// ======================= FX: small, functional interaction layer =======================
// Nothing here changes app logic. Motion is limited to what answers a user action.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const root = document.documentElement, view = $('#view');

  Object.assign(ICONS, { sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>` });

  // ---------- theme: icon follows the theme ----------
  const themeBtn = $('#theme');
  const curTheme = () => root.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  const paintThemeIcon = () => { const s = $('.ico', themeBtn); if (s) s.innerHTML = ic(curTheme() === 'dark' ? 'sun' : 'moon', 16); };
  const origTheme = themeBtn.onclick;
  themeBtn.onclick = e => { origTheme(e); paintThemeIcon(); };
  paintThemeIcon();

  // ---------- sidebar collapse (remembered) ----------
  $('#collapse').onclick = () => {
    const min = root.dataset.side === 'min';
    min ? delete root.dataset.side : root.dataset.side = 'min';
    try { localStorage.setItem('side', min ? 'max' : 'min'); } catch { }
  };

  // ---------- overlays: short exit for modals + toasts ----------
  const exitable = (n, ms) => { const orig = n.remove.bind(n); n.remove = () => { if (n._out) return; n._out = 1; if (reduced) return orig(); n.classList.add('out'); setTimeout(orig, ms); }; };
  const ov = new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains('toast')) exitable(n, 160);
    if (n.classList.contains('modalbg')) exitable(n, 120);
  })));
  ov.observe($('#toasts'), { childList: true }); ov.observe(document.body, { childList: true });

  // ---------- arrow-key navigation for command palette / pickers ----------
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
    showT = setTimeout(() => { nbar.classList.add('on'); prog = 14; nbar.style.width = prog + '%'; timer = setInterval(() => { prog += (90 - prog) * .1; nbar.style.width = prog + '%'; }, 220); }, 160);
  };
  const done = () => {
    if (--pend > 0) return; pend = 0; clearTimeout(showT); clearInterval(timer);
    if (!nbar.classList.contains('on')) return;
    nbar.style.width = '100%'; setTimeout(() => { nbar.classList.remove('on'); setTimeout(() => nbar.style.width = '0', 260); }, 200);
  };
  const _fetch = window.fetch.bind(window);
  window.fetch = (...a) => { start(); return _fetch(...a).finally(done); };
})();
