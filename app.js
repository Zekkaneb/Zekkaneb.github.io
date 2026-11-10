/* Application bootstrap. (Replaces the v1 monolith whose renderStudy() called the `glyph` lookup table as a function.) */
(function () {
  const OL = (window.OL = window.OL || {});
  const { $, esc, bus, debounce } = OL.utils;

  async function start(opts) {
    opts = opts || {};
    OL.settings.init();
    const loading = $('#boot');
    try {
      await OL.store.init();
      await OL.courses.load();
      await OL.progress.load();
      await OL.courses.activity.load();
      await OL.stats.load();
    } catch (e) {
      console.error('Startup failed:', e);
      if (loading) loading.innerHTML = '<div class="error-state"><h2>Could not open your library</h2><p>' + esc(e.message) + '</p><p class="muted small">Your data has not been changed. Try reloading; if you are in a private window, browser storage may be disabled.</p><button class="primary-btn" onclick="location.reload()">Reload</button></div>';
      return;
    }
    if (loading) loading.remove();
    $('#app').classList.remove('hidden');

    const banner = $('#banner');
    const notes = [];
    if (!OL.store.persistent) notes.push('<b>Storage unavailable:</b> your browser blocked IndexedDB, so nothing will be saved after you close this tab. Export a backup from Settings if you add content.');
    if (!OL.engine.available()) notes.push('<b>Chess library missing:</b> chess.js could not be loaded' + (opts.chessError ? ' (' + esc(opts.chessError) + ')' : '') + '. Importing, studying and practising are disabled until it loads - check your connection or content blocker and reload.');
    if (notes.length) { banner.innerHTML = notes.join('<br>'); banner.classList.remove('hidden'); }

    if (OL.courses.loadWarnings.length) {
      OL.ui.alert('Some data needed attention', '<p>Your earlier courses were upgraded to the new format. These notes were recorded:</p><ul class="plain">' + OL.courses.loadWarnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul><p class="muted small">Nothing was deleted. Original imported PGN text is kept per chapter and can be restored from the chapter menu.</p>');
    }
    const migrated = OL.courses.list.filter((c) => c.migratedFromV1 && !c.migrationAck);
    if (migrated.length) { migrated.forEach((c) => (c.migrationAck = true)); OL.store.putMany('courses', migrated).catch(console.warn); OL.ui.toast('Upgraded ' + migrated.length + ' course(s) from the previous version'); }

    const refresh = debounce(() => OL.router.refreshCurrent(), 60);
    ['courses', 'progress', 'activity'].forEach((k) => bus.on(k, refresh));
    bus.on('settings', () => { if (OL.nav.current() === 'study' || OL.nav.current() === 'settings') return; refresh(); });

    OL.router.route();
  }
  OL.app = { start };
})();
