/* User settings (localStorage - small preferences only; the library lives in IndexedDB). */
(function () {
  const OL = (window.OL = window.OL || {});
  const KEY = 'opening-lab-settings';
  const DEFAULTS = {
    theme: 'dark',            // dark | light | system
    palette: 'forest',        // forest | ocean | plum | graphite
    boardTheme: 'green',      // green | brown | blue | slate
    pieceStyle: 'classic',    // classic | minimal | detailed
    coords: true,
    animations: true,
    defaultSide: 'both',      // both | white | black
    defaultNew: 5,
    maxSession: 20,
    autoAdvance: true,        // practice: auto-play opponent replies and move on to the next line
    opponentDelay: 450,
    showArrows: true,         // arrows for next moves in study
    pauseOnComments: true,    // practice: wait for Continue when a move has an explanation
    waitBetweenLines: true,   // practice: wait for Next line instead of auto-advancing
    showComments: true,
    showAnnotations: true,
    defaultPracticeMode: 'smart', // smart | due | new | all | difficult | incorrect
  };
  let cur = Object.assign({}, DEFAULTS);

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) cur = Object.assign({}, DEFAULTS, JSON.parse(raw));
      else { const legacy = localStorage.getItem('opening-lab-theme'); if (legacy === 'light' || legacy === 'dark') cur.theme = legacy; }
    } catch (e) { console.warn('Could not read saved settings, using defaults:', e); }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { console.warn('Could not save settings:', e); }
  }
  function isLight() {
    if (cur.theme === 'system') return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return cur.theme === 'light';
  }
  function apply() {
    const b = document.body;
    b.classList.toggle('light', isLight());
    b.classList.toggle('reduce-motion', !cur.animations);
    b.dataset.board = cur.boardTheme;
    b.dataset.palette = cur.palette;
    b.dataset.pieces = cur.pieceStyle;
    b.dataset.coords = cur.coords ? 'on' : 'off';
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = isLight() ? '#f3f5f1' : '#111714';
  }
  OL.settings = {
    DEFAULTS,
    init() { load(); apply(); if (window.matchMedia) window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (cur.theme === 'system') apply(); }); },
    get: (k) => cur[k],
    all: () => Object.assign({}, cur),
    set(patch) { Object.assign(cur, patch); persist(); apply(); OL.utils.bus.emit('settings', cur); },
    reset() { cur = Object.assign({}, DEFAULTS); persist(); apply(); OL.utils.bus.emit('settings', cur); },
    apply,
    cycleBoard() { const l = ['green', 'brown', 'blue', 'slate', 'neutral', 'marble', 'midnight']; OL.settings.set({ boardTheme: l[(l.indexOf(cur.boardTheme) + 1) % l.length] }); },
    toggleTheme() { OL.settings.set({ theme: isLight() ? 'dark' : 'light' }); },
  };
  OL.actions.register({ 'board-theme': () => OL.settings.cycleBoard() });
})();
