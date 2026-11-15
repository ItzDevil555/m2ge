// ======================= Declaration workspace =======================
const D = { decl: null, issues: [], tab: 'declaration', page: 0, inv: 'all', q: '', onlyIssues: false, sel: new Set(), undo: [], redo: [], lastFile: null, dirty: false, saving: false, order: [] };
const PAGE = 100;

function newLine() { return { hs_inv: '', description: '', unit: '', flag: 'N', f17: '0', pd: [], extra: [], hs8: '', hs12: '', hs_status: 'missing', qty: 0, weight: 0, value: 0, country: '' }; }
const flatLines = () => D.decl.invoices.flatMap((inv, ii) => inv.lines.map((l, li) => ({ ii, li, l, inv })));
const totals = () => { const f = flatLines(); return { n: f.length, qty: f.reduce((a, x) => a + (+x.l.qty || 0), 0), weight: f.reduce((a, x) => a + (+x.l.weight || 0), 0), value: f.reduce((a, x) => a + (+x.l.value || 0), 0) }; };

function snapshot() { D.undo.push(JSON.stringify(D.decl)); if (D.undo.length > 60) D.undo.shift(); D.redo = []; }
function restore(s) { const rev = D.decl._rev; D.decl = JSON.parse(s); D.decl._rev = rev; afterChange(true); }
function undo() { if (!D.undo.length) return; D.redo.push(JSON.stringify(D.decl)); restore(D.undo.pop()); }
function redo() { if (!D.redo.length) return; D.undo.push(JSON.stringify(D.decl)); restore(D.redo.pop()); }

function setState(t, cls) { const s = $('#savestate'); if (s) { s.textContent = t; s.style.color = cls === 'err' ? 'var(--err)' : ''; } }
const autosave = debounce(() => saveNow(true), 1500);
const revalidate = debounce(async () => {
  try { const r = await api('/validate', { json: { decl: D.decl } }); D.issues = r.issues; paintMeta(); paintRows(); } catch (e) { }
}, 350);
function afterChange(rebuild) { D.dirty = true; setState('Unsaved changes…'); autosave(); revalidate(); if (rebuild) renderBody(); paintMeta(); if (D.tab === 'split' && window.refreshSplit) refreshSplit(); }
function mut(fn, rebuild = false) { snapshot(); fn(D.decl); afterChange(rebuild); }

async function saveNow(quiet) {
  if (!D.decl || D.saving) return; D.saving = true; setState('Saving…');
  try { const r = await api('/declarations/' + D.decl.id, { method: 'PUT', json: D.decl }); D.decl._rev = r._rev; D.decl.updated = r.updated; D.dirty = false; setState('Saved ' + new Date().toLocaleTimeString()); if (!quiet) toast('Saved', 'ok'); }
  catch (e) { setState('Not saved', 'err'); toast(e.message, 'err'); if (e.status === 409) modal({ title: 'Edit conflict', body: h('p', {}, e.message), buttons: [{ label: 'Reload latest', cls: 'pri', onclick: () => location.reload() }, { label: 'Keep editing' }] }); }
  D.saving = false;
}

async function runProcess(force) {
  setState('Processing…');
  const r = await api('/process', { json: { decl: D.decl, force } });
  snapshot(); D.decl = r.decl; D.issues = r.issues; D.dirty = true; renderBody(); paintMeta(); autosave();
  const c = { ok: 0, ambiguous: 0, missing: 0 }; flatLines().forEach(x => c[x.l.hs_status === 'manual' ? 'ok' : x.l.hs_status]++);
  toast(`HS matching done — ${c.ok} resolved, ${c.ambiguous} to choose, ${c.missing} missing`, c.ambiguous + c.missing ? '' : 'ok');
}

// ---------- page
route('declaration/:id', 'Declaration', async id => {
  const decl = await api('/declarations/' + id);
  Object.assign(D, { hdrOpen: true, decl, tab: 'declaration', page: 0, inv: 'all', q: '', onlyIssues: false, sel: new Set(), undo: [], redo: [], dirty: false, issues: [] });
  api('/declarations').then(l => D.order = l.map(x => x.id));
  leaving = async () => { if (D.dirty) await saveNow(true); };
  const root = h('div', { id: 'ws' });
  root.append(h('div', { id: 'tb' }), h('div', { id: 'hdr' }), h('div', { id: 'tabs' }), h('div', { id: 'body' }));
  setTimeout(() => { renderToolbar(); renderHeader(); renderTabs(); renderBody(); revalidate(); $('#title').textContent = 'Invoice Declaration — ' + D.decl.name; }, 0);
  return root;
});

