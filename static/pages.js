// ======================= Dashboard, list, HS master, settings, audit =======================
route('', 'Dashboard', async () => {
  await loadMeta();
  const d = await api('/dashboard'); const max = Math.max(1, ...d.per_day.map(x => x.n));
  const kpi = (v, l, c) => h('div', { class: 'card kpi' }, h('b', { style: c ? 'color:' + c : '' }, v), h('span', {}, l));
  const hb = (rows, total) => rows.length ? rows.map(([k, n]) => h('div', { class: 'hbar' }, h('span', { title: k, style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, k), h('i', { style: `width:${Math.max(4, 100 * n / total)}%` }), h('b', {}, n))) : h('p', { class: 'mut' }, 'No data yet.');
  const top = d.top_chapters.reduce((a, b) => Math.max(a, b[1]), 1), ts = d.top_shippers.reduce((a, b) => Math.max(a, b[1]), 1);
  return h('div', { class: 'grid' },
    h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: async () => { const x = await api('/declarations', { json: {} }); location.hash = '#/declaration/' + x.id; } }, '＋ New Declaration'), h('a', { class: 'btn', href: '#/declarations' }, 'Open declarations')),
    h('div', { class: 'grid g4' }, kpi(d.declarations, 'Declarations'), kpi(d.lines.toLocaleString(), 'Lines processed'), kpi(d.generated, 'Files generated'), kpi(d.error_rate + '%', 'Declarations with errors', d.error_rate > 30 ? 'var(--err)' : 'var(--ok)')),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('b', {}, 'Declarations created — last 14 days'), h('div', { class: 'bars', style: 'margin:18px 0 26px' }, d.per_day.map(x => h('div', { style: `height:${Math.max(2, 100 * x.n / max)}%`, title: x.d + ': ' + x.n }, h('span', {}, x.d.slice(3)))))),
      h('div', { class: 'card' }, h('b', {}, 'Top HS chapters (by lines)'), hb(d.top_chapters, top))),
    h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('b', {}, 'Top shippers'), hb(d.top_shippers, ts)),
      h('div', { class: 'card' }, h('b', {}, 'HS master'), h('p', { class: 'mut' }, `${M.hs.rows.toLocaleString()} rows · ${M.hs.distinct_old.toLocaleString()} distinct 8-digit codes. Total declared value ${fmt(d.value)}.`), h('a', { class: 'btn', href: '#/hs' }, 'Browse HS master'))));
});

