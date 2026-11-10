/* Hash router, sidebar/mobile nav, global search, keyboard shortcuts, theme toggle, and click delegation. */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, $$, esc } = OL.utils;
  const VIEWS = {
    dashboard: { title: 'Dashboard', render: () => OL.dashboard.render() },
    courses: { title: 'My courses', render: () => OL.library.render() },
    import: { title: 'Import', render: () => OL.importer.render() },
    explore: { title: 'Opening library', render: () => OL.explore.render() },
    practice: { title: 'Practice', render: (a, q) => OL.practice.render(q) },
    stats: { title: 'Progress', render: (a, q) => OL.stats.render(q) },
    settings: { title: 'Settings', render: () => OL.settingsView.render() },
    study: { title: 'Study', render: (a, q) => OL.study.render(a, q) },
  };
  const NAV_FOR = { study: 'courses', import: 'courses' };
  let current = null;

  function parse(hash) {
    const h = (hash || location.hash || '#/dashboard').replace(/^#\/?/, '');
    const [path, query = ''] = h.split('?');
    const [name, arg] = path.split('/');
    const q = {}; query.split('&').filter(Boolean).forEach((kv) => { const [k, v = ''] = kv.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v); });
    return { name: VIEWS[name] ? name : 'dashboard', arg: arg ? decodeURIComponent(arg) : '', q };
  }
  const nav = {
    go(hash) { if (location.hash === hash) route(); else location.hash = hash; },
    query: () => parse().q,
    current: () => current,
  };

  async function route() {
    const r = parse();
    if (current === 'study' && r.name !== 'study') { try { await OL.study.leave(); } catch (e) { console.error(e); } }
    if (current === 'practice' && r.name !== 'practice') OL.practice.leave();
    current = r.name;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + r.name));
    const navKey = NAV_FOR[r.name] || r.name;
    $$('[data-route]').forEach((b) => { const on = b.dataset.route === navKey; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.title = VIEWS[r.name].title + ' · Opening Lab';
    $('#breadcrumb-current').textContent = VIEWS[r.name].title;
    document.body.dataset.view = r.name;
    try { VIEWS[r.name].render(r.arg, r.q); }
    catch (e) {
      console.error('View "' + r.name + '" failed to render:', e);
      $('#view-' + r.name).innerHTML = '<div class="error-state"><h2>Something went wrong showing this page</h2><p>' + esc(e.message) + '</p><button class="primary-btn" data-nav="#/dashboard">Go to dashboard</button></div>';
    }
    if (r.name !== 'study') window.scrollTo(0, 0);
    updateCounts();
  }
  function updateCounts() {
    const c = $('#course-count'); if (c) c.textContent = OL.courses.list.length;
    const due = OL.stats ? OL.stats.overall().due : 0;
    const d = $('#due-count'); if (d) { d.textContent = due; d.classList.toggle('hidden', !due); }
  }
  function refreshCurrent() {
    if (!current || current === 'study' || current === 'import' || current === 'settings') { updateCounts(); return; }
    if (current === 'practice') { updateCounts(); if (!OL.practice.isRunning()) { /* setup preview reads live data */ } return; }
    const r = parse();
    try { VIEWS[r.name].render(r.arg, r.q); } catch (e) { console.error(e); }
    updateCounts();
  }

  /* ---------- global search ---------- */
  function openSearch() {
    const m = OL.ui.modal('<h3>Search</h3><input id="gs-input" class="gs-input" placeholder="Search courses, chapters, openings…" autocomplete="off"><div id="gs-results" class="result-list"></div><p class="muted small">Tip: search by move sequence in the Opening library.</p>', { wide: true });
    const inp = m.el.querySelector('#gs-input'), out = m.el.querySelector('#gs-results');
    const run = () => {
      const q = inp.value.trim().toLowerCase();
      if (!q) { out.innerHTML = ''; return; }
      const hits = [];
      OL.courses.list.forEach((c) => {
        if ((c.title + ' ' + c.opening + ' ' + c.eco + ' ' + c.category).toLowerCase().includes(q)) hits.push({ t: c.title, s: 'Course' + (c.opening ? ' · ' + c.opening : ''), h: '#/study/' + c.id });
        c.chapters.forEach((ch) => { if (ch.name.toLowerCase().includes(q)) hits.push({ t: ch.name, s: 'Chapter in ' + c.title, h: '#/study/' + c.id + '?ch=' + ch.id }); });
      });
      out.innerHTML = hits.length ? hits.slice(0, 25).map((h) => '<button class="result" data-modal-close="' + esc(h.h) + '"><b>' + esc(h.t) + '</b><small>' + esc(h.s) + '</small></button>').join('') : '<p class="muted pad">No matches.</p>';
    };
    inp.addEventListener('input', run);
    m.el.addEventListener('click', (e) => { const b = e.target.closest('.result'); if (b) setTimeout(() => nav.go(b.dataset.modalClose), 0); });
  }
  function showShortcuts() {
    const rows = [['/ or Ctrl+K', 'Search'], ['T', 'Toggle dark / light'], ['?', 'This help'], ['← →', 'Previous / next move (study)'], ['↑ ↓', 'Switch between variations (study)'], ['Home / End', 'First / last move'], ['F', 'Flip board'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo (edit mode)'], ['Enter / Space', 'Next line (practice, after a line)'], ['Esc', 'Close dialog']];
    OL.ui.modal('<h3>Keyboard shortcuts</h3><table class="table">' + rows.map((r) => '<tr><td><kbd>' + esc(r[0]) + '</kbd></td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table><div class="modal-actions"><button class="primary-btn" data-modal-close="x">Close</button></div>');
  }

  /* ---------- global events ---------- */
  document.addEventListener('click', (e) => {
    const n = e.target.closest('[data-nav]');
    if (n && !n.closest('[data-action]:not([data-nav])')) { e.preventDefault(); const go = n.dataset.nav; if (n.dataset.action) OL.actions.run(n.dataset.action, n, e); nav.go(go); return; }
    const a = e.target.closest('[data-action]');
    if (a) { const r = OL.actions.run(a.dataset.action, a, e); if (r && r.catch) r.catch((err) => { console.error(err); OL.ui.toast(err.message || String(err), 'error'); }); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (OL.ui.closeTop()) e.preventDefault(); return; }
    const typing = e.target.closest && e.target.closest('input,textarea,select,[contenteditable]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
    if (typing || OL.ui.hasModal()) return;
    if (current === 'study' && OL.study.keys(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); openSearch(); }
    else if (e.key === '?') showShortcuts();
    else if (e.key === 't' || e.key === 'T') OL.settings.toggleTheme();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (OL.study && OL.study.isActive && OL.study.isActive()) { try { OL.study.leave(); } catch (err) { /* best effort */ } } });
  OL.actions.register({ 'toggle-theme': () => OL.settings.toggleTheme(), 'open-search': openSearch, 'show-shortcuts': showShortcuts });

  OL.nav = nav; OL.router = { route, refreshCurrent, updateCounts };
})();