function renderToolbar() {
  const mk = (label, fn, cls = '', title) => h('button', { class: 'btn ' + cls, title, onclick: fn }, label);
  const split = h('div', { class: 'split' }, mk('📝 Prepare Text Files ▾', e => { e.stopPropagation(); split.classList.toggle('open'); }, 'ok'),
    h('div', { class: 'menu' },
      h('a', { onclick: () => genFiles(false) }, '⬇ Generate & download (validated)'),
      h('a', { onclick: () => genFiles(true) }, '⚠ Generate anyway (ignore errors)'),
      h('a', { onclick: () => setTab('preview') }, '👁 Preview M2 text'),
      h('a', { onclick: () => historyModal() }, '🕘 Generated file history')));
  document.addEventListener('click', () => split.classList.remove('open'), { once: false });
  const idx = D.order.indexOf(D.decl.id);
  const nav = d => { const id = D.order[idx + d]; if (id) location.hash = '#/declaration/' + id; };
  $('#tb').replaceWith(h('div', { id: 'tb', class: 'tb' },
    mk('＋ New Declaration', async () => { const d = await api('/declarations', { json: {} }); location.hash = '#/declaration/' + d.id; }),
    mk('🗑 Delete', async () => { if (confirm('Delete this declaration?')) { D.dirty = false; await api('/declarations/' + D.decl.id, { method: 'DELETE' }); toast('Deleted'); location.hash = '#/declarations'; } }, 'danger'),
    mk('⧉ Duplicate', async () => { await saveNow(true); const d = await api(`/declarations/${D.decl.id}/duplicate`, { method: 'POST' }); location.hash = '#/declaration/' + d.id; }),
    h('span', { class: 'sep' }),
    mk('📋 Report for Customer', async () => { await saveNow(true); window.open(`/api/declarations/${D.decl.id}/report`, '_blank'); }),
    mk('📗 Export To Excel', async () => { await saveNow(true); try { await download(`/api/declarations/${D.decl.id}/xlsx`, 'declaration.xlsx'); } catch (e) { toast(e.message, 'err'); } }),
    split,
    h('span', { class: 'sep' }),
    mk('⚖ Distribute Weight', weightModal), mk('⚙ Process', () => runProcess(false).catch(e => toast(e.message, 'err')), '', 'Match HS codes against the HS master and validate'),
    mk('🗂 Column mapping', () => D.lastFile ? importWizard(D.lastFile) : toast('Import an Excel/CSV file first')),
    mk('✖ Clear', () => { if (confirm('Remove all invoices from this declaration?')) mut(d => d.invoices = [], true); }),
    h('span', { class: 'sep' }), mk('↶', undo, '', 'Undo'), mk('↷', redo, '', 'Redo'),
    h('span', { class: 'sp' }),
    mk('‹', () => nav(1), 'sm'), mk('›', () => nav(-1), 'sm'),
    mk('Save', () => saveNow(false)), mk('Save and Close', async () => { await saveNow(true); location.hash = '#/declarations'; }, 'pri')));
}

function sel(kind, key, req) {
  const cur = D.decl.header[key]; const bad = req && !cur; const reg = D.decl.header.regime_id;
  let opts = codesOf(kind);
  if (kind === 'declaration') opts = opts.filter(c => c.parent ? c.parent == reg : c.id == cur);
  const s = h('select', { class: bad ? 'bad' : '', disabled: kind === 'declaration' && !reg, onchange: e => mut(d => { d.header[key] = e.target.value ? +e.target.value : null; if (key === 'regime_id') { const dc = M.codes.find(c => c.id == d.header.declaration_id); if (dc && dc.parent && dc.parent != d.header.regime_id) d.header.declaration_id = null; } }, key === 'regime_id') },
    h('option', { value: '' }, kind === 'declaration' && !reg ? 'Select regime type first' : 'Select…'), opts.map(c => h('option', { value: c.id, selected: c.id == cur }, c.label + (c.code === '' ? '  — (no code set)' : ''))));
  return s;
}
function field(label, el, cls = 'c4', req) { return h('label', { class: 'f ' + cls }, h('span', { class: req ? 'req' : '' }, label), el); }
function inp(key, type = 'text', opts = {}) {
  const v = D.decl.header[key]; const bad = opts.req && !String(v ?? '').trim();
  return h('input', { type, value: v ?? '', class: bad ? 'bad' : '', list: opts.list, step: opts.step, onchange: e => mut(d => d.header[key] = type === 'number' ? (e.target.value === '' ? null : +e.target.value) : e.target.value) });
}

function renderHeader() {
  const H = D.decl.header; const open = D.hdrOpen !== false;
  const dl = h('datalist', { id: 'parties' }, M.parties.map(p => h('option', { value: p.name })));
  const shipper = h('div', { class: 'row', style: 'flex-wrap:nowrap' }, inp('shipper', 'text', { list: 'parties', req: true }), h('button', { class: 'btn sm', title: 'Manage shippers / buyers', onclick: partiesModal }, I('edit', 14)));
  const inco = h('select', { class: !H.incoterm ? 'bad' : '', onchange: e => mut(d => d.header.incoterm = e.target.value) }, h('option', { value: '' }, 'Select…'), codesOf('incoterm').map(c => h('option', { value: c.code, selected: c.code === H.incoterm }, c.label)));
  const cur = h('select', { class: !H.currency ? 'bad' : '', onchange: e => mut(d => d.header.currency = e.target.value) }, h('option', { value: '' }, 'Select…'), codesOf('currency').map(c => h('option', { value: c.code, selected: c.code === H.currency }, c.label)));
  const el = h('div', { id: 'hdr', class: 'card collapse', style: 'margin-bottom:14px' },
    h('div', { class: 'h', onclick: () => { D.hdrOpen = !open; renderHeader(); } }, open ? '▾' : '▸', ' Declaration header', h('span', { class: 'mut right', style: 'font-weight:400' }, open ? 'Collapse header' : `${H.shipper || '—'} · ${H.currency || ''} ${H.incoterm || ''}`)),
    open ? h('div', { class: 'form' },
      field('Declaration name', h('input', { value: D.decl.name, onchange: e => mut(d => d.name = e.target.value) }), 'c4'),
      field('Regime Type', sel('regime', 'regime_id', true), 'c4', true), field('Declaration Type', sel('declaration', 'declaration_id', true), 'c4', true),
      field('Shipper / Seller', shipper, 'c8', true), field('Payment Type', sel('payment', 'payment_id', true), 'c4', true),
      field('Invoice Type', sel('invoice_type', 'invoice_type_id'), 'c4'), field('IncoTerm', inco, 'c4', true), field('Currency', cur, 'c4', true),
      field('Buyer Name', inp('buyer'), 'c4'), field('Number of Pages', inp('pages', 'number'), 'c2'), field('Declared total weight (kg)', inp('declared_weight', 'number', { step: '0.001' }), 'c4'), dl) : null);
  $('#hdr').replaceWith(el);
}

