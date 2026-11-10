/* Thin wrapper around chess.js (the rules engine). No chess rules are implemented here. */
(function () {
  const OL = (window.OL = window.OL || {});
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let shared = null;

  function available() { return typeof window.Chess === 'function'; }
  function game(fen) {
    if (!available()) throw new Error('The chess rules library (chess.js) did not load. Check your connection and reload.');
    if (!shared) shared = new window.Chess();
    if (!shared.load(fen || START)) throw new Error('Invalid FEN: ' + fen);
    return shared;
  }
  function normalizeFen(fen) {
    const p = String(fen || '').trim().split(/\s+/);
    if (p.length === 4) p.push('0', '1');
    if (p.length === 5) p.push('1');
    return p.join(' ');
  }
  function validateFen(raw) {
    if (!available()) return { ok: false, error: 'Chess library not loaded.' };
    const fen = normalizeFen(raw);
    const g = new window.Chess();
    if (typeof g.validate_fen === 'function') {
      const v = g.validate_fen(fen);
      if (!v.valid) return { ok: false, error: v.error || 'Invalid FEN' };
    }
    if (!g.load(fen)) return { ok: false, error: 'Invalid FEN' };
    return { ok: true, fen: g.fen() };
  }
  const uciOf = (m) => m.from + m.to + (m.promotion || '');

  function applySan(fen, san) {
    const g = game(fen);
    const m = g.move(san, { sloppy: true });
    if (!m) return { ok: false, error: 'Illegal or unreadable move "' + san + '"' };
    return { ok: true, san: m.san, uci: uciOf(m), fen: g.fen() };
  }
  function applyMove(fen, from, to, promotion) {
    const g = game(fen);
    const m = g.move({ from, to, promotion: promotion || undefined });
    if (!m) return { ok: false, error: 'Illegal move' };
    return { ok: true, san: m.san, uci: uciOf(m), fen: g.fen() };
  }
  function legalMoves(fen, square) {
    const g = game(fen);
    const list = g.moves(square ? { square, verbose: true } : { verbose: true });
    return list.map((m) => ({ from: m.from, to: m.to, promotion: m.promotion || null, san: m.san, capture: /[ce]/.test(m.flags) }));
  }
  function status(fen) {
    const g = game(fen);
    return { turn: g.turn(), check: g.in_check(), checkmate: g.in_checkmate(), stalemate: g.in_stalemate(), draw: g.in_draw() };
  }
  const parts = (fen) => String(fen || START).split(' ');
  const turnOf = (fen) => parts(fen)[1] || 'w';
  const fullmove = (fen) => parseInt(parts(fen)[5], 10) || 1;
  /* Position key for transposition matching: placement + side to move + castling rights.
     The en-passant field is dropped on purpose (engines differ on when they print it). */
  const posKey = (fen) => parts(fen).slice(0, 3).join(' ');

  function pieceGrid(fen) {
    return parts(fen)[0].split('/').map((row) => {
      const out = [];
      for (const ch of row) {
        if (/[1-8]/.test(ch)) for (let i = 0; i < +ch; i++) out.push(null);
        else out.push({ c: ch === ch.toUpperCase() ? 'w' : 'b', t: ch.toLowerCase() });
      }
      return out;
    });
  }
  function kingSquare(fen, color) {
    const g = pieceGrid(fen);
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = g[r][f];
      if (p && p.t === 'k' && p.c === color) return 'abcdefgh'[f] + (8 - r);
    }
    return null;
  }

  OL.engine = { START_FEN: START, available, validateFen, normalizeFen, applySan, applyMove, legalMoves, status, turnOf, fullmove, posKey, pieceGrid, kingSquare };
})();
