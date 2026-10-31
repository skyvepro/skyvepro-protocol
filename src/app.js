(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var REG = {};
  try { REG = JSON.parse($('#register').textContent).records; } catch (e) { REG = {}; }

  /* ---------- clipboard ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, no) {
      var t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? ok() : no(); } catch (e) { no(e); }
      document.body.removeChild(t);
    });
  }
  function wireCopy(btn, getText, doneLabel) {
    var label = btn.querySelector('.copy-t');
    var idle = label ? label.textContent : '';
    btn.addEventListener('click', function () {
      var v = getText();
      if (!v) return;
      copyText(v).then(function () {
        btn.classList.add('is-done');
        if (label) label.textContent = doneLabel;
        btn.setAttribute('aria-label', 'Copied');
        clearTimeout(btn._t);
        btn._t = setTimeout(function () {
          btn.classList.remove('is-done');
          if (label) label.textContent = idle;
          btn.setAttribute('aria-label', btn.getAttribute('data-aria') || 'Copy');
        }, 1600);
      });
    });
  }

  /* ---------- contract slot: reads the current record, never a fixed state ---------- */
  (function () {
    var rec = REG.ca || {};
    var slot = $('[data-ca]');
    if (!slot) return;
    var btn = $('[data-ca-copy]', slot);
    var word = $('[data-ca-word]');
    if (rec.state === 'stated' && rec.value) {
      if (word) word.textContent = 'Live';
      if (btn) { btn.setAttribute('data-aria', 'Copy contract address'); wireCopy(btn, function () { return rec.value; }, 'Copied'); }
    }
  })();

  /* ---------- progress bar ---------- */
  var bar = $('[data-progress]');
  function onScroll() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
    if (bar) bar.style.transform = 'scaleX(' + p + ')';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- spotlight ---------- */
  document.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('[data-spot], .mrow');
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  /* ---------- tabs ---------- */
  $$('[data-tabs]').forEach(function (root) {
    var tabs = $$('[role="tab"]', root);
    function pick(t) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
        var p = document.getElementById(x.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { pick(t); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, n = null;
        if (k === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
        if (k === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (n) { e.preventDefault(); pick(n); n.focus(); }
      });
    });
  });

  /* ---------- spring reveal (damped solver, semi-implicit Euler) ---------- */
  var reveals = $$('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.style.opacity = '1'; el.style.transform = 'none'; });
  } else {
    var K = 170, C = 20, M = 1; // stiffness, damping, mass
    var spring = function (el, delay) {
      var x = 1, v = 0, last = 0, started = false;
      var Y = 28;
      setTimeout(function () {
        function frame(t) {
          if (!started) { started = true; last = t; }
          var dt = Math.min(0.032, (t - last) / 1000); last = t;
          var a = (-K * x - C * v) / M;
          v += a * dt; x += v * dt;
          var done = Math.abs(x) < 0.002 && Math.abs(v) < 0.02;
          var p = done ? 0 : x;
          el.style.opacity = String(Math.min(1, Math.max(0, 1 - p)));
          el.style.transform = done ? 'none' : 'translateY(' + (p * Y).toFixed(2) + 'px)';
          if (!done) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }, delay);
    };
    var queue = 0, flushT = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        spring(en.target, (queue++) * 90);
        clearTimeout(flushT); flushT = setTimeout(function () { queue = 0; }, 160);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- hero parallax (pointer + scroll) ---------- */
  var stage = $('[data-parallax]');
  if (stage && !reduced) {
    var layers = $$('[data-depth]', stage);
    var px = 0, py = 0, tx = 0, ty = 0, sy = 0, raf = null;
    var tick = function () {
      px += (tx - px) * 0.08; py += (ty - py) * 0.08;
      layers.forEach(function (l) {
        var d = parseFloat(l.getAttribute('data-depth'));
        l.style.transform = 'translate3d(' + (px * 18 * d).toFixed(2) + 'px,' + (py * 14 * d + sy * 40 * d).toFixed(2) + 'px,0)';
      });
      raf = (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001) ? requestAnimationFrame(tick) : null;
    };
    var kick = function () { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      kick();
    }, { passive: true });
    window.addEventListener('scroll', function () {
      sy = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
      kick();
    }, { passive: true });
  }

  /* ---------- market ---------- */
  var mk = REG.market || {};
  if (mk.state !== 'stated') return;
  var rowsEl = $('[data-rows]');
  var tickerTrack = $('[data-ticker-track]');
  var pill = $('[data-pill]');
  var pillWord = $('[data-pill-word]');
  var feedWord = $('[data-feed-word]');
  var errEl = $('[data-err]');
  var DASH = '—';
  var state = { rows: [], good: false, fails: 0, timer: null, busy: false, cells: {} };

  function setStatus(tone, word) {
    if (pill) pill.setAttribute('data-tone', tone);
    if (pillWord) pillWord.textContent = word;
    if (feedWord) feedWord.textContent = word;
  }

  function fmtUsd(n) {
    if (n == null || !isFinite(n)) return DASH;
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }
  function fmtPrice(n) {
    if (n == null || !isFinite(n)) return DASH;
    if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toFixed(2);
    if (n >= 0.01) return '$' + n.toFixed(4);
    var s = n.toPrecision(3);
    if (/e/.test(s)) s = n.toFixed(10).replace(/0+$/, '');
    return '$' + s;
  }
  function fmtPct(n) {
    if (n == null || !isFinite(n)) return DASH;
    return (n < 0 ? '−' : '+') + Math.abs(n).toFixed(2) + '%';
  }
  function fmtFor(kind) { return kind === 'px' ? fmtPrice : kind === 'ch' ? fmtPct : fmtUsd; }

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  function avatar(row, idx) {
    var wrap = document.createElement('span');
    wrap.className = 'av c' + ((idx % 4) + 1);
    var letter = (row.symbol || '?').trim().charAt(0).toUpperCase() || '?';
    var tile = function () { wrap.textContent = letter; };
    if (!row.img) { tile(); return wrap; }
    var im = new Image();
    im.alt = '';
    im.width = 36; im.height = 36;
    im.referrerPolicy = 'no-referrer';
    im.decoding = 'async';
    im.onerror = function () { wrap.textContent = letter; };
    im.onload = function () { wrap.textContent = ''; wrap.appendChild(im); };
    wrap.textContent = letter;
    im.src = row.img;
    return wrap;
  }

  function skeletonRows() {
    rowsEl.innerHTML = '';
    for (var i = 0; i < 10; i++) {
      var r = document.createElement('div');
      r.className = 'mrow skeleton';
      r.innerHTML = '<span class="rank skel" style="width:18px"></span><span class="tok"><span class="skel circ"></span><span class="skel" style="width:90px"></span></span>' +
        '<span class="skel c-px" style="width:60%"></span><span class="skel c-ch" style="width:50%"></span><span class="skel c-vol" style="width:60%"></span><span class="skel c-liq" style="width:60%"></span><span class="skel c-copy" style="width:36px;height:36px"></span>';
      rowsEl.appendChild(r);
    }
  }

  function countTo(el, from, to, kind) {
    var f = fmtFor(kind);
    if (reduced || from == null || !isFinite(from) || !isFinite(to)) { el.textContent = f(to); return; }
    var t0 = null, dur = 650;
    var step = function (t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = f(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else el.textContent = f(to);
    };
    requestAnimationFrame(step);
  }

  function setCell(el, key, val, kind, first) {
    var prev = state.cells[key];
    state.cells[key] = val;
    if (first || prev == null) {
      el.textContent = fmtFor(kind)(val);
      return;
    }
    if (prev === val) return;
    var cls = val > prev ? 'flash-up' : 'flash-down';
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    if (!reduced) el.classList.add(cls);
    countTo(el, prev, val, kind);
  }

  function buildRow(row, i) {
    var r = document.createElement('div');
    r.className = 'mrow in';
    r.style.setProperty('--i', i);
    r.setAttribute('data-addr', row.address);
    var rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(i + 1);
    var tok = document.createElement('span'); tok.className = 'tok';
    tok.appendChild(avatar(row, i));
    var meta = document.createElement('span'); meta.className = 'tok-meta';
    meta.innerHTML = '<span class="tok-sym">' + esc(row.symbol || DASH) + '</span><span class="tok-name">' + esc(row.name || '') + '</span>';
    tok.appendChild(meta);
    r.appendChild(rank); r.appendChild(tok);
    [['px', 'c-px', 'Price'], ['ch', 'c-ch', '24h'], ['vol', 'c-vol', 'Volume'], ['liq', 'c-liq', 'Liquidity']].forEach(function (c) {
      var s = document.createElement('span');
      s.className = 'r cell ' + c[1];
      s.setAttribute('data-k', c[0]); s.setAttribute('data-l', c[2]);
      r.appendChild(s);
    });
    var cp = document.createElement('span'); cp.className = 'r c-copy';
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'copy is-sm';
    b.setAttribute('data-aria', 'Copy token address'); b.setAttribute('aria-label', 'Copy token address');
    b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';
    wireCopy(b, function () { return row.address; }, 'Copied');
    cp.appendChild(b); r.appendChild(cp);
    return r;
  }

  function render(rows, firstPaint) {
    if (firstPaint) {
      rowsEl.innerHTML = '';
      state.cells = {};
      rows.forEach(function (row, i) { rowsEl.appendChild(buildRow(row, i)); });
    }
    rows.forEach(function (row) {
      var el = rowsEl.querySelector('[data-addr="' + row.address.replace(/"/g, '') + '"]');
      if (!el) return;
      var set = function (k, v) { setCell(el.querySelector('[data-k="' + k + '"]'), row.address + k, v, k, firstPaint); };
      set('px', row.price); set('ch', row.change); set('vol', row.volume); set('liq', row.liquidity);
      var ch = el.querySelector('[data-k="ch"]');
      ch.classList.toggle('up', row.change > 0);
      ch.classList.toggle('down', row.change < 0);
    });
    renderTicker(rows);
  }

  function renderTicker(rows) {
    if (!tickerTrack) return;
    var one = rows.map(function (r) {
      return '<span class="tick"><span class="t-sym">' + esc(r.symbol || DASH) + '</span><span class="t-px">' + fmtPrice(r.price) + '</span><span class="' + (r.change > 0 ? 'up' : r.change < 0 ? 'down' : '') + '">' + fmtPct(r.change) + '</span></span>';
    }).join('');
    tickerTrack.innerHTML = one + one;
  }

  function showError() {
    if (errEl) errEl.hidden = false;
  }
  function dashAll() {
    rowsEl.innerHTML = '';
    for (var i = 0; i < 10; i++) {
      var r = document.createElement('div');
      r.className = 'mrow';
      r.innerHTML = '<span class="rank">' + (i + 1) + '</span><span class="tok"><span class="av c1">' + DASH + '</span><span class="tok-meta"><span class="tok-sym">' + DASH + '</span></span></span>' +
        '<span class="r cell c-px" data-l="Price">' + DASH + '</span><span class="r cell c-ch" data-l="24h">' + DASH + '</span><span class="r cell c-vol" data-l="Volume">' + DASH + '</span><span class="r cell c-liq" data-l="Liquidity">' + DASH + '</span><span class="r c-copy"></span>';
      rowsEl.appendChild(r);
    }
    if (tickerTrack) tickerTrack.innerHTML = '<span class="tick"><span class="t-sym">' + DASH + '</span></span>';
  }

  function getJSON(url) {
    var ctl = new AbortController();
    var to = setTimeout(function () { ctl.abort(); }, 12000);
    return fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } }).then(function (res) {
      clearTimeout(to);
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }, function (e) { clearTimeout(to); throw e; });
  }

  function pull() {
    return getJSON(mk.boosts).then(function (list) {
      if (!Array.isArray(list)) throw new Error('shape');
      var seen = {}, addrs = [];
      list.forEach(function (x) {
        if (x && x.chainId === 'solana' && x.tokenAddress && !seen[x.tokenAddress]) { seen[x.tokenAddress] = 1; addrs.push(x.tokenAddress); }
      });
      if (!addrs.length) throw new Error('empty');
      return getJSON(mk.pairs + addrs.slice(0, 30).join(','));
    }).then(function (pairs) {
      if (!Array.isArray(pairs)) throw new Error('shape');
      var best = {};
      pairs.forEach(function (p) {
        if (!p || p.chainId !== 'solana' || !p.baseToken || !p.baseToken.address) return;
        var a = p.baseToken.address;
        var liq = p.liquidity && p.liquidity.usd || 0;
        if (!best[a] || liq > (best[a].liquidity && best[a].liquidity.usd || 0)) best[a] = p;
      });
      var rows = Object.keys(best).map(function (a) {
        var p = best[a];
        return {
          address: a,
          symbol: p.baseToken.symbol, name: p.baseToken.name,
          img: p.info && p.info.imageUrl || '',
          price: p.priceUsd != null ? parseFloat(p.priceUsd) : null,
          change: p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null,
          volume: p.volume && p.volume.h24 != null ? Number(p.volume.h24) : null,
          liquidity: p.liquidity && p.liquidity.usd != null ? Number(p.liquidity.usd) : null
        };
      }).filter(function (r) { return r.volume != null; });
      rows.sort(function (a, b) { return b.volume - a.volume; });
      rows = rows.slice(0, 10);
      if (!rows.length) throw new Error('empty');
      return rows;
    });
  }

  function schedule(ms) {
    clearTimeout(state.timer);
    if (document.hidden) { state.timer = null; return; }
    state.timer = setTimeout(run, ms);
  }

  function run() {
    if (state.busy) return;
    state.busy = true;
    setStatus('warn', state.good ? 'Refreshing' : 'Connecting');
    pull().then(function (rows) {
      var first = !state.good;
      state.good = true; state.fails = 0; state.rows = rows;
      if (errEl) errEl.hidden = true;
      render(rows, first || !sameOrder(rows));
      setStatus('live', 'Live');
      schedule(60000);
    }, function () {
      state.fails++;
      var wait = Math.min(60000, 2000 * Math.pow(2, state.fails - 1));
      if (state.good) {
        setStatus('warn', 'Retrying');
      } else {
        setStatus('down', 'Offline');
        showError();
        if (state.fails === 1) dashAll();
      }
      schedule(wait);
    }).then(function () { state.busy = false; });
  }

  function sameOrder(rows) {
    var cur = $$('.mrow[data-addr]', rowsEl).map(function (e) { return e.getAttribute('data-addr'); });
    return cur.length === rows.length && cur.every(function (a, i) { return a === rows[i].address; });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(state.timer); state.timer = null; }
    else { clearTimeout(state.timer); run(); }
  });

  skeletonRows();
  run();
})();
