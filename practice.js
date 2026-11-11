/* Practice mode (MoveTrainer-style). Each queue item is one VARIATION (root->leaf line).
   - The user plays their side from memory; the opponent's moves are auto-played.
   - At any position, every repertoire continuation is accepted (positions are compared by FEN, so
     transpositions inside the chapter work and unrelated moves do not).
   - If the user plays a different repertoire move than the line being drilled, the drill switches to that branch
     (no penalty) and that branch's line is the one graded.
   - New lines are shown with the answer highlighted ("learn"), then graded with a hint flag.
   - Each finished line updates its own SRS card, saved immediately to IndexedDB. */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, esc, shuffle, plural, fmtDuration, fmtPct, uid } = OL.utils;
  const E = () => OL.engine;
  const MODES = [['smart', 'Smart (due + new)'], ['due', 'Due for review'], ['new', 'New variations'], ['all', 'All variations'], ['difficult', 'Difficult variations'], ['incorrect', 'Previously incorrect']];

  const P = { phase: 'setup', cfg: null, queue: [], qi: 0, L: null, board: null, S: null, timers: [], prefill: {}, posMaps: new Map() };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); P.timers.push(t); return t; };
  const clearTimers = () => { P.timers.forEach(clearTimeout); P.timers = []; };

  /* ---------- queue building ---------- */
  function buildQueue(cfg, now) {
    now = now || Date.now();
    const items = [];
    for (const course of OL.courses.list) {
      if (cfg.courseIds && !cfg.courseIds.includes(course.id)) continue;
      for (const ch of course.chapters) {
        if (cfg.chapterIds && cfg.chapterIds.length && !cfg.chapterIds.includes(ch.id)) continue;
        if (cfg.side !== 'both' && ch.orientation !== cfg.side) continue;
        let tr; try { tr = OL.courses.trainable(ch); } catch (e) { console.error('Skipping unreadable chapter', ch.name, e); continue; }
        for (const t of tr) {
          const card = OL.progress.get(course.id, ch.id, t.leaf.id);
          items.push({ course, ch, leaf: t.leaf, card, status: OL.srs.status(card) });
        }
      }
    }
    const isNew = (i) => !i.card || !i.card.reviews;
    const due = shuffle(items.filter((i) => OL.srs.isDue(i.card, now)));
    const fresh = shuffle(items.filter(isNew));
    let q;
    switch (cfg.mode) {
      case 'due': q = due; break;
      case 'new': q = fresh.slice(0, cfg.newCount); break;
      case 'difficult': q = shuffle(items.filter((i) => OL.srs.isDifficult(i.card))); break;
      case 'incorrect': q = shuffle(items.filter((i) => i.card && i.card.incorrect > 0)); break;
      case 'all': q = shuffle(items); break;
      default: q = due.concat(fresh.slice(0, cfg.newCount));
    }
    return { items, queue: q.slice(0, cfg.maxSession), counts: { total: items.length, due: due.length, fresh: fresh.length } };
  }
  function overview(courseIds) {
    const r = buildQueue({ courseIds, side: 'both', mode: 'all', newCount: 1e9, maxSession: 1e9 });
    return r.counts;
  }

  /* ---------- transposition map: posKey(parent) -> children, built once per chapter ---------- */
  function posMap(ch) {
    if (P.posMaps.has(ch.id) && P.posMaps.get(ch.id).root === ch.root) return P.posMaps.get(ch.id).map;
    const map = new Map();
    const idx = OL.courses.index(ch);
    idx.forEach((e) => {
      const k = E().posKey(OL.courses.fenOfNode(ch, e.node));
      (map.get(k) || map.set(k, []).get(k)).push(e.node);
    });
    P.posMaps.set(ch.id, { root: ch.root, map });
    return map;
  }
  function firstLeaf(n) { while (n.children[0]) n = n.children[0]; return n; }

  /* ---------- setup screen ---------- */
  function renderSetup() {
    P.phase = 'setup'; clearTimers();
    const root = $('#view-practice');
    const pf = P.prefill;
    const s = OL.settings.all();
    const list = OL.courses.sorted();
    if (!list.length) { root.innerHTML = head() + '<div class="empty-state"><div class="empty-symbol">◷</div><h3>Nothing to practise yet</h3><p>Import or create a course first.</p><button class="primary-btn" data-nav="#/import">Import a study</button></div>'; return; }
    const chosen = pf.course ? [pf.course] : list.map((c) => c.id);
    root.innerHTML = head() +
      '<div class="practice-setup"><div class="panel"><p class="eyebrow">1 · WHAT TO PRACTISE</p>' +
      list.map((c) => {
        const o = overview([c.id]);
        const open = pf.course === c.id;
        return '<div class="pick-course"><label class="check"><input type="checkbox" class="pc-course" value="' + esc(c.id) + '"' + (chosen.includes(c.id) ? ' checked' : '') + '> <span><b>' + esc(c.title) + '</b> <span class="muted">' + plural(o.total, 'variation') + ' · ' + o.due + ' due · ' + o.fresh + ' new</span></span></label>' +
          (open ? '<div class="pick-chapters">' + c.chapters.map((ch) => '<label class="check"><input type="checkbox" class="pc-chapter" value="' + esc(ch.id) + '"' + (!pf.chapter || pf.chapter === ch.id ? ' checked' : '') + '> <span>' + esc(ch.name) + ' <span class="muted">(' + ch.orientation + ')</span></span></label>').join('') + '</div>' : '<button class="text-btn sm" data-action="practice-expand" data-id="' + esc(c.id) + '">Choose chapters…</button>') + '</div>';
      }).join('') + '</div>' +
      '<div class="panel"><p class="eyebrow">2 · HOW</p>' +
      '<div class="field"><label for="pc-mode">Variations to include</label><select id="pc-mode">' + MODES.map((m) => '<option value="' + m[0] + '"' + (m[0] === (pf.mode || s.defaultPracticeMode) ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="pc-side">Side</label><select id="pc-side">' + [['both', 'Both sides'], ['white', 'White repertoire'], ['black', 'Black repertoire']].map((m) => '<option value="' + m[0] + '"' + (m[0] === s.defaultSide ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select></div>' +
      '<div class="form-grid"><div class="field"><label for="pc-new">New variations</label><input id="pc-new" type="number" min="0" max="200" value="' + s.defaultNew + '"></div><div class="field"><label for="pc-max">Max in session</label><input id="pc-max" type="number" min="1" max="500" value="' + s.maxSession + '"></div></div>' +
      '<div id="pc-preview" class="pc-preview"></div><button class="primary-btn block" data-action="practice-start">Start session</button></div></div>';
    refreshPreview();
  }
  function head() { return '<div class="page-heading"><div><p class="eyebrow">MAKE IT STICK</p><h1>Practice</h1><p class="subheading">Recall your lines move by move. Each variation has its own review schedule.</p></div></div>'; }
  function readCfg() {
    const courseIds = OL.utils.$$('.pc-course:checked').map((x) => x.value);
    const chapterIds = OL.utils.$$('.pc-chapter:checked').map((x) => x.value);
    const allCh = OL.utils.$$('.pc-chapter').length;
    return { courseIds, chapterIds: allCh && chapterIds.length !== allCh ? chapterIds : [], mode: $('#pc-mode').value, side: $('#pc-side').value, newCount: Math.max(0, +$('#pc-new').value || 0), maxSession: Math.max(1, +$('#pc-max').value || 20) };
  }
  function refreshPreview() {
    const el = $('#pc-preview'); if (!el) return;
    const cfg = readCfg();
    if (!cfg.courseIds.length) { el.innerHTML = '<span class="muted">Select at least one course.</span>'; return; }
    const r = buildQueue(cfg);
    el.innerHTML = '<b>' + plural(r.queue.length, 'variation') + '</b> in this session <span class="muted">· ' + r.counts.due + ' due · ' + r.counts.fresh + ' new available · ' + r.counts.total + ' total</span>';
  }
  document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('.practice-setup')) refreshPreview(); });
  document.addEventListener('input', (e) => { if (e.target.closest && e.target.closest('.practice-setup')) refreshPreview(); });

  /* ---------- session ---------- */
  function startSession(cfg) {
    const r = buildQueue(cfg);
    if (!r.queue.length) {
      OL.ui.toast(cfg.mode === 'due' ? 'Nothing is due right now. Try "Smart", "New" or "All".' : 'No variations match these options.', 'warn');
      return;
    }
    clearTimers();
    P.cfg = cfg; P.queue = r.queue; P.qi = 0;
    P.S = { id: uid('sess'), started: Date.now(), active: 0, last: Date.now(), attempted: 0, correct: 0, incorrect: 0, lines: [], courseIds: Array.from(new Set(r.queue.map((i) => i.course.id))) };
    P.phase = 'run';
    renderRunShell();
    startLine();
  }
  function tick() { const n = Date.now(); P.S.active += Math.min(60000, n - P.S.last); P.S.last = n; }

  function renderRunShell() {
    $('#view-practice').innerHTML =
      '<div class="practice-run"><div class="practice-top"><div><p class="eyebrow" id="pr-eyebrow"></p><h2 id="pr-title"></h2></div><div class="btn-row"><button class="secondary-btn" data-action="practice-end">End session</button></div></div>' +
      '<div class="progress-track big"><div class="progress-fill" id="pr-bar"></div></div>' +
      '<div class="practice-layout"><div class="board-host"><div id="pr-board"></div></div>' +
      '<aside class="panel practice-side"><div id="pr-turn" class="pill"></div><div id="pr-feedback" class="feedback">Your move.</div><div id="pr-comment" class="comment-box hidden"></div><div class="pr-notation"><p class="eyebrow">LINE SO FAR</p><div id="pr-notation" class="lesson-body"></div></div>' +
      '<div class="btn-row wrap" id="pr-actions"></div><div class="pr-counters" id="pr-counters"></div><p class="muted small" id="pr-line"></p></aside></div></div>';
    P.board = new OL.Board($('#pr-board'), { orientation: 'white', getMoves: (from) => (P.L && P.L.waiting ? E().legalMoves(P.L.fen, from) : []), onMove: onUserMove });
  }

  function startLine(replay) {
    clearTimers();
    const item = replay ? P.L.item : P.queue[P.qi];
    const ch = item.ch;
    const path = OL.courses.pathTo(ch, item.leaf.id);
    P.L = {
      item, path, step: 0, shown: 0, fen: OL.courses.startFenOf(ch), mistakes: 0, hint: false, revealed: false, attempts: 0, correct: 0, incorrect: 0,
      user: ch.orientation === 'black' ? 'b' : 'w', learn: !item.card || !item.card.reviews, waiting: false, done: false, replay: !!replay, t0: Date.now(), switched: false,
    };
    tick();
    P.board.set({ fen: P.L.fen, last: null, check: null, marks: {}, orientation: ch.orientation });
    paintRun();
    setFeedback(P.L.learn ? 'New line - watch the answers highlighted, then play them.' : 'Play the next move of your repertoire.', 'info');
    advance();
  }

  function paintRun() {
    const L = P.L, it = L.item, n = P.queue.length;
    $('#pr-eyebrow').textContent = 'LINE ' + (P.qi + 1) + ' OF ' + n + (L.replay ? ' · REPLAY (not graded)' : '');
    $('#pr-title').textContent = it.course.title + ' · ' + it.ch.name;
    $('#pr-bar').style.width = Math.round((P.qi / n) * 100) + '%';
    $('#pr-turn').textContent = (E().turnOf(L.fen) === 'w' ? 'White' : 'Black') + ' to move · you are ' + (L.user === 'w' ? 'White' : 'Black');
    $('#pr-counters').innerHTML = '<span class="pill green">✓ ' + L.correct + '</span><span class="pill red">✗ ' + L.incorrect + '</span><span class="pill">' + (L.learn ? 'Learning' : OL.srs.status(it.card)) + '</span>';
    $('#pr-line').textContent = 'Move ' + Math.min(L.step + 1, L.path.length) + ' of ' + L.path.length + ' in this line';
    const nt = $('#pr-notation');
    if (nt) nt.innerHTML = L.shown ? OL.courses.notation(it.ch, L.path.slice(0, L.shown)) : '<span class="muted small">Moves appear here as you play.</span>';
    setActions();
  }
  function setActions() {
    const L = P.L; if (!L) return;
    const el = $('#pr-actions'); if (!el) return;
    if (L.done) { el.innerHTML = '<button class="primary-btn" data-action="practice-next">' + (P.qi + 1 >= P.queue.length ? 'Finish session' : 'Next line →') + '</button><button class="secondary-btn" data-action="practice-replay">Replay line</button>'; return; }
    if (L.waiting) el.innerHTML = '<button class="secondary-btn" data-action="practice-hint">Hint</button><button class="secondary-btn" data-action="practice-reveal">Show answer</button>';
    else if (L.needContinue) el.innerHTML = '<button class="primary-btn" data-action="practice-continue">Continue →</button>';
    else el.innerHTML = '';
  }
  function setFeedback(text, kind) { const f = $('#pr-feedback'); if (f) { f.textContent = text; f.className = 'feedback ' + (kind || ''); } }
  function showComment(node) {
    const c = $('#pr-comment'); if (!c) return;
    if (node && node.comment && OL.settings.get('showComments')) { c.textContent = node.comment; c.classList.remove('hidden'); } else c.classList.add('hidden');
  }

  function advance() {
    const L = P.L; if (!L || L.done) return;
    if (L.step >= L.path.length) { finishLine(); return; }
    const node = L.path[L.step];
    const mover = OL.courses.sideAtPly(L.item.ch, L.step + 1);
    if (mover === L.user) {
      L.waiting = true;
      P.board.set({ marks: L.learn ? markFor(node) : {} });
      P.board.setInteractive(true);
      paintRun();
      return;
    }
    L.waiting = false; P.board.setInteractive(false);
    if (OL.settings.get('autoAdvance') || L.step === 0) later(() => playOpponent(node), L.step === 0 ? 250 : OL.settings.get('opponentDelay'));
    else { L.needContinue = true; setActions(); setFeedback('Opponent plays ' + node.san + '. Continue when ready.', 'info'); }
  }
  function markFor(node) { const m = {}; if (node.uci) { m[node.uci.slice(0, 2)] = 'hint'; m[node.uci.slice(2, 4)] = 'hint'; } return m; }
  function playOpponent(node) {
    const L = P.L; if (!L) return;
    L.needContinue = false;
    applyNode(node);
    showComment(node);
    L.step++; advance();
  }
  function applyNode(node) {
    const L = P.L;
    L.fen = node.fen; L.shown = L.path.indexOf(node) + 1;
    let chk = null; try { const st = E().status(L.fen); if (st.check) chk = E().kingSquare(L.fen, st.turn); } catch (e) { console.error(e); }
    P.board.set({ fen: L.fen, last: node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : null, check: chk, marks: {} });
    paintRun();
  }

  function onUserMove(from, to, promotion) {
    const L = P.L; if (!L || !L.waiting) return;
    tick();
    const r = E().applyMove(L.fen, from, to, promotion);
    if (!r.ok) { P.board.set({ fen: L.fen }); return; }
    const expected = L.path[L.step];
    const key = E().posKey(r.fen);
    const equivalent = posMap(L.item.ch).get(E().posKey(L.fen)) || [];
    let match = key === E().posKey(expected.fen) ? expected : null;
    let alt = null;
    if (!match) {
      for (const n of equivalent) { const c = n.children.find((ch) => E().posKey(ch.fen) === key); if (c) { alt = c; break; } }
    }
    L.attempts++; P.S.attempted++;
    if (match || alt) {
      L.correct++; P.S.correct++;
      const node = match || alt;
      if (alt) retarget(alt);
      L.waiting = false; P.board.setInteractive(false);
      applyNode(node);
      setFeedback(alt ? '✓ ' + node.san + ' - also in your repertoire (different line). Continuing there.' : '✓ Correct: ' + node.san, 'good');
      showComment(node);
      L.step++;
      later(advance, 220);
    } else {
      L.mistakes++; L.incorrect++; P.S.incorrect++;
      P.board.set({ fen: L.fen, marks: markFor(expected) });
      const nm = OL.courses.pathTo(L.item.ch, expected.id).length;
      setFeedback('✗ ' + r.san + ' is not in your repertoire here. Expected: ' + expected.san + '. Try again.', 'bad');
      showComment(expected);
      paintRun();
    }
  }
  function retarget(altNode) {
    const L = P.L, ch = L.item.ch;
    const leaf = firstLeaf(altNode);
    const newPath = OL.courses.pathTo(ch, leaf.id);
    L.path = newPath; L.step = newPath.findIndex((n) => n.id === altNode.id); // advanced by caller
    L.item = Object.assign({}, L.item, { leaf, card: OL.progress.get(L.item.course.id, ch.id, leaf.id) });
    L.switched = true;
  }

  async function finishLine() {
    const L = P.L; if (L.done) return;
    L.done = true; L.waiting = false; L.shown = L.path.length; P.board.setInteractive(false); tick();
    const it = L.item;
    let msg;
    const rec = { courseId: it.course.id, chapterId: it.ch.id, leafId: it.leaf.id, mistakes: L.mistakes, attempts: L.attempts, ms: Date.now() - L.t0, graded: !L.replay };
    if (!L.replay) {
      try {
        const before = it.card || OL.progress.fresh(it.course.id, it.ch.id, it.leaf.id);
        let card = OL.srs.grade(before, { mistakes: L.mistakes, hint: L.learn, revealed: L.revealed });
        card.attempts += L.attempts; card.correct += L.correct; card.incorrect += L.incorrect;
        await OL.progress.save(card);
        it.card = card; rec.next = card.due; rec.status = OL.srs.status(card);
        msg = (L.mistakes === 0 && !L.revealed ? 'Line complete - perfect. ' : 'Line complete with ' + plural(L.mistakes, 'mistake') + '. ') + 'Next review: ' + OL.srs.dueLabel(card) + '.';
      } catch (e) { console.error('Could not save progress:', e); OL.ui.toast('Progress could not be saved: ' + e.message, 'error'); msg = 'Line complete (progress not saved).'; }
      P.S.lines.push(rec);
    } else msg = 'Replay complete (not graded).';
    setFeedback(msg, L.mistakes || L.revealed ? 'info' : 'good');
    paintRun();
    OL.utils.bus.emit('progress', {});
    if (OL.settings.get('autoAdvance') && !L.mistakes && !L.revealed && !L.replay) later(() => nextLine(), 1100);
  }
  function nextLine() {
    if (!P.L || !P.L.done || P.phase !== 'run') return;
    clearTimers();
    P.qi++;
    if (P.qi >= P.queue.length) endSession(); else startLine();
  }

  async function endSession(early) {
    clearTimers(); tick();
    const S = P.S;
    if (!S) return;
    P.phase = 'summary';
    const rec = { id: S.id, ts: S.started, end: Date.now(), duration: S.active, attempted: S.attempted, correct: S.correct, incorrect: S.incorrect, lines: S.lines, courseIds: S.courseIds, mode: P.cfg.mode, early: !!early };
    if (S.attempted || S.lines.length) {
      try {
        await OL.store.put('sessions', rec);
        for (const id of S.courseIds) { const c = OL.courses.get(id); if (c) { c.lastStudied = Date.now(); await OL.store.put('courses', c); } }
        await OL.courses.activity.log('practice', 'Practice session: ' + plural(S.lines.length, 'variation') + ', ' + (S.attempted ? Math.round((S.correct / S.attempted) * 100) : 0) + '% accuracy', S.courseIds[0]);
      } catch (e) { console.error('Could not save session:', e); OL.ui.toast('Session could not be saved: ' + e.message, 'error'); }
    }
    OL.utils.bus.emit('progress', {});
    renderSummary(rec);
    P.L = null;
  }
  function renderSummary(r) {
    const acc = r.attempted ? r.correct / r.attempted : 0;
    const perfect = r.lines.filter((l) => !l.mistakes).length;
    const rows = r.lines.map((l) => {
      const c = OL.courses.get(l.courseId); const ch = c && c.chapters.find((x) => x.id === l.chapterId);
      let label = '(line removed)'; try { if (ch) label = OL.courses.lineLabel(ch, l.leafId, 48); } catch (e) { /* tree edited since */ }
      return '<tr><td>' + esc(c ? c.title + ' · ' + (ch ? ch.name : '') : '') + '<div class="muted small">' + esc(label) + '</div></td><td>' + (l.mistakes ? '<span class="pill red">' + l.mistakes + ' ✗</span>' : '<span class="pill green">perfect</span>') + '</td><td>' + esc(l.status || '') + '</td><td>' + (l.next ? esc(OL.srs.dueLabel({ reviews: 1, due: l.next })) : '') + '</td></tr>';
    }).join('');
    $('#view-practice').innerHTML = head() +
      '<div class="panel summary"><h2>' + (r.early ? 'Session ended early' : 'Session complete') + '</h2><div class="stats-grid four">' +
      stat('Moves attempted', r.attempted) + stat('Correct', r.correct) + stat('Incorrect', r.incorrect) + stat('Accuracy', fmtPct(acc)) + stat('Variations completed', r.lines.length) + stat('Perfect lines', perfect) + stat('Time spent', fmtDuration(r.duration)) + stat('Reviews scheduled', r.lines.length) + '</div>' +
      (rows ? '<table class="table"><thead><tr><th>Variation</th><th>Result</th><th>State</th><th>Next review</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="muted">No variations were completed, so no schedules changed.</p>') +
      '<div class="btn-row"><button class="primary-btn" data-action="practice-again">Practice again</button><button class="secondary-btn" data-nav="#/dashboard">Dashboard</button><button class="secondary-btn" data-nav="#/stats">Statistics</button></div></div>';
  }
  const stat = (l, v) => '<article class="stat-card"><span class="stat-label">' + esc(l.toUpperCase()) + '</span><strong>' + esc(v) + '</strong></article>';

  OL.actions.register({
    'practice-expand': (el) => { P.prefill = { course: el.dataset.id }; renderSetup(); },
    'practice-start': () => { const cfg = readCfg(); if (!cfg.courseIds.length) { OL.ui.toast('Select at least one course.', 'warn'); return; } startSession(cfg); },
    'practice-hint': () => { const L = P.L; if (!L || !L.waiting) return; L.hint = true; const n = L.path[L.step]; P.board.set({ marks: { [n.uci.slice(0, 2)]: 'hint' } }); setFeedback('Hint: move the highlighted piece.', 'info'); },
    'practice-reveal': () => { const L = P.L; if (!L || !L.waiting) return; L.revealed = true; const n = L.path[L.step]; L.attempts++; P.S.attempted++; L.waiting = false; P.board.setInteractive(false); applyNode(n); setFeedback('Answer: ' + n.san + ' (this line will come back sooner).', 'bad'); showComment(n); L.step++; later(advance, 500); },
    'practice-continue': () => { const L = P.L; if (!L) return; playOpponent(L.path[L.step]); },
    'practice-next': () => nextLine(),
    'practice-replay': () => { clearTimers(); startLine(true); },
    'practice-end': async () => { if (!(await OL.ui.confirm({ title: 'End this session?', message: 'Lines you already finished are saved. The current line will not be graded.', confirmLabel: 'End session' }))) return; endSession(true); },
    'practice-again': () => { P.prefill = {}; renderSetup(); },
  });

  document.addEventListener('keydown', (e) => {
    if (P.phase !== 'run' || !P.L || e.target.closest('input,textarea,select')) return;
    if ((e.key === 'Enter' || e.key === ' ') && P.L.done) { e.preventDefault(); nextLine(); }
    else if (e.key === 'Enter' && P.L.needContinue) { e.preventDefault(); OL.actions.run('practice-continue'); }
  });

  OL.practice = {
    render(params) {
      params = params || {};
      if (P.phase === 'run' && !params.course) { return; } // keep a running session when navigating back
      P.prefill = { course: params.course || null, chapter: params.chapter || null, mode: params.mode || null };
      if (!OL.engine.available()) { $('#view-practice').innerHTML = head() + '<div class="error-state"><h2>Chess library did not load</h2><p>Practice needs the rules engine (chess.js). Check your connection and reload.</p></div>'; return; }
      renderSetup();
    },
    leave() { if (P.phase === 'run') { return; } clearTimers(); },
    isRunning: () => P.phase === 'run',
    buildQueue, overview,
  };
})();
