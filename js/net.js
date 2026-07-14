// ============================================================
// Net — เลเยอร์ซิงก์ข้อมูล: Firebase Realtime Database
// หรือโหมดทดสอบในเครื่อง (BroadcastChannel + localStorage)
// API: init, set, update, push, once, on, off, remove, now
// path เป็นสตริงคั่นด้วย "/" เช่น "rooms/123456/players/p1"
// ============================================================

const Net = (() => {
  const isLocal = FIREBASE_CONFIG.apiKey.startsWith('PASTE');
  let timeOffset = 0;

  // ---------------- Firebase backend ----------------
  const fb = {
    db: null,
    init() {
      firebase.initializeApp(FIREBASE_CONFIG);
      this.db = firebase.database();
      this.db.ref('.info/serverTimeOffset').on('value', s => { timeOffset = s.val() || 0; });
    },
    set: (p, v) => firebase.database().ref(p).set(v),
    update: (p, o) => firebase.database().ref(p).update(o),
    remove: (p) => firebase.database().ref(p).remove(),
    push: (p, v) => firebase.database().ref(p).push(v),
    once: (p) => firebase.database().ref(p).once('value').then(s => s.val()),
    on: (p, cb) => {
      const ref = firebase.database().ref(p);
      const h = ref.on('value', s => cb(s.val()));
      return () => ref.off('value', h);
    },
    onDisconnectSet: (p, v) => firebase.database().ref(p).onDisconnect().set(v),
  };

  // ---------------- Local backend (ทดสอบหลายแท็บในเครื่องเดียว) ----------------
  const LS_KEY = 'ayn-localdb';
  const local = {
    bc: null,
    listeners: [], // {path, cb}
    tree() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } },
    save(t) { localStorage.setItem(LS_KEY, JSON.stringify(t)); },
    getAt(t, p) {
      let cur = t;
      for (const k of p.split('/').filter(Boolean)) {
        if (cur == null || typeof cur !== 'object') return null;
        cur = cur[k];
      }
      return cur === undefined ? null : cur;
    },
    setAt(t, p, v) {
      const ks = p.split('/').filter(Boolean);
      let cur = t;
      for (let i = 0; i < ks.length - 1; i++) {
        if (typeof cur[ks[i]] !== 'object' || cur[ks[i]] === null) cur[ks[i]] = {};
        cur = cur[ks[i]];
      }
      if (v === null) delete cur[ks[ks.length - 1]];
      else cur[ks[ks.length - 1]] = v;
    },
    init() {
      this.bc = ('BroadcastChannel' in window) ? new BroadcastChannel('ayn-game') : null;
      if (this.bc) this.bc.onmessage = (e) => this.notify(e.data.path);
      window.addEventListener('storage', (e) => { if (e.key === LS_KEY) this.notify(''); });
    },
    broadcast(path) {
      if (this.bc) this.bc.postMessage({ path });
      this.notify(path);
    },
    notify(path) {
      const t = this.tree();
      for (const l of this.listeners) {
        if (path === '' || l.path.startsWith(path) || path.startsWith(l.path)) {
          l.cb(this.getAt(t, l.path));
        }
      }
    },
    set(p, v) { const t = this.tree(); this.setAt(t, p, v); this.save(t); this.broadcast(p); return Promise.resolve(); },
    update(p, o) {
      const t = this.tree();
      for (const k in o) this.setAt(t, p + '/' + k, o[k]);
      this.save(t); this.broadcast(p); return Promise.resolve();
    },
    remove(p) { return this.set(p, null); },
    push(p, v) {
      const key = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      this.set(p + '/' + key, v);
      return Promise.resolve({ key });
    },
    once(p) { return Promise.resolve(this.getAt(this.tree(), p)); },
    on(p, cb) {
      const l = { path: p, cb };
      this.listeners.push(l);
      Promise.resolve().then(() => cb(this.getAt(this.tree(), p)));
      return () => { this.listeners = this.listeners.filter(x => x !== l); };
    },
    onDisconnectSet() { /* ไม่รองรับในโหมดทดสอบ */ },
  };

  const be = isLocal ? local : fb;

  return {
    isLocal,
    init() { be.init(); },
    set: (p, v) => be.set(p, v),
    update: (p, o) => be.update(p, o),
    remove: (p) => be.remove(p),
    push: (p, v) => be.push(p, v),
    once: (p) => be.once(p),
    on: (p, cb) => be.on(p, cb),
    onDisconnectSet: (p, v) => be.onDisconnectSet && be.onDisconnectSet(p, v),
    now: () => Date.now() + timeOffset,
  };
})();
