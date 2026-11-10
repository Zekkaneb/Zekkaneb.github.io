/* Library backup / restore. Restore MERGES by id (never blindly duplicates):
   - same course id, identical content  -> skipped
   - same course id, different content  -> newer `updated` wins (the older copy is not silently lost: reported)
   - progress cards merge per key (the more recently reviewed card wins); sessions/activity merge by id. */
(function () {
  const OL = (window.OL = window.OL || {});
  const FORMAT = 'opening-lab-backup';

  async function build() {
    return {
      format: FORMAT, version: 2, exported: new Date().toISOString(),
      courses: await OL.store.all('courses'), progress: await OL.store.all('progress'),
      sessions: await OL.store.all('sessions'), activity: await OL.store.all('activity'), settings: OL.settings.all(),
    };
  }
  async function exportAll() {
    const b = await build();
    OL.utils.download('opening-lab-backup-' + OL.utils.dayKey(Date.now()) + '.json', JSON.stringify(b), 'application/json');
    return b;
  }
  function validate(obj) {
    if (!obj || obj.format !== FORMAT) throw new Error('This is not an Opening Lab backup file.');
    if (obj.version !== 2) throw new Error('Unsupported backup version ' + obj.version + '.');
    if (!Array.isArray(obj.courses)) throw new Error('The backup has no course list.');
    obj.courses.forEach((c, i) => {
      if (!c || !c.id || !Array.isArray(c.chapters)) throw new Error('Course #' + (i + 1) + ' in the backup is malformed.');
      c.chapters.forEach((ch) => { if (!ch.root || !Array.isArray(ch.root.children)) throw new Error('A chapter of "' + c.title + '" has no move tree.'); });
    });
  }
  function plan(obj) {
    const have = new Map(OL.courses.list.map((c) => [c.id, c]));
    const p = { add: [], update: [], same: [], keepNewer: [] };
    for (const c of obj.courses) {
      const mine = have.get(c.id);
      if (!mine) p.add.push(c);
      else if (JSON.stringify(mine.chapters) === JSON.stringify(c.chapters) && mine.title === c.title) p.same.push(c);
      else if ((c.updated || 0) > (mine.updated || 0)) p.update.push(c);
      else p.keepNewer.push(c);
    }
    return p;
  }
  async function apply(obj, p, withSettings) {
    const courses = p.add.concat(p.update);
    if (courses.length) await OL.store.putMany('courses', courses);
    const cards = [];
    for (const c of obj.progress || []) { const mine = OL.progress.cards.get(c.key); if (!mine || (c.last || 0) > (mine.last || 0)) cards.push(c); }
    if (cards.length) await OL.store.putMany('progress', cards);
    const sIds = new Set((await OL.store.all('sessions')).map((s) => s.id));
    const ns = (obj.sessions || []).filter((s) => !sIds.has(s.id));
    if (ns.length) await OL.store.putMany('sessions', ns);
    const aIds = new Set(OL.courses.activity.items.map((a) => a.id));
    const na = (obj.activity || []).filter((a) => !aIds.has(a.id));
    if (na.length) await OL.store.putMany('activity', na);
    if (withSettings && obj.settings) OL.settings.set(obj.settings);
    await OL.courses.load(); await OL.progress.load(); await OL.courses.activity.load(); await OL.stats.load();
    OL.utils.bus.emit('courses', {});
    return { courses: courses.length, cards: cards.length, sessions: ns.length };
  }
  async function importFile(file) {
    let obj;
    try { obj = JSON.parse(await OL.utils.readFileText(file)); } catch (e) { throw new Error('That file is not valid JSON: ' + e.message); }
    validate(obj);
    const p = plan(obj);
    const html = '<ul class="plain"><li><b>' + p.add.length + '</b> new course(s) will be added</li><li><b>' + p.update.length + '</b> existing course(s) will be replaced by the newer copy in the backup</li><li><b>' + p.same.length + '</b> already identical (skipped)</li><li><b>' + p.keepNewer.length + '</b> where your current copy is newer (kept)</li></ul><p class="muted small">Practice progress is merged, keeping the most recent review of each variation.' + (obj.exported ? ' Backup created ' + esc(obj.exported.slice(0, 10)) + '.' : '') + '</p>';
    function esc(s) { return OL.utils.esc(s); }
    const v = await OL.ui.form({ title: 'Restore backup', intro: html, submitLabel: 'Restore', fields: [{ name: 'settings', type: 'checkbox', label: 'Also restore settings', checkLabel: 'Also restore my saved settings', value: false }] });
    if (!v) return null;
    return apply(obj, p, v.settings);
  }
  OL.backup = { build, exportAll, importFile, plan, validate };
})();
