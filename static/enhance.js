// ======================= Enhancements: bulk edit, keyboard grid, drag reorder, split view, charts, onboarding =======================
Object.assign(ICONS, {
  grip: `<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>`,
  rows: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18"/>`,
  keyboard: `<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>`,
  wand: `<path d="m4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 12l.7 1.3L21 14l-1.3.7L19 16l-.7-1.3L17 14l1.3-.7z"/>`,
  filter: `<path d="M3 5h18l-7 8v6l-4-2v-4z"/>`,
  star: `<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>`,
  circle: `<circle cx="12" cy="12" r="8"/>`,
});
const store = (k, v) => { try { if (v !== undefined) { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } };

// ---------- density
const applyDensity = () => { document.documentElement.dataset.density = store('density') || 'comfortable'; };
applyDensity();
$('#dens').onclick = () => { store('density', (store('density') || 'comfortable') === 'compact' ? 'comfortable' : 'compact'); applyDensity(); store('ob_dens', true); toast('Density: ' + document.documentElement.dataset.density); };

// ---------- shortcuts
const SHORTCUTS = [['Arrow keys', 'Move between cells'], ['Enter / Shift+Enter', 'Cell below / above'], ['Tab / Shift+Tab', 'Next / previous cell'], ['Ctrl+D', 'Fill down (from the row above, or to all selected rows)'], ['Alt+Up / Alt+Down', 'Move the current line up or down'], ['Alt+N', 'Insert a line below'], ['Alt+Delete', 'Delete the current line'], ['Shift+click checkbox', 'Select a range of lines'], ['Paste from Excel', 'Paste a block of cells into the grid'], ['Ctrl+K', 'Quick search'], ['?', 'Show this list']];
function shortcutsModal() { store('ob_keys', true); modal({ title: 'Keyboard shortcuts', size: 'sm', body: h('table', { class: 't' }, h('tbody', {}, SHORTCUTS.map(([k, d]) => h('tr', {}, h('td', {}, h('span', { class: 'kbd' }, k)), h('td', {}, d))))) }); }
$('#keys').onclick = shortcutsModal;
document.addEventListener('keydown', e => { if (e.key === '?' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) shortcutsModal(); });

// ---------- grid helpers
const GCOLS = ['hs_inv', 'description', 'unit', 'qty', 'weight', 'value', 'country'];
const NUMC = ['qty', 'weight', 'value'];
const coerce = (k, v) => NUMC.includes(k) ? (parseFloat(String(v).replace(/,/g, '')) || 0) : k === 'country' ? String(v).trim().toUpperCase() : String(v).trim();
const setField = (l, k, v) => { l[k] = v; if (k === 'hs_inv') { l.hs_status = 'missing'; l.hs8 = ''; } };
const gridInput = e => e.target.matches && e.target.matches('#body table.t input[data-col]') ? e.target : null;
const focusCell = (key, col) => { const i = $(`#body tr[data-k="${key}"] input[data-col="${col}"]`); if (i) { i.focus(); i.select(); } };
function selectPage(on) { $$('#body tbody tr[data-k]').forEach(tr => { const k = tr.dataset.k, cb = $('input[type=checkbox]', tr); if (cb) cb.checked = on; on ? D.sel.add(k) : D.sel.delete(k); }); }
function moveLine(ii, from, to) { if (to < 0 || from === to) return; mut(d => { const a = d.invoices[ii].lines; if (to >= a.length) return; const [x] = a.splice(from, 1); a.splice(to, 0, x); }, true); }

document.addEventListener('focusin', e => { const i = gridInput(e); if (i) { i.select(); if (D.tab === 'split') hlRow(i.closest('tr').dataset.k); } });
document.addEventListener('keydown', e => {
  const i = gridInput(e); if (!i) return;
  const tr = i.closest('tr'), key = tr.dataset.k, col = i.dataset.col, [ii, li] = key.split(':').map(Number);
  const go = (t, c) => { if (t) { const n = $(`input[data-col="${c}"]`, t); if (n) { e.preventDefault(); n.focus(); n.select(); } } };
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const to = li + (e.key === 'ArrowUp' ? -1 : 1); if (to >= 0 && to < D.decl.invoices[ii].lines.length) { moveLine(ii, li, to); setTimeout(() => focusCell(ii + ':' + to, col), 0); } return; }
  if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); mut(d => d.invoices[ii].lines.splice(li + 1, 0, newLine()), true); setTimeout(() => focusCell(ii + ':' + (li + 1), col), 0); return; }
  if (e.altKey && e.key === 'Delete') { e.preventDefault(); mut(d => d.invoices[ii].lines.splice(li, 1), true); toast('Line deleted. Use Undo to restore.'); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    e.preventDefault(); const v = coerce(col, i.value);
    if (D.sel.size > 1 && D.sel.has(key)) mut(d => D.sel.forEach(k => { const [a, b] = k.split(':').map(Number); setField(d.invoices[a].lines[b], col, v); }), true);
    else if (li > 0) mut(d => setField(d.invoices[ii].lines[li], col, coerce(col, d.invoices[ii].lines[li - 1][col] ?? '')), true);
    setTimeout(() => focusCell(key, col), 0); return;
  }
  if (e.key === 'Enter' && e.shiftKey) return go(tr.previousElementSibling, col);
  if (e.key === 'ArrowDown') return go(tr.nextElementSibling, col);
  if (e.key === 'ArrowUp') return go(tr.previousElementSibling, col);
  const idx = GCOLS.indexOf(col);
  if (e.key === 'ArrowRight' && i.selectionStart === i.value.length && i.selectionEnd === i.value.length && idx < GCOLS.length - 1) return go(tr, GCOLS[idx + 1]);
  if (e.key === 'ArrowLeft' && i.selectionStart === 0 && i.selectionEnd === 0 && idx > 0) return go(tr, GCOLS[idx - 1]);
  if (e.key === 'Escape') i.blur();
});
// paste a block from Excel
document.addEventListener('paste', e => {
  const i = gridInput(e); if (!i) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
  e.preventDefault();
  const grid = text.replace(/\r?\n$/, '').split(/\r?\n/).map(r => r.split('\t'));
  const trs = []; for (let t = i.closest('tr'); t && t.dataset.k; t = t.nextElementSibling) trs.push(t.dataset.k);
  const c0 = GCOLS.indexOf(i.dataset.col); let cells = 0;
  mut(d => grid.forEach((row, r) => { if (!trs[r]) return; const [a, b] = trs[r].split(':').map(Number); row.forEach((v, c) => { const k = GCOLS[c0 + c]; if (k) { setField(d.invoices[a].lines[b], k, coerce(k, v)); cells++; } }); }), true);
  toast(`Pasted ${cells} cells` + (grid.length > trs.length ? ` (${grid.length - trs.length} rows did not fit on this page)` : ''), 'ok');
});
// shift-click range select
let lastCb = null;
document.addEventListener('click', e => {
  const cb = e.target; if (!(cb.matches && cb.matches('#body tbody input[type=checkbox]'))) return;
  const rows = $$('#body tbody tr[data-k]'), tr = cb.closest('tr'), idx = rows.indexOf(tr);
  if (e.shiftKey && lastCb != null && rows[lastCb]) { const [a, b] = [Math.min(lastCb, idx), Math.max(lastCb, idx)]; for (let n = a; n <= b; n++) { const c = $('input[type=checkbox]', rows[n]); c.checked = cb.checked; cb.checked ? D.sel.add(rows[n].dataset.k) : D.sel.delete(rows[n].dataset.k); } }
  lastCb = idx;
});

