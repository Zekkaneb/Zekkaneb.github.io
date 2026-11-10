/* Interactive chessboard renderer: click-to-move, drag-and-drop, legal-move dots, last-move/check highlights,
   promotion chooser, flipping, coordinates. It only DRAWS and collects gestures - legality always comes from
   the rules engine through the getMoves() callback. */
(function () {
  const OL = (window.OL = window.OL || {});
  const FILES = 'abcdefgh';
  const FILLED = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const OUTLINE = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
  const TEXT = '︎'; // keep pawns as text glyphs, not emoji
  const glyph = (p, style) => OL.pieces.svg(p, style);

  class Board {
    /* opts: interactive, orientation, getMoves(from)->[{to,promotion,capture}], onMove(from,to,promotion) */
    constructor(root, opts) {
      this.root = root;
      this.o = Object.assign({ interactive: true, orientation: 'white', getMoves: () => [], onMove: () => {} }, opts || {});
      this.s = { fen: OL.engine.START_FEN, last: null, check: null, marks: {} };
      this.sel = null; this.targets = []; this.drag = null;
      root.classList.add('board');
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', 'Chessboard');
      this._down = (e) => this.pointerDown(e);
      root.addEventListener('pointerdown', this._down);
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-promo]');
        if (b && this.promoCtx) { const c = this.promoCtx; this.promoCtx = null; this.finish(c.from, c.to, b.dataset.promo); return; }
        if (e.target.closest('.promo-wrap') && !e.target.closest('.promo')) { this.promoCtx = null; this.clear(); }
      });
      this.render();
    }
    set(patch) {
      Object.assign(this.s, patch);
      if (patch.fen !== undefined || patch.orientation !== undefined) { this.sel = null; this.targets = []; }
      if (patch.orientation) this.o.orientation = patch.orientation;
      this.promoCtx = null;
      this.render();
    }
    setInteractive(v) { this.o.interactive = v; if (!v) this.clear(); }
    get orientation() { return this.o.orientation; }

    render() {
      let old = null;
      if (this.root.children.length && this._orient === this.o.orientation) {
        old = new Map();
        this.root.querySelectorAll('.sq').forEach((el) => { const pc = el.querySelector('.pc'); if (pc) { const r = el.getBoundingClientRect(); old.set(el.dataset.sq, { key: pc.className, x: r.left, y: r.top }); } });
      }
      this._orient = this.o.orientation;
      this.draw();
      this.slide(old);
    }
    slide(old) {
      if (!old || document.body.classList.contains('reduce-motion') || Date.now() - (this._dragEnd || 0) < 400) return;
      const now = new Map(), gone = [];
      this.root.querySelectorAll('.sq').forEach((el) => { const pc = el.querySelector('.pc'); if (pc) now.set(el.dataset.sq, { key: pc.className, pc, el }); });
      old.forEach((o, sq) => { const n = now.get(sq); if (!n || n.key !== o.key) gone.push(o); });
      now.forEach((n, sq) => {
        const o = old.get(sq); if (o && o.key === n.key) return;
        const r = n.el.getBoundingClientRect();
        let bi = -1, bd = Infinity;
        gone.forEach((g, i) => { if (g.key === n.key) { const d = Math.hypot(g.x - r.left, g.y - r.top); if (d < bd) { bd = d; bi = i; } } });
        if (bi < 0 || !bd) return;
        const g = gone.splice(bi, 1)[0];
        n.pc.style.transition = 'none'; n.pc.style.transform = 'translate(' + (g.x - r.left) + 'px,' + (g.y - r.top) + 'px)'; n.pc.style.zIndex = 5;
        void n.pc.offsetWidth;
        n.pc.style.transition = 'transform .17s ease-out'; n.pc.style.transform = '';
        setTimeout(() => { n.pc.style.zIndex = ''; n.pc.style.transition = ''; }, 220);
      });
    }
    draw() {
      const grid = OL.engine.pieceGrid(this.s.fen);
      const white = this.o.orientation === 'white';
      const style = document.body.dataset.pieces || 'filled';
      let html = '';
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const rr = white ? r : 7 - r, ff = white ? f : 7 - f;
        const sq = FILES[ff] + (8 - rr);
        const p = grid[rr][ff];
        const cls = ['sq', (rr + ff) % 2 === 0 ? 'light' : 'dark'];
        if (this.s.last && (this.s.last[0] === sq || this.s.last[1] === sq)) cls.push('last');
        if (this.s.check === sq) cls.push('check');
        if (this.s.marks[sq]) cls.push('m-' + this.s.marks[sq]);
        html += '<div class="' + cls.join(' ') + '" data-sq="' + sq + '">' +
          (f === 0 ? '<i class="co rk">' + (8 - rr) + '</i>' : '') + (r === 7 ? '<i class="co fl">' + FILES[ff] + '</i>' : '') +
          (p ? '<span class="pc ' + p.c + ' ' + p.t + '">' + glyph(p, style) + '</span>' : '') + '</div>';
      }
      this.root.innerHTML = html;
      this.root.insertAdjacentHTML('beforeend', this.arrowsSvg(white));
      this.paint();
    }
    arrowsSvg(white) {
      const A = this.s.arrows || [];
      if (!A.length) return '';
      const pt = (sq) => { const f = FILES.indexOf(sq[0]), r = +sq[1]; return [(white ? f : 7 - f) + 0.5, (white ? 8 - r : r - 1) + 0.5]; };
      return '<svg class="arrows" viewBox="0 0 8 8" aria-hidden="true">' + A.map((a) => {
        const p1 = pt(a.from), p2 = pt(a.to), dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
        const sx = p1[0] + ux * 0.22, sy = p1[1] + uy * 0.22, bx = p2[0] - ux * 0.36, by = p2[1] - uy * 0.36;
        const col = a.kind === 'alt' ? '#4a8fd0' : a.kind === 'hint' ? '#e0a93b' : '#3f9a57';
        const pts = [[p2[0] - ux * 0.06, p2[1] - uy * 0.06], [bx + px * 0.27, by + py * 0.27], [bx - px * 0.27, by - py * 0.27]].map((q) => q.map((v) => v.toFixed(3)).join(',')).join(' ');
        return '<g opacity="' + (a.kind === 'alt' ? 0.6 : 0.82) + '"><line x1="' + sx.toFixed(3) + '" y1="' + sy.toFixed(3) + '" x2="' + bx.toFixed(3) + '" y2="' + by.toFixed(3) + '" stroke="' + col + '" stroke-width="0.15" stroke-linecap="round"/><polygon points="' + pts + '" fill="' + col + '"/></g>';
      }).join('') + '</svg>';
    }
    paint() {
      this.root.querySelectorAll('.sq').forEach((el) => {
        const sq = el.dataset.sq;
        el.classList.toggle('selected', this.sel === sq);
        const t = this.targets.find((m) => m.to === sq);
        el.classList.toggle('target', !!t);
        el.classList.toggle('cap', !!(t && t.capture));
      });
    }
    select(sq, moves) { this.sel = sq; this.targets = moves; this.paint(); }
    clear() { this.sel = null; this.targets = []; this.paint(); }

    pointerDown(e) {
      if (!this.o.interactive || (e.button != null && e.button > 0)) return;
      if (e.target.closest('.promo-wrap')) return;
      const el = e.target.closest('.sq');
      if (!el) return;
      const sq = el.dataset.sq;
      if (this.sel && this.targets.some((m) => m.to === sq)) { this.attempt(this.sel, sq); return; }
      const moves = el.querySelector('.pc') ? this.o.getMoves(sq) : [];
      if (!moves.length) { this.clear(); return; }
      const was = this.sel === sq;
      this.select(sq, moves);
      this.drag = { from: sq, sx: e.clientX, sy: e.clientY, moved: false, was, ghost: null, pc: el.querySelector('.pc') };
      this._mv = (ev) => this.pointerMove(ev);
      this._up = (ev) => this.pointerUp(ev);
      window.addEventListener('pointermove', this._mv);
      window.addEventListener('pointerup', this._up);
      window.addEventListener('pointercancel', this._up);
    }
    pointerMove(e) {
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) {
        d.moved = true;
        const g = d.pc.cloneNode(true);
        g.classList.add('ghost');
        const size = d.pc.parentElement.getBoundingClientRect().width;
        g.style.width = g.style.height = size + 'px';
        g.style.fontSize = size * 0.82 + 'px';
        document.body.appendChild(g);
        d.ghost = g; d.size = size;
        d.pc.style.opacity = '0.25';
      }
      if (d.ghost) { d.ghost.style.left = e.clientX - d.size / 2 + 'px'; d.ghost.style.top = e.clientY - d.size / 2 + 'px'; }
    }
    pointerUp(e) {
      window.removeEventListener('pointermove', this._mv);
      window.removeEventListener('pointerup', this._up);
      window.removeEventListener('pointercancel', this._up);
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.ghost) d.ghost.remove();
      if (d.pc) d.pc.style.opacity = '';
      if (!d.moved) { if (d.was) this.clear(); return; }
      this._dragEnd = Date.now();
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const tsq = under && under.closest && under.closest('.sq') && this.root.contains(under) ? under.closest('.sq').dataset.sq : null;
      if (tsq && tsq !== d.from) this.attempt(d.from, tsq);
    }
    attempt(from, to) {
      const ms = this.targets.filter((m) => m.to === to);
      if (!ms.length) { this.clear(); return; }
      if (ms.some((m) => m.promotion)) { this.promoCtx = { from, to }; this.showPromo(ms.map((m) => m.promotion)); return; }
      this.finish(from, to, null);
    }
    showPromo(options) {
      const color = OL.engine.turnOf(this.s.fen);
      const style = document.body.dataset.pieces || 'filled';
      const wrap = document.createElement('div');
      wrap.className = 'promo-wrap';
      wrap.innerHTML = '<div class="promo" role="dialog" aria-label="Choose promotion piece">' + ['q', 'r', 'b', 'n'].filter((p) => options.includes(p)).map((p) => '<button data-promo="' + p + '" aria-label="Promote to ' + p + '"><span class="pc ' + color + ' ' + p + '">' + glyph({ c: color, t: p }, style) + '</span></button>').join('') + '</div>';
      this.root.appendChild(wrap);
    }
    finish(from, to, promo) {
      this.clear();
      this.o.onMove(from, to, promo || undefined);
    }
  }
  OL.Board = Board;
})();
