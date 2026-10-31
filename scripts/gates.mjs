// Gates: run against dist/ and against mutated builds of both register branches. Exit 0 only if all pass.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const regFile = path.join(root, 'src', 'register.json');
const results = [];
const gate = (name, fn) => {
  try { const r = fn(); if (r === false) throw new Error('failed'); results.push([name, true, '']); }
  catch (e) { results.push([name, false, e.message]); }
};
const read = (f) => fs.readFileSync(f, 'utf8');
const walk = (d, skip = []) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (skip.includes(e.name)) return [];
  return e.isDirectory() ? walk(p, skip) : [p];
});
const textFiles = (d) => walk(d).filter((f) => /\.(html|css|js|json|svg)$/.test(f));
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

const BASE58 = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const EVM = /\b0x[0-9a-fA-F]{40}\b/g;
const addressShaped = (s) => [
  ...(s.match(EVM) || []),
  ...(s.match(BASE58) || []).filter((m) => /\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m)),
];

function statedValues(reg) {
  return new Set(Object.values(reg.records).filter((r) => r.state === 'stated' && r.value).map((r) => r.value));
}

function scanAddresses(dir, reg) {
  const ok = statedValues(reg);
  for (const f of textFiles(dir)) {
    for (const a of addressShaped(read(f))) {
      if (!ok.has(a)) throw new Error(`${path.relative(dir, f)}: address-shaped string not in stated registry: ${a}`);
    }
  }
}

const reg = JSON.parse(read(regFile));
const html = fs.existsSync(path.join(dist, 'index.html')) ? read(path.join(dist, 'index.html')) : '';