route('declarations', 'Declarations', async () => {
  await loadMeta();
  const box = h('div', { class: 'card' }); let q = '', st = '';
  const draw = async () => {
    const rows = await api(`/declarations?q=${encodeURIComponent(q)}&status=${st}`);
    box.querySelector('.res')?.remove();
    box.append(h('div', { class: 'res hold', style: 'max-height:none' }, rows.length ? h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Name', 'Shipper', 'Status', 'Invoices', 'Lines', 'Value', 'Issues', 'Updated', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, rows.map(r => h('tr', { style: 'cursor:pointer', onclick: () => location.hash = '#/declaration/' + r.id }, h('td', {}, h('b', {}, r.name)), h('td', {}, r.shipper), h('td', {}, h('span', { class: 'pill ' + r.status }, r.status)), h('td', { class: 'num' }, r.invoices ?? 0), h('td', { class: 'num' }, r.lines ?? 0), h('td', { class: 'num' }, fmt(r.value ?? 0, 2)),
        h('td', {}, r.errors ? h('span', { class: 'pill', style: 'background:var(--errb);color:var(--err)' }, r.errors + ' err') : h('span', { class: 'pill Generated' }, 'OK'), r.warnings ? h('span', { class: 'pill Validated', style: 'margin-left:4px' }, r.warnings + ' warn') : null), h('td', { class: 'mut' }, r.updated.replace('T', ' ').slice(0, 16)),
        h('td', { onclick: e => e.stopPropagation() }, h('button', { class: 'btn sm', title: 'Duplicate', onclick: async () => { const d = await api(`/declarations/${r.id}/duplicate`, { method: 'POST' }); location.hash = '#/declaration/' + d.id; } }, '⧉'), ' ',
          h('button', { class: 'btn sm danger', title: 'Delete', onclick: async () => { if (confirm('Delete "' + r.name + '"?')) { await api('/declarations/' + r.id, { method: 'DELETE' }); toast('Deleted — can be restored via API'); draw(); } } }, '🗑')))))) : h('div', { class: 'empty' }, 'No declarations yet. Create one, or import an existing M2 text file.')));
  };
  const m2file = h('input', { type: 'file', accept: '.txt', style: 'display:none', onchange: async e => {
    const fd = new FormData(); [...e.target.files].forEach(f => fd.append('files', f)); const r = await api('/import/m2', { method: 'POST', body: fd });
    const d = await api('/declarations', { json: { name: e.target.files[0].name.replace(/\.txt$/i, ''), header: r.header } }); d.invoices = r.invoices; await api('/declarations/' + d.id, { method: 'PUT', json: d }); location.hash = '#/declaration/' + d.id;
  } });
  box.append(h('div', { class: 'row', style: 'margin-bottom:12px' }, h('input', { style: 'width:260px', placeholder: 'Search name, shipper, invoice…', oninput: debounce(e => { q = e.target.value; draw(); }, 250) }),
    h('select', { style: 'width:auto', onchange: e => { st = e.target.value; draw(); } }, ['', 'Draft', 'Validated', 'Generated', 'Submitted'].map(s => h('option', { value: s }, s || 'All statuses'))),
    h('span', { class: 'right row' }, h('button', { class: 'btn', onclick: () => m2file.click() }, '⬆ Open an M2 text file'), m2file, h('button', { class: 'btn pri', onclick: async () => { const x = await api('/declarations', { json: {} }); location.hash = '#/declaration/' + x.id; } }, '＋ New Declaration'))));
  await draw(); return box;
});