function renderTabs() {
  const n = D.decl.invoices.length, hsn = new Set(flatLines().map(x => x.l.hs8 || x.l.hs_inv)).size;
  const t = (k, label, badge) => h('a', { class: D.tab === k ? 'on' : '', onclick: () => setTab(k) }, label, badge != null ? h('span', { class: 'badge' }, badge) : null);
  $('#tabs').replaceWith(h('div', { id: 'tabs', class: 'tabs' }, t('declaration', '📥 Import'), t('invoices', '🧾 Invoices', n), t('lines', '✏️ Lines', totals().n), t('hs', '🔢 HS Codes', hsn), t('split', '⇄ Side by side'), t('preview', '👁 M2 Preview')));
}
function setTab(t) { D.tab = t; D.hdrOpen = t === 'declaration'; renderTabs(); renderBody(); }

function paintMeta() {
  const er = D.issues.filter(i => i.level === 'error').length, wr = D.issues.filter(i => i.level === 'warning').length;
  const ib = $('#issuebar'); if (ib) { ib.replaceWith(issueBar()); }
  const ft = $('#foot'); if (ft) { const t = totals(); ft.textContent = `${t.n} lines · qty ${fmt(t.qty, 2)} · net weight ${fmt(t.weight, 4)} kg · value ${fmt(t.value, 3)} ${D.decl.header.currency || ''}`; }
  const bs = $('#tabs .badge'); if (bs) renderTabs();
}
function issueBar() {
  const er = D.issues.filter(i => i.level === 'error').length, wr = D.issues.filter(i => i.level === 'warning').length;
  return h('div', { id: 'issuebar', class: 'row', style: 'margin-bottom:10px' },
    h('span', { class: 'pill ' + (er ? '' : 'Generated'), style: er ? 'background:var(--errb);color:var(--err)' : '' }, er ? `${er} error${er > 1 ? 's' : ''}` : '✓ No errors'),
    wr ? h('span', { class: 'pill Validated' }, wr + ' warnings') : null,
    D.issues.length ? h('button', { class: 'btn sm', onclick: issuesModal }, 'Show validation checklist') : null);
}
function issuesModal() {
  const list = h('div', { class: 'issues', style: 'max-height:60vh' }, D.issues.map(i => h('div', { class: 'iss ' + i.level, onclick: () => { if (i.line != null) jumpTo(i.invoice, i.line); else if (i.field) { setTab('declaration'); } document.querySelector('.modalbg')?.remove(); } }, h('b', {}, i.level === 'error' ? '✖' : i.level === 'warning' ? '▲' : 'ℹ'), i.msg)));
  modal({ title: `Validation checklist (${D.issues.length})`, body: list.children.length ? list : h('p', {}, 'Everything looks good.') });
}
function jumpTo(ii, li) {
  D.tab = 'lines'; D.inv = 'all'; D.q = ''; D.onlyIssues = false;
  const idx = flatLines().findIndex(x => x.ii === ii && x.li === li); D.page = Math.max(0, Math.floor(idx / PAGE)); renderTabs(); renderBody();
  setTimeout(() => { const r = $(`tr[data-k="${ii}:${li}"]`); if (r) { r.scrollIntoView({ block: 'center' }); r.style.outline = '2px solid var(--brand)'; } }, 50);
}

function renderBody() {
  const b = h('div', { id: 'body' });
  const t = D.tab;
  b.append(issueBar());
  if (t === 'declaration') b.append(importPanel()); else if (t === 'invoices') b.append(invoicesTab()); else if (t === 'lines') b.append(linesTab());
  else if (t === 'hs') b.append(hsTab()); else if (t === 'preview') b.append(previewTab()); else if (t === 'split') b.append(splitTab());
  $('#body').replaceWith(b); renderHeader(); paintMeta(); paintRows();
}

