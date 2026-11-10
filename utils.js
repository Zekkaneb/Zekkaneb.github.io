/* Shared helpers: DOM, ids, dates, event bus, and UI primitives (toast, modal, form, confirm, menu). */
(function () {
  const OL = (window.OL = window.OL || {});

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  let counter = 0;
  const uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + (counter++).toString(36);
  const nid = () => 'n' + Math.random().toString(36).slice(2, 8) + (counter++).toString(36);

  const handlers = {};
  const bus = {
    on(evt, fn) {
      (handlers[evt] = handlers[evt] || []).push(fn);
      return () => { handlers[evt] = handlers[evt].filter((f) => f !== fn); };
    },
    emit(evt, data) {
      (handlers[evt] || []).slice().forEach((fn) => {
        try { fn(data); } catch (e) { console.error('Listener for "' + evt + '" failed:', e); }
      });
    },
  };

  function debounce(fn, ms) {
    let t;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = (...a) => { clearTimeout(t); fn(...a); };
    d.cancel = () => clearTimeout(t);
    return d;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function hashString(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dayDiff = (a, b) => {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  };
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
  function relTime(ts) {
    if (!ts) return 'Never';
    const d = dayDiff(dayKey(ts), dayKey(Date.now()));
    if (d <= 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d < 30) return d + ' days ago';
    return fmtDate(ts);
  }
  function fmtDuration(ms) {
    const s = Math.round((ms || 0) / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + pad(s % 60) + 's';
    return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
  }
  const fmtPct = (n) => Math.round((n || 0) * 100) + '%';
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { console.warn('Clipboard unavailable:', e); return false; }
  }
  const readFileText = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error || new Error('Could not read file'));
    r.readAsText(file);
  });
  function fileToDataUrl(file, max) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, (max || 480) / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file is not a readable image.')); };
      img.src = url;
    });
  }

  /* ---------- UI primitives ---------- */
  const modals = [];
  const ui = {
    toast(msg, type) {
      const root = $('#toast-root');
      if (!root) return;
      const t = document.createElement('div');
      t.className = 'toast ' + (type || 'ok');
      t.setAttribute('role', type === 'error' ? 'alert' : 'status');
      t.textContent = msg;
      root.appendChild(t);
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, type === 'error' ? 6500 : 2600);
    },
    modal(html, opts) {
      opts = opts || {};
      const root = $('#modal-root');
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
      root.appendChild(wrap);
      const entry = { el: wrap, onClose: opts.onClose };
      modals.push(entry);
      const close = (val) => {
        const i = modals.indexOf(entry);
        if (i >= 0) modals.splice(i, 1);
        wrap.remove();
        if (entry.onClose) entry.onClose(val);
      };
      entry.close = close;
      wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && !opts.sticky) close(null); });
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-modal-close]');
        if (b) close(b.dataset.modalClose === '' ? null : b.dataset.modalClose);
      });
      const f = wrap.querySelector('input:not([type=hidden]),textarea,select,button.primary-btn');
      if (f) setTimeout(() => f.focus(), 30);
      return { el: wrap, close };
    },
    closeTop() { const m = modals[modals.length - 1]; if (m) m.close(null); return !!m; },
    hasModal: () => modals.length > 0,

    confirm({ title, message, confirmLabel, danger }) {
      return new Promise((resolve) => {
        const m = ui.modal(
          '<h3>' + esc(title || 'Are you sure?') + '</h3><p class="modal-text">' + (message || '') + '</p>' +
          '<div class="modal-actions"><button class="secondary-btn" data-modal-close="">Cancel</button>' +
          '<button class="' + (danger ? 'danger-btn' : 'primary-btn') + '" data-modal-close="yes">' + esc(confirmLabel || 'Confirm') + '</button></div>',
          { onClose: (v) => resolve(v === 'yes') }
        );
        const b = m.el.querySelector('[data-modal-close="yes"]'); if (b) b.focus();
      });
    },
    alert(title, html) {
      return new Promise((resolve) => {
        ui.modal('<h3>' + esc(title) + '</h3><div class="modal-text">' + html + '</div><div class="modal-actions"><button class="primary-btn" data-modal-close="ok">OK</button></div>', { wide: true, onClose: resolve });
      });
    },
    menu({ title, items }) {
      return new Promise((resolve) => {
        const list = items.map((it) =>
          it.sep ? '<hr>' : '<button class="menu-item' + (it.danger ? ' danger' : '') + '" data-modal-close="' + esc(it.id) + '">' + esc(it.label) + '</button>').join('');
        ui.modal('<h3>' + esc(title || 'Options') + '</h3><div class="menu-list">' + list + '</div>', { onClose: resolve });
      });
    },
    /* fields: [{name,label,type:text|textarea|number|select|checkbox|swatch|image,value,options,placeholder,help,required,rows,min,max}] */
    form({ title, intro, fields, submitLabel, validate, danger }) {
      return new Promise((resolve) => {
        const rows = fields.map((f) => {
          const id = 'f_' + f.name;
          let input;
          const v = f.value == null ? '' : f.value;
          if (f.type === 'textarea') input = '<textarea id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>';
          else if (f.type === 'select') input = '<select id="' + id + '" name="' + f.name + '">' + f.options.map((o) => { const ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? o.label : o; return '<option value="' + esc(ov) + '"' + (String(ov) === String(v) ? ' selected' : '') + '>' + esc(ol) + '</option>'; }).join('') + '</select>';
          else if (f.type === 'checkbox') input = '<label class="check"><input type="checkbox" id="' + id + '" name="' + f.name + '"' + (v ? ' checked' : '') + '> <span>' + esc(f.checkLabel || f.label) + '</span></label>';
          else if (f.type === 'swatch') input = '<div class="swatches" data-swatch="' + f.name + '">' + f.options.map((c) => '<button type="button" class="swatch' + (c === v ? ' on' : '') + '" data-color="' + esc(c) + '" style="background:' + esc(c) + '" aria-label="' + esc(c) + '"></button>').join('') + '</div><input type="hidden" name="' + f.name + '" value="' + esc(v) + '">';
          else if (f.type === 'image') input = '<input type="file" accept="image/*" id="' + id + '" data-image="' + f.name + '"><input type="hidden" name="' + f.name + '" value="' + esc(v) + '">' + (v ? '<label class="check"><input type="checkbox" data-image-clear="' + f.name + '"> <span>Remove current image</span></label>' : '');
          else input = '<input id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || '') + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + '>';
          const label = f.type === 'checkbox' ? '' : '<label for="' + id + '">' + esc(f.label) + (f.required ? ' *' : '') + '</label>';
          return '<div class="field">' + label + input + (f.help ? '<small>' + esc(f.help) + '</small>' : '') + '</div>';
        }).join('');
        const m = ui.modal(
          '<form novalidate><h3>' + esc(title) + '</h3>' + (intro ? '<p class="modal-text">' + intro + '</p>' : '') + rows +
          '<p class="form-error hidden"></p><div class="modal-actions"><button type="button" class="secondary-btn" data-modal-close="">Cancel</button><button type="submit" class="' + (danger ? 'danger-btn' : 'primary-btn') + '">' + esc(submitLabel || 'Save') + '</button></div></form>',
          { onClose: (v) => { if (v !== '__ok') resolve(null); } }
        );
        const form = m.el.querySelector('form');
        form.addEventListener('click', (e) => {
          const sw = e.target.closest('.swatch');
          if (!sw) return;
          const wrap = sw.parentElement;
          wrap.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === sw));
          form.elements[wrap.dataset.swatch].value = sw.dataset.color;
        });
        form.addEventListener('change', async (e) => {
          const fi = e.target.closest('[data-image]');
          if (!fi || !fi.files[0]) return;
          try { form.elements[fi.dataset.image].value = await fileToDataUrl(fi.files[0], 480); }
          catch (err) { showErr(err.message); }
        });
        const errEl = form.querySelector('.form-error');
        function showErr(msg) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const out = {};
          for (const f of fields) {
            const el = form.elements[f.name];
            let val = f.type === 'checkbox' ? el.checked : el.value;
            if (f.type === 'number') val = val === '' ? null : Number(val);
            if (typeof val === 'string' && f.type !== 'textarea') val = val.trim();
            if (f.type === 'image') { const clr = form.querySelector('[data-image-clear="' + f.name + '"]'); if (clr && clr.checked) val = ''; }
            if (f.required && (val === '' || val == null)) { showErr(f.label + ' is required.'); el.focus(); return; }
            out[f.name] = val;
          }
          if (validate) { const msg = validate(out); if (msg) { showErr(msg); return; } }
          m.close('__ok'); resolve(out);
        });
      });
    },
  };

  /* Action registry for [data-action] delegation */
  const actions = {};
  const registry = {
    register(map) { Object.assign(actions, map); },
    run(name, el, ev) {
      const fn = actions[name];
      if (!fn) { console.error('No handler registered for action "' + name + '"'); ui.toast('This control is not wired up (' + name + ').', 'error'); return; }
      return fn(el, ev);
    },
  };

  OL.utils = { $, $$, esc, uid, nid, bus, debounce, shuffle, hashString, dayKey, dayDiff, fmtDate, relTime, fmtDuration, fmtPct, plural, clamp, download, copyText, readFileText, fileToDataUrl };
  OL.ui = ui;
  OL.actions = registry;
})();
