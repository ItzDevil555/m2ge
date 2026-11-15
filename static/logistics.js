// ======================= UAE Logistics hub =======================
Object.assign(ICONS, {
  ship: `<path d="M3 17l2 3h14l2-3-9-3z"/><path d="M12 14V4l5 4h-5M7 14V9"/>`,
  plane: `<path d="M10 14 3 11l1-2 8 1 5-6a2 2 0 0 1 3 3l-6 5 1 8-2 1-3-7-5 3z"/>`,
  calc: `<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"/>`,
  box: `<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>`,
  building: `<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`,
  list: `<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>`,
  road: `<path d="M8 3 4 21M16 3l4 18M12 4v3M12 11v3M12 18v3"/>`,
});
const num = v => parseFloat(v) || 0;
const nf = (label, val, on, step = 'any') => h('label', { class: 'f' }, label, h('input', { type: 'number', step, value: val, oninput: e => on(num(e.target.value)) }));
const stat = (l, v, big) => h('div', { class: 'stat' + (big ? ' big' : '') }, h('span', {}, l), h('b', {}, v));

function calcLanded() {
  const S = { goods: 10000, freight: 800, ins: 50, fx: 3.6725, duty: 5, hs: '' };
  const out = h('div', { class: 'grid g2' });
  const hsNote = h('span', { class: 'mut' }, 'Enter an HS code to auto-fill the duty rate from the HS master.');
  const draw = () => {
    const cif = S.goods + S.freight + S.ins, cifA = cif * S.fx, duty = cifA * S.duty / 100, vat = (cifA + duty) * 0.05;
    out.replaceChildren(stat('CIF value (AED)', fmt(cifA), 0), stat('Customs duty (AED)', fmt(duty), 0), stat('VAT 5% (AED)', fmt(vat), 0), stat('Total payable at customs (AED)', fmt(duty + vat), 1));
  };
  const look = debounce(async v => { S.hs = v; if (v.replace(/\D/g, '').length < 4) return; try { const r = await api('/hs/search?q=' + encodeURIComponent(v) + '&limit=1'); if (r[0]) { S.duty = r[0].duty; hsNote.textContent = `${r[0].new12} · ${r[0].desc_en.slice(0, 70)} · duty ${r[0].duty}%`; duty.value = r[0].duty; draw(); } } catch { } }, 400);
  const duty = h('input', { type: 'number', step: 'any', value: S.duty, oninput: e => { S.duty = num(e.target.value); draw(); } });
  const el = h('div', { class: 'card' }, h('h3', { class: 'sec' }, I('calc', 18), ' Landed cost: duty and VAT'),
    h('div', { class: 'form' },
      h('div', { class: 'c3' }, nf('Goods value', S.goods, v => { S.goods = v; draw(); })), h('div', { class: 'c3' }, nf('Freight', S.freight, v => { S.freight = v; draw(); })),
      h('div', { class: 'c3' }, nf('Insurance', S.ins, v => { S.ins = v; draw(); })), h('div', { class: 'c3' }, nf('Rate to AED', S.fx, v => { S.fx = v; draw(); })),
      h('label', { class: 'f c4' }, 'HS code (optional)', h('input', { placeholder: 'e.g. 85176290', oninput: e => look(e.target.value) })),
      h('label', { class: 'f c3' }, 'Duty %', duty), h('div', { class: 'c12' }, hsNote)),
    h('div', { style: 'margin-top:14px' }, out), h('p', { class: 'mut' }, 'Estimate only. Duty is on CIF; VAT 5% is on CIF plus duty. Exemptions, excise and free zone rules are not applied.'));
  draw(); return el;
}

function calcCargo(ref) {
  const S = { l: 120, w: 80, h: 100, qty: 10, kg: 500, mode: 'air' };
  const out = h('div'); const FACT = { air: 6000, courier: 5000 };
  const draw = () => {
    const cbm = S.l * S.w * S.h * S.qty / 1e6, vol = S.mode in FACT ? S.l * S.w * S.h * S.qty / FACT[S.mode] : S.mode === 'road' ? cbm * 333 : cbm * 1000;
    const chg = Math.max(vol, S.kg);
    const fit = ref.CONTAINERS.map(c => { const byV = cbm / (c.cbm * .85), byW = S.kg / c.payload, n = Math.ceil(Math.max(byV, byW) * 100) / 100; return h('tr', {}, h('td', {}, c.type), h('td', { class: 'num' }, fmt(c.cbm, 1)), h('td', { class: 'num' }, fmt(c.payload, 0)), h('td', { class: 'num' }, fmt(Math.min(100, byV * 100), 0) + '%'), h('td', { class: 'num' }, fmt(Math.min(100, byW * 100), 0) + '%'), h('td', {}, h('b', {}, n <= 1 ? '1 container' : Math.ceil(n) + ' containers'))); });
    out.replaceChildren(h('div', { class: 'grid g4' }, stat('Total CBM', fmt(cbm, 3)), stat('Volumetric weight (kg)', fmt(vol, 1)), stat('Actual weight (kg)', fmt(S.kg, 1)), stat('Chargeable weight (kg)', fmt(chg, 1), 1)),
      h('div', { class: 'hold', style: 'max-height:none;margin-top:12px' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Container', 'CBM', 'Payload kg', 'Volume used', 'Weight used', 'Needed'].map(x => h('th', {}, x)))), h('tbody', {}, fit))));
  };
  const mode = h('select', { onchange: e => { S.mode = e.target.value; draw(); } }, [['air', 'Air (1:6000)'], ['courier', 'Courier (1:5000)'], ['sea', 'Sea LCL (1 CBM = 1000 kg)'], ['road', 'Road (1 CBM = 333 kg)']].map(([v, l]) => h('option', { value: v }, l)));
  const el = h('div', { class: 'card' }, h('h3', { class: 'sec' }, I('box', 18), ' Cargo: CBM, chargeable weight, container fit'),
    h('div', { class: 'form' }, h('div', { class: 'c2' }, nf('Length cm', S.l, v => { S.l = v; draw(); })), h('div', { class: 'c2' }, nf('Width cm', S.w, v => { S.w = v; draw(); })), h('div', { class: 'c2' }, nf('Height cm', S.h, v => { S.h = v; draw(); })),
      h('div', { class: 'c2' }, nf('Packages', S.qty, v => { S.qty = v; draw(); })), h('div', { class: 'c2' }, nf('Gross kg', S.kg, v => { S.kg = v; draw(); })), h('label', { class: 'f c2' }, 'Mode', mode)),
    h('div', { style: 'margin-top:14px' }, out), h('p', { class: 'mut' }, 'Container fit assumes 85% usable volume. Standard dimensions; check with your line.'));
  draw(); return el;
}

const tableOf = (cols, rows) => h('div', { class: 'hold', style: 'max-height:none' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))), h('tbody', {}, rows)));
const TICON = { Sea: 'ship', Air: 'plane', Land: 'road' };

