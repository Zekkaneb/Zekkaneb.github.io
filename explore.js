/* Opening library: groups the user's own courses by the opening/ECO data actually present in them.
   Nothing is guessed - chapters without opening metadata are listed as "Unclassified". Supports move-sequence search. */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, esc, plural } = OL.utils;
  const st = { q: '', mode: 'text' };

  function chapterMeta(ch, course) {
    const h = ch.headers || {};
    return { eco: (h.ECO && h.ECO !== '?' ? h.ECO : '') || course.eco || '', opening: (h.Opening && h.Opening !== '?' ? h.Opening : '') || course.opening || '', variation: h.Variation || '' };
  }
  function groups() {
    const m = new Map();
    for (const c of OL.courses.list) for (const ch of c.chapters) {
      const meta = chapterMeta(ch, c);
      const key = meta.opening || meta.eco ? (meta.eco + '|' + meta.opening) : '';
      let g = m.get(key);
      if (!g) m.set(key, (g = { eco: meta.eco, opening: meta.opening, courses: new Map(), chapters: 0, variations: 0 }));
      g.chapters++;
      try { g.variations += OL.courses.trainable(ch).length; } catch (e) { console.error(e); }
      if (!g.courses.has(c.id)) g.courses.set(c.id, c);
    }
    return Array.from(m.values()).sort((a, b) => (!a.opening && !a.eco ? 1 : !b.opening && !b.eco ? -1 : (a.eco || 'ZZZ').localeCompare(b.eco || 'ZZZ') || a.opening.localeCompare(b.opening)));
  }

  /* move-sequence search: follow SANs from the root of each chapter's tree */
  function parseSeq(text) {
    return text.replace(/\{[^}]*\}/g, ' ').replace(/\d+\s*\.(\.\.)?/g, ' ').split(/\s+/).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  }
  function seqSearch(text) {
    const toks = parseSeq(text);
    if (!toks.length || !OL.engine.available()) return null;
    const hits = [];
    for (const c of OL.courses.list) for (const ch of c.chapters) {
      let fen = OL.courses.startFenOf(ch), node = ch.root, ok = true, valid = true;
      for (const t of toks) {
        const r = OL.engine.applySan(fen, t);
        if (!r.ok) { valid = false; break; }
        const next = node.children.find((x) => x.san === r.san);
        if (!next) { ok = false; break; }
        node = next; fen = r.fen;
      }
      if (!valid) return { invalid: true, toks };
      if (ok) hits.push({ c, ch, node });
    }
    return { toks, hits };
  }

  function render() {
    const root = $('#view-explore');
    const q = st.q.trim();
    const ql = q.toLowerCase();
    let body = '';
    if (!OL.courses.list.length) body = '<div class="empty-state"><div class="empty-symbol">⌕</div><h3>Your opening library is empty</h3><p>Import a study and its openings will be listed here, using the ECO/Opening tags in the PGN.</p><button class="primary-btn" data-nav="#/import">Import a study</button></div>';
    else if (st.mode === 'moves' && q) {
      const r = seqSearch(q);
      if (!r) body = '<p class="muted">Enter moves like <span class="mono">1. e4 c5 2. Nf3</span>.</p>';
      else if (r.invalid) body = '<div class="message error">That move sequence is not legal from the standard starting position (or a move could not be read).</div>';
      else body = '<p class="muted">' + plural(r.hits.length, 'chapter') + ' contain <span class="mono">' + esc(r.toks.join(' ')) + '</span> as an opening sequence.</p><div class="result-list">' + r.hits.map((h) => '<button class="result" data-nav="#/study/' + esc(h.c.id) + '?ch=' + esc(h.ch.id) + '&node=' + esc(h.node.id) + '"><b>' + esc(h.c.title) + '</b> · ' + esc(h.ch.name) + '<small>' + plural(OL.pgn.countNodes(h.node), 'move') + ' follow this position</small></button>').join('') + '</div>';
    } else {
      let gs = groups();
      if (q) gs = gs.filter((g) => (g.opening + ' ' + g.eco + ' ' + Array.from(g.courses.values()).map((c) => c.title).join(' ')).toLowerCase().includes(ql));
      body = gs.length ? '<div class="catalog-grid">' + gs.map((g) => {
        const named = g.opening || g.eco;
        return '<article class="catalog-item"><div class="opening-glyph">' + (g.eco ? '<span class="pill">' + esc(g.eco) + '</span>' : '♞') + '</div><h3>' + esc(named ? g.opening || 'ECO ' + g.eco : 'Unclassified') + '</h3>' +
          (named ? '' : '<p class="muted small">These chapters have no ECO/Opening tag. Add an opening name when editing the course.</p>') +
          '<p>' + plural(g.chapters, 'chapter') + ' · ' + plural(g.variations, 'variation') + '</p>' +
          '<div class="chips">' + Array.from(g.courses.values()).map((c) => '<button class="chip" data-action="course-open" data-id="' + esc(c.id) + '">' + esc(c.title) + '</button>').join('') + '</div></article>';
      }).join('') + '</div>' : '<p class="muted">No openings match "' + esc(q) + '".</p>';
    }
    root.innerHTML = '<div class="page-heading"><div><p class="eyebrow">YOUR OPENINGS</p><h1>Opening library</h1><p class="subheading">Browse the openings in your courses. Names and ECO codes come from your PGN data only.</p></div></div>' +
      '<div class="toolbar"><label class="search-box">⌕ <input id="explore-search" placeholder="' + (st.mode === 'moves' ? 'Move sequence, e.g. 1. e4 c5 2. Nf3' : 'Opening name, ECO code or course title') + '" value="' + esc(st.q) + '"></label><select id="explore-mode" aria-label="Search by"><option value="text"' + (st.mode === 'text' ? ' selected' : '') + '>Name / ECO / course</option><option value="moves"' + (st.mode === 'moves' ? ' selected' : '') + '>Move sequence</option></select></div>' + body;
    const s = $('#explore-search'); if (s && document.activeElement && document.activeElement.id === 'explore-search') { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }
  document.addEventListener('input', (e) => { if (e.target.id === 'explore-search') { st.q = e.target.value; render(); } });
  document.addEventListener('change', (e) => { if (e.target.id === 'explore-mode') { st.mode = e.target.value; render(); } });
  OL.explore = { render, groups, seqSearch, parseSeq };
})();
