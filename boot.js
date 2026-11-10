/* Loads chess.js (local copy first, then two CDNs), then the app modules in dependency order, then starts the app.
   A missing chess.js does NOT stop the app from opening - it is reported in a banner instead. */
(function () {
  const CHESS_SOURCES = ['vendor/chess.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js', 'https://cdn.jsdelivr.net/npm/chess.js@0.10.3/chess.min.js'];
  const MODULES = ['utils', 'storage', 'settings', 'chess-engine', 'pgn-parser', 'spaced-repetition', 'courses', 'lichess-import', 'importer', 'pieces', 'board', 'study', 'practice', 'statistics', 'dashboard', 'explore', 'backup', 'settings-view', 'navigation', 'app'];

  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = false;
    s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
  async function loadChess() {
    const errs = [];
    for (const src of CHESS_SOURCES) {
      try { await load(src); if (typeof window.Chess === 'function') return null; errs.push(src + ' did not define Chess'); } catch (e) { errs.push(e.message); }
    }
    return errs.join('; ');
  }
  (async function () {
    const chessError = await loadChess();
    if (chessError) console.error('chess.js unavailable:', chessError);
    try {
      for (const m of MODULES) await load('js/' + m + '.js');
    } catch (e) {
      console.error(e);
      document.getElementById('boot').innerHTML = '<div class="error-state"><h2>Application files failed to load</h2><p>' + e.message + '</p><p>Serve the folder over http (for example <code>python -m http.server</code>) rather than opening index.html directly.</p></div>';
      return;
    }
    window.OL.app.start({ chessError });
  })();
})();
