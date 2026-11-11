/* Node tests for sideline handling: every variation is its own trainable line, transposition matching, SRS keys.
   Run (from the project root):  node sidelines.js
   Uses a FAKE engine, so this does not test chess legality. */
global.window = global; global.document = { addEventListener() {}, querySelector() {}, querySelectorAll() { return []; } };
global.localStorage = { getItem() { return null; } };
const path = require('path');
const p = (f) => require(path.join(__dirname, f));
p('utils.js'); p('pgn-parser.js'); p('spaced-repetition.js');
const OL = global.OL, assert = require('assert');
/* Fake engine: position = sorted set of moves played, so transpositions give equal positions. NOT chess legality. */
OL.engine = {
  START_FEN: 'start w - - 0 1', available: () => true,
  turnOf: (f) => f.split(' ')[1], fullmove: (f) => +f.split(' ')[5] || 1,
  posKey: (f) => f.split(' ').slice(0, 3).join(' '), validateFen: (f) => ({ ok: true, fen: f }),
  applySan(fen, san) {
    if (san === 'Zz9') return { ok: false };
    const [pl, t, , , , n] = fen.split(' ');
    const set = (pl === 'start' ? [] : pl.split('.')).concat(san).sort().join('.');
    return { ok: true, san, uci: san, fen: set + ' ' + (t === 'w' ? 'b' : 'w') + ' - - 0 ' + (t === 'b' ? +n + 1 : n) };
  },
};
p('courses.js');
let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const PGN = '[Event "S: Sidelines"]\n\n1. e4 e5 (1... c5 2. Nf3 (2. c3 { sideline note }) 2... d6) 2. Nf3 Nc6 (2... d6) 3. Bc4 *';
const ch = () => OL.pgn.buildChapter(OL.pgn.parse(PGN).games[0]).chapter;
const lines = (c) => OL.courses.trainable(c).map((x) => OL.courses.pathTo(c, x.leaf.id).map((n) => n.san).join(' ')).sort();

console.log('Sidelines');
t('every leaf (main line + each sideline) is its own trainable line', () => {
  assert.deepStrictEqual(lines(ch()), ['e4 c5 Nf3 d6', 'e4 c5 c3', 'e4 e5 Nf3 Nc6 Bc4', 'e4 e5 Nf3 d6']);
});
t('each line path is a continuous root-to-leaf chain (opponent replies never mix branches)', () => {
  const c = ch(), idx = OL.courses.index(c);
  OL.courses.trainable(c).forEach((x) => { let prev = 'root'; OL.courses.pathTo(c, x.leaf.id).forEach((n) => { assert.strictEqual(idx.get(n.id).parent.id, prev); prev = n.id; }); });
});
t('sideline comment and move order survive; mainline stays children[0]', () => {
  const c = ch(), e4 = c.root.children[0];
  assert.deepStrictEqual(e4.children.map((n) => n.san), ['e5', 'c5']);
  assert.strictEqual(e4.children[1].children[1].comment, 'sideline note');
});
t('black repertoire: lines ending on the user\'s own move are still trainable', () => {
  const c = ch(); c.orientation = 'black';
  assert.strictEqual(OL.courses.trainable(c).length, 4);
});
t('export then re-import keeps all 4 lines', () => {
  const c = ch(), out = OL.pgn.chapterToPgn(c);
  assert.deepStrictEqual(lines(OL.pgn.buildChapter(OL.pgn.parse(out).games[0]).chapter), lines(c));
});
t('illegal sideline: strict import fails, lenient drops only that branch', () => {
  const bad = () => OL.pgn.parse('1. e4 e5 (1... Zz9 2. a4) 2. Nf3 *').games[0];
  assert.throws(() => OL.pgn.buildChapter(bad()), /Illegal move/);
  assert.strictEqual(lines(OL.pgn.buildChapter(bad(), { lenient: true }).chapter).length, 1);
});
t('alternative repertoire move at the same position is found by position (practice logic)', () => {
  const c = ch(), E = OL.engine, idx = OL.courses.index(c);
  let afterC5; idx.forEach((e) => { if (e.node.san === 'c5') afterC5 = e.node; });
  const drilled = afterC5.children[0], played = E.applySan(afterC5.fen, 'c3');
  assert.notStrictEqual(E.posKey(played.fen), E.posKey(drilled.fen));
  assert.ok(afterC5.children.find((x) => E.posKey(x.fen) === E.posKey(played.fen)), 'c3 sideline accepted');
  assert.ok(!afterC5.children.find((x) => E.posKey(x.fen) === E.posKey(E.applySan(afterC5.fen, 'h4').fen)), 'unrelated move rejected');
});
t('each sideline has an independent SRS card', () => {
  const c = ch(), keys = new Set(OL.courses.trainable(c).map((x) => OL.progress.key('c', c.id, x.leaf.id)));
  assert.strictEqual(keys.size, 4);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