// ---------- import panel
function importPanel() {
  let mode = D.mode || 'excel';
  const wrap = h('div', { class: 'card' });
  const draw = () => {
    D.mode = mode;
    const accept = { excel: '.xlsx,.xlsm,.xls', csv: '.csv,.txt', m2: '.txt' }[mode];
    const input = h('input', { type: 'file', accept, multiple: mode === 'm2', style: 'display:none', onchange: e => handle([...e.target.files]) });
    const dz = h('div', { class: 'drop' }, h('div', { style: 'font-size:34px' }, mode === 'excel' ? '📗' : mode === 'csv' ? '📑' : '📄'), h('div', {}, h('b', {}, 'Drop ' + { excel: 'an Excel invoice', csv: 'a CSV file', m2: 'M2 text file(s)' }[mode] + ' here'), ' or '),
      h('button', { class: 'btn pri', style: 'margin-top:8px', onclick: () => input.click() }, 'Select file'), input);
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); handle([...e.dataTransfer.files]); };
    wrap.replaceChildren(h('div', { class: 'row', style: 'margin-bottom:12px' }, h('b', { style: 'font-size:16px' }, 'Import invoices'),
      h('div', { class: 'seg right' }, ['excel:Excel File', 'csv:CSV File', 'm2:M2 Text File(s)'].map(s => { const [k, l] = s.split(':'); return h('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; draw(); } }, l); }), h('button', { disabled: true, title: 'PDF extraction is not part of this build' }, 'PDF (n/a)'))),
      dz, h('p', { class: 'mut' }, mode === 'm2' ? 'Reads an existing M2 file back into an editable declaration (round-trip).' : 'The header row, columns, invoice number/date and incoterm are detected automatically; you confirm the mapping next.'));
  };
  const handle = async files => {
    if (!files.length) return;
    try {
      if (mode === 'm2' || files[0].name.toLowerCase().endsWith('.txt') && mode !== 'csv') {
        const fd = new FormData(); files.forEach(f => fd.append('files', f));
        const r = await api('/import/m2', { method: 'POST', body: fd });
        mut(d => { Object.entries(r.header).forEach(([k, v]) => { if (v && !d.header[k]) d.header[k] = v; }); d.invoices.push(...r.invoices); }, true);
        toast(`Imported ${r.invoices.length} invoice(s) from M2 text`, 'ok'); await runProcess(false); setTab('lines');
      } else { D.lastFile = files[0]; importWizard(files[0]); }
    } catch (e) { toast(e.message, 'err'); }
  };
  draw(); return wrap;
}

async function importWizard(file, sheet) {
  let ins;
  try { const fd = new FormData(); fd.append('file', file); fd.append('sheet', sheet || ''); ins = await api('/import/inspect', { method: 'POST', body: fd }); } catch (e) { return toast(e.message, 'err'); }
  const map = { ...ins.mapping }; const info = ins.info;
  const st = { group: false, tpl: false, tplName: '' };
  const body = h('div');
  const draw = () => {
    const mapRow = ins.fields.map(f => {
      const c = ins.confidence[f.key];
      return h('label', { class: 'f' }, h('span', {}, f.label + (c ? `  · ${c >= 80 ? 'high' : c >= 55 ? 'medium' : 'low'} confidence` : '')),
        h('select', { class: ['hs_inv', 'qty', 'weight', 'value'].includes(f.key) && map[f.key] == null ? 'bad' : '', onchange: e => { map[f.key] = e.target.value === '' ? null : +e.target.value; draw(); } },
          h('option', { value: '' }, '— not mapped —'), ins.header.map((c, i) => h('option', { value: i, selected: map[f.key] === i }, `${i + 1}. ${c || '(blank)'}`))));
    });
    const prev = h('div', { class: 'hold', style: 'max-height:240px' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ins.header.map((c, i) => h('th', {}, (Object.entries(map).find(([, v]) => v === i) || [''])[0] ? '→ ' + (Object.entries(map).find(([, v]) => v === i)[0]) : '', h('br'), c)))),
      h('tbody', {}, ins.preview.map(r => h('tr', {}, ins.header.map((_, i) => h('td', { style: 'padding:4px 8px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;' + (Object.values(map).includes(i) ? 'background:var(--okb)' : '') }, r[i] ?? '')))))));
    body.replaceChildren(
      h('div', { class: 'row' }, ins.sheets.length > 1 ? h('label', { class: 'f' }, h('span', {}, 'Worksheet'), h('select', { onchange: e => { close(); importWizard(file, e.target.value); } }, ins.sheets.map(s => h('option', { selected: s === ins.sheet }, s)))) : null,
        h('span', { class: 'mut' }, `Header row ${ins.header_row + 1} · ${ins.row_count} data rows${ins.template ? ' · template “' + ins.template + '” applied' : ''}`)),
      h('h4', {}, 'Invoice details'), h('div', { class: 'form' },
        field('Invoice number', h('input', { id: 'w_no', value: info.invoice_no }), 'c3'), field('Invoice date', h('input', { id: 'w_date', type: 'date', value: info.invoice_date }), 'c3'),
        field('Currency (blank = header)', h('input', { id: 'w_cur', value: info.currency }), 'c3'), field('IncoTerm (blank = header)', h('input', { id: 'w_inco', value: info.incoterm }), 'c3')),
      h('h4', {}, 'Column mapping'), h('div', { class: 'form' }, mapRow.map(m => { m.classList.add('c4'); return m; })),
      h('h4', {}, 'Preview (first rows)'), prev,
      h('div', { class: 'row', style: 'margin-top:12px' }, h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', checked: st.group, onchange: e => st.group = e.target.checked }), 'Group by HS code (merge lines with the same HS + origin)'),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', checked: st.tpl, onchange: e => { st.tpl = e.target.checked; } }), 'Save mapping as template for this shipper')));
  };
  draw();
  const close = modal({
    title: 'Column mapping — ' + file.name, body, buttons: [{ label: 'Cancel' }, {
      label: 'Import lines', cls: 'pri', onclick: async () => {
        const miss = ['hs_inv', 'qty', 'weight', 'value'].filter(k => map[k] == null);
        if (miss.length && !confirm('Not mapped: ' + miss.join(', ') + '. Continue anyway?')) return false;
        const fd = new FormData(); fd.append('file', file); fd.append('sheet', ins.sheet || ''); fd.append('mapping', JSON.stringify(map)); fd.append('header_row', ins.header_row);
        fd.append('group_by_hs', st.group); fd.append('invoice_no', $('#w_no').value); fd.append('invoice_date', $('#w_date').value); fd.append('currency', $('#w_cur').value); fd.append('incoterm', $('#w_inco').value);
        try {
          const r = await api('/import/apply', { method: 'POST', body: fd });
          if (st.tpl) await api('/templates', { json: { name: file.name, shipper: D.decl.header.shipper, header: ins.header, map } });
          mut(d => { d.invoices.push(...r.invoices); if (!d.header.incoterm && info.incoterm) d.header.incoterm = $('#w_inco').value || info.incoterm; if (!d.header.shipper && info.shipper) d.header.shipper = info.shipper; }, true);
          if (r.problems.length) toast(`${r.problems.length} cell(s) could not be read (flagged as 0 / blank)`, 'err');
          toast(`Imported ${r.lines} lines`, 'ok'); await runProcess(false); setTab('lines');
        } catch (e) { toast(e.message, 'err'); return false; }
      }
    }]
  });
}

