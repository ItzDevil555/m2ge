// ======================= FX: motion + interaction layer (pure progressive enhancement) =======================
// Nothing in here changes app logic. It only decorates what the other scripts render.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const root = document.documentElement, view = $('#view'), top = $('#top'), bg = $('#bg');
  const reflow = el => void el.offsetWidth;

  Object.assign(ICONS, { sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>` });

  // ---------- theme: circular reveal via View Transitions + sun/moon icon ----------
  const themeBtn = $('#theme');
  const curTheme = () => root.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  const paintThemeIcon = () => { const s = $('.ico', themeBtn); if (s) s.innerHTML = ic(curTheme() === 'dark' ? 'sun' : 'moon', 16); };
  const origTheme = themeBtn.onclick;
  themeBtn.onclick = e => {
    const x = e.clientX || innerWidth - 40, y = e.clientY || 30, r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const apply = () => { origTheme(e); paintThemeIcon(); };
    if (!document.startViewTransition || reduced) return apply();
    const t = document.startViewTransition(apply);
    t.ready.then(() => root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 750, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => { });
  };
  paintThemeIcon();

  // ---------- sidebar: sliding active pill + collapse ----------
  const nav = $('#side'), pill = $('#navpill'); let pillInit = false;
  const placePill = () => {
    const a = $('#side a.on', nav); if (!a) { pill.style.opacity = 0; return; }
    if (!pillInit) { pill.style.transition = 'none'; }
    pill.style.height = a.offsetHeight + 'px'; pill.style.transform = `translateY(${a.offsetTop}px)`; pill.style.opacity = 1;
    if (!pillInit) { reflow(pill); pill.style.transition = ''; pillInit = true; }
  };
  new MutationObserver(placePill).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', placePill);
  const follow = () => { const t0 = performance.now(); (function f() { placePill(); if (performance.now() - t0 < 700) requestAnimationFrame(f); })(); };
  $('#collapse').onclick = () => {
    const min = root.dataset.side === 'min';
    min ? delete root.dataset.side : root.dataset.side = 'min';
    try { localStorage.setItem('side', min ? 'max' : 'min'); } catch { }
    follow();
  };
  setTimeout(placePill, 60); if (document.fonts && document.fonts.ready) document.fonts.ready.then(placePill);

  // ---------- cursor: ambient glow + card spotlight ----------
  let mx = innerWidth * .6, my = innerHeight * .3, gx = mx, gy = my, raf = 0;
  const tick = () => { gx += (mx - gx) * .09; gy += (my - gy) * .09; bg.style.setProperty('--gx', gx + 'px'); bg.style.setProperty('--gy', gy + 'px'); raf = (Math.abs(mx - gx) + Math.abs(my - gy) > .5) ? requestAnimationFrame(tick) : 0; };
  addEventListener('pointermove', e => {
    mx = e.clientX; my = e.clientY; if (!raf && !reduced) raf = requestAnimationFrame(tick);
    const c = e.target.closest && e.target.closest('.card,.stat,.step,.zone');
    if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }
  }, { passive: true });

  // ---------- button ripple ----------
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.btn:not(:disabled),.ibtn'); if (!b || reduced) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, el = document.createElement('span');
    el.className = 'ripple'; el.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.append(el); setTimeout(() => el.remove(), 650);
  });

  // ---------- topbar shadow on scroll + title swap ----------
  view.addEventListener('scroll', () => top.classList.toggle('scrolled', view.scrollTop > 6), { passive: true });
  new MutationObserver(() => { const t = $('#title'); t.classList.remove('swap'); reflow(t); t.classList.add('swap'); })
    .observe($('#title'), { childList: true, characterData: true, subtree: true });

  // ---------- page entrance: stagger, count-up, charts ----------
  const setI = (els, base = 0) => els.forEach((el, i) => el.style.setProperty('--i', Math.min(base + i, 16)));
  function countUp(el) {
    const txt = el.textContent.trim(), m = /^(-?[\d,]*\.?\d+)(.*)$/.exec(txt); if (!m || reduced) return;
    const raw = m[1], suf = m[2], target = parseFloat(raw.replace(/,/g, '')); if (!isFinite(target) || target === 0) return;
    const dec = (raw.split('.')[1] || '').length, comma = raw.includes(','), dur = 1000 + Math.min(900, Math.log10(Math.abs(target) + 1) * 220), t0 = performance.now();
    const fmtv = v => (comma ? v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec)) + suf;
    (function f(now) { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = p < 1 ? fmtv(target * e) : txt; if (p < 1) requestAnimationFrame(f); })(t0);
  }
  function enhanceView() {
    const first = view.firstElementChild; if (!first || first.querySelector('.skel') || first.id === 'ws' || first.dataset.fx) return;
    first.dataset.fx = 1;
    // flatten one level of nested grids so KPI cards etc. cascade in
    const items = [];
    if (first.classList.contains('grid') || (!first.className && first.tagName === 'DIV')) {
      [...first.children].forEach(c => c.classList.contains('grid') ? items.push(...c.children) : items.push(c));
    } else items.push(first);
    setI(items); items.forEach(el => el.classList.add('stg'));
    // numbers
    $$('.kpi b, .welcome .mini b', first).forEach(countUp);
    // charts
    $$('.bars, .vb', first).forEach(g => { setI([...g.children]); g.classList.add('in'); });
    $$('.hbar', first).forEach(hb => { const sib = [...hb.parentElement.querySelectorAll(':scope>.hbar')]; hb.style.setProperty('--i', sib.indexOf(hb)); hb.classList.add('in'); });
    $$('svg', first).forEach(s => { if (s.querySelector('circle[stroke-dasharray]')) s.classList.add('ring-in'); });
    // first rows of any table glide in
    $$('tbody', first).forEach(tb => { const rows = [...tb.children].slice(0, 16); setI(rows); rows.forEach(r => r.classList.add('rowin')); });
  }

  // ---------- tabs: spring-sliding indicator ----------
  const tabMem = {};
  function placeTabs(tabs) {
    if (tabs.querySelector(':scope>.tind')) return;
    const on = tabs.querySelector(':scope>a.on'); if (!on) return;
    const key = tabs.id || 'tabs', ind = document.createElement('i'); ind.className = 'tind'; tabs.prepend(ind);
    const set = (l, w) => { ind.style.width = w + 'px'; ind.style.transform = `translateX(${l}px)`; };
    const l = on.offsetLeft, w = on.offsetWidth, prev = tabMem[key];
    if (prev && !reduced) { set(prev.l, prev.w); reflow(ind); ind.classList.add('go'); requestAnimationFrame(() => set(l, w)); }
    else { set(l, w); requestAnimationFrame(() => ind.classList.add('go')); }
    tabMem[key] = { l, w };
  }
  new MutationObserver(muts => {
    let viewChanged = false;
    for (const m of muts) {
      if (m.target === view) viewChanged = true;
      for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; if (n.matches('.tabs')) placeTabs(n); else if (n.querySelectorAll) n.querySelectorAll('.tabs').forEach(placeTabs); }
    }
    if (viewChanged) enhanceView();
  }).observe(view, { childList: true, subtree: true });
  addEventListener('resize', () => $$('.tabs').forEach(t => { t.querySelector(':scope>.tind')?.remove(); placeTabs(t); }));

  // soft cross-fade when switching declaration tabs
  if (typeof setTab === 'function') {
    const _setTab = setTab;
    window.setTab = function () { const r = _setTab.apply(this, arguments); const b = $('#body'); if (b && !reduced) { b.classList.remove('tabswap'); reflow(b); b.classList.add('tabswap'); } return r; };
  }

  // ---------- overlays: animated exit for modals + toasts ----------
  const exitable = (n, cls, ms) => { const orig = n.remove.bind(n); n.remove = () => { if (n._out) return; n._out = 1; n.classList.add('out'); setTimeout(orig, ms); }; };
  const ov = new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains('toast')) exitable(n, 'out', 300);
    if (n.classList.contains('modalbg')) exitable(n, 'out', 190);
  })));
  ov.observe($('#toasts'), { childList: true }); ov.observe(document.body, { childList: true });

  // arrow-key navigation for command palette / pickers
  document.addEventListener('keydown', e => {
    const inp = e.target; if (!(inp.matches && inp.matches('.modalbg input'))) return;
    const opts = [...inp.closest('.modalbg').querySelectorAll('.opt')]; if (!opts.length) return;
    const cur = opts.findIndex(o => o.classList.contains('act'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); const n = (cur + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach(o => o.classList.remove('act')); opts[n].classList.add('act'); opts[n].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && cur >= 0) { e.preventDefault(); e.stopImmediatePropagation(); opts[cur].click(); }
  }, true);

  // ---------- global activity bar (any API call) ----------
  const nbar = $('#nbar'); let pend = 0, prog = 0, timer = 0, showT = 0;
  const start = () => {
    if (pend++ > 0) return;
    showT = setTimeout(() => { nbar.classList.add('on'); prog = 14; nbar.style.width = prog + '%'; timer = setInterval(() => { prog += (90 - prog) * .1; nbar.style.width = prog + '%'; }, 220); }, 140);
  };
  const done = () => {
    if (--pend > 0) return; pend = 0; clearTimeout(showT); clearInterval(timer);
    if (!nbar.classList.contains('on')) return;
    nbar.style.width = '100%'; setTimeout(() => { nbar.classList.remove('on'); setTimeout(() => nbar.style.width = '0', 320); }, 260);
  };
  const _fetch = window.fetch.bind(window);
  window.fetch = (...a) => { start(); return _fetch(...a).finally(done); };

  // pick up whatever was rendered before this script ran
  enhanceView();
})();
