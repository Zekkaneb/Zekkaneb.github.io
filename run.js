/* Node tests for the pure-logic modules (no browser, no chess.js needed).
   Run: node tests/run.js
   buildChapter() is exercised against a FAKE engine, so these tests cover tree structure/leniency logic,
   not chess legality (that is chess.js's job in the browser). */
global.window = global;
const path = require('path');
const load = (f) => require(path.join(__dirname, '..', 'js', f));
load('utils.js');
load('pgn-parser.js');
load('spaced-repetition.js');
const OL = global.OL;
const assert = require('assert');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const sans = (n) => n.children.map((c) => c.san);

console.log('PGN parser');
t('headers, mainline, result', () => {
  const r = OL.pgn.parse('[Event "A"]\n[White "x"]\n\n1. e4 e5 2. Nf3 Nc6 1-0');
  assert.strictEqual(r.games.length, 1);
  assert.strictEqual(r.games[0].headers.Event, 'A');
  assert.deepStrictEqual(OL.pgn.mainline(r.games[0].root).map((n) => n.san), ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.strictEqual(r.games[0].result, '1-0');
});
t('variation is a SIBLING of the move it replaces, not a flat continuation', () => {
  const g = OL.pgn.parse('1. e4 (1. d4 d5) e5 2. Nf3').games[0];
  assert.deepStrictEqual(sans(g.root), ['e4', 'd4']);
  assert.deepStrictEqual(sans(g.root.children[0]), ['e5']);
  assert.deepStrictEqual(sans(g.root.children[1]), ['d5']);
});
t('nested variations', () => {
  const g = OL.pgn.parse('1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) 2. Nf3').games[0];
  const e4 = g.root.children[0];
  assert.deepStrictEqual(sans(e4), ['e5', 'c5']);
  const c5 = e4.children[1];
  assert.deepStrictEqual(sans(c5), ['Nf3', 'c3']);
  assert.deepStrictEqual(sans(c5.children[0]), ['d6']);
  assert.deepStrictEqual(sans(c5.children[1]), ['d5']);
  assert.deepStrictEqual(sans(e4.children[0]), ['Nf3']);
});
t('comments before/after moves, root comment, engine commands stripped', () => {
  const g = OL.pgn.parse('{ intro } 1. e4 { good [%clk 0:01:00] } e5 ; line comment\n2. Nf3').games[0];
  assert.strictEqual(g.root.comment, 'intro');
  assert.strictEqual(g.root.children[0].comment, 'good');
  assert.strictEqual(g.root.children[0].children[0].comment, 'line comment');
});
t('NAGs as $n and as suffixes', () => {
  const g = OL.pgn.parse('1. e4! e5 $2 2. Nf3?! Nc6!!').games[0];
  const m = OL.pgn.mainline(g.root);
  assert.deepStrictEqual(m.map((n) => n.nags), [[1], [2], [6], [3]]);
  assert.deepStrictEqual(m.map((n) => n.san), ['e4', 'e5', 'Nf3', 'Nc6']);
});
t('move-number styles: 1.e4, 1...e5, "1. ..." and zero castling', () => {
  const g = OL.pgn.parse('1.e4 1...e5 2.0-0 e4 3. ... O-O-O').games[0];
  assert.deepStrictEqual(OL.pgn.mainline(g.root).map((n) => n.san), ['e4', 'e5', 'O-O', 'e4', 'O-O-O']);
});
t('multiple games split by tags (not by regex on [Event)', () => {
  const r = OL.pgn.parse('[Event "One"]\n\n1. e4 *\n\n[Site "x"]\n[Event "Two"]\n\n1. d4 d5 *\n\n[Event "Three"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n1. Ka2 *');
  assert.strictEqual(r.games.length, 3);
  assert.strictEqual(r.games[1].headers.Event, 'Two');
  assert.strictEqual(r.games[2].headers.FEN.slice(0, 5), '8/8/8');
});
t('comment containing brackets/parens/PGN-looking text does not break parsing', () => {
  const g = OL.pgn.parse('[Event "x"]\n\n1. e4 { see (1. d4) and [Event "no"] } e5').games[0];
  assert.strictEqual(OL.pgn.mainline(g.root).length, 2);
  assert.strictEqual(g.root.children[0].children.length, 1);
});
t('malformed input does not throw and reports warnings', () => {
  const r = OL.pgn.parse('1. e4 ) e5 ( 2. Nf3 {oops');
  assert.ok(r.games.length === 1);
  assert.ok(r.games[0].warnings.length >= 2);
});
t('empty / junk input yields no games', () => {
  assert.strictEqual(OL.pgn.parse('').games.length, 0);
  assert.strictEqual(OL.pgn.parse('   \n  ').games.length, 0);
});
t('Windows line endings and BOM', () => {
  const g = OL.pgn.parse('﻿[Event "w"]\r\n\r\n1. e4 e5\r\n').games[0];
  assert.strictEqual(g.headers.Event, 'w');
  assert.strictEqual(OL.pgn.mainline(g.root).length, 2);
});
t('Lichess-style chapter name', () => {
  assert.strictEqual(OL.pgn.chapterName({ StudyName: 'Caro', Event: 'Caro: Advance' }, 0), 'Advance');
  assert.strictEqual(OL.pgn.chapterName({ ChapterName: 'X', Event: 'Y' }, 0), 'X');
  assert.strictEqual(OL.pgn.chapterName({}, 2), 'Chapter 3');
});

console.log('PGN writer');
OL.engine = {
  START_FEN: 'START',
  turnOf: (f) => (f === 'START' ? 'w' : (f.split(' ')[1] || 'w')),
  fullmove: (f) => (f === 'START' ? 1 : parseInt(f.split(' ')[5], 10) || 1),
  validateFen: (f) => ({ ok: /^\S+ [wb] /.test(f), fen: f, error: 'bad fen' }),
  applySan: (fen, san) => (san === 'Zz9' ? { ok: false, error: 'illegal' } : { ok: true, san, uci: san, fen: fen + '>' + san }),
};
t('round trip preserves tree shape, comments and NAGs', () => {
  const src = '[Event "R"]\n\n{ intro } 1. e4 $1 { best } e5 (1... c5 2. Nf3 (2. c3) 2... d6) 2. Nf3 Nc6 *';
  const g1 = OL.pgn.parse(src).games[0];
  const ch = OL.pgn.buildChapter(g1).chapter;
  const out = OL.pgn.chapterToPgn(ch);
  const g2 = OL.pgn.parse(out).games[0];
  const shape = (n) => ({ s: n.san, c: n.comment, g: n.nags, k: n.children.map(shape) });
  assert.deepStrictEqual(shape(g2.root), shape(ch.root));
});
t('custom FEN with black to move numbers correctly', () => {
  const ch = OL.pgn.buildChapter(OL.pgn.parse('[Event "f"]\n[FEN "k7/8/8/8/8/8/8/K7 b - - 0 5"]\n\n5... Ka7 6. Kb1 *').games[0]).chapter;
  assert.ok(ch.startFen);
  assert.ok(/5\.\.\. Ka7 6\. Kb1/.test(OL.pgn.movetext(ch)));
});
t('strict build aborts on illegal move with a helpful message; lenient truncates', () => {
  const g = () => OL.pgn.parse('1. e4 e5 (1... Zz9 2. a4) 2. Nf3 *').games[0];
  assert.throws(() => OL.pgn.buildChapter(g()), /Illegal move 1\.\.\. Zz9/);
  const r = OL.pgn.buildChapter(g(), { lenient: true });
  assert.strictEqual(r.truncated.length, 1);
  assert.strictEqual(r.chapter.root.children[0].children.length, 1);
});
t('unsupported variant is rejected', () => {
  assert.throws(() => OL.pgn.buildChapter(OL.pgn.parse('[Variant "Crazyhouse"]\n\n1. e4 *').games[0]), /not supported/);
});
t('leaves() counts each variation line once', () => {
  const g = OL.pgn.parse('1. e4 e5 (1... c5) (1... e6) 2. Nf3 *').games[0];
  assert.strictEqual(OL.pgn.leaves(g.root).length, 3);
});

console.log('Spaced repetition');
const S = OL.srs;
const now0 = 1_700_000_000_000;
t('quality mapping', () => {
  assert.strictEqual(S.qualityFrom({ mistakes: 0 }), 5);
  assert.strictEqual(S.qualityFrom({ mistakes: 0, hint: true }), 4);
  assert.strictEqual(S.qualityFrom({ mistakes: 1 }), 3);
  assert.strictEqual(S.qualityFrom({ mistakes: 2 }), 2);
  assert.strictEqual(S.qualityFrom({ mistakes: 0, revealed: true }), 1);
});
t('perfect reviews grow the interval: 1d, 3d, then * ease', () => {
  let c = S.newCard({ key: 'k' });
  assert.strictEqual(S.status(c), 'new');
  c = S.grade(c, { mistakes: 0 }, now0);
  assert.strictEqual(c.interval, 1); assert.strictEqual(S.status(c), 'learning');
  c = S.grade(c, { mistakes: 0 }, now0 + 1 * S.DAY);
  assert.strictEqual(c.interval, 3); assert.strictEqual(S.status(c), 'reviewing');
  const i3 = S.grade(c, { mistakes: 0 }, now0 + 4 * S.DAY).interval;
  assert.ok(i3 >= 8, 'third interval should be ~ 3*ease, got ' + i3);
});
t('a failed review comes back within minutes and resets reps, lowering ease', () => {
  let c = S.newCard({ key: 'k' });
  c = S.grade(S.grade(S.grade(c, { mistakes: 0 }, now0), { mistakes: 0 }, now0 + S.DAY), { mistakes: 0 }, now0 + 4 * S.DAY);
  const before = c.ease;
  const f = S.grade(c, { mistakes: 3 }, now0 + 20 * S.DAY);
  assert.strictEqual(f.reps, 0); assert.strictEqual(f.lapses, 1);
  assert.ok(f.ease < before);
  assert.ok(f.due - (now0 + 20 * S.DAY) <= 10 * S.MIN);
  assert.ok(S.isDue(f, now0 + 20 * S.DAY + 11 * S.MIN));
});
t('mistakes lead to earlier review than a clean pass', () => {
  let a = S.newCard({ key: 'a' }), b = S.newCard({ key: 'b' });
  for (let i = 0; i < 3; i++) { a = S.grade(a, { mistakes: 0 }, now0 + i * 5 * S.DAY); b = S.grade(b, { mistakes: i === 2 ? 1 : 0 }, now0 + i * 5 * S.DAY); }
  assert.ok(b.interval < a.interval);
});
t('mastered after reaching 21+ days; difficult flag on low ease', () => {
  let c = S.newCard({ key: 'k' }); let now = now0;
  for (let i = 0; i < 8; i++) { c = S.grade(c, { mistakes: 0 }, now); now += c.interval * S.DAY; }
  assert.strictEqual(S.status(c), 'mastered');
  let d = S.newCard({ key: 'd' }); d = S.grade(d, { mistakes: 0 }, now0);
  for (let i = 0; i < 3; i++) d = S.grade(d, { mistakes: 3 }, now0 + (i + 1) * S.DAY);
  assert.ok(S.isDifficult(d));
});
t('late-but-correct review gets credit; never-reviewed is not due', () => {
  let c = S.newCard({ key: 'k' });
  assert.ok(!S.isDue(c, now0));
  c = S.grade(S.grade(c, { mistakes: 0 }, now0), { mistakes: 0 }, now0 + S.DAY);
  const onTime = S.grade(c, { mistakes: 0 }, now0 + 4 * S.DAY).interval;
  const late = S.grade(c, { mistakes: 0 }, now0 + 10 * S.DAY).interval;
  assert.ok(late >= onTime);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