function portsView(ref) {
  let q = '', ty = '', em = '';
  const box = h('div');
  const draw = () => {
    const rows = ref.PORTS.filter(p => (!ty || p.type === ty) && (!em || p.emirate === em) && (p.name + p.ops + p.note).toLowerCase().includes(q));
    box.replaceChildren(h('div', { class: 'mut', style: 'margin:6px 0' }, rows.length + ' locations'), tableOf(['Type', 'Name', 'Emirate', 'Operations', 'Note'], rows.map(p => h('tr', {}, h('td', {}, h('span', { class: 'tag ' + p.type }, I(TICON[p.type], 14), ' ', p.type)), h('td', {}, h('b', {}, p.name)), h('td', {}, p.emirate), h('td', {}, p.ops), h('td', { class: 'mut' }, p.note)))));
  };
  const ems = [...new Set(ref.PORTS.map(p => p.emirate))];
  const el = h('div', { class: 'card' }, h('div', { class: 'row' }, h('input', { style: 'width:240px', placeholder: 'Search ports, airports, borders…', oninput: e => { q = e.target.value.toLowerCase(); draw(); } }),
    h('select', { style: 'width:auto', onchange: e => { ty = e.target.value; draw(); } }, ['', 'Sea', 'Air', 'Land'].map(v => h('option', { value: v }, v || 'All modes'))),
    h('select', { style: 'width:auto', onchange: e => { em = e.target.value; draw(); } }, ['', ...ems].map(v => h('option', { value: v }, v || 'All emirates')))), box);
  draw(); return el;
}

const zonesView = ref => h('div', { class: 'grid g3' }, ref.FREEZONES.map(z => h('div', { class: 'card zone' }, h('div', { class: 'row' }, I('building', 18), h('b', {}, z.name)), h('div', { class: 'mut' }, z.emirate), h('p', {}, z.focus))));

function docsView(ref) {
  const keys = Object.keys(ref.DOCS), box = h('div'); let k = keys[0];
  const draw = () => box.replaceChildren(h('div', { class: 'seg' }, keys.map(x => h('button', { class: x === k ? 'on' : '', onclick: () => { k = x; draw(); } }, x))),
    h('div', { class: 'checks' }, ref.DOCS[k].map(d => h('label', { class: 'chk' }, h('input', { type: 'checkbox' }), h('span', {}, d)))),
    h('p', { class: 'mut' }, 'General checklist. Requirements vary by goods, authority and free zone. Confirm with the customs authority.'));
  draw(); return h('div', { class: 'card' }, h('h3', { class: 'sec' }, I('list', 18), ' Document checklist'), box);
}

const incoView = ref => h('div', { class: 'card' }, h('h3', { class: 'sec' }, I('globe', 18), ' Incoterms 2020: who does what'), tableOf(ref.INCO_COLS, ref.INCO.map(r => h('tr', {}, r.map((c, i) => h('td', {}, i === 0 ? h('b', { class: 'mono' }, c) : i < 5 ? h('span', { class: 'who ' + c }, c) : c))))));

route('logistics', 'UAE Logistics', async () => {
  const ref = await api('/uae'); let tab = 'calc';
  const wrap = h('div'), body = h('div');
  const T = [['calc', 'Landed cost', 'calc'], ['cargo', 'Cargo and containers', 'box'], ['ports', 'Ports, airports, borders', 'ship'], ['zones', 'Free zones', 'building'], ['docs', 'Documents', 'list'], ['inco', 'Incoterms', 'globe']];
  const draw = () => {
    wrap.replaceChildren(h('div', { class: 'hero' }, h('div', {}, h('h2', {}, 'UAE Logistics Hub'), h('p', {}, ref.HOLIDAY_NOTE)),
      h('div', { class: 'row' }, stat('VAT', ref.VAT + '%'), stat('USD to AED', ref.USD_AED), stat('Ports and borders', ref.PORTS.length), stat('Free zones', ref.FREEZONES.length))),
      h('div', { class: 'tabs' }, T.map(([k, l, i]) => h('a', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, I(i, 15), l))), body);
    body.replaceChildren({ calc: calcLanded, cargo: () => calcCargo(ref), ports: () => portsView(ref), zones: () => zonesView(ref), docs: () => docsView(ref), inco: () => incoView(ref) }[tab]());
  };
  draw(); return wrap;
});
$$('.ico').forEach(e => e.innerHTML = ic(e.dataset.i, +e.dataset.s || 18));
