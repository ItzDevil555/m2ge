const ICONS = {"dash": `<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>`, "file": `<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>`, "search": `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`, "gear": `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`, "log": `<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>`, "moon": `<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>`, "plus": `<path d="M12 5v14M5 12h14"/>`, "up": `<path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16"/>`, "down": `<path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16"/>`, "warn": `<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>`, "eye": `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`, "clock": `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`, "copy": `<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>`, "trash": `<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`, "report": `<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>`, "sheet": `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>`, "scale": `<path d="M12 3v18M5 21h14M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>`, "cog": `<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`, "cols": `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>`, "x": `<path d="M18 6 6 18M6 6l12 12"/>`, "undo": `<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>`, "redo": `<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>`, "chev": `<path d="m6 9 6 6 6-6"/>`, "chevr": `<path d="m9 6 6 6-6 6"/>`, "chevl": `<path d="m15 6-6 6 6 6"/>`, "check": `<path d="m5 12 5 5 9-10"/>`, "import": `<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>`, "text": `<path d="M4 6h16M4 12h16M4 18h10"/>`, "receipt": `<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>`, "edit": `<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>`, "bank": `<path d="M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>`, "truck": `<path d="M2 6h11v10H2zM13 9h5l3 3v4h-8M6 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01"/>`, "alert": `<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>`, "info": `<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`};
const ic = (n, s = 16) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const SYM = {"📝": "text", "⬇": "down", "⚠": "warn", "👁": "eye", "🕘": "clock", "＋": "plus", "🗑": "trash", "⧉": "copy", "📋": "report", "📗": "sheet", "⚖": "scale", "⚙": "cog", "🗂": "cols", "✖": "x", "↶": "undo", "↷": "redo", "‹": "chevl", "›": "chevr", "▾": "chev", "▸": "chevr", "⬆": "up", "📥": "import", "🧾": "receipt", "✏": "edit", "🔢": "log", "📑": "sheet", "📄": "file", "⇄": "cols", "✓": "check", "✕": "x", "🔍": "search"};
function I(n, s) { const e = document.createElement('span'); e.className = 'icw'; e.innerHTML = ic(n, s); return e; }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v; else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat(9)) {
    if (c == null || c === false) continue;
    if (c.nodeType) { e.append(c); continue; }
    let s = String(c), m;
    while ((m = /^(\uFE0F?)([\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B00-\u2BFF\uFF0B\u29C9\u21B6\u21B7\u2039\u203A\u2022\u25BE\u25B8\u21C4\u2713\u2716\u2699]\uFE0F?)\s?/u.exec(s)) && SYM[m[2].replace('\uFE0F', '')]) { e.append(I(SYM[m[2].replace('\uFE0F', '')], 15)); s = s.slice(m[0].length); if (s) e.append(' '); }
    if (s.endsWith(' \u25BE')) { e.append(document.createTextNode(s.slice(0, -2)), I('chev', 14)); continue; }
    if (s) e.append(document.createTextNode(s));
  }
  return e;
}
async function api(path, opt = {}) {
  const o = { ...opt };
  if (o.json !== undefined) { o.method = o.method || 'POST'; o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.json); delete o.json; }
  const r = await fetch('/api' + path, o);
  if (!r.ok) {
    let m = r.statusText, body = null;
    try { body = await r.json(); m = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail); } catch { }
    const e = new Error(m); e.status = r.status; e.body = body; throw e;
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r;
}
function toast(msg, kind = '') {
  const t = h('div', { class: 'toast ' + kind }, msg); $('#toasts').append(t); setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000);
}
function modal({ title, body, buttons = [], size = '' }) {
  const bg = h('div', { class: 'modalbg', onmousedown: e => { if (e.target === bg) close(); } });
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  const foot = h('footer', {}, buttons.map(b => h('button', {
    class: 'btn ' + (b.cls || ''), onclick: async ev => { if (b.onclick) { const r = await b.onclick(ev, close); if (r === false) return; } if (!b.keep) close(); }
  }, b.label)));
  bg.append(h('div', { class: 'modal ' + size }, h('header', {}, h('span', {}, title), h('button', { class: 'btn ghost sm right', onclick: close }, I('x', 14))), h('div', { class: 'body' }, body), buttons.length ? foot : null));
  document.body.append(bg); const f = $('input,select', bg); if (f) f.focus();
  return close;
}
const fmt = (n, d = 2) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
async function download(url, fallbackName, opts) {
  const r = await fetch(url, opts); if (!r.ok) { let b = null; try { b = await r.json(); } catch { } const e = new Error((b && b.detail) || r.statusText); e.status = r.status; e.body = b; throw e; }
  const cd = r.headers.get('content-disposition') || ''; const m = /filename="([^"]+)"/.exec(cd);
  const blob = await r.blob(); const a = h('a', { href: URL.createObjectURL(blob), download: m ? m[1] : fallbackName }); document.body.append(a); a.click(); a.remove();
  return m ? m[1] : fallbackName;
}
// ---------- global state
let M = { codes: [], parties: [], settings: {}, hs: {} };
async function loadMeta() { M = await api('/meta'); }
const codesOf = kind => M.codes.filter(c => c.kind === kind && c.active);
const codeLabel = (kind, id) => { const c = M.codes.find(c => c.id == id); return c ? c.label : ''; };
function theme(t) { try { if (t) localStorage.setItem('theme', t); return localStorage.getItem('theme'); } catch { return null; } }
function applyTheme() { const t = theme(); if (t) document.documentElement.dataset.theme = t; }
// ---------- router
const routes = [];
function route(pattern, title, fn) { routes.push({ re: new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), title, fn }); }
let leaving = null;
async function go() {
  if (leaving) { try { await leaving(); } catch { } leaving = null; }
  const p = location.hash.replace(/^#\/?/, '');
  for (const r of routes) {
    const m = r.re.exec(p);
    if (m) {
      $$('#side a').forEach(a => a.classList.toggle('on', a.dataset.r === p.split('/')[0] || (a.dataset.r === 'declarations' && p.startsWith('declaration/'))));
      $('#title').textContent = r.title; $('#savestate').textContent = '';
      const v = $('#view'); v.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'skel', style: 'width:40%' }), h('br'), h('div', { class: 'skel' }), h('br'), h('div', { class: 'skel', style: 'width:70%' })));
      try { const el = await r.fn(...m.slice(1)); v.replaceChildren(el); v.scrollTop = 0; } catch (e) { v.replaceChildren(h('div', { class: 'card empty' }, I('warn', 20), ' ' + e.message)); }
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', go);
$$('#side a').forEach(a => a.onclick = () => location.hash = '#/' + a.dataset.r);
$('#theme').onclick = () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); const n = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; theme(n); };
applyTheme();
// ---------- command palette
async function palette() {
  const decls = await api('/declarations');
  const items = [['Dashboard', '#/'], ['Declarations', '#/declarations'], ['UAE Logistics', '#/logistics'], ['HS Master', '#/hs'], ['Settings', '#/settings'], ['Audit log', '#/audit'],
  ...decls.map(d => ['Declaration: ' + d.name + (d.shipper ? ' — ' + d.shipper : ''), '#/declaration/' + d.id])];
  const list = h('div'); const inp = h('input', { placeholder: 'Jump to a page or declaration…' });
  let close;
  const draw = () => { const q = inp.value.toLowerCase(); list.replaceChildren(...items.filter(i => i[0].toLowerCase().includes(q)).slice(0, 12).map(i => h('div', { class: 'opt', onclick: () => { location.hash = i[1]; close(); } }, i[0]))); };
  inp.oninput = draw; inp.onkeydown = e => { if (e.key === 'Enter') { const f = list.firstChild; if (f) f.click(); } };
  draw(); close = modal({ title: 'Quick search', body: h('div', {}, inp, h('br'), list), size: 'sm' });
}
$('#pal').onclick = palette;
$$('.ico').forEach(e => e.innerHTML = ic(e.dataset.i, +e.dataset.s || 18));
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); } });
