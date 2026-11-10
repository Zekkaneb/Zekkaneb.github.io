/* Study workspace: course navigation | board | move tree + comments. Also all editing (with undo/redo + autosave). */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, esc, debounce, plural } = OL.utils;
  const E = () => OL.engine;
  const NAG_BTNS = [[1, '!'], [2, '?'], [3, '!!'], [4, '??'], [5, '!?'], [6, '?!']];

  const S = {
    course: null, ch: null, nodeId: 'root', board: null, edit: false, chapterQ: '', undo: [], redo: [],
    left: true, right: true, saveState: 'saved', flipped: false, lastErr: null,
  };

  /* ---------- persistence ---------- */
  const saveNow = async () => {
    if (!S.course) return;
    try {
      S.saveState = 'saving'; paintSave();
      await OL.courses.save(S.course, { touch: true });
      await OL.progress.prune(S.course);
      S.saveState = 'saved';
    } catch (e) { S.saveState = 'error'; console.error('Autosave failed:', e); OL.ui.toast('Could not save your changes: ' + e.message, 'error'); }
    paintSave();
  };
  const saveSoon = debounce(saveNow, 500);
  function paintSave() {
    const el = $('#save-state');
    if (el) { el.textContent = S.saveState === 'saved' ? '✓ Saved' : S.saveState === 'saving' ? 'Saving…' : S.saveState === 'dirty' ? 'Unsaved…' : '⚠ Save failed'; el.className = 'save-state ' + S.saveState; }
  }
  function markDirty() { S.saveState = 'dirty'; paintSave(); saveSoon(); }

  /* ---------- undo / redo (snapshots of the chapter's editable content) ---------- */
  const snap = () => JSON.stringify({ root: S.ch.root, startFen: S.ch.startFen, name: S.ch.name, description: S.ch.description, orientation: S.ch.orientation, nodeId: S.nodeId });
  function pushUndo() { S.undo.push(snap()); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
  function restore(json) {
    const o = JSON.parse(json);
    Object.assign(S.ch, { root: o.root, startFen: o.startFen, name: o.name, description: o.description, orientation: o.orientation, edited: true });
    OL.courses.reindex(S.ch);
    S.nodeId = OL.courses.index(S.ch).has(o.nodeId) ? o.nodeId : 'root';
  }
  function undo() { if (!S.undo.length) return; S.redo.push(snap()); restore(S.undo.pop()); markDirty(); renderAll(); }
  function redo() { if (!S.redo.length) return; S.undo.push(snap()); restore(S.redo.pop()); markDirty(); renderAll(); }
  function mutate(fn) { pushUndo(); fn(); S.ch.edited = true; OL.courses.reindex(S.ch); markDirty(); }

  /* ---------- view helpers ---------- */
  const cur = () => OL.courses.index(S.ch).get(S.nodeId) || OL.courses.index(S.ch).get('root');
  const curFen = () => OL.courses.fenOfNode(S.ch, cur().node);
  function numberFor(ply0) { // ply0 = 0-based ply counted from the chapter's start position
    const fen = OL.courses.startFenOf(S.ch);
    const abs = (E().fullmove(fen) - 1) * 2 + (E().turnOf(fen) === 'b' ? 1 : 0) + ply0;
    return { white: abs % 2 === 0, n: Math.floor(abs / 2) + 1 };
  }
  function token(node, ply0, force) {
    const nm = numberFor(ply0);
    const pre = nm.white ? '<span class="mn">' + nm.n + '.</span>' : force ? '<span class="mn">' + nm.n + '…</span>' : '';
    const showNag = OL.settings.get('showAnnotations');
    const nags = showNag ? (node.nags || []).map((n) => OL.pgn.nagSymbol(n)).filter(Boolean) : [];
    const cls = ['mv'];
    if (node.id === S.nodeId) cls.push('on');
    if (node.comment && OL.settings.get('showComments')) cls.push('hc');
    (node.nags || []).forEach((n) => { if ([1, 3].includes(n)) cls.push('good'); if ([2, 4].includes(n)) cls.push('bad'); if ([5, 6].includes(n)) cls.push('dubious'); });
    return pre + '<button class="' + cls.join(' ') + '" data-action="study-goto" data-id="' + esc(node.id) + '">' + esc(node.san) + (nags.length ? '<sup>' + esc(nags.join('')) + '</sup>' : '') + '</button>' +
      '';
  }
  function seq(P, start, ply0, depth) {
    let html = '', c = P, i = start, force = true;
    while (c.children[i]) {
      const node = c.children[i];
      html += token(node, ply0, force);
      force = !!(node.comment && OL.settings.get('showComments'));
      if (i === 0 && c.children.length > 1) {
        for (let k = 1; k < c.children.length; k++) html += '<div class="var d' + Math.min(depth, 3) + '"><span class="paren">(</span>' + seq(c, k, ply0, depth + 1) + '<span class="paren">)</span></div>';
        force = true;
      }
      c = node; i = 0; ply0++;
    }
    return html;
  }

  /* ---------- rendering ---------- */
  function renderAll() {
    if (!S.course) return;
    renderLeft(); renderBoard(); renderRight(); paintSave();
  }

  function renderShell() {
    const root = $('#view-study');
    root.innerHTML =
      '<div class="study-top"><button class="icon-btn" data-nav="#/courses" aria-label="Back to library" title="Back to library">←</button>' +
      '<div class="study-title"><strong>' + esc(S.course.title) + '</strong><span class="muted" id="chapter-title"></span></div>' +
      '<span id="save-state" class="save-state saved">✓ Saved</span>' +
      '<div class="btn-row">' +
      '<button class="secondary-btn" data-action="study-toggle-left" title="Toggle course panel">Chapters</button>' +
      '<button class="secondary-btn" data-action="study-toggle-right" title="Toggle moves panel">Moves</button>' +
      '<button class="secondary-btn' + (S.edit ? ' active' : '') + '" data-action="study-edit" id="btn-edit">✎ ' + (S.edit ? 'Editing' : 'Edit') + '</button>' +
      '<button class="primary-btn" data-action="study-practice">Practice</button></div></div>' +
      '<div class="study-layout' + (S.left ? '' : ' no-left') + (S.right ? '' : ' no-right') + '">' +
      '<aside class="study-left panel" id="study-left"></aside>' +
      '<section class="study-center"><div id="study-board" class="board-host"></div><div class="board-controls" id="board-controls"></div><div id="edit-tools"></div></section>' +
      '<aside class="study-right panel" id="study-right"></aside></div>';
  }

  function renderLeft() {
    const q = S.chapterQ.toLowerCase();
    const idx = S.course.chapters;
    const rows = idx.map((ch, i) => {
      if (q && !ch.name.toLowerCase().includes(q)) return '';
      const on = ch.id === S.ch.id;
      let lines = 0, done = 0;
      try { const tr = OL.courses.trainable(ch); lines = tr.length; done = tr.filter((t) => { const c = OL.progress.get(S.course.id, ch.id, t.leaf.id); return c && c.reviews > 0; }).length; } catch (e) { console.error(e); }
      return '<div class="chapter-row' + (on ? ' on' : '') + '"><button class="chapter-btn" data-action="study-chapter" data-id="' + esc(ch.id) + '">' +
        '<span class="ch-no">' + String(i + 1).padStart(2, '0') + '</span><span class="ch-name">' + esc(ch.name) + '</span>' +
        '<span class="ch-state ' + (ch.completed ? 'done' : done ? 'part' : '') + '" title="' + (ch.completed ? 'Marked complete' : done ? done + '/' + lines + ' lines practised' : 'Not started') + '">' + (ch.completed ? '✓' : lines ? done + '/' + lines : '') + '</span></button>' +
        '<button class="icon-btn sm" aria-label="Chapter options" data-action="study-chapter-menu" data-id="' + esc(ch.id) + '">⋯</button></div>';
    }).join('');
    let lineHtml = '';
    try {
      const tr = OL.courses.trainable(S.ch);
      lineHtml = tr.length ? tr.map((t) => {
        const c = OL.progress.get(S.course.id, S.ch.id, t.leaf.id);
        const stt = OL.srs.status(c);
        return '<button class="line-btn" data-action="study-goto" data-id="' + esc(t.leaf.id) + '" title="' + esc(OL.courses.lineLabel(S.ch, t.leaf.id)) + '"><span class="dot ' + stt + '"></span><span>' + esc(OL.courses.lineLabel(S.ch, t.leaf.id, 80)) + '</span></button>';
      }).join('') : '<p class="muted small">No trainable lines yet. ' + (S.ch.root.children.length ? '' : 'Add moves in edit mode.') + '</p>';
    } catch (e) { console.error(e); lineHtml = '<p class="muted small">Could not list lines: ' + esc(e.message) + '</p>'; }
    $('#study-left').innerHTML =
      '<div class="panel-head"><p class="eyebrow">COURSE</p><h3>' + esc(S.course.title) + '</h3><p class="muted small">' + plural(idx.length, 'chapter') + '</p></div>' +
      '<label class="search-box sm">⌕ <input id="chapter-search" placeholder="Search chapters" value="' + esc(S.chapterQ) + '"></label>' +
      '<div class="chapter-list">' + (rows || '<p class="muted small pad">No chapters match.</p>') + '</div>' +
      (S.edit ? '<button class="secondary-btn block" data-action="study-add-chapter">＋ Add chapter</button>' : '') +
      '<div class="panel-head tight"><p class="eyebrow">LINES IN THIS CHAPTER</p></div><div class="line-list">' + lineHtml + '</div>';
    const si = $('#chapter-search');
    if (si && document.activeElement && document.activeElement.id === 'chapter-search') { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
  }

  function studyArrows() {
    if (!OL.settings.get('showArrows')) return [];
    return cur().node.children.filter((c) => c.uci).map((c, i) => ({ from: c.uci.slice(0, 2), to: c.uci.slice(2, 4), kind: i ? 'alt' : 'main' }));
  }
  function renderBoard() {
    const host = $('#study-board');
    if (!S.board || S.board.root !== host) {
      S.board = new OL.Board(host, {
        orientation: S.flipped ? (S.ch.orientation === 'white' ? 'black' : 'white') : S.ch.orientation,
        getMoves: (from) => E().legalMoves(curFen(), from),
        onMove: onBoardMove,
      });
    }
    const n = cur().node, fen = curFen();
    let check = null, st = null;
    try { st = E().status(fen); if (st.check) check = E().kingSquare(fen, st.turn); } catch (e) { console.error(e); }
    S.board.set({ fen, last: n.uci ? [n.uci.slice(0, 2), n.uci.slice(2, 4)] : null, check, arrows: studyArrows(), orientation: S.board.orientation });
    $('#chapter-title').textContent = ' · ' + S.ch.name;
    const idx = OL.courses.index(S.ch), e = idx.get(S.nodeId);
    const hasPrev = e.node.id !== 'root', hasNext = e.node.children.length > 0;
    $('#board-controls').innerHTML =
      '<button class="icon-btn" data-action="study-first" ' + (hasPrev ? '' : 'disabled') + ' title="First (Home)" aria-label="First move">⏮</button>' +
      '<button class="icon-btn" data-action="study-prev" ' + (hasPrev ? '' : 'disabled') + ' title="Previous (←)" aria-label="Previous move">◀</button>' +
      '<button class="icon-btn" data-action="study-next" ' + (hasNext ? '' : 'disabled') + ' title="Next (→)" aria-label="Next move">▶</button>' +
      '<button class="icon-btn" data-action="study-last" ' + (hasNext ? '' : 'disabled') + ' title="Last (End)" aria-label="Last move">⏭</button>' +
      '<span class="spacer"></span>' +
      '<button class="icon-btn" data-action="study-flip" title="Flip board (F)" aria-label="Flip board">⇅</button>' +
      '<button class="icon-btn' + (OL.settings.get('coords') ? ' active' : '') + '" data-action="study-coords" title="Toggle coordinates" aria-label="Toggle coordinates">a1</button>' +
      '<button class="icon-btn' + (OL.settings.get('showArrows') ? ' active' : '') + '" data-action="study-arrows" title="Toggle next-move arrows" aria-label="Toggle arrows">➚</button>' +
      '<button class="icon-btn" data-action="board-theme" title="Change board theme" aria-label="Change board theme">◧</button>';
    S.board.setInteractive(true);
    renderEditTools(st);
  }

  function renderEditTools() {
    const el = $('#edit-tools');
    const e = cur();
    if (!S.edit) { el.innerHTML = '<p class="hint">Click a move, use ← → keys, or play a move on the board that is in the study. Switch on <b>Edit</b> to add moves and variations.</p>'; return; }
    const n = e.node, isRoot = n.id === 'root';
    const sibIdx = e.parent ? e.parent.children.indexOf(n) : 0;
    el.innerHTML =
      '<div class="edit-tools"><div class="edit-row"><span class="eyebrow">EDIT</span>' +
      '<button class="secondary-btn sm" data-action="study-undo" ' + (S.undo.length ? '' : 'disabled') + '>↶ Undo</button><button class="secondary-btn sm" data-action="study-redo" ' + (S.redo.length ? '' : 'disabled') + '>↷ Redo</button>' +
      '<button class="secondary-btn sm" data-action="study-del-move" ' + (isRoot ? 'disabled' : '') + '>Delete move &amp; after</button>' +
      '<button class="secondary-btn sm" data-action="study-promote" ' + (!isRoot && sibIdx > 0 ? '' : 'disabled') + ' title="Make this variation the main continuation">Promote</button>' +
      '<button class="secondary-btn sm" data-action="study-demote" ' + (!isRoot && e.parent && sibIdx < e.parent.children.length - 1 ? '' : 'disabled') + ' title="Swap with the next alternative">Demote</button></div>' +
      '<div class="edit-row"><span class="eyebrow">SYMBOL</span>' + NAG_BTNS.map((b) => '<button class="nag-btn' + ((n.nags || []).includes(b[0]) ? ' on' : '') + '" data-action="study-nag" data-nag="' + b[0] + '" ' + (isRoot ? 'disabled' : '') + '>' + b[1] + '</button>').join('') + '<button class="nag-btn" data-action="study-nag" data-nag="0" ' + (isRoot ? 'disabled' : '') + '>clear</button></div>' +
      '<div class="edit-row"><span class="eyebrow">ADD</span><input id="san-input" class="mini-input" placeholder="Type a move (e.g. Nf3) + Enter" aria-label="Add move in algebraic notation"><span class="muted small">or play it on the board</span></div></div>';
  }

  function renderRight() {
    const e = cur(), n = e.node;
    const fen = curFen();
    let st = { turn: 'w' };
    try { st = E().status(fen); } catch (err) { console.error(err); }
    const nm = n.id === 'root' ? null : numberFor(e.ply - 1);
    const heading = n.id === 'root' ? 'Starting position' : nm.n + (nm.white ? '. ' : '… ') + n.san;
    const nextMoves = n.children.length > 1 ? '<div class="branches"><p class="eyebrow">CONTINUATIONS</p>' + n.children.map((c, i) => '<button class="chip" data-action="study-goto" data-id="' + esc(c.id) + '">' + esc(c.san) + (i === 0 ? ' <small>main</small>' : '') + '</button>').join('') + '</div>' : '';
    const h = S.ch.headers || {};
    const meta = [h.ECO && h.ECO !== '?' ? h.ECO : '', h.Opening || ''].filter(Boolean).join(' · ');
    const commentBox = S.edit
      ? '<textarea id="comment-box" rows="4" placeholder="' + (n.id === 'root' ? 'Comment on the starting position…' : 'Comment on this move…') + '">' + esc(n.comment || '') + '</textarea>'
      : (n.comment ? '<div class="comment-box">' + esc(n.comment).replace(/\n/g, '<br>') + '</div>' : '');
    const nagTxt = (n.nags || []).map((x) => OL.pgn.nagSymbol(x)).filter(Boolean).join(' ');
    const tree = S.ch.root.children.length ? '<div class="move-list" id="move-list">' + (S.ch.root.comment && OL.settings.get('showComments') ? '<span class="cm root">' + esc(S.ch.root.comment) + '</span>' : '') + seq(S.ch.root, 0, 0, 0) + '</div>' : '<p class="muted small pad">This chapter has no moves yet.' + (S.edit ? ' Play a move on the board to begin.' : ' Turn on Edit to add some.') + '</p>';
    $('#study-right').innerHTML =
      '<div class="panel-head"><p class="eyebrow">' + esc(S.ch.name) + '</p><h3>' + esc(heading) + (nagTxt ? ' <span class="nag-big">' + esc(nagTxt) + '</span>' : '') + '</h3>' + (meta ? '<p class="muted small">' + esc(meta) + '</p>' : '') + '</div>' +
      '<div class="info-pills"><span class="pill">' + (st.turn === 'w' ? 'White' : 'Black') + ' to move</span>' + (st.checkmate ? '<span class="pill red">Checkmate</span>' : st.check ? '<span class="pill red">Check</span>' : '') + (st.stalemate ? '<span class="pill">Stalemate</span>' : '') + (S.ch.startFen ? '<span class="pill">Custom start</span>' : '') + '<button class="pill btn" data-action="study-copy-fen" title="Copy FEN">FEN ⧉</button></div>' +
      '<div class="panel-section">' + commentBox + '</div>' + nextMoves +
      '<div class="panel-section"><p class="eyebrow">MOVES</p>' + tree + '</div>' +
      '<div class="panel-section"><p class="eyebrow">CHAPTER NOTES</p>' + (S.edit ? '<textarea id="chapter-notes" rows="3" placeholder="Describe this chapter…">' + esc(S.ch.description || '') + '</textarea>' : (S.ch.description ? '<div class="comment-box">' + esc(S.ch.description).replace(/\n/g, '<br>') + '</div>' : '<p class="muted small">No chapter notes.</p>')) + '</div>' +
      '<div class="panel-section"><button class="secondary-btn block" data-action="study-complete">' + (S.ch.completed ? '✓ Marked complete - click to undo' : 'Mark chapter as studied') + '</button></div>';
    const act = $('.mv.on');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- navigation ---------- */
  function goto(id) {
    const idx = OL.courses.index(S.ch);
    if (!idx.has(id)) { console.warn('goto: unknown node', id); return; }
    S.nodeId = id;
    renderBoard(); renderRight();
    OL.utils.$$('#study-left .line-btn').length && 0;
  }
  const go = {
    prev() { const e = cur(); if (e.parent) goto(e.parent.id); },
    next() { const n = cur().node; if (n.children[0]) goto(n.children[0].id); },
    first() { goto('root'); },
    last() { let n = cur().node; while (n.children[0]) n = n.children[0]; goto(n.id); },
  };

  function onBoardMove(from, to, promotion) {
    const fen = curFen();
    const r = E().applyMove(fen, from, to, promotion);
    if (!r.ok) { OL.ui.toast('That move is not legal here.', 'error'); renderBoard(); return; }
    addMoveFromResult(r);
  }
  function addMoveFromResult(r) {
    const n = cur().node;
    const same = n.children.find((c) => c.san === r.san);
    if (same) { goto(same.id); return; }
    if (!S.edit) {
      OL.ui.toast(r.san + ' is not in this study. Turn on Edit to add it as a new line.', 'warn');
      renderBoard(); return;
    }
    let id;
    mutate(() => {
      const node = { id: OL.utils.nid(), san: r.san, uci: r.uci, fen: r.fen, comment: '', nags: [], children: [] };
      n.children.push(node); id = node.id;
    });
    S.nodeId = id; renderAll();
  }

  /* ---------- chapter-level helpers ---------- */
  function openChapter(id, keepNode) {
    const ch = S.course.chapters.find((c) => c.id === id) || S.course.chapters[0];
    if (!ch) return false;
    OL.courses.index(ch); // throws a descriptive error if the data is damaged
    S.ch = ch; if (!keepNode) S.nodeId = 'root'; S.undo = []; S.redo = []; S.flipped = false; S.board = null;
    try { history.replaceState(null, '', '#/study/' + S.course.id + '?ch=' + ch.id + (S.edit ? '&edit=1' : '')); } catch (e) { console.warn('replaceState failed', e); }
    return true;
  }

  async function chapterForm(ch) {
    return OL.ui.form({
      title: ch ? 'Edit chapter' : 'New chapter', submitLabel: ch ? 'Save' : 'Add chapter',
      fields: [
        { name: 'name', label: 'Chapter name', value: ch ? ch.name : '', required: true },
        { name: 'orientation', label: 'You play as (board orientation & training side)', type: 'select', options: [{ value: 'white', label: 'White' }, { value: 'black', label: 'Black' }], value: ch ? ch.orientation : (S.course.side === 'black' ? 'black' : 'white') },
        { name: 'description', label: 'Chapter description', type: 'textarea', value: ch ? ch.description : '' },
      ],
    });
  }

  async function setStartFen() {
    const has = S.ch.root.children.length > 0;
    const v = await OL.ui.form({
      title: 'Starting position', intro: has ? '<b>Warning:</b> changing the start position removes all moves in this chapter (you can undo).' : 'Enter a FEN, or leave empty for the standard starting position.',
      fields: [{ name: 'fen', label: 'FEN', value: S.ch.startFen || '', placeholder: E().START_FEN }],
      validate: (o) => (o.fen && !E().validateFen(o.fen).ok ? 'Invalid FEN: ' + E().validateFen(o.fen).error : ''),
    });
    if (!v) return;
    const fen = v.fen ? E().validateFen(v.fen).fen : null;
    mutate(() => { S.ch.startFen = fen === E().START_FEN ? null : fen; S.ch.root.children = []; S.ch.root.comment = ''; S.nodeId = 'root'; });
    renderAll();
  }

  /* ---------- actions ---------- */
  OL.actions.register({
    'study-goto': (el) => goto(el.dataset.id),
    'study-first': () => go.first(), 'study-prev': () => go.prev(), 'study-next': () => go.next(), 'study-last': () => go.last(),
    'study-flip': () => { const o = S.board.orientation === 'white' ? 'black' : 'white'; S.flipped = o !== S.ch.orientation; S.board.set({ orientation: o }); },
    'study-arrows': () => { OL.settings.set({ showArrows: !OL.settings.get('showArrows') }); renderBoard(); },
    'study-coords': () => { OL.settings.set({ coords: !OL.settings.get('coords') }); renderBoard(); },
    'study-toggle-left': () => { S.left = !S.left; $('.study-layout').classList.toggle('no-left', !S.left); },
    'study-toggle-right': () => { S.right = !S.right; $('.study-layout').classList.toggle('no-right', !S.right); },
    'study-edit': () => { S.edit = !S.edit; const b = $('#btn-edit'); b.classList.toggle('active', S.edit); b.textContent = '✎ ' + (S.edit ? 'Editing' : 'Edit'); history.replaceState(null, '', '#/study/' + S.course.id + '?ch=' + S.ch.id + (S.edit ? '&edit=1' : '')); renderAll(); },
    'study-practice': () => OL.nav.go('#/practice?course=' + S.course.id + '&chapter=' + S.ch.id),
    'study-chapter': (el) => { flush(); try { openChapter(el.dataset.id); renderAll(); } catch (e) { showError(e); } },
    'study-copy-fen': async () => { OL.ui.toast((await OL.utils.copyText(curFen())) ? 'FEN copied' : 'Could not copy - clipboard blocked by the browser', 'warn'); },
    'study-undo': undo, 'study-redo': redo,
    'study-del-move': async () => {
      const e = cur(); if (e.node.id === 'root') return;
      const cnt = OL.pgn.countNodes(e.node) + 1;
      if (cnt > 3 && !(await OL.ui.confirm({ title: 'Delete this move?', message: 'This removes ' + plural(cnt, 'move') + ' (this move and everything after it). You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true }))) return;
      const pid = e.parent.id;
      mutate(() => { e.parent.children = e.parent.children.filter((c) => c.id !== e.node.id); });
      S.nodeId = pid; renderAll();
    },
    'study-promote': () => { const e = cur(); const i = e.parent.children.indexOf(e.node); if (i < 1) return; mutate(() => { const a = e.parent.children; [a[i - 1], a[i]] = [a[i], a[i - 1]]; }); renderAll(); },
    'study-demote': () => { const e = cur(); const a = e.parent.children; const i = a.indexOf(e.node); if (i >= a.length - 1) return; mutate(() => { [a[i + 1], a[i]] = [a[i], a[i + 1]]; }); renderAll(); },
    'study-nag': (el) => {
      const e = cur(); if (e.node.id === 'root') return; const nag = +el.dataset.nag;
      mutate(() => { const set = e.node.nags || (e.node.nags = []); if (!nag) e.node.nags = []; else { const exclusive = [1, 2, 3, 4, 5, 6]; const had = set.includes(nag); e.node.nags = set.filter((x) => !exclusive.includes(x)); if (!had) e.node.nags.push(nag); } });
      renderAll();
    },
    'study-complete': async () => { S.ch.completed = !S.ch.completed; await OL.courses.save(S.course, { touch: false }); if (S.ch.completed) await OL.courses.activity.log('chapter', 'Completed chapter "' + S.ch.name + '" in ' + S.course.title, S.course.id); renderLeft(); renderRight(); OL.ui.toast(S.ch.completed ? 'Chapter marked as studied' : 'Chapter unmarked'); },
    'study-add-chapter': async () => {
      const v = await chapterForm(null); if (!v) return;
      const ch = OL.courses.newChapter(v); S.course.chapters.push(ch); await saveNow();
      openChapter(ch.id); renderAll();
    },
    'study-chapter-menu': async (el) => {
      const ch = S.course.chapters.find((c) => c.id === el.dataset.id); if (!ch) return;
      const i = S.course.chapters.indexOf(ch);
      const isCur = ch.id === S.ch.id;
      const pick = await OL.ui.menu({ title: ch.name, items: [
        { id: 'edit', label: 'Rename / edit details…' }, ...(isCur ? [{ id: 'fen', label: 'Set starting position (FEN)…' }] : []),
        { id: 'up', label: 'Move up' }, { id: 'down', label: 'Move down' }, { id: 'pgn', label: 'Export chapter as PGN' },
        ...(ch.originalPgn ? [{ id: 'restore', label: 'Restore to imported version…' }] : []), { sep: true }, { id: 'del', label: 'Delete chapter…', danger: true }] });
      if (!pick) return;
      if (pick === 'edit') {
        const v = await chapterForm(ch); if (!v) return;
        if (isCur) pushUndo(); if (v.orientation !== ch.orientation && S.course.side && S.course.side !== 'both') ch.sideLocked = true; Object.assign(ch, v); if (isCur) S.board = null; ch.edited = true; markDirty(); renderAll();
      } else if (pick === 'fen') { if (!S.edit) { S.edit = true; } await setStartFen(); renderShellKeep(); }
      else if (pick === 'up' || pick === 'down') {
        const j = i + (pick === 'up' ? -1 : 1); if (j < 0 || j >= S.course.chapters.length) return;
        const a = S.course.chapters; [a[i], a[j]] = [a[j], a[i]]; await saveNow(); renderLeft();
      } else if (pick === 'pgn') { OL.utils.download(ch.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.pgn', OL.pgn.chapterToPgn(ch, S.course.title), 'application/x-chess-pgn'); }
      else if (pick === 'restore') {
        if (!(await OL.ui.confirm({ title: 'Restore imported version?', message: 'Your edits to "' + esc(ch.name) + '" will be replaced by the original imported moves. Progress for lines that no longer exist is removed.', confirmLabel: 'Restore', danger: true }))) return;
        try {
          const g = OL.pgn.parse(ch.originalPgn).games[0]; const b = OL.pgn.buildChapter(g, { lenient: true }).chapter;
          Object.assign(ch, { root: b.root, startFen: b.startFen, orientation: b.orientation, edited: false }); OL.courses.reindex(ch);
          if (isCur) { S.nodeId = 'root'; S.undo = []; S.redo = []; } await saveNow(); renderAll(); OL.ui.toast('Chapter restored');
        } catch (e) { OL.ui.toast('Could not restore: ' + e.message, 'error'); }
      } else if (pick === 'del') {
        if (S.course.chapters.length === 1) { OL.ui.toast('A course needs at least one chapter. Delete the course instead.', 'warn'); return; }
        if (!(await OL.ui.confirm({ title: 'Delete "' + ch.name + '"?', message: 'The chapter and its practice progress will be removed. This cannot be undone.', confirmLabel: 'Delete chapter', danger: true }))) return;
        S.course.chapters = S.course.chapters.filter((c) => c !== ch);
        await saveNow();
        if (isCur) openChapter(S.course.chapters[Math.max(0, i - 1)].id);
        renderAll(); OL.ui.toast('Chapter deleted');
      }
    },
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'chapter-search') { S.chapterQ = e.target.value; renderLeft(); }
    if (!S.course || !S.ch) return;
    if (e.target.id === 'comment-box') {
      const n = cur().node;
      if (!S.commentUndoArmed) { pushUndo(); S.commentUndoArmed = true; clearTimeout(S.commentT); }
      clearTimeout(S.commentT); S.commentT = setTimeout(() => { S.commentUndoArmed = false; }, 1500);
      n.comment = e.target.value; S.ch.edited = true; markDirty();
      if (OL.settings.get('showComments')) { const ml = $('#move-list'); if (ml) ml.innerHTML = (S.ch.root.comment && OL.settings.get('showComments') ? '<span class="cm root">' + esc(S.ch.root.comment) + '</span>' : '') + seq(S.ch.root, 0, 0, 0); }
    }
    if (e.target.id === 'chapter-notes') { if (!S.notesArmed) { pushUndo(); S.notesArmed = true; setTimeout(() => (S.notesArmed = false), 1500); } S.ch.description = e.target.value; S.ch.edited = true; markDirty(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'san-input' && e.key === 'Enter') {
      e.preventDefault();
      const r = E().applySan(curFen(), e.target.value.trim());
      if (!r.ok) { OL.ui.toast(r.error, 'error'); return; }
      e.target.value = ''; addMoveFromResult(r); const si = $('#san-input'); if (si) si.focus();
    }
  });

  function flush() { saveSoon.cancel(); if (S.saveState === 'dirty') return saveNow(); }
  function showError(err) {
    console.error('renderStudy failed:', err);
    S.lastErr = err;
    $('#view-study').innerHTML = '<div class="error-state"><h2>This chapter could not be displayed</h2><p>' + esc(err.message) + '</p><p class="muted small">Your data has not been modified. You can go back to the library, or open another chapter.</p>' +
      '<div class="btn-row center"><button class="primary-btn" data-nav="#/courses">Back to library</button>' + (S.course && S.course.chapters.length > 1 ? '<button class="secondary-btn" data-action="study-first-ok">Open another chapter</button>' : '') + '</div></div>';
  }
  function renderShellKeep() { renderShell(); renderAll(); }

  function renderStudy(courseId, params) {
    const root = $('#view-study');
    if (!OL.engine.available()) { root.innerHTML = '<div class="error-state"><h2>Chess library did not load</h2><p>The rules engine (chess.js) could not be downloaded, so boards cannot be shown. Check your internet connection or content blocker and reload the page.</p></div>'; return; }
    const c = OL.courses.get(courseId);
    if (!c) { root.innerHTML = '<div class="error-state"><h2>Course not found</h2><p>It may have been deleted.</p><div class="btn-row center"><button class="primary-btn" data-nav="#/courses">Back to library</button></div></div>'; return; }
    S.course = c; S.edit = params.edit === '1'; S.chapterQ = '';
    if (!S.layoutInit) { S.layoutInit = true; if (window.innerWidth < 900) S.left = false; } // phones: board first, course panel on demand
    if (!c.chapters.length) { c.chapters.push(OL.courses.newChapter({ name: 'Chapter 1' })); }
    try {
      openChapter(params.ch || (c.chapters.find((x) => !x.completed) || c.chapters[0]).id);
      if (params.node && OL.courses.index(S.ch).has(params.node)) S.nodeId = params.node;
      renderShell(); renderAll();
      c.lastStudied = Date.now(); OL.store.put('courses', c).catch((e) => console.warn('lastStudied not saved', e));
    } catch (err) { showError(err); }
  }

  OL.actions.register({ 'study-first-ok': () => { const ok = S.course.chapters.find((c) => { try { OL.courses.index(c); return true; } catch (e) { return false; } }); if (!ok) { OL.ui.toast('No readable chapters in this course.', 'error'); return; } try { openChapter(ok.id); renderShell(); renderAll(); } catch (e) { showError(e); } } });

  OL.study = {
    render: renderStudy,
    leave() { const p = flush(); S.course = null; S.ch = null; S.board = null; return p; },
    isActive: () => !!S.course && $('#view-study') && !$('#view-study').classList.contains('hidden'),
    keys(e) {
      if (!S.course || !S.ch) return false;
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && S.edit && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return true; }
      if ((e.ctrlKey || e.metaKey) && S.edit && k === 'y') { e.preventDefault(); redo(); return true; }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (k === 'ArrowLeft') go.prev(); else if (k === 'ArrowRight') go.next(); else if (k === 'Home') go.first(); else if (k === 'End') go.last();
      else if (k === 'ArrowDown') { const n = cur().node; const e2 = cur(); if (e2.parent && e2.parent.children.length > 1) { const a = e2.parent.children; goto(a[(a.indexOf(n) + 1) % a.length].id); } }
      else if (k === 'ArrowUp') { const e2 = cur(); if (e2.parent && e2.parent.children.length > 1) { const a = e2.parent.children; goto(a[(a.indexOf(e2.node) - 1 + a.length) % a.length].id); } }
      else if (k === 'f' || k === 'F') OL.actions.run('study-flip');
      else return false;
      e.preventDefault();
      return true;
    },
  };
})();
