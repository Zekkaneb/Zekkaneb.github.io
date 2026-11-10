/* TEST DOUBLE ONLY - not shipped to users, not a chess engine.
   Mimics the small slice of the chess.js 0.10 API the app uses, for a fixed table of opening moves, so browser
   smoke tests can exercise UI wiring. It does NOT validate chess legality. Real behaviour comes from chess.js. */
(function () {
  const T = { e4: ['e2', 'e4'], e5: ['e7', 'e5'], Nf3: ['g1', 'f3'], Nc6: ['b8', 'c6'], Bc4: ['f1', 'c4'], Bc5: ['f8', 'c5'], c3: ['c2', 'c3'], Nf6: ['g8', 'f6'], d4: ['d2', 'd4'], d3: ['d2', 'd3'], d6: ['d7', 'd6'] };
  const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
  function Chess(fen) { this.f = fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; }
  Chess.prototype.load = function (f) { if (typeof f !== 'string' || f.split(' ').length < 2 || /^bad/.test(f)) return false; this.f = f; return true; };
  Chess.prototype.validate_fen = function (f) { return /^bad/.test(f) || f.split(' ').length < 4 ? { valid: false, error: 'fake: invalid FEN' } : { valid: true }; };
  Chess.prototype.fen = function () { return this.f; };
  Chess.prototype.turn = function () { return this.f.split(' ')[1]; };
  Chess.prototype.in_check = Chess.prototype.in_checkmate = Chess.prototype.in_stalemate = Chess.prototype.in_draw = function () { return false; };
  Chess.prototype.moves = function (o) {
    const out = Object.keys(T).map((san) => ({ san, from: T[san][0], to: T[san][1], flags: 'n' })).filter((m) => !o || !o.square || m.from === o.square);
    return o && o.verbose ? out : out.map((m) => m.san);
  };
  Chess.prototype.move = function (m) {
    let san;
    if (typeof m === 'string') san = m.replace(/[+#!?]/g, ''); else san = Object.keys(T).find((k) => T[k][0] === m.from && T[k][1] === m.to);
    if (!san || !T[san]) return null;
    const p = this.f.split(' ');
    const wasBlack = p[1] === 'b';
    p[3] = '-'; p[2] = 'K' + hash(p[2] + san); p[1] = wasBlack ? 'w' : 'b'; p[5] = String((+p[5] || 1) + (wasBlack ? 1 : 0));
    this.f = p.join(' ');
    return { san, from: T[san][0], to: T[san][1], flags: 'n' };
  };
  window.Chess = Chess;
})();