route('hs', 'HS Master', async () => {
  await loadMeta(); const out = h('div', { class: 'hold', style: 'max-height:62vh' }); const q = h('input', { placeholder: 'Search by code (e.g. 8517, 01012110) or words (English / Arabic)…', style: 'max-width:520px' });
  const file = h('input', { type: 'file', accept: '.xlsx', style: 'display:none', onchange: async e => { const fd = new FormData(); fd.append('file', e.target.files[0]); try { toast('Importing…'); await api('/hs/upload', { method: 'POST', body: fd }); await loadMeta(); toast('HS master replaced', 'ok'); go(); } catch (er) { toast(er.message, 'err'); } } });
  const run = async () => { if (!q.value.trim()) return out.replaceChildren(h('div', { class: 'empty' }, 'Type to search the master.')); const r = await api('/hs/search?q=' + encodeURIComponent(q.value) + '&limit=80');
    out.replaceChildren(r.length ? h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Old (8)', 'New (12)', 'Description', 'Unit', 'Duty', 'VGN'].map(x => h('th', {}, x)))), h('tbody', {}, r.map(x => h('tr', {}, h('td', { class: 'mono' }, x.old8), h('td', { class: 'mono' }, x.new12), h('td', { style: 'padding:6px 8px' }, x.desc_en, h('div', { class: 'ar mut' }, x.desc_ar)), h('td', {}, x.unit), h('td', { class: 'num' }, x.duty + '%'), h('td', { class: 'mut' }, x.vgn))))) : h('div', { class: 'empty' }, 'No matches.')); };
  q.oninput = debounce(run, 250); run();
  const v = M.hs.versions[0];
  return h('div', { class: 'grid' }, h('div', { class: 'card row' }, h('div', {}, h('b', {}, `${M.hs.rows.toLocaleString()} master rows`), h('div', { class: 'mut' }, `${M.hs.distinct_old.toLocaleString()} distinct old 8-digit codes · active version: ${v ? v.filename + ' (' + v.uploaded.replace('T', ' ') + ')' : '—'}`)),
    h('span', { class: 'right' }, h('button', { class: 'btn', onclick: () => file.click() }, '⬆ Replace HS master (.xlsx)'), file)),
    h('div', { class: 'card' }, q, h('br'), out));
});

route('settings', 'Settings', async () => {
  await loadMeta(); let tab = 'codes'; const wrap = h('div'); const body = h('div');
  const KINDS = [['regime', 'Regime types'], ['declaration', 'Declaration types'], ['payment', 'Payment types'], ['invoice_type', 'Invoice types'], ['incoterm', 'IncoTerms'], ['currency', 'Currencies']];
  const bulkBox = () => { const ta = h('textarea', { rows: 5, placeholder: 'kind,code,label\nregime,10,Import\ntransit_example,..' }); return h('div', { class: 'card' }, h('b', {}, 'Bulk import codes'), h('p', { class: 'mut' }, 'Paste lines as kind,code,label. Kinds: regime, declaration, payment, invoice_type, incoterm, currency. Matching labels get the new code; others are added.'), ta, h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn pri', onclick: async () => { const r = await api('/codes/bulk', { json: { text: ta.value } }); await loadMeta(); toast(`${r.updated} updated, ${r.added} added`, 'ok'); draw(); } }, I('import', 15), ' Apply'), h('button', { class: 'btn', onclick: () => download('/api/codes/export', 'code_tables.csv') }, I('down', 15), ' Export CSV'))); };
  const codesView = () => h('div', { class: 'grid' }, bulkBox(), h('div', { class: 'card' }, h('p', { class: 'mut' }, 'These tables drive the dropdowns and the numeric codes written to the M2 file. Entries with a blank code are shown in red and block generation until you fill them in.')), ...KINDS.map(([k, label]) => {
    const rows = M.codes.filter(c => c.kind === k);
    return h('div', { class: 'card' }, h('b', {}, label), h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Code written to M2', 'Label', ''].map(x => h('th', {}, x)))), h('tbody', {}, rows.map(c => h('tr', {}, h('td', { style: 'width:180px' }, h('input', { class: c.code === '' ? 'bad' : '', value: c.code, style: 'border-color:var(--line)', onchange: async e => { await api('/codes', { json: { ...c, code: e.target.value.trim() } }); await loadMeta(); toast('Saved', 'ok'); } })), h('td', {}, h('input', { value: c.label, style: 'border-color:var(--line)', onchange: async e => { await api('/codes', { json: { ...c, label: e.target.value } }); await loadMeta(); toast('Saved', 'ok'); } })), h('td', { style: 'width:50px' }, h('button', { class: 'btn sm danger', onclick: async () => { await api('/codes/' + c.id, { method: 'DELETE' }); await loadMeta(); draw(); } }, '✕'))))), h('tfoot', {}, h('tr', {}, h('td', {}, h('input', { id: 'nc_' + k, placeholder: 'code' })), h('td', {}, h('input', { id: 'nl_' + k, placeholder: 'label' })), h('td', {}, h('button', { class: 'btn sm pri', onclick: async () => { const l = $('#nl_' + k).value.trim(); if (!l) return; await api('/codes', { json: { kind: k, code: $('#nc_' + k).value.trim(), label: l } }); await loadMeta(); draw(); } }, '＋')))))); }));
  const writerView = () => { const s = M.settings; const F = (k, label, el) => h('label', { class: 'f c6' }, label, el);
    const save = async () => { const b = {}; $$('[data-s]', body).forEach(i => b[i.dataset.s] = i.value); await api('/settings', { method: 'PUT', json: b }); await loadMeta(); toast('Settings saved', 'ok'); };
    const sel = (k, opts) => h('select', { 'data-s': k }, opts.map(([v, l]) => h('option', { value: v, selected: s[k] === v }, l)));
    return h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'M2 writer profile v1'), h('div', { class: 'form' },
      F('ID field 3 contains', sel('m2_code_field', [['hs8', '8-digit tariff code (matches the sample file)'], ['hs12', '12-digit Dubai HS code']])), F('Line numbering with several invoices', sel('line_numbering', [['per_invoice', 'Restart at 1 for each invoice'], ['continuous', 'Continue across invoices']])),
      F('Units written with 4 decimals (comma separated)', h('input', { 'data-s': 'decimal_units', value: s.decimal_units })), F('Max lines per file (0 = one file)', h('input', { 'data-s': 'max_lines_per_file', type: 'number', value: s.max_lines_per_file })),
      F('Company name (reports)', h('input', { 'data-s': 'company_name', value: s.company_name })), F('Default currency', h('input', { 'data-s': 'default_currency', value: s.default_currency }))),
      h('p', { class: 'mut' }, 'Line endings (CRLF), quoting and field order are fixed by the sample file and verified by an automated byte-for-byte test. The meaning of the PD records is not documented: they are preserved exactly when a file is imported, but not invented for new Excel imports.'),
      h('button', { class: 'btn pri', onclick: save }, 'Save settings')); };
  const partiesView = () => { const name = h('input', { placeholder: 'Name' }); return h('div', { class: 'card' }, h('div', { class: 'row' }, name, h('button', { class: 'btn pri', onclick: async () => { if (!name.value.trim()) return; await api('/parties', { json: { name: name.value } }); await loadMeta(); draw(); } }, 'Add')), h('table', { class: 't' }, h('tbody', {}, M.parties.map(p => h('tr', {}, h('td', {}, p.name), h('td', { style: 'width:50px' }, h('button', { class: 'btn sm danger', onclick: async () => { await api('/parties/' + p.id, { method: 'DELETE' }); await loadMeta(); draw(); } }, '✕'))))))); };
  const tplView = async () => { const t = await api('/templates'); const m = await api('/hs/memory'); return h('div', { class: 'grid' }, h('div', { class: 'card' }, h('b', {}, 'Column-mapping templates'), t.length ? h('table', { class: 't' }, h('tbody', {}, t.map(x => h('tr', {}, h('td', {}, x.name), h('td', { class: 'mut' }, x.shipper), h('td', { class: 'mut' }, x.created.slice(0, 10)), h('td', {}, h('button', { class: 'btn sm danger', onclick: async () => { await api('/templates/' + x.id, { method: 'DELETE' }); draw(); } }, '✕')))))) : h('p', { class: 'mut' }, 'None yet — tick “Save mapping as template” in the import wizard.')),
    h('div', { class: 'card' }, h('b', {}, 'Learned HS choices'), m.length ? h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Shipper', 'Invoice HS', 'Master HS', 'Used'].map(x => h('th', {}, x)))), h('tbody', {}, m.map(x => h('tr', {}, h('td', {}, x.shipper), h('td', { class: 'mono' }, x.hs_inv), h('td', { class: 'mono' }, x.hs8), h('td', {}, x.uses))))) : h('p', { class: 'mut' }, 'Nothing learned yet — choices you make in the HS picker are remembered per shipper.'))); };
  const draw = async () => {
    wrap.replaceChildren(h('div', { class: 'tabs' }, [['codes', 'Code tables'], ['writer', 'M2 writer profile'], ['parties', 'Shippers / Sellers'], ['tpl', 'Templates & learning']].map(([k, l]) => h('a', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, l))), body);
    body.replaceChildren(tab === 'codes' ? codesView() : tab === 'writer' ? writerView() : tab === 'parties' ? partiesView() : await tplView());
  };
  await draw(); return wrap;
});

route('audit', 'Audit log', async () => {
  const rows = await api('/audit');
  return h('div', { class: 'card' }, rows.length ? h('div', { class: 'hold', style: 'max-height:none' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['When', 'Action', 'Declaration', 'Detail'].map(x => h('th', {}, x)))), h('tbody', {}, rows.map(r => h('tr', {}, h('td', { class: 'mut', style: 'padding:6px 8px' }, r.ts.replace('T', ' ')), h('td', {}, h('b', {}, r.action)), h('td', {}, r.decl_id ? h('a', { href: '#/declaration/' + r.decl_id }, r.decl_id) : '—'), h('td', { class: 'mut' }, (r.detail || '').slice(0, 120))))))) : h('div', { class: 'empty' }, 'No activity yet.'));
});
loadMeta().then(go);