// ---------- drag and drop reorder
let dragKey = null;
document.addEventListener('mousedown', e => { const g = e.target.closest && e.target.closest('td.drag'); if (g) g.closest('tr').draggable = true; });
document.addEventListener('mouseup', () => $$('#body tr[draggable=true]').forEach(t => t.draggable = false));
document.addEventListener('dragstart', e => { const tr = e.target.closest && e.target.closest('#body tbody tr[data-k]'); if (!tr) return; dragKey = tr.dataset.k; tr.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKey); });
document.addEventListener('dragover', e => { const tr = e.target.closest && e.target.closest('#body tbody tr[data-k]'); if (!tr || !dragKey) return; e.preventDefault(); $$('.dropbefore,.dropafter').forEach(x => x.classList.remove('dropbefore', 'dropafter')); const r = tr.getBoundingClientRect(); tr.classList.add(e.clientY < r.top + r.height / 2 ? 'dropbefore' : 'dropafter'); });
document.addEventListener('dragend', () => { dragKey = null; $$('.dragging,.dropbefore,.dropafter').forEach(x => x.classList.remove('dragging', 'dropbefore', 'dropafter')); $$('#body tr[draggable=true]').forEach(t => t.draggable = false); });
document.addEventListener('drop', e => {
  const tr = e.target.closest && e.target.closest('#body tbody tr[data-k]'); if (!tr || !dragKey) return; e.preventDefault();
  const after = tr.classList.contains('dropafter'), [a, from] = dragKey.split(':').map(Number), [b, t0] = tr.dataset.k.split(':').map(Number);
  dragKey = null; $$('.dragging,.dropbefore,.dropafter').forEach(x => x.classList.remove('dragging', 'dropbefore', 'dropafter'));
  if (a !== b) return toast('Lines can only be moved within the same invoice');
  if (D.q || D.onlyIssues) return toast('Clear the filters before reordering');
  let to = t0 + (after ? 1 : 0); if (from < to) to--; moveLine(a, from, to);
});

