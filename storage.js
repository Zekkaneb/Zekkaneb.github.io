/* Storage layer. IndexedDB for library + progress; the facade (OL.store) is the only thing the app talks to,
   so a remote/sync backend can later implement the same interface (all/get/put/putMany/del/clear). */
(function () {
  const OL = (window.OL = window.OL || {});
  const DB_NAME = 'opening-lab-db';
  const DB_VERSION = 2; // v1 only had "courses"; v2 adds progress/sessions/activity/meta (existing courses are kept)
  const STORES = { courses: 'id', progress: 'key', sessions: 'id', activity: 'id', meta: 'key' };

  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = (tx) => new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('Database transaction aborted'));
  });

  class IdbBackend {
    async open() {
      if (!('indexedDB' in window)) throw new Error('IndexedDB is not available in this browser.');
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, DB_VERSION);
        r.onupgradeneeded = () => {
          const db = r.result;
          Object.keys(STORES).forEach((n) => { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: STORES[n] }); });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('The database upgrade is blocked by another Opening Lab tab. Close other tabs and reload.'));
      });
    }
    async all(s) { return (await req(this.db.transaction(s).objectStore(s).getAll())) || []; }
    async get(s, k) { return req(this.db.transaction(s).objectStore(s).get(k)); }
    async put(s, o) { const tx = this.db.transaction(s, 'readwrite'); tx.objectStore(s).put(o); await done(tx); }
    async putMany(s, arr) { const tx = this.db.transaction(s, 'readwrite'); const st = tx.objectStore(s); arr.forEach((o) => st.put(o)); await done(tx); }
    async del(s, k) { const tx = this.db.transaction(s, 'readwrite'); tx.objectStore(s).delete(k); await done(tx); }
    async clear(s) { const tx = this.db.transaction(s, 'readwrite'); tx.objectStore(s).clear(); await done(tx); }
  }

  class MemoryBackend {
    constructor() { this.m = {}; Object.keys(STORES).forEach((s) => (this.m[s] = new Map())); }
    async all(s) { return Array.from(this.m[s].values()); }
    async get(s, k) { return this.m[s].get(k); }
    async put(s, o) { this.m[s].set(o[STORES[s]], o); }
    async putMany(s, arr) { arr.forEach((o) => this.m[s].set(o[STORES[s]], o)); }
    async del(s, k) { this.m[s].delete(k); }
    async clear(s) { this.m[s].clear(); }
  }

  const store = {
    persistent: true,
    backend: null,
    initError: null,
    STORES,
    async init() {
      try {
        const b = new IdbBackend();
        await b.open();
        this.backend = b;
      } catch (e) {
        console.error('IndexedDB unavailable; using temporary in-memory storage:', e);
        this.backend = new MemoryBackend();
        this.persistent = false;
        this.initError = e;
      }
      return this.persistent;
    },
    all: (s) => store.backend.all(s),
    get: (s, k) => store.backend.get(s, k),
    put: (s, o) => store.backend.put(s, o),
    putMany: (s, a) => store.backend.putMany(s, a),
    del: (s, k) => store.backend.del(s, k),
    clear: (s) => store.backend.clear(s),
    async clearAll() { for (const s of Object.keys(STORES)) await store.backend.clear(s); },
    async estimate() {
      try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { console.warn('Storage estimate failed:', e); }
      return null;
    },
  };
  OL.store = store;
})();