// ---------- invoices tab
function invoicesTab() {
  const wrap = h('div', { class: 'card' });
  if (!D.decl.invoices.length) return h('div', { class: 'card empty' }, 'No invoices yet — use the Import tab, or ', h('button', { class: 'btn sm', onclick: () => mut(d => d.invoices.push({ number: '', date: new Date().toISOString().slice(0, 10), currency: '', incoterm: '', lines: [newLine()] }), true) }, '＋ add an empty invoice'));
  const sel = new Set();
  const rows = D.decl.invoices.map((inv, ii) => {
    const t = inv.lines.reduce((a, l) => ({ q: a.q + +l.qty, w: a.w + +l.weight, v: a.v + +l.value }), { q: 0, w: 0, v: 0 });
    const f = (k, type = 'text', w) => h('input', { type, value: inv[k] ?? '', style: w, onchange: e => mut(d => d.invoices[ii][k] = e.target.value) });
    return h('tr', {}, h('td', {}, h('input', { type: 'checkbox', style: 'width:auto', onchange: e => e.target.checked ? sel.add(ii) : sel.delete(ii) })), h('td', {}, f('number')), h('td', {}, h('input', { value: fmtDate(inv.date), placeholder: 'dd/mm/yy', style: 'width:92px', onchange: e => { const v = parseDate(e.target.value); if (v === null) { e.target.classList.add('bad'); return toast('Date must be dd/mm/yy', 'err'); } e.target.classList.remove('bad'); e.target.value = fmtDate(v); mut(d => d.invoices[ii].date = v); } })), h('td', {}, f('currency', 'text', 'width:70px')), h('td', {}, f('incoterm', 'text', 'width:70px')),
      h('td', { class: 'num' }, inv.lines.length), h('td', { class: 'num' }, fmt(t.q, 2)), h('td', { class: 'num' }, fmt(t.w, 4)), h('td', { class: 'num' }, fmt(t.v, 3)),
      h('td', {}, h('button', { class: 'btn sm', onclick: () => { D.inv = String(ii); setTab('lines'); } }, 'Open lines')));
  });
  wrap.append(h('div', { class: 'row', style: 'margin-bottom:10px' }, h('b', {}, 'Invoices'), h('span', { class: 'right row' },
    h('button', { class: 'btn sm', onclick: () => mut(d => d.invoices.push({ number: '', date: new Date().toISOString().slice(0, 10), currency: '', incoterm: '', lines: [] }), true) }, '＋ Add invoice'),
    h('button', { class: 'btn sm danger', onclick: () => { if (!sel.size) return toast('Select invoices first'); if (confirm('Remove selected invoices?')) mut(d => d.invoices = d.invoices.filter((_, i) => !sel.has(i)), true); } }, 'Clear selected'))),
    h('div', { class: 'hold' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['', 'Invoice No', 'Invoice Date', 'Cur', 'Inco', 'No. of Lines', 'Qty', 'Total Weight', 'Total Value', ''].map(x => h('th', {}, x)))), h('tbody', {}, rows))));
  return wrap;
}