// ---------- saved filters (browser only)
function savedFiltersUI() {
  const list = store('filters') || [];
  const sel = h('select', { style: 'width:auto', title: 'Saved filters', onchange: e => { const f = list[+e.target.value]; if (f) { D.q = f.q; D.onlyIssues = f.onlyIssues; D.page = 0; renderBody(); } } },
    h('option', { value: '' }, list.length ? 'Saved filters' : 'No saved filters'), list.map((f, n) => h('option', { value: n }, f.name)));
  return h('span', { class: 'row', style: 'gap:4px' }, sel,
    h('button', { class: 'btn sm', title: 'Save the current filter', onclick: () => { if (!D.q && !D.onlyIssues) return toast('Set a filter first'); const name = prompt('Name this filter', D.q || 'Issues only'); if (!name) return; store('filters', [...list, { name, q: D.q, onlyIssues: D.onlyIssues }]); renderBody(); } }, I('star', 14)),
    list.length ? h('button', { class: 'btn sm danger', title: 'Delete a saved filter', onclick: () => { if (sel.value === '') return toast('Pick a filter to delete'); store('filters', list.filter((_, n) => n !== +sel.value)); renderBody(); } }, I('trash', 14)) : null);
}

// ---------- bulk edit
function bulkEditModal() {
  const F = [['description', 'Description'], ['hs_inv', 'Invoice HS'], ['unit', 'Unit'], ['country', 'Origin'], ['qty', 'Qty'], ['weight', 'Net weight'], ['value', 'Value']];
  const S = { field: 'description', op: 'replace', scope: D.sel.size ? 'sel' : 'vis', find: '', to: '', cs: false, rx: false, n: 2 };
  const out = h('div', { class: 'bulkprev' }), form = h('div');
  const isNum = () => NUMC.includes(S.field);
  const OPS = () => isNum() ? [['set', 'Set to value'], ['mul', 'Multiply by'], ['add', 'Add'], ['round', 'Round to decimals'], ['zero', 'Set to 0']] : [['replace', 'Find and replace'], ['set', 'Set to value'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['trim', 'Trim and collapse spaces'], ['prefix', 'Add prefix'], ['suffix', 'Add suffix'], ['clear', 'Clear']];
  const targets = () => S.scope === 'sel' ? [...D.sel].map(k => k.split(':').map(Number)).map(([ii, li]) => ({ ii, li })) : S.scope === 'vis' ? visibleLines() : flatLines();
  const calc = (cur) => {
    const s = String(cur ?? '');
    switch (S.op) {
      case 'set': return coerce(S.field, S.to);
      case 'mul': return +(num(cur) * num(S.to)).toFixed(6); case 'add': return +(num(cur) + num(S.to)).toFixed(6);
      case 'round': return +num(cur).toFixed(Math.max(0, S.n | 0)); case 'zero': return 0;
      case 'upper': return s.toUpperCase(); case 'lower': return s.toLowerCase(); case 'title': return s.toLowerCase().replace(/(^|[\s\-\/(])(\S)/g, (_, a, b) => a + b.toUpperCase());
      case 'trim': return s.replace(/\s+/g, ' ').trim(); case 'prefix': return S.to + s; case 'suffix': return s + S.to; case 'clear': return '';
      case 'replace': { if (!S.find) return s; try { const re = S.rx ? new RegExp(S.find, S.cs ? 'g' : 'gi') : new RegExp(S.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), S.cs ? 'g' : 'gi'); return s.replace(re, S.to); } catch { return s; } }
    }
    return cur;
  };
  const changes = () => targets().map(t => { const l = D.decl.invoices[t.ii].lines[t.li]; const nv = calc(l[S.field]); return String(nv) !== String(l[S.field] ?? '') ? { t, old: l[S.field], nv } : null; }).filter(Boolean);
  const prev = () => { const c = changes(); out.replaceChildren(h('b', {}, `${c.length} of ${targets().length} line(s) will change`), c.length ? h('table', { class: 't' }, h('tbody', {}, c.slice(0, 6).map(x => h('tr', {}, h('td', { class: 'mut' }, '#' + (x.t.li + 1)), h('td', {}, String(x.old ?? '').slice(0, 40) || '(empty)'), h('td', {}, I('chevr', 14)), h('td', {}, h('b', {}, String(x.nv).slice(0, 40) || '(empty)')))))) : null); };
  const draw = () => {
    const needTo = ['set', 'mul', 'add', 'prefix', 'suffix', 'replace'].includes(S.op);
    form.replaceChildren(h('div', { class: 'form' },
      h('label', { class: 'f c4' }, 'Field', h('select', { onchange: e => { S.field = e.target.value; S.op = isNum() ? 'set' : 'replace'; draw(); } }, F.map(([v, l]) => h('option', { value: v, selected: S.field === v }, l)))),
      h('label', { class: 'f c4' }, 'Action', h('select', { onchange: e => { S.op = e.target.value; draw(); } }, OPS().map(([v, l]) => h('option', { value: v, selected: S.op === v }, l)))),
      h('label', { class: 'f c4' }, 'Apply to', h('select', { onchange: e => { S.scope = e.target.value; prev(); } }, [['sel', `Selected lines (${D.sel.size})`], ['vis', 'Filtered lines'], ['all', 'All lines']].map(([v, l]) => h('option', { value: v, selected: S.scope === v }, l)))),
      S.op === 'replace' ? h('label', { class: 'f c6' }, 'Find', h('input', { value: S.find, oninput: e => { S.find = e.target.value; prev(); } })) : null,
      needTo ? h('label', { class: 'f ' + (S.op === 'replace' ? 'c6' : 'c12') }, S.op === 'replace' ? 'Replace with' : 'Value', h('input', { value: S.to, oninput: e => { S.to = e.target.value; prev(); } })) : null,
      S.op === 'round' ? h('label', { class: 'f c4' }, 'Decimals', h('input', { type: 'number', min: 0, max: 6, value: S.n, oninput: e => { S.n = +e.target.value; prev(); } })) : null,
      S.op === 'replace' ? h('div', { class: 'c12 row' }, h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', onchange: e => { S.cs = e.target.checked; prev(); } }), 'Match case'), h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', onchange: e => { S.rx = e.target.checked; prev(); } }), 'Regular expression')) : null), h('br'), out);
    prev();
  };
  draw();
  modal({ title: 'Bulk edit', size: 'sm', body: form, buttons: [{ label: 'Cancel' }, { label: 'Apply', cls: 'pri', onclick: () => { const c = changes(); if (!c.length) { toast('Nothing to change'); return false; } mut(d => c.forEach(x => setField(d.invoices[x.t.ii].lines[x.t.li], S.field, x.nv)), true); toast(`${c.length} line(s) updated. Undo is available.`, 'ok'); } }] });
}