/* ---------- logo and assets ---------- */
gate('dist/index.html exists', () => html.length > 0);
gate('logo copied into dist and referenced by index.html with correct relative path', () => {
  const m = [...html.matchAll(/<img[^>]*class="hero-logo"[^>]*src="([^"]+)"|<img[^>]*src="([^"]+)"[^>]*class="hero-logo"/g)][0];
  const ref = m && (m[1] || m[2]);
  if (ref !== 'assets/logo-640.png') throw new Error('hero logo src is ' + ref);
  const f = path.join(dist, ref);
  const b = fs.readFileSync(f);
  if (b.readUInt32BE(16) !== 640 || b.readUInt32BE(20) !== 640 || b[25] !== 6) throw new Error('logo is not a 640x640 RGBA PNG');
  for (const x of html.matchAll(/(?:src|href)="((?!https?:|#|data:)[^"]+)"/g)) {
    if (!fs.existsSync(path.join(dist, x[1]))) throw new Error('missing in dist: ' + x[1]);
  }
});
gate('favicon is 32x32 SVG with no XML comment and no double hyphen', () => {
  const s = read(path.join(dist, 'favicon.svg'));
  if (!/width="32"[^>]*height="32"|viewBox="0 0 32 32"/.test(s)) throw new Error('not 32x32');
  if (s.includes('--') || s.includes('<!--')) throw new Error('double hyphen or comment');
});
gate('no loading="lazy" anywhere', () => !textFiles(dist).some((f) => /loading\s*[=:]\s*["']?lazy/.test(read(f))));
gate('hero does not use data-reveal', () => {
  const hero = html.slice(html.indexOf('<section class="hero"'), html.indexOf('</section>', html.indexOf('<section class="hero"')));
  if (hero.includes('data-reveal')) throw new Error('data-reveal inside hero');
});

/* ---------- dates ---------- */
gate('no dates, timestamps or clock strings in shipped files', () => {
  const months = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const pats = [/\b(19|20)\d{2}-\d{2}-\d{2}\b/, /\b\d{1,2}[/.]\d{1,2}[/.](19|20)?\d{2}\b/, new RegExp('\\b' + months + '\\.?\\s+\\d{1,2}\\b', 'i'),
    /\b\d{1,2}:\d{2}(:\d{2})?\b/, /\b(as of|checked|updated|last updated|\d+\s*(s|m|h|d)\s+ago|ago)\b/i, /©/];
  const yearPat = /\b(19|20)\d{2}\b/;
  for (const f of textFiles(dist)) {
    let s = read(f);
    if (f.endsWith('.html')) s = visibleText(s) + (s.match(/(?:aria-label|title|alt)="[^"]*"/g) || []).join(' ') + ((s.match(/id="register">([\s\S]*?)<\/script>/) || [])[1] || '');
    if (f.endsWith('.css') || f.endsWith('.js')) s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\bDate\.now\b|\bnew Date\b/g, '');
    if (f.endsWith('.html') && yearPat.test(s)) throw new Error(`${path.relative(dist, f)}: year-like number "${s.match(yearPat)[0]}"`);
    for (const p of pats) {
      const m = s.match(p);
      if (m && !(f.endsWith('.js') && /^\d{1,2}:\d{2}$/.test(m[0]))) throw new Error(`${path.relative(dist, f)} matches ${p}: "${m[0]}"`);
    }
  }
});
gate('register dates stay out of the public register copy', () => {
  const pub = JSON.parse(html.match(/id="register">([\s\S]*?)<\/script>/)[1]);
  for (const r of Object.values(pub.records)) for (const k of ['recorded', 'checked', 'asof', 'updated']) if (k in r) throw new Error('date key leaked: ' + k);
});

/* ---------- palette ---------- */
gate('colour literals only in tokens.css', () => {
  for (const f of textFiles(dist)) {
    const rel = path.relative(dist, f);
    if (rel === 'tokens.css' || rel === 'favicon.svg') continue;
    const s = read(f).replace(/\burl\([^)]*\)/g, '');
    const m = s.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\bhsla?\(|\bhwb\(|\boklch\(/);
    if (m) throw new Error(`${rel}: ${m[0]}`);
  }
});
gate('no ch units', () => !textFiles(dist).some((f) => /\d\s*ch\b/.test(read(f))));
gate('prefers-reduced-motion present in css and js', () => /prefers-reduced-motion:\s*reduce/.test(read(path.join(dist, 'styles.css'))) && /prefers-reduced-motion/.test(read(path.join(dist, 'app.js'))));
gate('tap targets declared 44px for icon links, copy and nav', () => {
  const c = read(path.join(dist, 'styles.css'));
  return /\.social\{width:44px;height:44px/.test(c) && /\.copy\{[^}]*min-height:44px;min-width:44px/.test(c) && /\.nav a\{[^}]*min-height:44px/.test(c);
});

/* ---------- register, social, CA (current state, read at runtime) ---------- */
gate('register: inert records carry no value or url', () => {
  for (const [k, r] of Object.entries(reg.records)) if (r.state !== 'stated' && ('value' in r || 'url' in r)) throw new Error(k);
});
function checkBranch(page, regObj, label) {
  const R = regObj.records;
  const socials = [...page.matchAll(/<(?:a|span) class="social[^"]*"[^>]*>/g)].map((m) => m[0]);
  if (socials.length !== 2) throw new Error(`${label}: expected 2 social icons, found ${socials.length}`);
  [['x', 0], ['github', 1]].forEach(([k, i]) => {
    const tag = socials[i], stated = R[k].state === 'stated';
    if (stated) {
      const href = (tag.match(/href="([^"]+)"/) || [])[1];
      if (href !== R[k].url) throw new Error(`${label}: ${k} href ${href}`);
      const handle = '@' + new URL(R[k].url).pathname.split('/').filter(Boolean)[0];
      if (!tag.includes(handle)) throw new Error(`${label}: ${k} handle not derived`);
    } else if (/href=/.test(tag) || !/is-inert/.test(tag)) throw new Error(`${label}: ${k} must be inert without href`);
  });
  const ca = page.match(/<div class="ca"[^>]*data-state="(\w+)"[\s\S]*?<\/div><\/div>/);
  if (!ca) throw new Error(label + ': CA slot missing');
  if (ca[1] !== R.ca.state) throw new Error(`${label}: CA state ${ca[1]} != ${R.ca.state}`);
  if (R.ca.state === 'stated') {
    if (!ca[0].includes(R.ca.value)) throw new Error(label + ': full CA not shown');
    if (/<button[^>]*disabled/.test(ca[0])) throw new Error(label + ': CA button disabled while stated');
  } else if (!/<button[^>]*disabled/.test(ca[0]) || /pending/.test(ca[0]) === false) throw new Error(label + ': inert CA must be disabled + pending');
  // market is independent of CA state
  if (!/data-rows/.test(page) || !/id="register"/.test(page)) throw new Error(label + ': market markup missing');
  if (JSON.parse(page.match(/id="register">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<')).records.market.state !== R.market.state) throw new Error(label + ': market state changed');
}
gate('current register state renders correctly (social, CA slot)', () => checkBranch(html, reg, 'dist'));
gate('address scanner passes on dist (CA exempt, matches stated registry only)', () => scanAddresses(dist, reg));

/* ---------- mutation harness: both branches, anchors read the live record ---------- */
const flip = (r, st, extra) => {
  const c = { label: r.label, state: st };
  if (st === 'stated') Object.assign(c, extra);
  return c;
};
function mutatedBuild(mutate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skyve-gate-'));
  const r = JSON.parse(read(regFile));
  mutate(r.records);
  const rf = path.join(tmp, 'register.json');
  fs.writeFileSync(rf, JSON.stringify(r));
  const out = path.join(tmp, 'out');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { env: { ...process.env, SKYVE_OUT: out, SKYVE_REGISTER: rf }, stdio: 'pipe' });
  return { out, reg: r, html: read(path.join(out, 'index.html')), tmp };
}
const sol = 'DemoMintAddr3kQ9xV7pLw2RfYtZb8NhGcJ5sUeA4mXqBp'.slice(0, 44);
const evm = '0x' + 'ab12'.repeat(10);
const mutants = {
  'stated (base58 CA, X, GitHub)': (R) => {
    R.ca = flip(R.ca, 'stated', { value: sol });
    R.x = flip(R.x, 'stated', { url: 'https://x.com/skyvelabs' });
    R.github = flip(R.github, 'stated', { url: 'https://github.com/skyve-labs/skyve' });
  },
  'stated (0x CA is not blanket-rejected)': (R) => { R.ca = flip(R.ca, 'stated', { value: evm }); },
  'absent': (R) => { R.ca = flip(R.ca, 'absent'); R.x = flip(R.x, 'absent'); R.github = flip(R.github, 'absent'); },
  'unconfirmed': (R) => { R.ca = flip(R.ca, 'unconfirmed'); R.x = flip(R.x, 'unconfirmed'); R.github = flip(R.github, 'unconfirmed'); },
};
for (const [name, fn] of Object.entries(mutants)) {
  gate(`branch ${name}`, () => {
    const m = mutatedBuild(fn);
    try { checkBranch(m.html, m.reg, name); scanAddresses(m.out, m.reg); }
    finally { fs.rmSync(m.tmp, { recursive: true, force: true }); }
  });
}
gate('address scanner rejects an unregistered address', () => {
  const m = mutatedBuild((R) => { R.ca = flip(R.ca, 'absent'); });
  try {
    fs.appendFileSync(path.join(m.out, 'index.html'), `<p>${sol}</p>`);
    let threw = false;
    try { scanAddresses(m.out, m.reg); } catch { threw = true; }
    if (!threw) throw new Error('rogue address accepted');
  } finally { fs.rmSync(m.tmp, { recursive: true, force: true }); }
});
gate('build refuses an inert record that carries a value or url', () => {
  let threw = false;
  try { mutatedBuild((R) => { R.x = { label: 'X', state: 'absent', url: 'https://x.com/nope' }; }); } catch { threw = true; }
  if (!threw) throw new Error('build accepted inert record with url');
});

/* ---------- originality: no shared 2-grams with the reference copy ---------- */
gate('copy shares no 2-grams with the reference', () => {
  const toks = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const stop = new Set('a an the of to in on for and or is are be it its as at by with from that this your you we our can will each every any all if so than then into onto only not no per via up out off over'.split(' '));
  const brand = new Set(['skyve', 'skive', 'solana']);
  const grams = (t) => { const s = new Set(); for (let i = 0; i < t.length - 1; i++) { if (stop.has(t[i]) || stop.has(t[i + 1]) || brand.has(t[i]) || brand.has(t[i + 1])) continue; s.add(t[i] + ' ' + t[i + 1]); } return s; };
  const refG = grams(toks(read(path.join(root, 'scripts', 'fixtures', 'ref-copy.txt'))));
  const mine = grams(toks(visibleText(html) + ' ' + (html.match(/(?:aria-label|alt|content)="[^"]*"/g) || []).join(' ')));
  const shared = [...mine].filter((g) => refG.has(g));
  if (shared.length) throw new Error('shared: ' + shared.join(' | '));
});

/* ---------- repo hygiene ---------- */
gate('repo hygiene: no CLAUDE.md, .claude, AI attribution; docs kept out of dist', () => {
  if (fs.existsSync(path.join(root, 'CLAUDE.md')) || fs.existsSync(path.join(root, '.claude'))) throw new Error('forbidden path present');
  const banned = new RegExp(['cl' + 'aude', 'anthr' + 'opic', 'co-authored-by', 'generated (with|by)', 'chat' + 'gpt', 'open' + 'ai', '\\bA' + 'I\\b'].join('|'), 'i');
  const files = walk(root, ['node_modules', 'brand', 'reference', 'dist', '.git', 'fixtures', 'gates.mjs']).filter((f) => /\.(md|json|html|css|js|mjs|py|txt)$/.test(f) || path.basename(f) === 'LICENSE');
  for (const f of files) { const m = read(f).match(banned); if (m) throw new Error(`${path.relative(root, f)}: ${m[0]}`); }
  for (const n of ['README.md', 'LICENSE', 'docs']) if (fs.existsSync(path.join(dist, n))) throw new Error(n + ' in dist');
  for (const n of ['README.md', 'LICENSE', 'docs/whitepaper.md']) if (!fs.existsSync(path.join(root, n))) throw new Error('missing ' + n);
});

/* ---------- report ---------- */
let failed = 0;
for (const [n, ok, msg] of results) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '\n      ' + msg}`); if (!ok) failed++; }
console.log(`\n${results.length - failed}/${results.length} gates passed`);
process.exit(failed ? 1 : 0);
