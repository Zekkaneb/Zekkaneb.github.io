/* SVG piece sets (hand-drawn silhouettes, 45x45 viewBox). Unknown style names fall back to "classic". */
(function () {
  const OL = (window.OL = window.OL || {});
  const SHAPES = {
    p: '<path d="M22.5 9a4 4 0 0 0-2.2 7.3C17.6 17.6 16 20.3 16 23c0 1.9.8 3.4 2 4.5-3 1.3-5 4.3-5 8.5h19c0-4.2-2-7.2-5-8.5 1.2-1.1 2-2.6 2-4.5 0-2.7-1.6-5.4-4.3-6.7A4 4 0 0 0 22.5 9z"/>',
    r: '<path d="M11 37v-4h23v4zM13 33V19h19v14zM12 19v-7h4v3h3.5v-3h6v3H29v-3h4v7z"/>',
    n: '<path d="M13 37c0-6 1-11 5-15-2-1-4-2-5-4 0-3 3-6 6-8l1-3 3 2c6 1 11 6 11 14 0 5-1 9-1 14z"/><circle cx="20" cy="15" r="1.2" fill="#888" stroke="none"/>',
    b: '<circle cx="22.5" cy="8.5" r="3"/><path d="M22.5 11c-5 4-8 8-8 13 0 3 1.5 5 3.5 6h9c2-1 3.5-3 3.5-6 0-5-3-9-8-13zM12 37c3-2 7-2 10.5-1 3.5-1 7.5-1 10.500 1v-3H12z"/>',
    q: '<path d="M9 14l4 15h19l4-15-6.500 8-3-10-3 10-3-10-3 10zM12 29h21v4H12zM10 33h25v4H10z"/><circle cx="9" cy="12.500" r="2"/><circle cx="36" cy="12.500" r="2"/><circle cx="22.500" cy="9.500" r="2"/>',
    k: '<path d="M21 4h3v3h3v3h-3v3h-3v-3h-3V7h3zM22.500 15c-6 0-10 4-10 8 0 3 1.500 5 4 6h12c2.500-1 4-3 4-6 0-4-4-8-10-8zM11 30h23v4H11zM10 34h25v4H10z"/>',
  };
  const SETS = {
    classic:  { wf: '#f4efe1', ws: '#3a3328', bf: '#2b2b2d', bs: '#0d0d0d', sw: 1.3, detail: false },
    minimal:  { wf: '#fbfaf5', ws: '#5a5a55', bf: '#202124', bs: '#202124', sw: 0.8, detail: false },
    detailed: { wf: '#efe6d0', ws: '#2f281d', bf: '#26262a', bs: '#000', sw: 1.5, detail: true },
  };
  const DETAIL = 'M13 31.500h19M12 35.500h21';
  function svg(p, set) {
    const s = SETS[set] || SETS.classic, w = p.c === 'w';
    return '<svg class="pcs" viewBox="0 0 45 45" aria-hidden="true"><g fill="' + (w ? s.wf : s.bf) + '" stroke="' + (w ? s.ws : s.bs) + '" stroke-width="' + s.sw + '" stroke-linejoin="round">' + SHAPES[p.t] + '</g>' +
      (s.detail ? '<path d="' + DETAIL + '" fill="none" stroke="' + (w ? '#6b5d44' : '#9a9aa0') + '" stroke-width=".8" opacity=".6"/>' : '') + '</svg>';
  }
  OL.pieces = { svg, sets: Object.keys(SETS) };
})();