// ---------- side-by-side view
function splitTab() {
  const pre = h('pre', { class: 'm2', id: 'splitpre' }, 'Loading…');
  setTimeout(() => refreshSplit(true), 0);
  return h('div', { class: 'split2' }, linesTab(), h('div', { class: 'card splitr' }, h('div', { class: 'row', style: 'margin-bottom:8px' }, h('b', {}, 'Live M2 text'), h('span', { class: 'mut' }, 'Click a line on the left to highlight its record')), pre));
}
let splitHl = null;
function paintSplit() {
  const pre = $('#splitpre'); if (!pre) return;
  const lines = (D.splitText || '').split(/\r?\n/).filter(Boolean);
  pre.innerHTML = lines.length ? lines.map((ln, i) => `<div class="ln${i === splitHl ? ' hl' : ''}">${colorM2(ln)}</div>`).join('') : '<span class="e">Nothing to generate yet.</span>';
  const hl = $('.ln.hl', pre); if (hl) hl.scrollIntoView({ block: 'nearest' });
}
function hlRow(key) {
  const ids = []; (D.splitText || '').split(/\r?\n/).filter(Boolean).forEach((ln, i) => { if (ln.startsWith('"ID"')) ids.push(i); });
  const n = flatLines().findIndex(x => x.ii + ':' + x.li === key); splitHl = n >= 0 && ids[n] != null ? ids[n] : null; paintSplit();
}
window.refreshSplit = debounce(async () => {
  if (D.tab !== 'split' || !D.decl) return;
  try { await saveNow(true); const r = await api(`/declarations/${D.decl.id}/preview`); D.splitText = r.text || ''; D.issues = r.issues; paintMeta(); paintSplit(); } catch (e) { const p = $('#splitpre'); if (p) p.textContent = e.message; }
}, 500);