// ---------- lines grid (review)
function visibleLines() {
  let f = flatLines();
  if (D.inv !== 'all') f = f.filter(x => String(x.ii) === D.inv);
  if (D.q) { const q = D.q.toLowerCase(); f = f.filter(x => (x.l.hs_inv + ' ' + x.l.hs8 + ' ' + x.l.description + ' ' + x.l.country).toLowerCase().includes(q)); }
  if (D.onlyIssues) { const bad = new Set(D.issues.filter(i => i.line != null && i.level !== 'info').map(i => i.invoice + ':' + i.line)); f = f.filter(x => bad.has(x.ii + ':' + x.li) || x.l.hs_status !== 'ok' && x.l.hs_status !== 'manual'); }
  return f;
}
function linesTab() {
  const wrap = h('div', { class: 'card' });
  if (!D.decl.invoices.length) return h('div', { class: 'card empty' }, 'Nothing to review yet — import an invoice first.');
  const vis = visibleLines(); const pages = Math.max(1, Math.ceil(vis.length / PAGE)); if (D.page >= pages) D.page = pages - 1;
  const slice = vis.slice(D.page * PAGE, D.page * PAGE + PAGE);
  const tools = h('div', { class: 'row', style: 'margin-bottom:10px' },
    h('select', { style: 'width:auto', onchange: e => { D.inv = e.target.value; D.page = 0; renderBody(); } }, h('option', { value: 'all' }, 'All invoices'), D.decl.invoices.map((i, k) => h('option', { value: k, selected: D.inv === String(k) }, i.number || 'Invoice #' + (k + 1)))),
    h('input', { style: 'width:220px', placeholder: 'Filter lines…', value: D.q, oninput: debounce(e => { D.q = e.target.value; D.page = 0; renderBody(); const i = $('#body input[placeholder^="Filter"]'); if (i) { i.focus(); i.setSelectionRange(99, 99); } }, 300) }),
    h('label', { class: 'row' }, h('input', { type: 'checkbox', style: 'width:auto', checked: D.onlyIssues, onchange: e => { D.onlyIssues = e.target.checked; D.page = 0; renderBody(); } }), 'Issues only'),
    h('span', { class: 'right row' },
      savedFiltersUI(), h('button', { class: 'btn sm pri', onclick: bulkEditModal }, I('wand', 14), ' Bulk edit'), h('button', { class: 'btn sm', onclick: () => bulkModal('country') }, 'Set country'), h('button', { class: 'btn sm', onclick: () => bulkModal('unit') }, 'Set unit'), h('button', { class: 'btn sm', onclick: () => bulkModal('hs') }, 'Apply HS to selected'),
      h('button', { class: 'btn sm', onclick: () => { const t = vis[0]; mut(d => d.invoices[t ? t.ii : 0].lines.push(newLine()), true); } }, '＋ Line'),
      h('button', { class: 'btn sm danger', onclick: () => { if (!D.sel.size) return toast('Select lines first'); mut(d => d.invoices.forEach((inv, ii) => inv.lines = inv.lines.filter((_, li) => !D.sel.has(ii + ':' + li))), true); D.sel.clear(); renderBody(); } }, 'Delete selected')));
  const cols = ['', h('input', { type: 'checkbox', style: 'width:auto', title: 'Select page', onchange: e => selectPage(e.target.checked) }), '#', 'Inv', 'Master HS', 'Invoice HS', 'Description', 'Unit', 'Qty', 'Net weight', 'Value', 'Origin'];
  const cell = (x, k, cls = '', extra = {}) => h('td', { class: cls }, h('input', {
    value: x.l[k] ?? '', 'data-col': k, ...extra,
    onchange: e => { let v = e.target.value; if (['qty', 'weight', 'value'].includes(k)) { v = parseFloat(String(v).replace(/,/g, '')) || 0; e.target.value = v; } if (k === 'country') { v = v.toUpperCase(); e.target.value = v; } mut(d => { d.invoices[x.ii].lines[x.li][k] = v; if (k === 'hs_inv') { d.invoices[x.ii].lines[x.li].hs_status = 'missing'; d.invoices[x.ii].lines[x.li].hs8 = ''; } }); },
    onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { const tr = e.target.closest('tr').nextElementSibling; if (tr) { const n = $(`input[data-col="${k}"]`, tr); if (n) { e.preventDefault(); n.focus(); n.select(); } } } }
  }));
  const rows = slice.map((x, n) => {
    const key = x.ii + ':' + x.li;
    return h('tr', { 'data-k': key }, h('td', { class: 'drag', title: 'Drag to reorder (Alt+Up/Down)' }, I('grip', 14)), h('td', {}, h('input', { type: 'checkbox', style: 'width:auto', checked: D.sel.has(key), onchange: e => e.target.checked ? D.sel.add(key) : D.sel.delete(key) })),
      h('td', { class: 'mut' }, x.li + 1), h('td', { class: 'mut', title: x.inv.number }, D.decl.invoices.length > 1 ? '#' + (x.ii + 1) : ''),
      h('td', { 'data-hs': key }, hsChip(x)), cell(x, 'hs_inv', 'mono'), cell(x, 'description', '', { style: 'min-width:220px' }), cell(x, 'unit', '', { style: 'width:52px' }), cell(x, 'qty', 'num', { style: 'width:80px' }), cell(x, 'weight', 'num', { style: 'width:90px' }), cell(x, 'value', 'num', { style: 'width:100px' }), cell(x, 'country', '', { style: 'width:50px' }));
  });
  wrap.append(tools, h('div', { class: 'hold' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))), h('tbody', {}, rows))),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { id: 'foot', class: 'mut' }), h('span', { class: 'right row' },
      h('button', { class: 'btn sm', disabled: D.page === 0, onclick: () => { D.page--; renderBody(); } }, '‹ Prev'), h('span', { class: 'mut' }, `Page ${D.page + 1} / ${pages} · ${vis.length} lines`), h('button', { class: 'btn sm', disabled: D.page >= pages - 1, onclick: () => { D.page++; renderBody(); } }, 'Next ›'))));
  return wrap;
}
function hsChip(x) {
  const s = x.l.hs_status || 'missing';
  const label = x.l.hs8 ? x.l.hs8 : (s === 'ambiguous' ? 'choose…' : 'missing');
  return h('span', { class: 'chip ' + s, title: 'Click to choose an HS master code' + (x.l.hs_source === 'learned' ? ' (learned)' : ''), onclick: () => hsPicker(x.ii, x.li) }, label, x.l.hs_source === 'learned' ? I('check', 12) : '');
}
function paintRows() {
  if (D.tab !== 'lines') return;
  const sev = {}; D.issues.forEach(i => { if (i.line == null) return; const k = i.invoice + ':' + i.line; const o = { error: 3, warning: 2, info: 1 }; if ((o[i.level] || 0) > (o[sev[k]] || 0)) sev[k] = i.level; });
  $$('#body tbody tr[data-k]').forEach(tr => { const k = tr.dataset.k; const s = sev[k]; tr.className = s === 'error' ? 'err' : s === 'warning' ? 'warn' : 'okr'; const [ii, li] = k.split(':').map(Number); const l = D.decl.invoices[ii]?.lines[li]; if (l) { const td = $('[data-hs]', tr); td.replaceChildren(hsChip({ ii, li, l })); } });
}

async function hsPicker(ii, li) {
  const l = D.decl.invoices[ii].lines[li];
  const list = h('div', { class: 'hold', style: 'max-height:46vh' }); let remember = true; let mode = 'cand';
  const q = h('input', { placeholder: 'Search the HS master by code or description (English/Arabic)…' });
  const draw = (rows, note) => {
    list.replaceChildren(...(rows.length ? rows.map(o => h('div', { class: 'opt' + (l.hs8 === o.old8 && l.hs12 === o.new12 ? ' sel' : ''), onclick: () => {
      mut(d => { const t = d.invoices[ii].lines[li]; t.hs8 = o.old8; t.hs12 = o.new12; t.hs_status = 'manual'; t.hs_source = 'manual'; if (!t.unit) t.unit = o.unit_code; }); if (remember) api('/hs/remember', { json: { shipper: D.decl.header.shipper, hs_inv: l.hs_inv, hs8: o.old8, hs12: o.new12 } }).catch(() => { });
      close(); paintRows(); renderTabs(); } },
      h('div', { class: 'row' }, h('b', { class: 'mono' }, o.old8), h('span', { class: 'mono mut' }, '→ ' + o.new12), h('span', { class: 'right row' }, o.score != null ? h('span', { class: 'badge' }, o.score + '% match') : null, h('span', { class: 'badge' }, o.unit_code || ''), h('span', { class: 'badge' }, 'duty ' + o.duty + '%'))),
      h('div', {}, o.desc_en), h('div', { class: 'ar mut' }, o.desc_ar))) : [h('div', { class: 'empty' }, note || 'No candidates found — try searching.')]));
  };
  let close = modal({
    title: `HS master — invoice HS “${l.hs_inv || '—'}”  ·  ${l.description || ''}`.slice(0, 120), size: '', body: h('div', {}, q, h('br'), list,
      h('label', { class: 'row', style: 'margin-top:10px' }, h('input', { type: 'checkbox', style: 'width:auto', checked: true, onchange: e => remember = e.target.checked }), 'Remember this choice for this shipper and invoice HS')), buttons: [{ label: 'Close' }]
  });
  const cand = await api('/hs/candidates', { json: { hs_inv: l.hs_inv, description: l.description, shipper: D.decl.header.shipper } });
  draw(cand.options, 'No candidate for this invoice HS code — search by description.');
  q.oninput = debounce(async () => { if (!q.value.trim()) return draw(cand.options); draw(await api('/hs/search?q=' + encodeURIComponent(q.value))); }, 250);
}

