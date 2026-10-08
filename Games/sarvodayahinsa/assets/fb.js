/* ── सर्वोदय अहिंसा — data layer ───────────────────────────────────
   Every page talks to SA.db, never to firebase directly. SA.db has two
   backends behind one interface:

     live  — Firebase Realtime Database (same project as KBS)
     demo  — a local tree in localStorage, switched on with ?demo=1

   The demo backend is not a toy. It is how you rehearse an entire show
   on a laptop with no internet, and how the game logic gets tested
   without touching the live database.
   ────────────────────────────────────────────────────────────────── */
window.SA = window.SA || {};

/* ---------- tiny shared helpers ---------- */
SA.$   = id => document.getElementById(id);
SA.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
            c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

SA.qs = (k, d) => new URLSearchParams(location.search).get(k) || d || '';
SA.DEMO = SA.qs('demo') === '1';

SA.uid4 = () => 'x'.replace(/x/, '') +
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* A–Z0–9 minus the characters people mishear on a microphone (O/0, I/1, S/5). */
SA.code = (n = 5) => {
  const A = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
  let s = ''; for (let i = 0; i < n; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
};

SA.clean = (s, n = 40) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

SA.toast = (msg, isErr) => {
  let t = SA.$('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.toggle('err', !!isErr);
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
};

/* Deterministic shuffle — same seed gives the same order on every device.
   Used so a phone and the projector agree on a shuffled option order. */
SA.shuffle = (arr, seed) => {
  const a = arr.slice();
  let s = 0;
  if (seed == null) s = Math.floor(Math.random() * 2 ** 31);
  else for (let i = 0; i < String(seed).length; i++) s = (s * 31 + String(seed).charCodeAt(i)) | 0;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

SA.fmtTime = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s < 60 ? String(s) : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/* ═══════════════════════════════════════════════════════════════
   LOCAL BACKEND — an RTDB-shaped tree kept in localStorage
   ═══════════════════════════════════════════════════════════════ */
SA.local = (function () {
  const KEY = 'sa.demo.db';

  /* Read straight back from storage before every write. Rehearsal runs in
     several tabs at once — host, projector, a phone — and if each tab kept
     its own copy of the whole tree and wrote it back wholesale, the last
     tab to save would silently erase the others' work. */
  function fresh() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch (e) { return {}; }
  }

  let tree = fresh();

  const seg = p => String(p || '').split('/').filter(Boolean);

  function getAt(p) {
    let n = tree;
    for (const k of seg(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
    return n === undefined ? null : n;
  }

  function writeAt(t, p, v) {
    const s = seg(p);
    if (!s.length) return;
    let n = t;
    for (let i = 0; i < s.length - 1; i++) {
      if (n[s[i]] == null || typeof n[s[i]] !== 'object') n[s[i]] = {};
      n = n[s[i]];
    }
    /* RTDB semantics: writing null deletes the key entirely */
    if (v == null) delete n[s[s.length - 1]];
    else n[s[s.length - 1]] = v;
  }

  /* Rehearsal has to work the way the real show does: host window here,
     projector window there, a phone-sized window next to them. Every write
     is announced to the other tabs, which re-read and fire their own
     listeners. Without this, demo mode would only drive the page you are
     looking at. */
  let chan = null;
  try { chan = new BroadcastChannel('sa.demo'); } catch (e) {}

  /* One read-modify-write, no debounce. Delaying the save is exactly what
     opens the window for another tab to overwrite it. */
  function commit(mutate, path) {
    tree = fresh();
    mutate(tree);
    try { localStorage.setItem(KEY, JSON.stringify(tree)); }
    catch (e) { console.warn('[demo] storage full', e); }
    if (chan) { try { chan.postMessage({ path: path || '' }); } catch (e) {} }
    notify(path);
  }

  function adopt(path) {
    tree = fresh();
    notify(path || '');
  }
  if (chan) chan.onmessage = e => adopt(e.data && e.data.path);
  /* BroadcastChannel is blocked in a few privacy modes; the storage event
     is the slower fallback that still works there */
  window.addEventListener('storage', e => { if (e.key === KEY) adopt(''); });

  /* listeners: path -> Set of callbacks. A write to a/b/c wakes listeners
     on a, a/b, a/b/c and anything beneath a/b/c.                        */
  const subs = new Map();

  function notify(p) {
    const s = seg(p), pre = [];
    for (let i = 0; i <= s.length; i++) pre.push(s.slice(0, i).join('/'));
    const changed = s.join('/');
    for (const [path, set] of subs) {
      const isAncestorOrSelf = pre.includes(path);
      const isBeneath = path === '' || path.startsWith(changed + '/') || changed === '';
      if (isAncestorOrSelf || isBeneath) {
        const v = getAt(path);
        /* async, so a write inside a listener cannot re-enter this loop */
        set.forEach(cb => setTimeout(() => cb(v), 0));
      }
    }
  }

  /* A one-off read must not serve a value another tab has already changed
     but whose broadcast has not landed yet, so once() goes to storage. */
  function getFresh(p) {
    let n = fresh();
    for (const k of seg(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
    return n === undefined ? null : n;
  }

  return {
    get: getAt,
    getFresh,
    set(p, v) { commit(t => writeAt(t, p, v), p); },
    update(p, obj) {
      commit(t => Object.keys(obj || {}).forEach(k => writeAt(t, p + '/' + k, obj[k])), p);
    },
    push(p, v) {
      const id = '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      commit(t => writeAt(t, p + '/' + id, v), p);
      return id;
    },
    on(p, cb) {
      if (!subs.has(p)) subs.set(p, new Set());
      subs.get(p).add(cb);
      setTimeout(() => cb(getAt(p)), 0);
      return () => { const s = subs.get(p); if (s) s.delete(cb); };
    },
    wipe() {
      tree = {};
      try { localStorage.removeItem(KEY); } catch (e) {}
      if (chan) { try { chan.postMessage({ path: '' }); } catch (e) {} }
      notify('');
    }
  };
})();

/* ═══════════════════════════════════════════════════════════════
   UNIFIED DB
   ═══════════════════════════════════════════════════════════════ */
SA.db = (function () {

  const CONFIG = {
    apiKey: "AIzaSyBvFw7TNIflcBbms-K4sk_jrqgdzYYJKok",
    authDomain: "kounbanegasiddhatma.firebaseapp.com",
    databaseURL: "https://kounbanegasiddhatma-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "kounbanegasiddhatma",
    storageBucket: "kounbanegasiddhatma.firebasestorage.app",
    messagingSenderId: "53011686572",
    appId: "1:53011686572:web:f9b02eb2aed988c9ed6b09"
  };

  let rtdb = null, fbAuth = null, offset = 0;

  let offline = false;

  if (!SA.DEMO) {
    if (typeof firebase === 'undefined') {
      /* Not necessarily a fault: tickets.html prints perfectly well with no
         network and no SDK. So note it quietly here, and only complain if
         something actually reaches for the database (see ref below). */
      offline = true;
      console.info('[SA] running without the Firebase SDK — offline-only page');
    } else {
      if (!firebase.apps.length) firebase.initializeApp(CONFIG);
      rtdb   = firebase.database();
      fbAuth = firebase.auth();
      rtdb.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
    }
  }

  /* Clock every device agrees on. Speed scoring is meaningless without it —
     a phone five seconds fast would win every buzzer round. */
  const now = () => Date.now() + offset;

  const STAMP = () => SA.DEMO ? Date.now() : firebase.database.ServerValue.TIMESTAMP;

  /* ---------- ref ---------- */
  function ref(path) {
    const p = String(path).replace(/^\/+|\/+$/g, '');

    if (offline) {
      throw new Error('[SA] this page needs the Firebase SDK — add the three compat scripts before fb.js');
    }

    if (SA.DEMO) {
      let stops = [];
      return {
        path: p,
        on(cb)        { stops.push(SA.local.on(p, cb)); return cb; },
        off()         { stops.forEach(f => f()); stops = []; },
        once()        { return Promise.resolve(SA.local.getFresh(p)); },
        set(v)        { SA.local.set(p, v); return Promise.resolve(); },
        update(o)     { SA.local.update(p, o); return Promise.resolve(); },
        push(v)       { const id = SA.local.push(p, v); return Promise.resolve(id); },
        remove()      { SA.local.set(p, null); return Promise.resolve(); },
        onDisconnect(){ return { set(){ return Promise.resolve(); }, remove(){ return Promise.resolve(); }, cancel(){ return Promise.resolve(); } }; }
      };
    }

    const r = rtdb.ref(p);
    return {
      path: p,
      raw: r,
      on(cb)    { r.on('value', s => cb(s.val())); return cb; },
      off()     { r.off(); },
      once()    { return r.once('value').then(s => s.val()); },
      set(v)    { return r.set(v); },
      update(o) { return r.update(o); },
      push(v)   { const c = r.push(); return c.set(v).then(() => c.key); },
      remove()  { return r.remove(); },
      onDisconnect(){ return r.onDisconnect(); }
    };
  }

  /* Detachable listener groups — call group.off() on teardown and no
     listener from the previous session can fire into the new one.      */
  function group() {
    const refs = [];
    return {
      on(path, cb) { const r = ref(path); r.on(cb); refs.push(r); return r; },
      add(r) { refs.push(r); return r; },
      off() { refs.forEach(r => r.off()); refs.length = 0; }
    };
  }

  return { ref, group, now, STAMP, CONFIG,
           get rtdb() { return rtdb; }, get auth() { return fbAuth; } };
})();

/* ═══════════════════════════════════════════════════════════════
   AUTH  — same accounts as KBS, same admins/<uid> node
   ═══════════════════════════════════════════════════════════════ */
SA.auth = (function () {

  let user = null, isAdmin = false;
  /* `user === null` means two different things — "not known yet" and
     "known to be signed out" — and onAuthStateChanged fires only once at
     startup. A page that registers its listener a moment too late would
     then never hear anything and sit on "connecting…" forever. So track
     whether auth has actually resolved, separately from who it resolved to. */
  let resolved = false;
  const listeners = new Set();

  const IS_LOCAL = location.protocol === 'file:' ||
                   /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  function fire() { listeners.forEach(cb => cb(user, isAdmin)); }

  function onUser(cb) {
    listeners.add(cb);
    if (resolved) cb(user, isAdmin);
    return () => listeners.delete(cb);
  }

  if (SA.DEMO) {
    /* Rehearsal: nobody signs in and everybody is the owner. The id is
       per tab (sessionStorage), not per browser, so the host window and
       three phone windows count as four different people — otherwise a
       rehearsal could only ever have one player. It survives a reload of
       that tab, so refreshing a "phone" does not kick it out. */
    let id;
    try {
      id = sessionStorage.getItem('sa.demo.uid');
      if (!id) { id = 'demo-' + SA.uid4(); sessionStorage.setItem('sa.demo.uid', id); }
    } catch (e) { id = 'demo-' + SA.uid4(); }
    user = { uid: id, email: 'demo@local', isAnonymous: false, displayName: 'Demo' };
    isAdmin = true;
    resolved = true;
    setTimeout(fire, 0);
  } else if (SA.db.auth) {
    SA.db.auth.onAuthStateChanged(u => {
      user = u;
      if (!u) { isAdmin = false; resolved = true; fire(); return; }
      SA.db.ref('admins/' + u.uid).once()
        .then(v => { isAdmin = v === true; resolved = true; fire(); })
        .catch(() => { isAdmin = false; resolved = true; fire(); });
    });
  }

  const signIn  = (email, pass) => SA.db.auth.signInWithEmailAndPassword(email, pass);
  const signOut = () => SA.DEMO ? Promise.resolve() : SA.db.auth.signOut();
  /* audience: no account, no password, no personal data collected */
  const signInAnon = () => SA.DEMO ? Promise.resolve() : SA.db.auth.signInAnonymously();

  const errText = e => ({
    'auth/invalid-credential'   : 'Wrong email or password.',
    'auth/wrong-password'       : 'Wrong password.',
    'auth/user-not-found'       : 'No host account with that email.',
    'auth/invalid-email'        : 'That is not a valid email address.',
    'auth/too-many-requests'    : 'Too many attempts. Wait a minute and try again.',
    'auth/user-disabled'        : 'That account has been disabled by the owner.',
    'auth/network-request-failed':'No internet. Check the connection and try again.',
    'auth/operation-not-allowed': 'That sign-in method is turned off in the Firebase console.'
  }[e && e.code] || (e && e.message) || 'Sign-in failed.');

  return {
    onUser, signIn, signOut, signInAnon, errText, IS_LOCAL,
    get user()    { return user; },
    get uid()     { return user && user.uid; },
    get isAdmin() { return isAdmin; }
  };
})();

/* ═══════════════════════════════════════════════════════════════
   AUDIENCE PROFILE

   Deliberately not an account. No password, no email, nothing on a
   server — just the name and city kept on this device, so that after
   the first time a person never fills the join form again. Anonymous
   auth already gives the browser a stable id, so their score follows
   them too. Entirely optional: anyone can still join as a guest.
   ═══════════════════════════════════════════════════════════════ */
SA.profile = (function () {
  const KEY = 'sa.player';

  function get() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || 'null');
      return p && p.name ? p : null;
    } catch (e) { return null; }
  }

  /* Phone and age are personal data, so they are stored the same way the
     name is — on this device only — and copied into a show only when the
     person actually joins one that asks for them. */
  function save(name, city, phone, age) {
    const p = {
      name:  SA.clean(name, 40),
      city:  SA.clean(city, 40),
      phone: String(phone == null ? '' : phone).replace(/[^0-9]/g, '').slice(0, 15),
      age:   Number(age) || 0,
      at: Date.now()
    };
    if (!p.name) return null;
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('sa:profile', { detail: p }));
    return p;
  }

  /* what the rules will actually accept */
  const validPhone = v => /^[0-9]{7,15}$/.test(String(v || '').replace(/[^0-9]/g, ''));
  const validAge   = v => Number(v) >= 3 && Number(v) <= 120;

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    document.dispatchEvent(new CustomEvent('sa:profile', { detail: null }));
  }

  return { get, save, clear, validPhone, validAge };
})();

/* ═══════════════════════════════════════════════════════════════
   SHARED CHROME — header, mode toggle, gate
   ═══════════════════════════════════════════════════════════════ */
SA.ui = (function () {

  /* One row of links so a host can move between the pages without going
     back to the home page and hunting. The current page is marked and
     not a link, so nobody reloads the page they are already on mid-show. */
  function navBar() {
    const here = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const items = [
      { k: 'index',     href: 'index.html',     icon: '🏠', label: 'acct.home' },
      { k: 'host',      href: 'host.html',      icon: '🎛️', label: 'home.host_panel' },
      { k: 'studio',    href: 'studio.html',    icon: '🛠️', label: 'home.studio' },
      { k: 'dashboard', href: 'dashboard.html', icon: '📊', label: 'home.dashboard' },
      { k: 'tickets',   href: 'tickets.html',   icon: '🎟️', label: 'home.tickets' }
    ];
    return `<nav class="hdr-nav no-print">${items.map(i => i.k === here
      ? `<span class="on">${i.icon} <span class="lbl">${SA.esc(SA.t(i.label))}</span></span>`
      : `<a href="${i.href}">${i.icon} <span class="lbl">${SA.esc(SA.t(i.label))}</span></a>`
    ).join('')}</nav>`;
  }

  function header(opts) {
    const o = opts || {};
    const b = SA.brand;
    return `
      <header class="hdr no-print">
        <div class="in">
          <a href="index.html" title="${SA.esc(b.name)}" style="display:flex;align-items:center;gap:10px">
            <img class="logo" src="${b.logo}" alt="">
            <span>
              <span class="brand-n">${SA.esc(o.title || b.name)}</span>
              <span class="brand-s" style="display:block">${SA.esc(o.sub || SA.t('tagline'))}</span>
            </span>
          </a>
          ${o.nav === false ? '' : navBar()}
          <div class="grow"></div>
          <div class="row" id="hdr-slot" style="gap:8px"></div>
          <button class="btn sm ghost" id="lang-btn" title="भाषा / Language">${SA.t('lang_toggle')}</button>
          <button class="btn sm ghost" id="mode-btn" title="${SA.t('theme_toggle')}">◐</button>
        </div>
      </header>`;
  }

  /* Wires the two header buttons. Switching language re-runs whatever the
     page passed as `redraw`, so a change is instant and does not need a
     reload that would lose the show's state. */
  function wireMode(redraw) {
    SA.theme.apply(SA.theme.current || null, SA.theme.savedMode());
    const m = SA.$('mode-btn');
    if (m) m.onclick = () => SA.theme.toggleMode();
    const l = SA.$('lang-btn');
    if (l) l.onclick = () => SA.i18n.toggle();

    SA.i18n.onChange(() => {
      const hdr = document.querySelector('.hdr');
      if (hdr) {
        const nb = hdr.querySelector('.brand-s');
        if (nb && !nb.dataset.fixed) nb.textContent = SA.t('tagline');
        const lb = SA.$('lang-btn');
        if (lb) lb.textContent = SA.t('lang_toggle');
        const mb = SA.$('mode-btn');
        if (mb) mb.title = SA.t('theme_toggle');
      }
      if (typeof redraw === 'function') redraw();
    });
  }

  /* Full-screen blocker used by host/studio until auth resolves. */
  function gate(html) {
    let g = SA.$('sa-gate');
    if (!g) {
      g = document.createElement('div');
      g.id = 'sa-gate'; g.className = 'ovl';
      document.body.appendChild(g);
    }
    g.innerHTML = `<div class="box card">${html}</div>`;
    g.style.display = 'grid';
    return g;
  }
  function closeGate() { const g = SA.$('sa-gate'); if (g) g.style.display = 'none'; }

  function spinner(msg) {
    return `<div class="col center" style="gap:16px;padding:18px 6px">
              <div class="spin"></div>
              <div class="mut">${SA.esc(msg || SA.t('connecting'))}</div>
            </div>`;
  }

  /* The sign-in card, reused by host.html, studio.html and dashboard.html. */
  function loginForm(msg, isErr) {
    return `
      <div class="col" style="gap:14px">
        <div class="row" style="gap:12px">
          <img src="${SA.brand.logo}" class="logo" style="height:46px" alt="">
          <div><h2 style="font-size:20px">${SA.t('gate.title')}</h2>
               <div class="sm mut">${SA.esc(SA.brand.name)}</div></div>
        </div>
        <div id="gate-msg" class="sm" style="color:${isErr ? 'var(--bad)' : 'var(--tx-mut)'}">
          ${msg || SA.t('gate.hint')}
        </div>
        <form id="gate-form" class="col" style="gap:10px">
          <div><label class="f">${SA.t('gate.email')}</label>
            <input type="email" id="lg-email" autocomplete="username" required></div>
          <div><label class="f">${SA.t('gate.password')}</label>
            <input type="password" id="lg-pass" autocomplete="current-password" required></div>
          <button class="btn p wide" id="lg-btn" type="submit">🔓 ${SA.t('gate.signin')}</button>
        </form>
        <div class="tc sm mut">${SA.t('gate.audience')}
          <a href="index.html">${SA.t('gate.join_code')}</a>.</div>
      </div>`;
  }

  /* Shows the gate, resolves once an admin is signed in. */
  function requireAdmin() {
    return new Promise(resolve => {
      gate(spinner());

      const showLogin = (msg, isErr) => {
        gate(loginForm(msg, isErr));
        const f = SA.$('gate-form');
        f.onsubmit = ev => {
          ev.preventDefault();
          const btn = SA.$('lg-btn');
          btn.disabled = true; btn.textContent = SA.t('gate.signing');
          SA.auth.signIn(SA.$('lg-email').value.trim(), SA.$('lg-pass').value)
            .catch(e => showLogin('<b>' + SA.esc(SA.auth.errText(e)) + '</b>', true));
        };
      };

      SA.auth.onUser((u, admin) => {
        if (u && admin) { closeGate(); resolve(u); return; }

        /* An anonymous user is an audience member who wandered in from the
           home page — that page signs everyone in anonymously so it can read
           the public lists. Showing them "add this UID to admins" is useless;
           what they need is the sign-in form. Only a REAL account that lacks
           rights gets the UID screen. */
        if (!u || u.isAnonymous) {
          showLogin(u && u.isAnonymous ? SA.t('gate.anon_note') : null);
          return;
        }

        gate(`
          <div class="col" style="gap:13px">
            <h2 style="font-size:19px">${SA.t('gate.nothost')}</h2>
            <div class="sm">${SA.t('gate.nothost_b', { x: '<b>' + SA.esc(u.email || u.uid) + '</b>' })}</div>
            <div class="sm mut">${SA.t('gate.uid_note')}</div>
            <code class="sub" style="word-break:break-all;font-size:12px">${SA.esc(u.uid)}</code>
            <div class="row" style="gap:8px">
              <button class="btn" onclick="location.reload()">↻ ${SA.t('reload')}</button>
              <button class="btn ghost" onclick="SA.auth.signOut().then(()=>location.reload())">${SA.t('signout')}</button>
            </div>
          </div>`);
      });
    });
  }

  /* The account chip every host-side page puts in its header. Signing out
     used to mean navigating back to the home page to find the button. */
  function accountChip() {
    const u = SA.auth.user;
    const who = (u && (u.email || u.uid)) || '';
    return `
      <span class="pill" id="acct-chip" title="${SA.esc(SA.t('acct.signed_as'))}: ${SA.esc(who)}"
            style="cursor:pointer;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        👤 ${SA.esc(who.split('@')[0] || SA.t('acct.title'))}
      </span>`;
  }

  function wireAccount() {
    const chip = SA.$('acct-chip');
    if (!chip) return;
    chip.onclick = () => {
      const u = SA.auth.user;
      const el = document.createElement('div');
      el.className = 'ovl';
      el.innerHTML = `
        <div class="box card col" style="gap:13px">
          <div class="row" style="gap:11px">
            <img src="${SA.brand.logo}" style="height:38px" alt="">
            <div><h3 style="font-size:18px">${SA.esc(SA.t('acct.title'))}</h3>
              <div class="sm mut">${SA.esc(SA.t('acct.signed_as'))}</div></div>
          </div>
          <div class="sub" style="word-break:break-all">
            <b>${SA.esc((u && (u.email || u.uid)) || '')}</b></div>
          <div class="sm mut">${SA.esc(SA.t('acct.body'))}</div>
          <div class="row wrap-r" style="gap:8px;justify-content:flex-end">
            <a class="btn ghost" href="index.html">🏠 ${SA.esc(SA.t('acct.home'))}</a>
            <button class="btn ghost" data-no>${SA.esc(SA.t('close'))}</button>
            <button class="btn bad" data-out>${SA.esc(SA.t('acct.switch'))}</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      el.querySelector('[data-no]').onclick = () => el.remove();
      el.onclick = e => { if (e.target === el) el.remove(); };
      el.querySelector('[data-out]').onclick = () =>
        SA.auth.signOut().then(() => location.href = 'index.html');
    };
  }

  function confirm(title, body, okLabel) {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'ovl';
      el.innerHTML = `
        <div class="box card col" style="gap:14px">
          <h3 style="font-size:18px">${SA.esc(title)}</h3>
          <div class="sm mut">${body || ''}</div>
          <div class="row" style="justify-content:flex-end;gap:8px">
            <button class="btn ghost" data-no>${SA.t('cancel')}</button>
            <button class="btn bad" data-yes>${SA.esc(okLabel || SA.t('confirm'))}</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      const done = v => { el.remove(); resolve(v); };
      el.querySelector('[data-no]').onclick = () => done(false);
      el.querySelector('[data-yes]').onclick = () => done(true);
      el.onclick = e => { if (e.target === el) done(false); };
    });
  }

  /* Banner so nobody mistakes a rehearsal for the real show. */
  function demoBanner() {
    if (!SA.DEMO) return '';
    return `<div class="no-print" style="background:var(--accent);color:var(--on-accent);
      text-align:center;padding:5px;font:700 12.5px var(--fd);letter-spacing:.06em">
      REHEARSAL MODE — saved on this device only, nothing is live
      <a href="${location.pathname}" style="color:inherit;text-decoration:underline;margin-left:10px">exit</a>
    </div>`;
  }

  return { header, wireMode, gate, closeGate, spinner, loginForm, requireAdmin, confirm, demoBanner,
           accountChip, wireAccount };
})();
