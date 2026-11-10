/* PGN parsing and writing.
   - A character-level scanner (no line-splitting regexes) that understands tag pairs, {comments}, ;comments,
     nested (variations), NAGs ($n and !/? suffixes) and every move-number style.
   - Produces a real move TREE: node.children[0] is the main continuation, children[1..] are alternatives.
   - It never throws on malformed input; problems are returned as warnings.
   Moves are validated against the rules engine afterwards (buildChapter). */
(function () {
  const OL = (window.OL = window.OL || {});
  const mkId = () => (OL.utils && OL.utils.nid ? OL.utils.nid() : 'n' + Math.random().toString(36).slice(2, 9));
  const mkNode = (san, comment) => ({ id: mkId(), san: san || '', comment: comment || '', nags: [], children: [] });
  const SUFFIX_NAG = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
  const NAG_SYMBOL = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!', 10: '=', 13: '∞', 14: '⩲', 15: '⩱', 16: '±', 17: '∓', 18: '+−', 19: '−+' };
  const RESULT = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/;

  function readTag(t, i) {
    let j = i + 1;
    while (t[j] === ' ' || t[j] === '\t') j++;
    const s = j;
    while (j < t.length && /[A-Za-z0-9_]/.test(t[j])) j++;
    if (j === s) return null;
    const name = t.slice(s, j);
    while (t[j] === ' ' || t[j] === '\t') j++;
    if (t[j] !== '"') return null;
    j++;
    let val = '';
    while (j < t.length && t[j] !== '"') {
      if (t[j] === '\\' && (t[j + 1] === '"' || t[j + 1] === '\\')) { val += t[j + 1]; j += 2; } else { val += t[j]; j++; }
    }
    if (t[j] !== '"') return null;
    j++;
    while (t[j] === ' ' || t[j] === '\t') j++;
    if (t[j] !== ']') return null;
    return { name, value: val, next: j + 1 };
  }

  function cleanComment(s) {
    return s.replace(/\[%[^\]]*\]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function newGame(index) {
    const root = { id: 'root', san: '', comment: '', nags: [], children: [] };
    return { index, headers: {}, root, result: null, warnings: [], started: false, finished: false, P: root, lastNode: null, lastParent: null, stack: [], skip: 0, pending: '' };
  }
  function addComment(g, text) {
    text = cleanComment(text);
    if (!text) return;
    if (g.lastNode) g.lastNode.comment = g.lastNode.comment ? g.lastNode.comment + '\n' + text : text;
    else if (!g.stack.length && !g.root.children.length) g.root.comment = g.root.comment ? g.root.comment + '\n' + text : text;
    else g.pending = g.pending ? g.pending + '\n' + text : text;
  }
  function addMove(g, san) {
    const node = mkNode(san, g.pending);
    g.pending = '';
    g.P.children.push(node);
    g.lastParent = g.P;
    g.lastNode = node;
    g.P = node;
  }
  function finish(g) {
    if (g.stack.length) g.warnings.push(g.stack.length + ' unclosed variation(s) at end of game');
    return { index: g.index, headers: g.headers, root: g.root, result: g.result, warnings: g.warnings };
  }

  function parse(input) {
    const text = String(input == null ? '' : input).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const out = [];
    const warnings = [];
    let g = null;
    let i = 0;
    const len = text.length;
    const flush = () => {
      if (!g) return;
      const res = finish(g);
      if (res.root.children.length || Object.keys(res.headers).length) out.push(res);
      g = null;
    };

    while (i < len) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
      if (c === '%' && (i === 0 || text[i - 1] === '\n')) { const e = text.indexOf('\n', i); i = e < 0 ? len : e + 1; continue; }

      if (c === '[') {
        const tag = readTag(text, i);
        if (tag) {
          if (!g || g.started || g.finished) { flush(); g = newGame(out.length); }
          g.headers[tag.name] = tag.value;
          i = tag.next;
          continue;
        }
      }
      if (!g || g.finished) { flush(); g = newGame(out.length); }

      if (c === '{') {
        const j = text.indexOf('}', i + 1);
        let body;
        if (j < 0) { g.warnings.push('Unterminated { comment'); body = text.slice(i + 1); i = len; } else { body = text.slice(i + 1, j); i = j + 1; }
        g.started = true;
        if (!g.skip) addComment(g, body);
        continue;
      }
      if (c === ';') {
        const j = text.indexOf('\n', i);
        const body = text.slice(i + 1, j < 0 ? len : j);
        i = j < 0 ? len : j + 1;
        g.started = true;
        if (!g.skip) addComment(g, body);
        continue;
      }
      if (c === '(') {
        g.started = true;
        if (g.skip) g.skip++;
        else if (!g.lastNode) { g.warnings.push('A variation appeared before any move and was skipped'); g.skip = 1; }
        else { g.stack.push({ P: g.P, lastNode: g.lastNode, lastParent: g.lastParent }); g.P = g.lastParent; g.lastNode = null; g.lastParent = null; }
        i++;
        continue;
      }
      if (c === ')') {
        g.started = true;
        if (g.skip) g.skip--;
        else if (!g.stack.length) g.warnings.push('Unmatched ")" ignored');
        else { const s = g.stack.pop(); g.P = s.P; g.lastNode = s.lastNode; g.lastParent = s.lastParent; }
        i++;
        continue;
      }

      let j = i;
      while (j < len && !/[\s(){};]/.test(text[j])) j++;
      let w = text.slice(i, j);
      i = j;
      if (!w) { i++; continue; }
      g.started = true;
      if (g.skip) continue;

      if (RESULT.test(w)) {
        if (!g.stack.length) { g.result = w === '½-½' ? '1/2-1/2' : w; g.finished = true; }
        continue;
      }
      if (/^\$\d+$/.test(w)) {
        const n = parseInt(w.slice(1), 10);
        if (g.lastNode) { if (!g.lastNode.nags.includes(n)) g.lastNode.nags.push(n); } else g.warnings.push('Annotation ' + w + ' has no move to attach to');
        continue;
      }
      w = w.replace(/^\d+(\.{1,3}|…)/, '');
      if (!w || /^\d+$/.test(w) || /^\.+$/.test(w) || w === '…') continue;
      w = w.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
      let nag = 0;
      const m = /^(.+?)([!?]{1,2})$/.exec(w);
      if (m && SUFFIX_NAG[m[2]]) { w = m[1]; nag = SUFFIX_NAG[m[2]]; }
      if (!/^[A-Za-z-][A-Za-z0-9=+#x\-@]*$/.test(w)) { g.warnings.push('Unrecognized token "' + w + '" ignored'); continue; }
      addMove(g, w);
      if (nag) g.lastNode.nags.push(nag);
    }
    flush();
    return { games: out, warnings };
  }

  /* ---------- tree helpers ---------- */
  function countNodes(root) {
    let n = 0; const st = [root];
    while (st.length) { const p = st.pop(); for (const c of p.children) { n++; st.push(c); } }
    return n;
  }
  function leaves(root) {
    const res = []; const st = [root];
    while (st.length) { const p = st.pop(); if (!p.children.length && p !== root) res.push(p); else p.children.forEach((c) => st.push(c)); }
    return res;
  }
  function mainline(root) { const r = []; let n = root; while (n.children.length) { n = n.children[0]; r.push(n); } return r; }
  function cloneTree(root) { return JSON.parse(JSON.stringify(root)); }

  /* ---------- validation against the rules engine ---------- */
  function chapterName(h, idx) {
    if (h.ChapterName) return h.ChapterName;
    if (h.StudyName && h.Event && h.Event.indexOf(h.StudyName + ': ') === 0) return h.Event.slice(h.StudyName.length + 2);
    if (h.Event && h.Event !== '?') return h.Event;
    if (h.Opening) return h.Opening;
    return 'Chapter ' + (idx + 1);
  }

  /* Walks the tree, replaying each move on the engine to normalise SAN and store fen/uci per node.
     Strict by default: the first illegal move aborts with a precise message. With lenient=true the
     invalid branch is removed and reported in `truncated`. */
  function buildChapter(game, opts) {
    opts = opts || {};
    const E = OL.engine;
    const h = game.headers;
    const variant = (h.Variant || '').toLowerCase();
    if (variant && !['standard', 'chess', 'from position', 'fromposition'].includes(variant)) throw new Error('Variant "' + h.Variant + '" is not supported (standard chess only).');
    let startFen = null;
    if (h.FEN && h.FEN.trim()) {
      const v = E.validateFen(h.FEN);
      if (!v.ok) throw new Error('Invalid starting FEN: ' + v.error);
      startFen = v.fen === E.START_FEN ? null : v.fen;
    }
    const root = game.root;
    const truncated = [];
    const stack = [{ node: root, fen: startFen || E.START_FEN, ply: 0, path: '' }];
    while (stack.length) {
      const cur = stack.pop();
      const keep = [];
      const startTurn = E.turnOf(startFen || E.START_FEN);
      for (const child of cur.node.children) {
        const r = E.applySan(cur.fen, child.san);
        const num = Math.floor((E.fullmove(startFen || E.START_FEN) * 2 - 2 + (startTurn === 'b' ? 1 : 0) + cur.ply) / 2) + 1;
        const side = (startTurn === 'w') === (cur.ply % 2 === 0) ? 'w' : 'b';
        const label = num + (side === 'w' ? '. ' : '... ') + child.san;
        if (!r.ok) {
          const msg = 'Illegal move ' + label + (cur.path ? ' (after ' + cur.path + ')' : ' (first move)');
          if (!opts.lenient) throw new Error(msg);
          truncated.push(msg + ' - this line was skipped');
          continue;
        }
        child.san = r.san; child.uci = r.uci; child.fen = r.fen;
        keep.push(child);
        stack.push({ node: child, fen: r.fen, ply: cur.ply + 1, path: cur.path ? cur.path + ' ' + child.san : child.san });
      }
      cur.node.children = keep;
    }
    const orientation = String(h.Orientation || '').toLowerCase() === 'black' ? 'black' : 'white';
    const chapter = {
      id: OL.utils.uid('ch'),
      name: chapterName(h, game.index),
      description: '',
      orientation,
      startFen,
      headers: Object.assign({}, h),
      root,
      completed: false,
      edited: false,
      originalPgn: '',
    };
    chapter.originalPgn = chapterToPgn(chapter);
    return { chapter, truncated, warnings: game.warnings.slice() };
  }

  /* ---------- writing ---------- */
  const q = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  function movetext(chapter) {
    const E = OL.engine;
    const fen = chapter.startFen || E.START_FEN;
    const ply0 = (E.fullmove(fen) - 1) * 2 + (E.turnOf(fen) === 'b' ? 1 : 0);
    const out = [];
    const emit = (node, ply, forceNum) => {
      if (ply % 2 === 0) out.push(Math.floor(ply / 2) + 1 + '.');
      else if (forceNum) out.push(Math.floor(ply / 2) + 1 + '...');
      out.push(node.san);
      (node.nags || []).forEach((n) => out.push('$' + n));
      if (node.comment) out.push('{ ' + node.comment.replace(/\}/g, '') + ' }');
    };
    const chain = (P, idx, ply) => {
      let cur = P, i = idx, force = true;
      while (cur.children[i]) {
        const node = cur.children[i];
        emit(node, ply, force);
        let had = false;
        if (i === 0) for (let k = 1; k < cur.children.length; k++) { out.push('('); chain(cur, k, ply); out.push(')'); had = true; }
        force = had || !!node.comment;
        cur = node; i = 0; ply++;
      }
    };
    if (chapter.root.comment) out.push('{ ' + chapter.root.comment.replace(/\}/g, '') + ' }');
    chain(chapter.root, 0, ply0);
    return out.join(' ');
  }
  function chapterToPgn(chapter, courseTitle) {
    const h = Object.assign({}, chapter.headers || {});
    const base = {
      Event: h.Event || (courseTitle ? courseTitle + ': ' + chapter.name : chapter.name),
      Site: h.Site || '?', Date: h.Date || '????.??.??', Round: h.Round || '?', White: h.White || '?', Black: h.Black || '?', Result: h.Result || '*',
    };
    const order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    const lines = order.map((k) => '[' + k + ' "' + q(base[k]) + '"]');
    const skip = new Set(order.concat(['FEN', 'SetUp', 'Orientation', 'ChapterName']));
    lines.push('[ChapterName "' + q(chapter.name) + '"]');
    Object.keys(h).forEach((k) => { if (!skip.has(k)) lines.push('[' + k + ' "' + q(h[k]) + '"]'); });
    lines.push('[Orientation "' + chapter.orientation + '"]');
    if (chapter.startFen) { lines.push('[SetUp "1"]'); lines.push('[FEN "' + q(chapter.startFen) + '"]'); }
    const mt = movetext(chapter);
    return lines.join('\n') + '\n\n' + (mt ? mt + ' ' : '') + base.Result + '\n';
  }
  function courseToPgn(course) { return course.chapters.map((c) => chapterToPgn(c, course.title)).join('\n'); }

  OL.pgn = { parse, buildChapter, chapterToPgn, courseToPgn, movetext, countNodes, leaves, mainline, cloneTree, nagSymbol: (n) => NAG_SYMBOL[n] || '', NAG_SYMBOL, chapterName };
})();