function bulkModal(kind) {
  if (!D.sel.size) return toast('Select lines first (checkboxes)');
  const inp = h('input', { placeholder: kind === 'country' ? 'ISO-2, e.g. DE' : kind === 'unit' ? 'u, kg, m2…' : 'HS master code (8 or 12 digits)' });
  modal({
    title: `Set ${kind} on ${D.sel.size} selected line(s)`, size: 'sm', body: inp, buttons: [{ label: 'Cancel' }, {
      label: 'Apply', cls: 'pri', onclick: async () => {
        const v = inp.value.trim(); if (!v) return false;
        let m = null; if (kind === 'hs') { const r = await api('/hs/search?q=' + encodeURIComponent(v), {}); m = r[0]; if (!m) { toast('Code not found in the HS master', 'err'); return false; } }
        mut(d => { d.invoices.forEach((inv, ii) => inv.lines.forEach((l, li) => { if (!D.sel.has(ii + ':' + li)) return; if (kind === 'country') l.country = v.toUpperCase(); else if (kind === 'unit') l.unit = v; else { l.hs8 = m.old8; l.hs12 = m.new12; l.hs_status = 'manual'; } })); }, true);
      }
    }]
  });
}

// ---------- weight distribution
function weightModal() {
  const T = totals();
  const tot = h('input', { type: 'number', step: '0.001', value: D.decl.header.declared_weight ?? T.weight });
  const basis = h('select', {}, h('option', { value: 'value' }, 'Proportional to value'), h('option', { value: 'qty' }, 'Proportional to quantity'), h('option', { value: 'equal' }, 'Equal'));
  const step = h('select', {}, [['0.001', '0.001 kg'], ['0.1', '0.1 kg'], ['1', '1 kg (whole kg)']].map(([v, l]) => h('option', { value: v }, l)));
  const min = h('input', { type: 'number', step: '0.001', value: 0 });
  const scope = h('select', {}, h('option', { value: 'all' }, 'Whole declaration'), D.decl.invoices.map((i, k) => h('option', { value: k }, 'Invoice ' + (i.number || '#' + (k + 1)))));
  const out = h('div', { class: 'mut', style: 'margin-top:10px' }, `Current net weight: ${fmt(T.weight, 4)} kg over ${T.n} lines.`);
  let result = null;
  const prev = async () => {
    try {
      const r = await api('/weights/distribute', { json: { decl: JSON.parse(JSON.stringify(D.decl)), total: +tot.value, basis: basis.value, step: +step.value, minimum: +min.value, invoice: scope.value === 'all' ? null : +scope.value } });
      result = r; out.innerHTML = `<b>Preview:</b> ${fmt(r.before, 4)} kg → <b>${fmt(r.after, 4)} kg</b> (target ${fmt(r.target, 4)}) · residual <b>${fmt(r.after - r.target, 4)}</b>`; out.style.color = 'var(--ok)';
    } catch (e) { result = null; out.textContent = e.message; out.style.color = 'var(--err)'; }
  };
  modal({
    title: 'Distribute Weight', size: 'sm', body: h('div', { class: 'form' }, field('Total net weight (kg)', tot, 'c12'), field('Basis', basis, 'c12'), field('Rounding step', step, 'c6'), field('Minimum per line (kg)', min, 'c6'), field('Apply to', scope, 'c12'), h('div', { class: 'c12' }, h('button', { class: 'btn', onclick: prev }, 'Preview'), out)),
    buttons: [{ label: 'Cancel' }, { label: 'Apply', cls: 'pri', onclick: async () => { await prev(); if (!result) return false; snapshot(); const rev = D.decl._rev; D.decl = result.decl; D.decl._rev = rev; D.decl.header.declared_weight = +tot.value; afterChange(true); toast('Weights distributed — exact total ' + fmt(result.after, 4) + ' kg', 'ok'); } }]
  });
}

