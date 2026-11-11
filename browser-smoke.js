/* Browser smoke test (Playwright). Uses fake-chess.js in place of chess.js (no network in CI sandbox).
   Verifies UI wiring, persistence, migration, SRS write-through. Does NOT verify chess legality.
   Run (from the project root):  python3 -m http.server 8123 &   node browser-smoke.js */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = process.env.URL || 'http://localhost:8123/index.html';
const fake = fs.readFileSync(path.join(__dirname, 'fake-chess.js'), 'utf8');
const SHOTS = process.env.SHOTS || '/tmp';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const PGN = `[Event "Test: Italian"]
[Opening "Italian Game"]
[ECO "C50"]

{ Intro comment } 1. e4 e5 2. Nf3 Nc6 3. Bc4 { Develops } (3. d4 { Centre } d6) 3... Bc5 (3... Nf6 $1) 4. c3 *

[Event "Test: Second"]
[Orientation "white"]

1. e4 d6 2. d4 *

[Event "Test: Broken"]

1. e4 e5 2. Zz9 *
`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  await ctx.route('**/vendor/chess.min.js', (r) => r.fulfill({ contentType: 'application/javascript', body: fake }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const idb = (fn, arg) => page.evaluate(fn, arg);
  const dbAll = (store) => page.evaluate((s) => new Promise((res, rej) => { const r = indexedDB.open('opening-lab-db'); r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; r.onerror = () => rej(r.error); }), store);

  /* ---- 0. seed a v1 prototype database BEFORE the app first runs ---- */
  await page.goto('about:blank');
  await page.goto(URL.replace('index.html', 'blank.html')).catch(() => {});
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('opening-lab-db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('courses', { keyPath: 'id' });
    r.onsuccess = () => {
      const tx = r.result.transaction('courses', 'readwrite');
      tx.objectStore('courses').put({ id: 'course-legacy-1', title: 'Legacy Italian', opening: 'Opening study', source: 'old.pgn', created: 1700000000000, moveCount: 6,
        chapters: [{ id: 'old-ch-1', name: 'Old chapter', fen: 'start', completed: true, comments: 'old notes',
          tree: [{ san: 'e4', comment: 'king pawn', variations: [[{ san: 'd4', comment: '', variations: [], nag: '' }]], nag: '$1' }, { san: 'e5', comment: '', variations: [], nag: '' }, { san: 'Nf3', comment: '', variations: [], nag: '' }] }] });
      tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  }));

  console.log('Boot & migration');
  await page.goto(URL);
  await page.waitForSelector('#app:not(.hidden)', { timeout: 8000 });
  ok(true, 'app boots and shows the shell');
  await page.waitForSelector('.modal', { timeout: 3000 }).catch(() => {});
  const modalText = await page.locator('.modal').first().textContent().catch(() => '');
  if (modalText) await page.click('[data-modal-close]');
  await page.goto(URL + '#/courses');
  await page.waitForSelector('#view-courses .course-card');
  ok((await page.locator('#view-courses .course-card h3').allTextContents()).includes('Legacy Italian'), 'legacy v1 course survived and appears in library');
  const legacy = (await dbAll('courses')).find((c) => c.id === 'course-legacy-1');
  ok(legacy && legacy.schema === 2, 'legacy course rewritten to schema 2');
  const ch0 = legacy.chapters[0];
  ok(ch0.root.children.length === 2 && ch0.root.children[0].san === 'e4' && ch0.root.children[1].san === 'd4', 'legacy variation became a SIBLING of its move (e4 / d4)');
  ok(ch0.root.children[0].nags[0] === 1 && ch0.completed === true && ch0.description === 'old notes', 'legacy NAG, completed flag and notes preserved');

  console.log('Import');
  await page.goto(URL + '#/import');
  await page.click('[data-tab="paste"]');
  await page.fill('#pgn-text', PGN);
  await page.click('[data-action="import-parse-paste"]');
  await page.waitForSelector('.preview-panel');
  const rows = await page.locator('.preview-chapter').count();
  ok(rows === 3, 'preview lists all 3 games');
  ok((await page.locator('.preview-chapter.err').textContent()).includes('Illegal move'), 'bad chapter reported with a precise reason, others still importable');
  ok((await page.inputValue('#imp-title')) === 'Test', 'course name suggested from "Study: Chapter" Event tags');
  await page.screenshot({ path: SHOTS + '/shot-import.png' });
  await page.click('[data-action="import-save"]');
  await page.waitForURL(/#\/study\//);
  await page.waitForSelector('.board .sq');
  const courses = await dbAll('courses');
  const test = courses.find((c) => c.title === 'Test');
  ok(test && test.chapters.length === 2, 'imported course saved with 2 chapters (broken one excluded)');
  ok(test.opening === 'Italian Game' && test.eco === 'C50', 'ECO/opening taken from PGN headers');

  console.log('Study');
  ok((await page.locator('.board .sq').count()) === 64, 'board renders 64 squares (no renderStudy crash)');
  ok((await page.locator('.board .pc').count()) === 32, 'start position has 32 pieces');
  ok((await page.locator('.var').count()) >= 2, 'variations rendered as nested blocks in the move list');
  const mainBtns = await page.locator('#move-list .mv').allTextContents();
  ok(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'd4', 'Bc5', 'Nf6', 'c3'].every((m) => mainBtns.some((t) => t.startsWith(m))), 'all mainline + variation moves present');
  await page.click('[data-action="study-next"]'); await page.click('[data-action="study-next"]');
  ok((await page.locator('#move-list .mv.on').textContent()).startsWith('e5'), 'next-move navigation highlights e5');
  await page.keyboard.press('ArrowLeft');
  ok((await page.locator('#move-list .mv.on').textContent()).startsWith('e4'), 'arrow-key navigation works');
  await page.locator('#move-list .var .mv', { hasText: 'd4' }).first().click();
  ok((await page.locator('#move-list .mv.on').textContent()).startsWith('d4') && (await page.locator('#study-right').textContent()).includes('Centre'), 'clicking a variation move selects it and shows its comment');
  await page.keyboard.press('ArrowRight');
  ok((await page.locator('#move-list .mv.on').textContent()).startsWith('d6'), 'navigation continues inside the variation');
  await page.keyboard.press('Home');
  ok((await page.locator('#study-right .comment-box').first().textContent()).includes('Intro'), 'chapter intro comment shown at start position');
  await page.keyboard.press('f');
  ok((await page.locator('.board .sq').first().getAttribute('data-sq')) === 'h1', 'board flips');
  await page.screenshot({ path: SHOTS + '/shot-study.png' });

  console.log('Editing');
  await page.click('#btn-edit');
  await page.keyboard.press('End');
  const before = await page.locator('#move-list .mv').count();
  await page.fill('#san-input', 'd3'); await page.press('#san-input', 'Enter');
  ok((await page.locator('#move-list .mv').count()) === before + 1, 'typed move added to the tree');
  await page.click('[data-action="study-nag"][data-nag="1"]');
  ok((await page.locator('#move-list .mv.on sup').textContent()) === '!', 'annotation "!" applied');
  await page.fill('#comment-box', 'my note');
  await page.click('[data-action="study-undo"]');
  await page.click('[data-action="study-undo"]');
  await page.click('[data-action="study-undo"]').catch(() => {});
  ok((await page.locator('#move-list .mv').count()) === before, 'undo reverts edits');
  await page.click('[data-action="study-redo"]');
  await page.fill('#comment-box', 'persisted note');
  await page.waitForFunction(() => document.querySelector('#save-state').textContent.includes('Saved'), null, { timeout: 4000 });
  const saved = (await dbAll('courses')).find((c) => c.title === 'Test');
  ok(JSON.stringify(saved).includes('persisted note'), 'edits autosaved to IndexedDB');
  await page.click('#btn-edit');

  console.log('Practice');
  const ch2 = test.chapters[1];
  await page.goto(URL + '#/practice?course=' + test.id + '&chapter=' + ch2.id);
  await page.waitForSelector('.practice-setup');
  await page.selectOption('#pc-mode', 'all');
  await page.waitForFunction(() => document.querySelector('#pc-preview').textContent.includes('1 variation'));
  await page.click('[data-action="practice-start"]');
  await page.waitForSelector('#pr-board .sq');
  await page.waitForFunction(() => document.querySelector('#pr-feedback') && /Learn|New line|watch/i.test(document.querySelector('#pr-feedback').textContent), null, { timeout: 3000 }).catch(() => {});
  await page.waitForSelector('.sq.m-hint', { timeout: 3000 });
  ok(true, 'new line shows the expected move highlighted (learn mode)');
  const clickSq = (sq) => page.click('#pr-board [data-sq="' + sq + '"]');
  await clickSq('d2'); await clickSq('d4');
  await page.waitForFunction(() => document.querySelector('#pr-feedback').classList.contains('bad'));
  ok((await page.locator('#pr-feedback').textContent()).includes('Expected: e4'), 'wrong move rejected and the expected move is shown');
  await clickSq('e2'); await clickSq('e4');
  await page.waitForFunction(() => /Correct|✓/.test(document.querySelector('#pr-feedback').textContent));
  await page.waitForFunction(() => document.querySelector('#pr-actions button') === null || true);
  await page.waitForTimeout(1300);
  await clickSq('d2'); await clickSq('d4');
  await page.waitForSelector('[data-action="practice-next"]', { timeout: 5000 });
  ok(true, 'line completes after opponent auto-reply and final move');
  const cards = await dbAll('progress');
  ok(cards.length === 1 && cards[0].reviews === 1 && cards[0].attempts === 3 && cards[0].incorrect === 1, 'SRS card saved: 1 review, 3 attempts, 1 incorrect');
  ok(cards[0].due > Date.now() && cards[0].interval >= 1, 'next review scheduled in the future (interval ' + cards[0].interval + 'd)');
  await page.click('[data-action="practice-next"]');
  await page.waitForSelector('.summary');
  ok(/accuracy/i.test(await page.locator('.summary').textContent()), 'session summary displayed');
  const sessions = await dbAll('sessions');
  ok(sessions.length === 1 && sessions[0].attempted === 3 && sessions[0].correct === 2, 'session record persisted (3 attempted, 2 correct)');

  console.log('Dashboard / Stats / Explore');
  await page.goto(URL + '#/dashboard');
  await page.waitForSelector('#view-dashboard .stats-grid');
  ok((await page.locator('#view-dashboard .activity').textContent()).includes('Practice session'), 'dashboard activity reflects the practice session');
  await page.goto(URL + '#/stats');
  await page.waitForSelector('.course-stats');
  ok((await page.locator('#view-stats').textContent()).includes('Test'), 'statistics lists courses from saved data');
  await page.click('[data-action="stats-toggle"]');
  await page.locator('[data-action="stats-variations"]').first().click();
  ok((await page.locator('.modal').textContent()).includes('Attempts'), 'per-variation table opens');
  await page.keyboard.press('Escape');
  await page.goto(URL + '#/explore');
  await page.waitForSelector('#view-explore .catalog-item');
  ok((await page.locator('#view-explore .catalog-item h3').allTextContents()).includes('Italian Game'), 'opening library groups by PGN opening name');
  await page.selectOption('#explore-mode', 'moves'); await page.fill('#explore-search', '1. e4 e5 2. Nf3');
  ok((await page.locator('#view-explore .result').count()) >= 1, 'move-sequence search finds the chapter');

  console.log('Course management & backup');
  await page.goto(URL + '#/courses');
  await page.waitForSelector('#view-courses .course-card');
  const n0 = await page.locator('#view-courses .course-card').count();
  await page.locator('[data-action="course-menu"]').first().click();
  await page.click('[data-modal-close="dup"]');
  await page.waitForFunction((n) => document.querySelectorAll('#view-courses .course-card').length === n + 1, n0);
  ok(true, 'duplicate course');
  await page.locator('[data-action="course-menu"]').first().click();
  await page.click('[data-modal-close="edit"]');
  await page.fill('#f_title', 'Renamed course'); await page.click('.modal button[type=submit]');
  await page.waitForFunction(() => [...document.querySelectorAll('#view-courses .course-card h3')].some((h) => h.textContent === 'Renamed course'));
  ok(true, 'rename course');
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.goto(URL + '#/settings'); await page.click('[data-action="set-export"]'); })()]);
  const bpath = SHOTS + '/backup.json'; await dl.saveAs(bpath);
  const backup = JSON.parse(fs.readFileSync(bpath, 'utf8'));
  ok(backup.format === 'opening-lab-backup' && backup.courses.length === n0 + 1 && backup.progress.length === 1, 'backup contains courses + progress');
  await page.setInputFiles('#backup-file', bpath);
  await page.waitForSelector('.modal');
  ok((await page.locator('.modal').textContent()).includes('already identical'), 'restoring the same backup is recognised as identical (no duplicates)');
  await page.click('.modal button[type=submit]');
  await page.waitForTimeout(500);
  ok((await dbAll('courses')).length === n0 + 1, 'course count unchanged after re-import');
  await page.goto(URL + '#/courses');
  await page.locator('[data-action="course-menu"]').first().click();
  await page.click('[data-modal-close="del"]');
  await page.click('.modal .danger-btn');
  await page.waitForFunction((n) => document.querySelectorAll('#view-courses .course-card').length === n, n0);
  ok(true, 'delete course (with confirmation)');

  console.log('Persistence & theme');
  await page.goto(URL + '#/settings'); await page.selectOption('[data-setting="theme"]', 'light');
  await page.reload(); await page.waitForSelector('#app:not(.hidden)');
  ok(await page.evaluate(() => document.body.classList.contains('light')), 'theme persists after reload');
  ok((await dbAll('progress')).length >= 0 && (await dbAll('courses')).length === n0, 'library intact after reload');
  await page.screenshot({ path: SHOTS + '/shot-settings-light.png' });

  console.log('Responsive');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(URL + '#/courses'); await page.waitForSelector('#view-courses .course-card');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile: no horizontal overflow (courses)');
  await page.screenshot({ path: SHOTS + '/shot-mobile-courses.png' });
  await page.goto(URL + '#/study/' + test.id); await page.waitForSelector('#study-board .sq');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile: no horizontal overflow (study)');
  await page.screenshot({ path: SHOTS + '/shot-mobile-study.png' });
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto(URL + '#/dashboard'); await page.waitForSelector('#view-dashboard .stats-grid');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'tablet: no horizontal overflow (dashboard)');

  ok(errors.length === 0, 'no uncaught errors / console errors during the run' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
