/* Import view: upload / paste / Lichess URL -> parse -> preview (per-chapter status) -> confirm -> save. */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, esc, hashString, plural } = OL.utils;
  const st = { tab: 'upload', text: '', source: '', items: null, title: '', mode: 'single', category: '', msg: null, busy: false, parseWarnings: [], lichessUrl: '', lichessWhole: true };

  function titleFrom(games, source) {
    const h = (games[0] && games[0].headers) || {};
    if (h.StudyName) return h.StudyName;
    if (h.Event && h.Event.includes(': ')) return h.Event.split(': ')[0];
    if (h.Event && h.Event !== '?' && games.length === 1) return h.Event;
    return (source || 'Imported study').replace(/\.(pgn|txt)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported study';
  }

  function analyze(text, source, retryLenient) {
    const parsed = OL.pgn.parse(text);
    if (!parsed.games.length) throw new Error('No chess games were found. Make sure this is a PGN export (it should contain moves like "1. e4 e5").');
    const prev = retryLenient ? st.items : null;
    st.parseWarnings = parsed.warnings;
    st.items = parsed.games.map((g, i) => {
      if (prev && prev[i] && !prev[i].error) return prev[i];
      const item = { id: i, include: true, chapter: null, error: '', truncated: [], warnings: g.warnings };
      try {
        const r = OL.pgn.buildChapter(g, { lenient: !!retryLenient });
        item.chapter = r.chapter; item.truncated = r.truncated;
      } catch (e) { item.error = e.message; item.include = false; }
      return item;
    });
    if (!retryLenient) { st.title = titleFrom(parsed.games, source); }
    st.text = text; st.source = source;
  }

  function summaryOf(ch) { let v = 0; try { v = OL.courses.trainable(ch).length; } catch (e) { console.error(e); } return { moves: OL.pgn.countNodes(ch.root), vars: v }; }

  function render() {
    const root = $('#view-import');
    const tabs = [['upload', 'Upload PGN'], ['paste', 'Paste PGN'], ['lichess', 'Lichess URL']];
    let body = '';
    if (st.tab === 'upload') {
      body = '<label class="dropzone" id="dropzone" for="pgn-file"><span class="upload-icon">↑</span><strong>Drop a PGN file here</strong><span>or <u>browse files</u></span><small>.pgn or .txt · multiple chapters, variations, comments, NAGs and FEN positions are supported</small><input id="pgn-file" type="file" accept=".pgn,.txt,text/plain" hidden></label>';
    } else if (st.tab === 'paste') {
      body = '<div class="field"><label for="pgn-text">PGN text</label><textarea id="pgn-text" rows="10" placeholder="[Event &quot;My study: Chapter 1&quot;]&#10;&#10;1. e4 e5 2. Nf3 ...">' + esc(st.pasted || '') + '</textarea></div><button class="primary-btn" data-action="import-parse-paste">Parse PGN</button>';
    } else {
      body = '<div class="field"><label for="li-url">Lichess study URL or ID</label><input id="li-url" placeholder="https://lichess.org/study/abcd1234" value="' + esc(st.lichessUrl) + '"></div>' +
        '<div class="field"><label for="li-token">API token (only for private studies)</label><input id="li-token" type="password" autocomplete="off" placeholder="lip_… (scope: study:read)"><small>Used for this one request only; never saved. Create one at lichess.org/account/oauth/token.</small></div>' +
        '<label class="check"><input type="checkbox" id="li-whole"' + (st.lichessWhole ? ' checked' : '') + '> <span>If the link points to one chapter, import the whole study</span></label>' +
        '<div class="btn-row"><button class="primary-btn" data-action="import-lichess"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Fetching…' : 'Fetch study') + '</button></div>' +
        '<p class="helper-text">Works for public studies when your browser lets the request through. If Lichess or the network blocks it, you will get a clear message - then use <strong>Share → Study PGN</strong> on Lichess and upload the file.</p>';
    }
    root.innerHTML =
      '<div class="page-heading"><div><p class="eyebrow">GROW YOUR REPERTOIRE</p><h1>Import a study</h1><p class="subheading">Bring Lichess studies and PGN files into your library, with variations intact.</p></div></div>' +
      '<div class="import-layout"><div class="panel"><div class="tabs">' + tabs.map((t) => '<button class="tab' + (st.tab === t[0] ? ' on' : '') + '" data-action="import-tab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' + body + '</div>' +
      '<aside class="panel tips-panel"><p class="eyebrow">WHAT IS PRESERVED</p><div class="tip"><span>✓</span><div><strong>The full move tree</strong><p>Nested variations stay variations - nothing is flattened into the main line.</p></div></div><div class="tip"><span>✓</span><div><strong>Comments &amp; symbols</strong><p>Comments, !, ?, !!, ??, !?, ?! and other NAGs.</p></div></div><div class="tip"><span>✓</span><div><strong>Chapters &amp; start positions</strong><p>One chapter per game, custom FEN, board orientation when present.</p></div></div><div class="format-note"><strong>Every move is checked.</strong><p>Moves are replayed on a chess engine during import. Bad lines are reported, never silently dropped.</p></div></aside></div>' +
      (st.msg ? '<div class="message ' + st.msg.type + '">' + esc(st.msg.text) + '</div>' : '') +
      (st.items ? preview() : '');
    wireDrop();
  }

  function preview() {
    const ok = st.items.filter((i) => i.chapter);
    const bad = st.items.filter((i) => i.error);
    const rows = st.items.map((it, i) => {
      if (it.error) return '<div class="preview-chapter err"><div><b>' + String(i + 1).padStart(2, '0') + '</b> &nbsp; Chapter could not be imported<div class="small">' + esc(it.error) + '</div></div><span class="pill red">Error</span></div>';
      const s = summaryOf(it.chapter);
      const notes = it.truncated.map((t) => '<div class="small warn">⚠ ' + esc(t) + '</div>').join('') + it.warnings.map((w) => '<div class="small warn">⚠ ' + esc(w) + '</div>').join('');
      return '<div class="preview-chapter"><label class="check"><input type="checkbox" data-action="import-toggle" data-i="' + i + '"' + (it.include ? ' checked' : '') + '> <span><b>' + String(i + 1).padStart(2, '0') + '</b> &nbsp; ' + esc(it.chapter.name) + '</span></label>' +
        '<span class="muted">' + plural(s.moves, 'move') + ' · ' + plural(s.vars, 'variation') + ' · ' + it.chapter.orientation + (it.chapter.startFen ? ' · custom FEN' : '') + '</span>' + (notes ? '<div class="notes">' + notes + '</div>' : '') + '</div>';
    }).join('');
    return '<div class="panel preview-panel"><div class="preview-top"><div><p class="eyebrow">IMPORT PREVIEW</p><h2>' + plural(ok.length, 'chapter') + ' ready' + (bad.length ? ', ' + bad.length + ' with errors' : '') + '</h2><p class="muted">' + esc(st.source) + '</p></div></div>' +
      '<div class="form-grid"><div class="field"><label for="imp-title">Course name</label><input id="imp-title" value="' + esc(st.title) + '"></div><div class="field"><label for="imp-cat">Category (optional)</label><input id="imp-cat" value="' + esc(st.category) + '" placeholder="e.g. Black repertoire"></div></div>' +
      (st.items.length > 1 ? '<div class="field"><label>This file has ' + st.items.length + ' games</label><div class="radio-row"><label class="check"><input type="radio" name="imp-mode" value="single"' + (st.mode === 'single' ? ' checked' : '') + '> <span>Chapters of one course</span></label><label class="check"><input type="radio" name="imp-mode" value="separate"' + (st.mode === 'separate' ? ' checked' : '') + '> <span>Separate courses (one per game)</span></label></div></div>' : '') +
      '<div class="preview-chapters">' + rows + '</div>' +
      (bad.length ? '<div class="btn-row"><button class="secondary-btn" data-action="import-lenient">Retry failed chapters, skipping invalid lines</button></div><p class="helper-text">Skipping removes only the illegal line (and everything after it in that branch) and tells you exactly what was removed.</p>' : '') +
      '<div class="btn-row end"><button class="secondary-btn" data-action="import-cancel">Cancel</button><button class="primary-btn" data-action="import-save"' + (ok.length ? '' : ' disabled') + '>Add to library →</button></div></div>';
  }

  function wireDrop() {
    const dz = $('#dropzone');
    if (!dz) return;
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('dragover'); const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
  }
  async function handleFile(file) {
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('That file is over 30 MB, which is too large to import in the browser.');
      load(await OL.utils.readFileText(file), file.name);
    } catch (e) { fail(e); }
  }
  function load(text, source) {
    try { st.msg = null; analyze(text, source); st.msg = { type: 'ok', text: 'Parsed successfully. Review the chapters below.' }; }
    catch (e) { fail(e); return; }
    render();
  }
  function fail(e) { st.items = null; st.msg = { type: 'error', text: e.message }; console.error(e); render(); }

  async function commit() {
    const title = ($('#imp-title').value || '').trim() || 'Imported study';
    st.title = title; st.category = ($('#imp-cat') || {}).value || '';
    const chosen = st.items.filter((i) => i.include && i.chapter);
    if (!chosen.length) { OL.ui.toast('Select at least one chapter to import.', 'error'); return; }
    const hash = hashString(st.text);
    const dup = OL.courses.list.find((c) => c.sourceHash === hash);
    if (dup && !(await OL.ui.confirm({ title: 'Already imported?', message: 'This exact file was already imported as "' + esc(dup.title) + '". Import it again as a separate course?', confirmLabel: 'Import again' }))) return;
    const made = [];
    if (st.mode === 'separate' && chosen.length > 1) {
      for (const it of chosen) {
        const meta = OL.courses.deriveMeta([it.chapter]);
        made.push(await OL.courses.create(Object.assign({ title: it.chapter.name, category: st.category, source: st.source, sourceHash: hash + ':' + it.id, chapters: [it.chapter] }, meta)));
      }
    } else {
      const chapters = chosen.map((i) => i.chapter);
      made.push(await OL.courses.create(Object.assign({ title, category: st.category, source: st.source, sourceHash: hash, chapters }, OL.courses.deriveMeta(chapters))));
    }
    await OL.courses.activity.log('import', 'Imported ' + plural(chosen.length, 'chapter') + ' from ' + st.source, made[0].id);
    st.items = null; st.msg = null; st.text = '';
    OL.ui.toast('Imported ' + plural(made.length, 'course'));
    OL.nav.go(made.length === 1 ? '#/study/' + made[0].id : '#/courses');
  }

  document.addEventListener('change', (e) => {
    if (e.target.id === 'pgn-file') { const f = e.target.files[0]; e.target.value = ''; if (f) handleFile(f); }
    if (e.target.name === 'imp-mode') st.mode = e.target.value;
    if (e.target.id === 'li-whole') st.lichessWhole = e.target.checked;
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'li-url') st.lichessUrl = e.target.value; if (e.target.id === 'pgn-text') st.pasted = e.target.value; });

  OL.actions.register({
    'import-tab': (el) => { st.tab = el.dataset.tab; st.msg = null; render(); },
    'import-parse-paste': () => { const t = ($('#pgn-text').value || '').trim(); if (!t) { st.msg = { type: 'error', text: 'Paste some PGN first.' }; render(); return; } load(t, 'Pasted PGN'); },
    'import-toggle': (el) => { st.items[+el.dataset.i].include = el.checked; },
    'import-lenient': () => {
      try { analyze(st.text, st.source, true); st.msg = { type: 'ok', text: 'Retried with invalid lines skipped. Review the warnings below.' }; } catch (e) { st.msg = { type: 'error', text: e.message }; }
      render();
    },
    'import-cancel': () => { st.items = null; st.msg = null; render(); },
    'import-save': () => commit().catch(fail),
    'import-lichess': async () => {
      const ref = OL.lichess.parseRef($('#li-url').value);
      if (!ref) { st.msg = { type: 'error', text: 'That does not look like a Lichess study link. Expected something like https://lichess.org/study/abcd1234 (8-character study ID).' }; render(); return; }
      st.busy = true; st.msg = { type: 'ok', text: 'Contacting lichess.org…' }; render();
      try {
        const token = ($('#li-token') && $('#li-token').value.trim()) || '';
        const text = await OL.lichess.fetchStudy(ref, token, st.lichessWhole);
        st.busy = false;
        load(text, 'lichess.org/study/' + ref.studyId);
      } catch (e) { st.busy = false; fail(e); }
    },
  });

  OL.importer = { render, st };
})();
