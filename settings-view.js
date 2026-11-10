/* Settings page */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, esc, plural } = OL.utils;
  const sel = (name, opts, val) => '<select data-setting="' + name + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
  const chk = (name, val, label) => '<label class="check"><input type="checkbox" data-setting="' + name + '"' + (val ? ' checked' : '') + '> <span>' + label + '</span></label>';
  const row = (l, h, c) => '<div class="set-row"><div><b>' + l + '</b>' + (h ? '<p class="muted small">' + h + '</p>' : '') + '</div><div>' + c + '</div></div>';

  async function render() {
    const s = OL.settings.all();
    const root = $('#view-settings');
    const est = await OL.store.estimate();
    const bytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    const chapters = OL.courses.list.reduce((n, c) => n + c.chapters.length, 0);
    root.innerHTML = '<div class="page-heading"><div><p class="eyebrow">PREFERENCES</p><h1>Settings</h1></div></div>' +
      '<div class="panel"><h3>Appearance</h3>' +
      row('Theme', 'Remembered on this device.', sel('theme', [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match system']], s.theme)) +
      row('Board theme', '', sel('boardTheme', [['green', 'Green'], ['brown', 'Wood'], ['blue', 'Blue'], ['slate', 'Slate']], s.boardTheme)) +
      row('Piece style', 'Text-glyph pieces: filled or outline.', sel('pieceStyle', [['filled', 'Filled'], ['outline', 'Outline']], s.pieceStyle)) +
      row('Board coordinates', '', chk('coords', s.coords, 'Show a–h and 1–8')) +
      row('Animations', 'Turn off for instant transitions.', chk('animations', s.animations, 'Enable animations')) +
      '<div class="board-preview"><div id="set-board"></div></div></div>' +
      '<div class="panel"><h3>Study &amp; practice</h3>' +
      row('Default training side', '', sel('defaultSide', [['both', 'Both sides'], ['white', 'White'], ['black', 'Black']], s.defaultSide)) +
      row('Default practice mode', '', sel('defaultPracticeMode', [['smart', 'Smart (due + new)'], ['due', 'Due'], ['new', 'New'], ['all', 'All'], ['difficult', 'Difficult'], ['incorrect', 'Previously incorrect']], s.defaultPracticeMode)) +
      row('New variations per session', '', '<input type="number" data-setting="defaultNew" min="0" max="200" value="' + s.defaultNew + '">') +
      row('Maximum variations per session', '', '<input type="number" data-setting="maxSession" min="1" max="500" value="' + s.maxSession + '">') +
      row('Automatic advancement', 'Auto-play the opponent\'s replies and continue to the next line after a perfect one.', chk('autoAdvance', s.autoAdvance, 'Enabled')) +
      row('Show comments', '', chk('showComments', s.showComments, 'In move list and during practice')) +
      row('Show annotations', '!, ?, !!, ?? etc. next to moves.', chk('showAnnotations', s.showAnnotations, 'Enabled')) + '</div>' +
      '<div class="panel"><h3>Data</h3><p class="muted small">Everything is stored in <b>this browser only</b> (IndexedDB). It does not sync between devices - use a backup file to move it. ' + (OL.store.persistent ? '' : '<b class="warn">Persistent storage is unavailable right now; changes will be lost when you close the tab.</b>') + '</p>' +
      row('Library', plural(OL.courses.list.length, 'course') + ' · ' + plural(chapters, 'chapter') + ' · ' + OL.progress.cards.size + ' review cards · ' + OL.stats.sessions().length + ' sessions' + (est && est.usage != null ? ' · ' + bytes(est.usage) + ' used' + (est.quota ? ' of ' + bytes(est.quota) + ' available' : '') : ''), '') +
      '<div class="btn-row wrap"><button class="secondary-btn" data-action="set-export">Export library backup</button><button class="secondary-btn" data-action="set-import">Import backup…</button><input type="file" id="backup-file" accept=".json,application/json" hidden><button class="danger-btn" data-action="set-clear">Clear all local data…</button><button class="secondary-btn" data-action="set-reset">Reset settings</button></div></div>';
    const b = $('#set-board');
    if (b && OL.engine.available()) new OL.Board(b, { interactive: false }).set({ fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', last: ['f3', 'f3'] });
  }
  document.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.setting; if (!k) return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Math.max(+e.target.min || 0, Math.min(+e.target.max || 1e6, +e.target.value || 0)) : e.target.value;
    OL.settings.set({ [k]: v }); if (['theme', 'boardTheme', 'pieceStyle', 'coords'].includes(k)) render();
    OL.ui.toast('Setting saved');
  });
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'backup-file' || !e.target.files[0]) return;
    const f = e.target.files[0]; e.target.value = '';
    try { const r = await OL.backup.importFile(f); if (r) { OL.ui.toast('Restored: ' + plural(r.courses, 'course') + ', ' + plural(r.cards, 'review card')); render(); } } catch (err) { console.error(err); OL.ui.toast(err.message, 'error'); }
  });
  OL.actions.register({
    'set-export': async () => { try { const b = await OL.backup.exportAll(); OL.ui.toast('Backup saved (' + plural(b.courses.length, 'course') + ')'); } catch (e) { OL.ui.toast('Export failed: ' + e.message, 'error'); } },
    'set-import': () => $('#backup-file').click(),
    'set-reset': async () => { if (await OL.ui.confirm({ title: 'Reset settings?', message: 'Appearance and study preferences return to defaults. Your courses and progress are not affected.', confirmLabel: 'Reset' })) { OL.settings.reset(); render(); } },
    'set-clear': async () => {
      if (!(await OL.ui.confirm({ title: 'Clear ALL local data?', message: 'This permanently deletes every course, chapter, practice record and review schedule stored in this browser. <b>Export a backup first</b> if you may want them back.', confirmLabel: 'Continue', danger: true }))) return;
      const v = await OL.ui.form({ title: 'Final confirmation', intro: 'Type <b>DELETE</b> to erase everything.', fields: [{ name: 'word', label: 'Confirmation', placeholder: 'DELETE' }], submitLabel: 'Erase everything', danger: true, validate: (o) => (o.word === 'DELETE' ? '' : 'Type DELETE exactly to continue.') });
      if (!v) return;
      try { await OL.store.clearAll(); OL.progress.cards.clear(); await OL.courses.load(); await OL.courses.activity.load(); await OL.stats.load(); OL.ui.toast('All local data erased'); OL.nav.go('#/dashboard'); } catch (e) { OL.ui.toast('Could not clear data: ' + e.message, 'error'); }
    },
  });
  OL.settingsView = { render };
})();
