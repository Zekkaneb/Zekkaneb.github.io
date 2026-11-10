/* Spaced repetition: an SM-2-inspired scheduler adapted to chess lines, plus the persisted progress cache.
   One card per VARIATION (a root-to-leaf line), keyed courseId:chapterId:leafId.

   Quality (0-5) comes from how the line went:
     no mistakes -> 5 (4 if a hint was used) | 1 mistake -> 3 | 2 mistakes -> 2 | 3+ mistakes or revealed -> 1
   quality < 3  : lapse - repetition count resets, line comes back in 10 minutes, ease drops
   quality >= 3 : 1st success -> 1 day, 2nd -> 3 days, then interval * ease (a hard pass shrinks it)
   Being reviewed late and still answering well earns credit (up to 1.5x the planned interval). */
(function () {
  const OL = (window.OL = window.OL || {});
  const DAY = 86400000, MIN = 60000;
  const MASTERED_DAYS = 21;

  function newCard(meta) {
    return Object.assign({ key: '', courseId: '', chapterId: '', leafId: '', ease: 2.5, interval: 0, reps: 0, lapses: 0, due: 0, last: 0, reviews: 0, attempts: 0, correct: 0, incorrect: 0, lastMistakes: 0, lastQuality: null, firstSeen: 0 }, meta || {});
  }
  function qualityFrom(p) {
    p = p || {};
    if (p.revealed) return 1;
    const m = p.mistakes || 0;
    if (m === 0) return p.hint ? 4 : 5;
    if (m === 1) return 3;
    if (m === 2) return 2;
    return 1;
  }
  function grade(card, perf, now) {
    now = now || Date.now();
    const c = Object.assign({}, card);
    const q = qualityFrom(perf);
    const elapsed = c.last ? (now - c.last) / DAY : 0;
    c.reviews += 1;
    c.lastQuality = q;
    c.lastMistakes = (perf && perf.mistakes) || 0;
    if (!c.firstSeen) c.firstSeen = now;
    c.ease = Math.max(1.3, c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    if (q < 3) {
      if (c.reps > 0) c.lapses += 1;
      c.reps = 0; c.interval = 0; c.due = now + 10 * MIN;
    } else {
      c.reps += 1;
      let iv;
      if (c.reps === 1) iv = 1;
      else if (c.reps === 2) iv = 3;
      else iv = Math.max(c.interval, Math.min(elapsed, c.interval * 1.5)) * c.ease;
      if (q === 3) iv *= 0.6;
      iv = Math.max(1, Math.round(iv));
      c.interval = iv; c.due = now + iv * DAY;
    }
    c.last = now;
    return c;
  }
  const status = (c) => (!c || !c.reviews ? 'new' : c.reps < 2 ? 'learning' : c.interval >= MASTERED_DAYS ? 'mastered' : 'reviewing');
  const isDue = (c, now) => !!c && c.reviews > 0 && c.due <= (now || Date.now());
  const isDifficult = (c) => !!c && c.reviews > 0 && (c.ease < 2.0 || c.lapses >= 2);
  function dueLabel(c, now) {
    now = now || Date.now();
    if (!c || !c.reviews) return 'Not started';
    const ms = c.due - now;
    if (ms <= 0) return 'Due now';
    if (ms < 60 * MIN) return 'in ' + Math.max(1, Math.round(ms / MIN)) + ' min';
    if (ms < DAY) return 'in ' + Math.round(ms / (60 * MIN)) + ' h';
    const d = Math.round(ms / DAY);
    return d === 1 ? 'tomorrow' : 'in ' + d + ' days';
  }

  /* Persisted progress cache */
  const progress = {
    cards: new Map(),
    key: (courseId, chapterId, leafId) => courseId + ':' + chapterId + ':' + leafId,
    async load() { const all = await OL.store.all('progress'); progress.cards = new Map(all.map((c) => [c.key, c])); },
    get(courseId, chapterId, leafId) { return progress.cards.get(progress.key(courseId, chapterId, leafId)) || null; },
    fresh(courseId, chapterId, leafId) { return newCard({ key: progress.key(courseId, chapterId, leafId), courseId, chapterId, leafId }); },
    async save(card) { progress.cards.set(card.key, card); await OL.store.put('progress', card); },
    async removeForCourse(courseId) {
      const dead = [];
      progress.cards.forEach((c, k) => { if (c.courseId === courseId) dead.push(k); });
      for (const k of dead) { progress.cards.delete(k); await OL.store.del('progress', k); }
    },
    /* Drop cards whose line no longer exists (after the tree was edited) */
    async prune(course) {
      if (!course) return;
      const live = new Set();
      course.chapters.forEach((ch) => OL.courses.trainable(ch).forEach((t) => live.add(progress.key(course.id, ch.id, t.leaf.id))));
      const dead = [];
      progress.cards.forEach((c, k) => { if (c.courseId === course.id && !live.has(k)) dead.push(k); });
      for (const k of dead) { progress.cards.delete(k); await OL.store.del('progress', k); }
    },
  };

  OL.srs = { DAY, MIN, MASTERED_DAYS, newCard, qualityFrom, grade, status, isDue, isDifficult, dueLabel };
  OL.progress = progress;
})();