// ---------- dashboard: charts + onboarding
const PAL = ['#4c8dff', '#14b8a6', '#f59e0b', '#a78bfa', '#f472b6', '#34d399', '#fb7185', '#94a3b8'];
function donut(rows) {
  const tot = rows.reduce((a, r) => a + r[1], 0) || 1, R = 52, C = 2 * Math.PI * R; let off = 0;
  const arcs = rows.map((r, i) => { const len = C * r[1] / tot, s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${PAL[i % 8]}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(r[0])}: ${fmt(r[1])}</title></circle>`; off += len; return s; }).join('');
  return h('div', { class: 'row', style: 'gap:18px;flex-wrap:nowrap' }, h('div', { html: `<svg width="140" height="140" viewBox="0 0 140 140">${arcs}<text x="70" y="66" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">Total</text><text x="70" y="84" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${esc(fmt(tot, 0))}</text></svg>` }),
    h('div', { style: 'flex:1;min-width:0' }, rows.map((r, i) => h('div', { class: 'lgd' }, h('i', { style: `background:${PAL[i % 8]}` }), h('span', {}, r[0]), h('b', {}, Math.round(100 * r[1] / tot) + '%')))));
}
function vbars(rows) {
  const mx = Math.max(1, ...rows.map(r => r[1]));
  return h('div', { class: 'vb' }, rows.map((r, i) => h('div', { class: 'vcol', title: `Chapter ${r[0]}: ${fmt(r[1])} kg` }, h('em', {}, r[1] >= 1000 ? (r[1] / 1000).toFixed(1) + 't' : Math.round(r[1])), h('i', { style: `height:${Math.max(3, 100 * r[1] / mx)}%;background:${PAL[i % 8]}` }), h('span', {}, r[0]))));
}
function chartsRow(d) {
  const empty = h('p', { class: 'mut' }, 'No data yet. Charts fill in once declarations have lines.');
  return h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('b', {}, 'Value by country of origin'), h('div', { style: 'margin-top:12px' }, d.value_by_country.length ? donut(d.value_by_country) : empty)),
    h('div', { class: 'card' }, h('b', {}, 'Net weight by HS chapter (kg)'), h('div', { style: 'margin-top:12px' }, d.weight_by_chapter.length ? vbars(d.weight_by_chapter) : empty)));
}
function onboardCard(d) {
  if (store('ob_hide')) return null;
  const blank = M.codes.filter(c => ['regime', 'declaration', 'payment'].includes(c.kind) && c.active && c.code === '').length;
  const S = [
    [blank === 0, 'Fill in the numeric codes', blank ? `${blank} regime, declaration or payment entries still have no code` : 'All codes are set', '#/settings', 'Open Settings'],
    [d.declarations > 0, 'Create or import a declaration', 'Upload an Excel, CSV or existing M2 file', '#/declarations', 'Open declarations'],
    [d.generated > 0, 'Generate your first M2 file', 'Open a declaration, then Prepare Text Files', '#/declarations', 'Go'],
    [!!store('ob_keys'), 'Learn the keyboard shortcuts', 'Arrow keys, Ctrl+D fill down, paste from Excel', null, 'Show shortcuts'],
    [!!store('ob_dens'), 'Pick a density', 'Compact fits more lines on screen', null, 'Toggle density'],
  ];
  const done = S.filter(s => s[0]).length;
  return h('div', { class: 'card onb' }, h('div', { class: 'row' }, h('b', {}, I('star', 16), ' Getting started'), h('span', { class: 'mut' }, `${done} of ${S.length} done`), h('button', { class: 'btn sm ghost right', title: 'Hide', onclick: () => { store('ob_hide', true); go(); } }, I('x', 14))),
    h('div', { class: 'prog' }, h('i', { style: `width:${100 * done / S.length}%` })),
    h('div', { class: 'steps' }, S.map(([ok, t, sub, href, cta], n) => h('div', { class: 'step' + (ok ? ' ok' : '') }, h('span', { class: 'sn' }, ok ? I('check', 14) : n + 1), h('div', {}, h('b', {}, t), h('div', { class: 'mut' }, sub)), !ok ? h('button', { class: 'btn sm right', onclick: () => href ? location.hash = href : n === 3 ? shortcutsModal() : $('#dens').click() }, cta) : null))));
}
$$('.ico').forEach(e => e.innerHTML = ic(e.dataset.i, +e.dataset.s || 18));
