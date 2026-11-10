/* Dashboard: re-renders from saved data every time it is shown, and whenever progress/courses change while visible. */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, esc, relTime, fmtDuration, fmtPct, plural } = OL.utils;
  const ICON = { practice: '◷', import: '↓', course: '▦', chapter: '✓' };

  function render() {
    const root = $('#view-dashboard');
    const now = Date.now();
    const o = OL.stats.overall(now);
    const recent = OL.courses.list.filter((c) => c.lastStudied).sort((a, b) => b.lastStudied - a.lastStudied).slice(0, 3);
    const fallback = recent.length ? recent : OL.courses.sorted().slice(0, 3);
    const acts = OL.courses.activity.items.slice(0, 8);
    root.innerHTML =
      '<div class="welcome-row"><div><p class="eyebrow">YOUR CHESS WORKSPACE</p><h1>Build your opening <em>repertoire.</em></h1><p class="subheading">' + (o.due ? plural(o.due, 'variation') + ' due for review today.' : o.courses ? 'You are all caught up on reviews.' : 'Import a Lichess study to get started.') + '</p></div></div>' +
      '<div class="quick-actions">' +
      '<button class="qa" data-nav="#/import"><span>↓</span><b>Import a study</b><small>Lichess or PGN</small></button>' +
      '<button class="qa" data-nav="#/import" data-tab="upload" data-action="qa-upload"><span>↑</span><b>Upload a PGN</b><small>File or paste</small></button>' +
      '<button class="qa" data-action="course-create"><span>＋</span><b>New course</b><small>Start from scratch</small></button>' +
      '<button class="qa primary" data-nav="#/practice"><span>◷</span><b>Start practice</b><small>' + (o.due ? o.due + ' due' : 'Choose what to drill') + '</small></button></div>' +
      '<div class="stats-grid six">' + [['DUE NOW', o.due, 'variations to review'], ['NEW', o.fresh, 'not yet learned'], ['MASTERED', o.mastered, 'long intervals'], ['STREAK', plural(o.current, 'day'), 'longest ' + o.longest], ['PRACTICE TIME', fmtDuration(o.time), 'all sessions'], ['MEMORISED', fmtPct(o.memorised), 'of ' + plural(o.variations, 'variation')]].map((s) => '<article class="stat-card"><span class="stat-label">' + s[0] + '</span><strong>' + esc(s[1]) + '</strong><small>' + esc(s[2]) + '</small></article>').join('') + '</div>' +
      (o.variations ? '<div class="panel">' + OL.stats.statusBar(o) + '</div>' : '') +
      '<div class="section-heading"><div><p class="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>Continue studying</h2></div><button class="text-btn" data-nav="#/courses">All courses →</button></div>' +
      (fallback.length ? '<div class="course-grid">' + fallback.map((c) => continueCard(c)).join('') + '</div>' : '<div class="empty-banner"><div class="empty-symbol">♞</div><div><h3>Your opening library starts here</h3><p>Import a Lichess Study PGN to turn its chapters and variations into an interactive course.</p></div><button class="secondary-btn" data-nav="#/import">Import your first study →</button></div>') +
      '<div class="section-heading"><div><p class="eyebrow">LATELY</p><h2>Recent activity</h2></div></div>' +
      (acts.length ? '<div class="panel activity">' + acts.map((a) => '<div class="act"><span class="act-icon">' + (ICON[a.type] || '•') + '</span><span>' + esc(a.text) + '</span><span class="muted small">' + relTime(a.ts) + '</span></div>').join('') + '</div>' : '<p class="muted">Nothing yet. Your imports, completed chapters and practice sessions will appear here.</p>');
  }
  function continueCard(c) {
    const s = OL.courses.summary(c);
    const pct = s.chapters ? Math.round((s.completed / s.chapters) * 100) : 0;
    return '<article class="course-card" data-action="course-open" data-id="' + esc(c.id) + '"><div class="course-info"><p class="eyebrow">' + esc([c.eco, c.opening].filter(Boolean).join(' · ') || 'OPENING STUDY') + '</p><h3>' + esc(c.title) + '</h3><p>' + plural(s.chapters, 'chapter') + ' · last studied ' + relTime(c.lastStudied).toLowerCase() + '</p>' +
      '<div class="progress-row"><span>Progress</span><span>' + pct + '%</span></div><div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="course-foot"><span>' + (s.due ? '<b class="due-pill">' + s.due + ' due</b>' : '<span class="faint">No reviews due</span>') + '</span><button class="primary-btn sm" data-action="course-open" data-id="' + esc(c.id) + '">Continue</button></div></div></article>';
  }
  OL.actions.register({ 'qa-upload': () => { OL.importer.st.tab = 'upload'; } });
  OL.dashboard = { render };
})();
