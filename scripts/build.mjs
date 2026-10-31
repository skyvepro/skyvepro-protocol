// Static build: src/ + register.json -> dist/ (or SKYVE_OUT). SKYVE_REGISTER overrides the register path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const out = path.resolve(process.env.SKYVE_OUT || path.join(root, 'dist'));
const regPath = path.resolve(process.env.SKYVE_REGISTER || path.join(src, 'register.json'));

const STATES = ['stated', 'absent', 'unconfirmed'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function loadRegister(file) {
  const reg = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [k, r] of Object.entries(reg.records)) {
    if (!STATES.includes(r.state)) throw new Error(`register: ${k} has invalid state ${r.state}`);
    if (r.state !== 'stated' && ('value' in r || 'url' in r)) {
      throw new Error(`register: inert record ${k} (${r.state}) must not carry value or url`);
    }
    if (r.state === 'stated' && k !== 'chain' && k !== 'market' && !(r.value || r.url)) {
      throw new Error(`register: stated record ${k} has no value or url`);
    }
  }
  return reg;
}

// Dates live in the register as data only; the public copy omits them.
const DATE_KEYS = ['recorded', 'checked', 'asof', 'updated'];
function publicRegister(reg) {
  const o = { records: {} };
  for (const [k, r] of Object.entries(reg.records)) {
    const c = { ...r };
    DATE_KEYS.forEach((d) => delete c[d]);
    o.records[k] = c;
  }
  return o;
}

const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const ICON_GH = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';

// Handle is derived from the stored URL, never stored on its own.
const handleOf = (url) => {
  try { const seg = new URL(url).pathname.split('/').filter(Boolean)[0]; return seg ? '@' + seg : ''; } catch { return ''; }
};

function social(rec, icon) {
  if (rec.state === 'stated' && rec.url) {
    const h = handleOf(rec.url);
    const name = h ? `${rec.label} ${h}` : rec.label;
    return `<a class="social" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(name)}" title="${esc(name)}">${icon}</a>`;
  }
  return `<span class="social is-inert" role="img" aria-label="${esc(rec.label)}, pending" aria-disabled="true">${icon}</span>`;
}

function caSlot(rec) {
  const live = rec.state === 'stated' && rec.value;
  const copy = `<button class="copy" type="button" data-ca-copy aria-label="${live ? 'Copy contract address' : 'Copy contract address, pending'}"${live ? '' : ' disabled'}>${ICON_COPY}<span class="copy-t">Copy</span></button>`;
  return `<div class="ca" data-ca data-state="${rec.state}"><div class="ca-in"><span class="ca-label">CA</span><span class="ca-value" data-ca-value>${live ? esc(rec.value) : 'pending'}</span>${copy}<span class="sr" aria-live="polite"></span></div></div>`;
}

export function build() {
  const reg = loadRegister(regPath);
  const R = reg.records;
  let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
  html = html
    .replace('{{SOCIAL_X}}', social(R.x, ICON_X))
    .replace('{{SOCIAL_GITHUB}}', social(R.github, ICON_GH))
    .replace('{{CA_SLOT}}', caSlot(R.ca))
    .replaceAll('{{CHAIN}}', esc(R.chain.value))
    .replace('{{REGISTER_JSON}}', JSON.stringify(publicRegister(reg)).replace(/</g, '\\u003c'));

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  for (const f of ['tokens.css', 'styles.css', 'app.js']) fs.copyFileSync(path.join(src, f), path.join(out, f));
  fs.copyFileSync(path.join(src, 'assets', 'favicon.svg'), path.join(out, 'favicon.svg'));
  // Logo files referenced by index.html must be explicitly copied.
  for (const f of ['logo-640.png', 'logo-192.png', 'apple-touch-icon.png']) {
    fs.copyFileSync(path.join(src, 'assets', f), path.join(out, 'assets', f));
  }
  // Every local asset referenced by the page must exist in the output.
  for (const m of html.matchAll(/(?:src|href)="((?!https?:|#|data:)[^"]+)"/g)) {
    if (!fs.existsSync(path.join(out, m[1]))) throw new Error(`build: ${m[1]} referenced in index.html but missing from output`);
  }
  console.log(`built ${path.relative(root, out) || '.'}: ${fs.readdirSync(out).length} entries`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