// ---------- HS summary tab
function hsTab() {
  const agg = {}; flatLines().forEach(x => { const k = x.l.hs8 || '(unresolved)'; const a = agg[k] ||= { n: 0, q: 0, w: 0, v: 0 }; a.n++; a.q += +x.l.qty; a.w += +x.l.weight; a.v += +x.l.value; });
  const keys = Object.keys(agg).sort(); const body = h('tbody');
  api('/hs/describe', { json: { codes: keys } }).then(d => {
    body.replaceChildren(...keys.map(k => { const m = d[k] || {}; return h('tr', {}, h('td', { class: 'mono' }, k), h('td', {}, m.en || '', h('div', { class: 'ar mut' }, m.ar || '')), h('td', { class: 'num' }, agg[k].n), h('td', { class: 'num' }, fmt(agg[k].q, 2)), h('td', { class: 'num' }, fmt(agg[k].w, 4)), h('td', { class: 'num' }, fmt(agg[k].v, 3)), h('td', { class: 'num' }, m.duty != null ? m.duty + '%' : ''), h('td', { class: 'num' }, m.duty ? fmt(agg[k].v * m.duty / 100, 2) : '')); }));
  });
  return h('div', { class: 'card' }, h('p', { class: 'mut' }, 'Grouped summary of all HS master codes in this declaration. Estimated duty is for information only and is never written to the M2 file.'),
    h('div', { class: 'hold' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Master HS', 'Description (EN / AR)', 'Lines', 'Qty', 'Net weight', 'Value', 'Duty', 'Est. duty'].map(x => h('th', {}, x)))), body)));
}

// ---------- preview / diff / generation
function colorM2(text) {
  return text.split(/\r?\n/).filter(Boolean).map(line => { const f = line.match(/"(?:[^"]|"")*"/g) || []; return f.map((x, i) => `<span class="${i === 0 ? 'k' : /^"-?\d+(\.\d+)?"$/.test(x) ? 'n' : x === '""' ? 'e' : 's'}${f[0] === '"PD"' ? ' p' : ''}">${esc(x)}</span>`).join('<span class="e">,</span>'); }).join('\n');
}
function previewTab() {
  const pre = h('pre', { class: 'm2' }, 'Loading…'); const box = h('div');
  (async () => { await saveNow(true); try { const r = await api(`/declarations/${D.decl.id}/preview`); pre.innerHTML = r.text ? colorM2(r.text) : '<span class="e">Nothing to generate yet.</span>'; D.issues = r.issues; paintMeta(); } catch (e) { pre.textContent = e.message; } })();
  const file = h('input', { type: 'file', accept: '.txt', style: 'display:none', onchange: async e => {
    const fd = new FormData(); fd.append('file', e.target.files[0]); await saveNow(true);
    const r = await api(`/declarations/${D.decl.id}/diff`, { method: 'POST', body: fd });
    box.replaceChildren(h('div', { class: 'row', style: 'margin:10px 0' }, r.identical ? h('span', { class: 'pill Generated' }, `✓ Byte-identical to the reference (${r.gen_lines} lines)`) : h('span', { class: 'pill', style: 'background:var(--errb);color:var(--err)' }, `${r.changed} changed lines (reference ${r.ref_lines}, generated ${r.gen_lines})`)),
      r.identical ? null : h('div', { class: 'hold', style: 'max-height:260px' }, r.diff.map(d => h('div', { class: 'diffl ' + (d[0] === '+' && !d.startsWith('+++') ? 'a' : d[0] === '-' && !d.startsWith('---') ? 'd' : 'h') }, d))));
  } });
  return h('div', { class: 'card' }, h('div', { class: 'row', style: 'margin-bottom:10px' }, h('b', {}, 'Live M2 text'), h('span', { class: 'mut' }, 'Field-coloured: record type · numbers · text · empty'), h('span', { class: 'right row' }, h('button', { class: 'btn sm', onclick: () => file.click() }, '⇄ Compare with a reference file'), file)), pre, box);
}
async function genFiles(force) {
  await saveNow(true);
  try { const name = await download(`/api/declarations/${D.decl.id}/download?force=${force ? 1 : 0}`, 'm2.txt'); toast('Generated ' + name, 'ok'); D.decl.status = 'Generated'; }
  catch (e) {
    if (e.status === 422 && e.body) { D.issues = e.body.issues; paintMeta(); modal({ title: 'Fix these before generating', body: h('div', { class: 'issues', style: 'max-height:55vh' }, e.body.issues.slice(0, 80).map(i => h('div', { class: 'iss error' }, '✖ ' + i.msg))), buttons: [{ label: 'Close' }, { label: 'Generate anyway', cls: 'danger', onclick: () => genFiles(true) }] }); }
    else toast(e.message, 'err');
  }
}
async function historyModal() {
  const rows = await api(`/declarations/${D.decl.id}/history`);
  modal({ title: 'Generated files', body: rows.length ? h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['When', 'File', 'Lines', 'SHA-256', ''].map(x => h('th', {}, x)))), h('tbody', {}, rows.map(r => h('tr', {}, h('td', {}, fmtTs(r.ts)), h('td', {}, r.filename), h('td', {}, r.lines), h('td', { class: 'mono', title: r.sha256 }, r.sha256.slice(0, 12) + '…'), h('td', {}, h('a', { class: 'btn sm', href: '/api/generated/' + r.id }, '⬇')))))) : h('p', {}, 'Nothing generated yet.') });
}
function partiesModal() {
  const name = h('input', { placeholder: 'Company name' });
  const list = h('div'); const draw = () => list.replaceChildren(...M.parties.map(p => h('div', { class: 'row opt' }, h('span', { onclick: () => { mut(d => d.header.shipper = p.name, true); } }, p.name), h('button', { class: 'btn sm danger right', onclick: async () => { await api('/parties/' + p.id, { method: 'DELETE' }); await loadMeta(); draw(); } }, '✕'))));
  draw();
  modal({ title: 'Shippers / Sellers', size: 'sm', body: h('div', {}, h('div', { class: 'row' }, name, h('button', { class: 'btn pri', onclick: async () => { if (!name.value.trim()) return; await api('/parties', { json: { name: name.value } }); await loadMeta(); mut(d => d.header.shipper = name.value.trim(), true); name.value = ''; draw(); } }, 'Add & use')), h('br'), h('div', { class: 'hold' }, list)), buttons: [{ label: 'Close' }] });
}
document.addEventListener('keydown', e => {
  if (!D.decl || !location.hash.startsWith('#/declaration/')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(false); }
  if ((e.ctrlKey || e.metaKey) && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); } }
});
