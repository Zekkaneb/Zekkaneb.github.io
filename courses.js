/* Course model (courses -> chapters -> move tree), persistence, legacy migration, and the course library view. */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, esc, uid, nid, bus, relTime, plural, hashString } = OL.utils;
  const COLORS = ['#3d5a45', '#4a5d7a', '#7a4a4a', '#6b5a3a', '#5a4a7a', '#3f6b6b', '#7a5a6b', '#555b52'];
  const SCHEMA = 2;

  /* ---------- tree index (id -> {node,parent,ply}); cached per chapter object ---------- */
  const idxCache = new WeakMap();
  function buildIndex(ch) {
    if (!ch || !ch.root || !Array.isArray(ch.root.children)) throw new Error('Chapter "' + (ch && ch.name) + '" has no move tree (its data may be damaged).');
    const m = new Map();
    m.set('root', { node: ch.root, parent: null, ply: 0 });
    const st = [ch.root];
    while (st.length) {
      const p = st.pop();
      if (!Array.isArray(p.children)) throw new Error('Chapter "' + ch.name + '": move "' + p.san + '" (id ' + p.id + ') is missing its list of continuations.');
      const pe = m.get(p.id);
      for (const c of p.children) {
        if (typeof c.san !== 'string' || typeof c.fen !== 'string') throw new Error('Chapter "' + ch.name + '": a move after "' + (p.san || 'the start') + '" has no position data.');
        if (m.has(c.id)) throw new Error('Chapter "' + ch.name + '": duplicate move id ' + c.id + '.');
        m.set(c.id, { node: c, parent: p, ply: pe.ply + 1 });
        st.push(c);
      }
    }
    return m;
  }
  function index(ch) { let m = idxCache.get(ch); if (!m) { m = buildIndex(ch); idxCache.set(ch, m); } return m; }
  function reindex(ch) { idxCache.delete(ch); return index(ch); }
  const startFenOf = (ch) => ch.startFen || OL.engine.START_FEN;
  const fenOfNode = (ch, node) => (node.id === 'root' ? startFenOf(ch) : node.fen);
  function sideAtPly(ch, ply) { /* side that plays the move that creates ply `ply` (1-based) */
    const st = OL.engine.turnOf(startFenOf(ch));
    return (st === 'w') === (ply % 2 === 1) ? 'w' : 'b';
  }
  function trainable(ch) {
    const idx = index(ch);
    const user = ch.orientation === 'black' ? 'b' : 'w';
    const first = OL.engine.turnOf(startFenOf(ch));
    const out = [];
    idx.forEach((e, id) => {
      if (id === 'root' || e.node.children.length) return;
      if (e.ply >= 2 || first === user) out.push({ leaf: e.node, ply: e.ply });
    });
    return out;
  }
  function pathTo(ch, nodeId) {
    const idx = index(ch);
    const path = [];
    let e = idx.get(nodeId);
    while (e && e.node.id !== 'root') { path.push(e.node); e = idx.get(e.parent.id); }
    return path.reverse();
  }
  function lineLabel(ch, leafId, max) {
    const path = pathTo(ch, leafId);
    const start = OL.engine.fullmove(startFenOf(ch));
    const white0 = OL.engine.turnOf(startFenOf(ch)) === 'w';
    let s = '';
    path.forEach((n, i) => {
      const ply = i + (white0 ? 0 : 1);
      if (ply % 2 === 0) s += (start + ply / 2) + '. ';
      else if (i === 0) s += (start + (ply - 1) / 2) + '... ';
      s += n.san + ' ';
    });
    s = s.trim();
    return max && s.length > max ? '…' + s.slice(s.length - max) : s;
  }
  function mainSans(ch) { return OL.pgn.mainline(ch.root).map((n) => n.san); }

  function summary(course, now) {
    now = now || Date.now();
    const s = { chapters: course.chapters.length, completed: 0, variations: 0, new: 0, learning: 0, reviewing: 0, mastered: 0, due: 0, attempts: 0, correct: 0, incorrect: 0 };
    for (const ch of course.chapters) {
      if (ch.completed) s.completed++;
      let tr = [];
      try { tr = trainable(ch); } catch (e) { console.error(e); }
      for (const t of tr) {
        s.variations++;
        const c = OL.progress.get(course.id, ch.id, t.leaf.id);
        s[OL.srs.status(c)]++;
        if (OL.srs.isDue(c, now)) s.due++;
        if (c) { s.attempts += c.attempts; s.correct += c.correct; s.incorrect += c.incorrect; }
      }
    }
    return s;
  }

  /* ---------- activity log ---------- */
  const activity = {
    items: [],
    async load() { activity.items = (await OL.store.all('activity')).sort((a, b) => b.ts - a.ts); },
    async log(type, text, courseId) {
      const it = { id: uid('act'), ts: Date.now(), type, text, courseId: courseId || null };
      activity.items.unshift(it);
      await OL.store.put('activity', it);
      if (activity.items.length > 600) {
        const old = activity.items.splice(500);
        for (const o of old) await OL.store.del('activity', o.id);
      }
      bus.emit('activity', it);
    },
  };

  /* ---------- legacy (v1 prototype) migration ---------- */
  function convSeq(parent, seq) {
    let P = parent;
    for (const n of seq) {
      const node = { id: nid(), san: n.san, comment: n.comment || '', nags: n.nag ? [parseInt(String(n.nag).replace('$', ''), 10)].filter(Boolean) : [], children: [] };
      P.children.push(node);
      for (const v of n.variations || []) convSeq(P, v); // old format: a variation is an alternative to the move it follows
      P = node;
    }
  }
  function migrateLegacy(old) {
    const warnings = [];
    const chapters = (old.chapters || []).map((oc, i) => {
      const root = { id: 'root', san: '', comment: '', nags: [], children: [] };
      convSeq(root, oc.tree || []);
      const headers = { Event: oc.name || 'Chapter ' + (i + 1) };
      if (oc.fen && oc.fen !== 'start') headers.FEN = oc.fen;
      let built;
      try {
        built = OL.pgn.buildChapter({ headers, root, warnings: [], index: i }, { lenient: true });
      } catch (e) {
        warnings.push('Chapter "' + headers.Event + '" could not be converted: ' + e.message);
        built = { chapter: { id: uid('ch'), name: headers.Event, description: '', orientation: 'white', startFen: null, headers: {}, root: { id: 'root', san: '', comment: '', nags: [], children: [] }, completed: false, edited: false, originalPgn: '' }, truncated: [] };
      }
      built.truncated.forEach((t) => warnings.push(headers.Event + ': ' + t));
      const ch = built.chapter;
      ch.id = oc.id || ch.id; ch.completed = !!oc.completed; ch.description = oc.comments || '';
      return ch;
    });
    const course = {
      schema: SCHEMA, id: old.id, title: old.title || 'Untitled course', description: '', opening: old.opening && old.opening !== 'Opening study' ? old.opening : '', eco: '',
      category: '', color: COLORS[parseInt(hashString(old.id || old.title || 'x'), 16) % COLORS.length], cover: '', order: old.created || Date.now(), created: old.created || Date.now(), updated: Date.now(), lastStudied: 0,
      source: old.source || '', sourceHash: '', chapters, migratedFromV1: true,
    };
    return { course, warnings };
  }

  /* ---------- course store ---------- */
  const courses = {
    list: [], loadWarnings: [],
    COLORS, SCHEMA, index, reindex, trainable, pathTo, lineLabel, mainSans, summary, activity, startFenOf, fenOfNode, sideAtPly,
    get: (id) => courses.list.find((c) => c.id === id) || null,
    sorted() { return courses.list.slice().sort((a, b) => (a.order || 0) - (b.order || 0)); },

    async load() {
      let all = await OL.store.all('courses');
      // one-time import of the very first prototype's localStorage fallback
      try {
        const raw = localStorage.getItem('opening-lab-courses-v1');
        if (raw) {
          const have = new Set(all.map((c) => c.id));
          const legacy = JSON.parse(raw).filter((c) => c && c.id && !have.has(c.id));
          if (legacy.length) { await OL.store.putMany('courses', legacy); all = all.concat(legacy); }
          localStorage.setItem('opening-lab-courses-v1-migrated', raw);
          localStorage.removeItem('opening-lab-courses-v1');
        }
      } catch (e) { console.warn('Legacy localStorage import skipped:', e); }

      courses.loadWarnings = [];
      const out = [];
      for (const c of all) {
        if (c.schema === SCHEMA) { out.push(c); continue; }
        try {
          const r = migrateLegacy(c);
          r.warnings.forEach((w) => courses.loadWarnings.push(r.course.title + ' - ' + w));
          await OL.store.put('courses', r.course);
          out.push(r.course);
        } catch (e) {
          console.error('Could not migrate course', c && c.title, e);
          courses.loadWarnings.push('Course "' + (c && c.title) + '" could not be migrated and was left untouched: ' + e.message);
        }
      }
      courses.list = out;
      return out;
    },
    async save(course, opts) {
      if (!opts || opts.touch !== false) course.updated = Date.now();
      const i = courses.list.findIndex((c) => c.id === course.id);
      if (i >= 0) courses.list[i] = course; else courses.list.push(course);
      await OL.store.put('courses', course);
      bus.emit('courses', { id: course.id });
    },
    newChapter(o) {
      o = o || {};
      return { id: uid('ch'), name: o.name || 'New chapter', description: o.description || '', orientation: o.orientation || 'white', startFen: o.startFen || null, headers: {}, root: { id: 'root', san: '', comment: '', nags: [], children: [] }, completed: false, edited: true, originalPgn: '' };
    },
    deriveMeta(chapters) {
      const pick = (k) => { for (const c of chapters) if (c.headers && c.headers[k] && c.headers[k] !== '?') return c.headers[k]; return ''; };
      return { opening: pick('Opening'), eco: pick('ECO') };
    },
    make(o) {
      const now = Date.now();
      const id = uid('course');
      return Object.assign({
        schema: SCHEMA, id, title: 'Untitled course', description: '', opening: '', eco: '', category: '',
        color: COLORS[parseInt(hashString(id), 16) % COLORS.length], cover: '', order: now, created: now, updated: now, lastStudied: 0,
        source: '', sourceHash: '', chapters: [],
      }, o);
    },
    async create(o) { const c = courses.make(o); await courses.save(c); await activity.log('course', 'Created course "' + c.title + '"', c.id); return c; },
    async remove(id) {
      const c = courses.get(id);
      await OL.store.del('courses', id);
      await OL.progress.removeForCourse(id);
      courses.list = courses.list.filter((x) => x.id !== id);
      if (c) await activity.log('course', 'Deleted course "' + c.title + '"', null);
      bus.emit('courses', { id, removed: true });
    },
    async duplicate(id) {
      const src = courses.get(id);
      if (!src) return null;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid('course'); copy.title = src.title + ' (copy)'; copy.created = copy.updated = copy.order = Date.now(); copy.lastStudied = 0;
      copy.chapters.forEach((ch) => { ch.id = uid('ch'); ch.completed = false; });
      await courses.save(copy);
      await activity.log('course', 'Duplicated "' + src.title + '"', copy.id);
      return copy;
    },
    async move(id, dir) {
      const l = courses.sorted();
      const i = l.findIndex((c) => c.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= l.length) return;
      [l[i], l[j]] = [l[j], l[i]];
      for (let k = 0; k < l.length; k++) { l[k].order = k + 1; await OL.store.put('courses', l[k]); }
      bus.emit('courses', {});
    },
    categories() { return Array.from(new Set(courses.list.map((c) => c.category).filter(Boolean))).sort(); },
    applySide(course) { if (course.side === 'white' || course.side === 'black') course.chapters.forEach((ch) => { if (!ch.sideLocked) ch.orientation = course.side; }); },
    exportPgn(course) { OL.utils.download(course.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.pgn', OL.pgn.courseToPgn(course), 'application/x-chess-pgn'); },
  };

  /* ---------- Library view ---------- */
  const view = { q: '', sort: 'recent', cat: '' };
  function coverStyle(c) {
    return c.cover ? 'background-image:linear-gradient(#0003,#0006),url(' + esc(c.cover) + ');background-size:cover;background-position:center' : 'background:linear-gradient(135deg,' + esc(c.color) + ',#18251f)';
  }
  function courseCard(c) {
    const s = summary(c);
    const pctDone = s.chapters ? Math.round((s.completed / s.chapters) * 100) : 0;
    const memo = s.variations ? Math.round(((s.reviewing + s.mastered) / s.variations) * 100) : 0;
    return '<article class="course-card" data-action="course-open" data-id="' + esc(c.id) + '">' +
      '<div class="course-art" style="' + coverStyle(c) + '">' +
      (c.opening || c.eco ? '<span class="tag">' + esc([c.eco, c.opening].filter(Boolean).join(' · ')) + '</span>' : '') +
      '<span class="chess-symbol">♞</span>' + (c.category ? '<span class="tag cat">' + esc(c.category) + '</span>' : '') + '</div>' +
      '<div class="course-info"><h3>' + esc(c.title) + '</h3>' +
      '<p class="clamp">' + (c.description ? esc(c.description) : '<span class="faint">No description</span>') + '</p>' +
      '<div class="course-meta"><span>' + (c.side && c.side !== 'both' ? c.side[0].toUpperCase() + c.side.slice(1) + ' · ' : '') + plural(s.chapters, 'chapter') + ' · ' + plural(s.variations, 'variation') + '</span><span>' + (s.due ? '<b class="due-pill">' + s.due + ' due</b>' : '') + '</span></div>' +
      '<div class="progress-row"><span>Chapters studied</span><span>' + s.completed + '/' + s.chapters + ' · ' + pctDone + '%</span></div><div class="progress-track"><div class="progress-fill" style="width:' + pctDone + '%"></div></div>' +
      '<div class="progress-row"><span>Memorised</span><span>' + memo + '%</span></div><div class="progress-track"><div class="progress-fill gold" style="width:' + memo + '%"></div></div>' +
      '<div class="course-foot"><span class="faint">Last studied: ' + relTime(c.lastStudied) + '</span>' +
      '<span class="card-btns"><button class="text-btn" data-action="course-practice" data-id="' + esc(c.id) + '">Practice</button><button class="icon-btn" title="Course options" aria-label="Course options" data-action="course-menu" data-id="' + esc(c.id) + '">⋯</button></span></div></div></article>';
  }
  function renderLibrary() {
    const root = $('#view-courses');
    const cats = courses.categories();
    let list = courses.list.filter((c) => {
      const hay = (c.title + ' ' + c.opening + ' ' + c.eco + ' ' + c.description + ' ' + c.category + ' ' + c.chapters.map((x) => x.name).join(' ')).toLowerCase();
      return (!view.q || hay.includes(view.q.toLowerCase())) && (!view.cat || (view.cat === '__none' ? !c.category : c.category === view.cat));
    });
    if (view.sort === 'az') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (view.sort === 'manual') list.sort((a, b) => (a.order || 0) - (b.order || 0));
    else if (view.sort === 'studied') list.sort((a, b) => (b.lastStudied || 0) - (a.lastStudied || 0));
    else if (view.sort === 'progress') list.sort((a, b) => summary(b).completed / (b.chapters.length || 1) - summary(a).completed / (a.chapters.length || 1));
    else list.sort((a, b) => b.created - a.created);

    root.innerHTML =
      '<div class="page-heading"><div><p class="eyebrow">YOUR PERSONAL LIBRARY</p><h1>My courses</h1><p class="subheading">Every opening study you have imported or created.</p></div>' +
      '<div class="btn-row"><button class="secondary-btn" data-action="course-create">＋ New course</button><button class="primary-btn" data-nav="#/import">＋ Import study</button></div></div>' +
      '<div class="toolbar"><label class="search-box">⌕ <input id="course-search" placeholder="Search courses, openings, chapters…" value="' + esc(view.q) + '"></label>' +
      '<select id="course-sort" aria-label="Sort courses">' + [['recent', 'Recently added'], ['studied', 'Last studied'], ['progress', 'Progress'], ['az', 'A–Z'], ['manual', 'Manual order']].map((o) => '<option value="' + o[0] + '"' + (view.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>' +
      (cats.length ? '<div class="chips"><button class="chip' + (!view.cat ? ' on' : '') + '" data-action="course-cat" data-cat="">All</button>' + cats.map((k) => '<button class="chip' + (view.cat === k ? ' on' : '') + '" data-action="course-cat" data-cat="' + esc(k) + '">' + esc(k) + '</button>').join('') + '<button class="chip' + (view.cat === '__none' ? ' on' : '') + '" data-action="course-cat" data-cat="__none">Uncategorised</button></div>' : '') +
      (list.length ? '<div class="course-grid">' + list.map(courseCard).join('') + '</div>'
        : '<div class="empty-state"><div class="empty-symbol">▦</div><h3>' + (courses.list.length ? 'No courses match your filters' : 'No courses yet') + '</h3><p>' + (courses.list.length ? 'Try a different search or category.' : 'Import a Lichess Study or PGN, or start a blank course.') + '</p><div class="btn-row center"><button class="primary-btn" data-nav="#/import">Import a study</button><button class="secondary-btn" data-action="course-create">New course</button></div></div>');
    const s = $('#course-search');
    if (s && document.activeElement && document.activeElement.id === 'course-search') s.focus();
  }

  function detailsForm(c) {
    return OL.ui.form({
      title: c ? 'Edit course' : 'New course', submitLabel: c ? 'Save changes' : 'Create course',
      fields: [
        { name: 'title', label: 'Course name', value: c ? c.title : '', required: true },
        { name: 'description', label: 'Description', type: 'textarea', value: c ? c.description : '' },
        { name: 'opening', label: 'Opening (optional)', value: c ? c.opening : '', placeholder: 'e.g. Caro-Kann Defense', help: 'Only shown if you enter it - nothing is guessed.' },
        { name: 'eco', label: 'ECO code (optional)', value: c ? c.eco : '', placeholder: 'e.g. B12' },
        { name: 'category', label: 'Category / folder', value: c ? c.category : '', placeholder: 'e.g. White repertoire' },
        { name: 'side', label: 'Repertoire side', type: 'select', options: [{ value: 'both', label: 'Both (set per chapter)' }, { value: 'white', label: 'White' }, { value: 'black', label: 'Black' }], value: c ? c.side || 'both' : 'both' },
        { name: 'color', label: 'Cover colour', type: 'swatch', options: COLORS, value: c ? c.color : COLORS[0] },
        { name: 'cover', label: 'Cover image (optional)', type: 'image', value: c ? c.cover : '' },
      ],
    });
  }

  OL.actions.register({
    'course-open': (el, e) => { if (e.target.closest('[data-action="course-menu"],[data-action="course-practice"]')) return; OL.nav.go('#/study/' + el.dataset.id); },
    'course-practice': (el) => OL.nav.go('#/practice?course=' + el.dataset.id),
    'course-cat': (el) => { view.cat = el.dataset.cat; renderLibrary(); },
    'course-create': async () => {
      const v = await detailsForm(null);
      if (!v) return;
      const c = await courses.create(Object.assign({}, v, { chapters: [courses.newChapter({ name: 'Chapter 1', orientation: v.side === 'black' ? 'black' : 'white' })] }));
      OL.ui.toast('Course created');
      OL.nav.go('#/study/' + c.id + '?edit=1');
    },
    'course-menu': async (el) => {
      const c = courses.get(el.dataset.id);
      if (!c) return;
      const pick = await OL.ui.menu({ title: c.title, items: [
        { id: 'edit', label: 'Edit details…' }, { id: 'dup', label: 'Duplicate' }, { id: 'pgn', label: 'Export as PGN' },
        { id: 'up', label: 'Move earlier (manual order)' }, { id: 'down', label: 'Move later (manual order)' }, { sep: true },
        { id: 'del', label: 'Delete course…', danger: true }] });
      if (pick === 'edit') {
        const v = await detailsForm(c);
        if (v) { Object.assign(c, v); courses.applySide(c); await courses.save(c); OL.ui.toast('Course updated'); }
      } else if (pick === 'dup') { await courses.duplicate(c.id); OL.ui.toast('Course duplicated'); }
      else if (pick === 'pgn') courses.exportPgn(c);
      else if (pick === 'up' || pick === 'down') { view.sort = 'manual'; await courses.move(c.id, pick === 'up' ? -1 : 1); }
      else if (pick === 'del') {
        if (await OL.ui.confirm({ title: 'Delete "' + c.title + '"?', message: 'This removes the course, its chapters and all practice progress for it. Export it first if you want a copy.', confirmLabel: 'Delete course', danger: true })) { await courses.remove(c.id); OL.ui.toast('Course deleted'); }
      }
    },
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'course-search') { view.q = e.target.value; renderLibrary(); } });
  document.addEventListener('change', (e) => { if (e.target.id === 'course-sort') { view.sort = e.target.value; renderLibrary(); } });

  OL.courses = courses;
  OL.library = { render: renderLibrary, courseCard };
})();
