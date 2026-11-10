/* Statistics computed ONLY from saved data (progress cards, practice sessions, courses). Plus the Statistics view. */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, esc, dayKey, dayDiff, fmtDuration, fmtPct, relTime, plural } = OL.utils;
  let sessions = [];
  const st = { open: null };

  async function load() { sessions = (await OL.store.all('sessions')).sort((a, b) => a.ts - b.ts); }

  function streaks(now) {
    const days = Array.from(new Set(sessions.filter((s) => s.attempted || (s.lines && s.lines.length)).map((s) => dayKey(s.ts)))).sort();
    let longest = 0, run = 0, prev = null;
    for (const d of days) { run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1; longest = Math.max(longest, run); prev = d; }
    const today = dayKey(now || Date.now());
    let current = 0;
    if (days.length) {
      const last = days[days.length - 1], gap = dayDiff(last, today);
      if (gap <= 1) { current = 1; for (let i = days.length - 1; i > 0; i--) { if (dayDiff(days[i - 1], days[i]) === 1) current++; else break; } }
    }
    return { current, longest, days: days.length, practisedToday: days.includes(today) };
  }

  function overall(now) {
    now = now || Date.now();
    let chapters = 0, variations = 0, due = 0, fresh = 0, learning = 0, reviewing = 0, mastered = 0, attempts = 0, correct = 0;
    OL.courses.list.forEach((c) => { const s = OL.courses.summary(c, now); chapters += s.chapters; variations += s.variations; due += s.due; fresh += s.new; learning += s.learning; reviewing += s.reviewing; mastered += s.mastered; attempts += s.attempts; correct += s.correct; });
    const time = sessions.reduce((n, s) => n + (s.duration || 0), 0);
    const memorised = variations ? (reviewing + mastered) / variations : 0;
    return Object.assign({ courses: OL.courses.list.length, chapters, variations, due, fresh, learning, reviewing, mastered, attempts, correct, accuracy: attempts ? correct / attempts : 0, time, memorised, sessions: sessions.length }, streaks(now));
  }

  function perCourse(course, now) {
    const s = OL.courses.summary(course, now);
    const time = sessions.filter((x) => (x.courseIds || []).includes(course.id)).reduce((n, x) => n + (x.duration || 0) / Math.max(1, (x.courseIds || []).length), 0);
    const chapters = course.chapters.map((ch) => {
      let tr = []; try { tr = OL.courses.trainable(ch); } catch (e) { console.error(e); }
      const cards = tr.map((t) => OL.progress.get(course.id, ch.id, t.leaf.id));
      const started = cards.filter((c) => c && c.reviews > 0).length;
      const a = cards.reduce((n, c) => n + (c ? c.attempts : 0), 0), k = cards.reduce((n, c) => n + (c ? c.correct : 0), 0);
      return { ch, lines: tr.length, started, mastered: cards.filter((c) => OL.srs.status(c) === 'mastered').length, due: cards.filter((c) => OL.srs.isDue(c, now)).length, accuracy: a ? k / a : null, pct: tr.length ? started / tr.length : 0 };
    });
    return Object.assign({}, s, { accuracy: s.attempts ? s.correct / s.attempts : 0, time, chapterRows: chapters, memorised: s.variations ? (s.reviewing + s.mastered) / s.variations : 0 });
  }

  function perVariation(course, ch, now) {
    return OL.courses.trainable(ch).map((t) => {
      const c = OL.progress.get(course.id, ch.id, t.leaf.id);
      return { leaf: t.leaf, label: OL.courses.lineLabel(ch, t.leaf.id, 60), card: c, status: OL.srs.status(c), attempts: c ? c.attempts : 0, correct: c ? c.correct : 0, incorrect: c ? c.incorrect : 0, accuracy: c && c.attempts ? c.correct / c.attempts : null, last: c ? c.last : 0, next: c && c.reviews ? c.due : 0, due: OL.srs.isDue(c, now) };
    });
  }

  /* last n days of practice: moves + accuracy */
  function daily(n, now) {
    now = now || Date.now();
    const out = [];
    for (let i = n - 1; i >= 0; i--) { const d = dayKey(now - i * 86400000); out.push({ day: d, attempted: 0, correct: 0, ms: 0 }); }
    const m = new Map(out.map((o) => [o.day, o]));
    sessions.forEach((s) => { const o = m.get(dayKey(s.ts)); if (o) { o.attempted += s.attempted; o.correct += s.correct; o.ms += s.duration || 0; } });
    return out;
  }
  /* upcoming workload: how many cards fall due in each of the next n days (day 0 includes overdue) */
  function forecast(n, now) {
    now = now || Date.now();
    const arr = new Array(n).fill(0);
    OL.progress.cards.forEach((c) => {
      if (!c.reviews) return;
      if (!OL.courses.get(c.courseId)) return;
      const d = Math.max(0, Math.floor((c.due - now) / 86400000));
      if (d < n) arr[d]++;
    });
    return arr;
  }

  /* ---------- view ---------- */
  const bar = (v, max, cls) => '<div class="bar-col"><div class="bar ' + (cls || '') + '" style="height:' + (max ? Math.round((v / max) * 100) : 0) + '%" title="' + v + '"></div></div>';
  function statusBar(o) {
    const tot = o.variations || 1;
    const seg = [['new', o.fresh], ['learning', o.learning], ['reviewing', o.reviewing], ['mastered', o.mastered]];
    return '<div class="stack-bar">' + seg.map((s) => '<span class="seg ' + s[0] + '" style="width:' + (s[1] / tot) * 100 + '%" title="' + s[0] + ': ' + s[1] + '"></span>').join('') + '</div><div class="legend">' + seg.map((s) => '<span><i class="dot ' + s[0] + '"></i>' + s[0] + ' ' + s[1] + '</span>').join('') + '</div>';
  }
  function render(params) {
    const root = $('#view-stats');
    const now = Date.now();
    const o = overall(now);
    if (!o.courses) { root.innerHTML = heading() + '<div class="empty-state"><div class="empty-symbol">↗</div><h3>No data yet</h3><p>Statistics appear here after you import a course and practise.</p><button class="primary-btn" data-nav="#/import">Import a study</button></div>'; return; }
    const d14 = daily(14, now), mx = Math.max(1, ...d14.map((x) => x.attempted));
    const fc = forecast(14, now), fmx = Math.max(1, ...fc);
    const noData = !sessions.length;
    root.innerHTML = heading() +
      '<div class="stats-grid">' + [['COURSES', o.courses], ['CHAPTERS', o.chapters], ['VARIATIONS', o.variations], ['MEMORISED', fmtPct(o.memorised)], ['STUDY TIME', fmtDuration(o.time)], ['CURRENT STREAK', plural(o.current, 'day')], ['LONGEST STREAK', plural(o.longest, 'day')], ['ACCURACY', o.attempts ? fmtPct(o.accuracy) : '—']].map((s) => '<article class="stat-card"><span class="stat-label">' + s[0] + '</span><strong>' + esc(s[1]) + '</strong></article>').join('') + '</div>' +
      '<div class="two-col"><div class="panel"><p class="eyebrow">MEMORISATION</p>' + statusBar(o) + '</div>' +
      '<div class="panel"><p class="eyebrow">MOVES PRACTISED · LAST 14 DAYS</p>' + (noData ? '<p class="muted">No practice sessions recorded yet.</p>' : '<div class="chart">' + d14.map((x) => bar(x.attempted, mx, 'a')).join('') + '</div><div class="chart-axis"><span>' + esc(d14[0].day.slice(5)) + '</span><span>today</span></div>') + '</div></div>' +
      '<div class="two-col"><div class="panel"><p class="eyebrow">REVIEW FORECAST · NEXT 14 DAYS</p>' + (fc.some(Boolean) ? '<div class="chart">' + fc.map((v) => bar(v, fmx, 'b')).join('') + '</div><div class="chart-axis"><span>due now</span><span>+13 days</span></div>' : '<p class="muted">Nothing scheduled yet - complete a practice session to create review schedules.</p>') + '</div>' +
      '<div class="panel"><p class="eyebrow">ACCURACY · LAST 14 DAYS</p>' + (noData ? '<p class="muted">No data yet.</p>' : '<div class="chart">' + d14.map((x) => bar(x.attempted ? Math.round((x.correct / x.attempted) * 100) : 0, 100, 'c')).join('') + '</div><div class="chart-axis"><span>0%</span><span>100%</span></div>') + '</div></div>' +
      '<div class="section-heading"><div><p class="eyebrow">PER COURSE</p><h2>Courses</h2></div></div>' +
      OL.courses.sorted().map((c) => courseBlock(c, now)).join('');
  }
  const heading = () => '<div class="page-heading"><div><p class="eyebrow">YOUR PROGRESS</p><h1>Statistics</h1><p class="subheading">Calculated from your saved practice history.</p></div></div>';

  function courseBlock(c, now) {
    const p = perCourse(c, now), open = st.open === c.id;
    return '<div class="panel course-stats"><div class="cs-head"><div><h3>' + esc(c.title) + '</h3><p class="muted small">' + plural(p.chapters, 'chapter') + ' · ' + plural(p.variations, 'variation') + ' · ' + fmtDuration(p.time) + ' studied</p></div>' +
      '<div class="cs-nums"><span><b>' + fmtPct(p.memorised) + '</b> memorised</span><span><b>' + p.mastered + '</b> mastered</span><span><b>' + p.due + '</b> due</span><span><b>' + (p.attempts ? fmtPct(p.accuracy) : '—') + '</b> accuracy</span></div>' +
      '<button class="text-btn" data-action="stats-toggle" data-id="' + esc(c.id) + '">' + (open ? 'Hide details' : 'Chapters & variations') + '</button></div>' +
      (open ? '<table class="table"><thead><tr><th>Chapter</th><th>Progress</th><th>Mastered</th><th>Due</th><th>Accuracy</th><th></th></tr></thead><tbody>' + p.chapterRows.map((r) => '<tr><td>' + esc(r.ch.name) + '</td><td><div class="progress-track"><div class="progress-fill" style="width:' + Math.round(r.pct * 100) + '%"></div></div><span class="muted small">' + r.started + '/' + r.lines + '</span></td><td>' + r.mastered + '</td><td>' + r.due + '</td><td>' + (r.accuracy == null ? '—' : fmtPct(r.accuracy)) + '</td><td><button class="text-btn" data-action="stats-variations" data-course="' + esc(c.id) + '" data-ch="' + esc(r.ch.id) + '">Variations</button></td></tr>').join('') + '</tbody></table>' : '') + '</div>';
  }

  OL.actions.register({
    'stats-toggle': (el) => { st.open = st.open === el.dataset.id ? null : el.dataset.id; render(); },
    'stats-variations': (el) => {
      const c = OL.courses.get(el.dataset.course), ch = c && c.chapters.find((x) => x.id === el.dataset.ch); if (!ch) return;
      const rows = perVariation(c, ch, Date.now());
      OL.ui.modal('<h3>' + esc(ch.name) + ' - variations</h3><div class="table-wrap"><table class="table"><thead><tr><th>Line</th><th>State</th><th>Attempts</th><th>✓</th><th>✗</th><th>Acc.</th><th>Last</th><th>Next review</th></tr></thead><tbody>' +
        (rows.map((r) => '<tr><td class="mono small">' + esc(r.label) + '</td><td><span class="pill ' + r.status + '">' + r.status + '</span>' + (r.due ? ' <span class="pill red">due</span>' : '') + '</td><td>' + r.attempts + '</td><td>' + r.correct + '</td><td>' + r.incorrect + '</td><td>' + (r.accuracy == null ? '—' : fmtPct(r.accuracy)) + '</td><td>' + (r.last ? relTime(r.last) : '—') + '</td><td>' + (r.card && r.card.reviews ? OL.srs.dueLabel(r.card) : '—') + '</td></tr>').join('') || '<tr><td colspan="8" class="muted">No trainable variations.</td></tr>') +
        '</tbody></table></div><div class="modal-actions"><button class="primary-btn" data-modal-close="x">Close</button></div>', { wide: true });
    },
  });

  OL.stats = { load, overall, perCourse, perVariation, daily, forecast, streaks, render, sessions: () => sessions, add: (s) => { sessions.push(s); }, statusBar };
  OL.utils.bus.on('progress', () => load().catch(console.error));
})();
