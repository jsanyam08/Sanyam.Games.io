/* ── सर्वोदय अहिंसा — engine ───────────────────────────────────────
   Three things live here:

     SA.types   the registry every game type plugs into
     SA.game    reading and writing a game definition (Studio)
     SA.sess    running a live session — venues, players, teams, scoring

   Adding a new game type means adding one file under assets/types/ that
   calls SA.types.register(). Nothing in host/screen/play needs editing.
   ────────────────────────────────────────────────────────────────── */
window.SA = window.SA || {};

/* ═══════════════════════════════════════════════════════════════
   TYPE REGISTRY

   A type module may implement any of these. Everything is optional —
   a missing hook just means that surface shows nothing for this type.

     key, label, hi, icon, blurb
     defaults()                     round-level config
     newItem()                      a blank content item
     itemSummary(item)              one line for the Studio list
     editItem(box, item, ctx)       Studio: edit one item      ctx.change()
     configForm(box, round, ctx)    Studio: round settings     ctx.change()
     hostPanel(box, ctx)            Host: the controller
     screenView(box, ctx)           Projector
     playerView(box, ctx)           Phone
     payload(item, live, round)     what is safe to publish right now
     check(item, value)             true / false / null (not auto-checkable)
     score(item, value, ms, round)  points for one correct answer
     autoAssign(ctx)                called by host when a player joins
   ═══════════════════════════════════════════════════════════════ */
SA.types = (function () {
  const reg = {};
  const order = [];

  function register(mod) {
    reg[mod.key] = mod;
    if (!order.includes(mod.key)) order.push(mod.key);
  }
  const get  = k => reg[k] || null;
  const list = () => order.map(k => reg[k]);
  const has  = k => !!reg[k];

  /* A type's display name and blurb come from the dictionary, not from the
     module, so they follow the interface language. The module's own
     `label` is only the English fallback if a key is ever missing. */
  const name  = k => SA.t('ty.' + k) === ('ty.' + k) ? ((reg[k] && reg[k].label) || k) : SA.t('ty.' + k);
  const blurb = k => SA.t('ty.' + k + '.b') === ('ty.' + k + '.b') ? '' : SA.t('ty.' + k + '.b');

  /* Calls a hook only if the type defines it, so callers stay free of
     `if (t && t.hostPanel)` noise at every site. */
  function call(typeKey, hook, ...args) {
    const t = reg[typeKey];
    if (!t || typeof t[hook] !== 'function') return null;
    try { return t[hook](...args); }
    catch (e) { console.error(`[SA] ${typeKey}.${hook} failed`, e); return null; }
  }

  return { register, get, list, has, call, name, blurb };
})();

/* ═══════════════════════════════════════════════════════════════
   GAME DEFINITIONS
   ═══════════════════════════════════════════════════════════════ */
SA.game = (function () {

  const P = id => 'sa/games/' + id;

  function blank(type, title) {
    const t = SA.types.get(type);
    return {
      info: {
        title: title || SA.t('def.new_game'),
        subtitle: '',
        type,
        icon: (t && t.icon) || '🎯',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        published: false,
        owner: SA.auth.uid || 'demo-host'
      },
      theme: { preset: SA.theme.DEFAULT },
      config: Object.assign({
        playMode: 'both',          // stage teams + public phones
        teamCount: 5,
        teamNames: [1,2,3,4,5].map(n => SA.t('def.group_n', { x: n })),
        timerDefault: 30,
        pointsCorrect: 10,
        pointsWrong: 0,
        speedBonus: 0,             // extra points for the fastest, tapering to 0
        showLeaderboard: true,
        /* what the join form asks for: 'off' | 'opt' | 'req'.
           All three are asked by default, matching how कौन बनेगा सिद्धात्मा
           has always collected name, age and mobile. They are optional
           rather than required so a blank field never stops someone
           joining mid-show; switch any of them to Required per game. */
        askCity: 'opt',
        askPhone: 'opt',
        askAge: 'opt'
      }, (t && t.defaults && t.defaults()) || {})
    };
  }

  const load    = id => SA.db.ref(P(id)).once();
  const save    = (id, g) => SA.db.ref(P(id)).update(g);
  const watch   = (id, cb) => { const r = SA.db.ref(P(id)); r.on(cb); return r; };

  async function create(g) {
    const id = await SA.db.ref('sa/games').push(g);
    await reindex(id, g);
    return id;
  }

  /* gameIndex is the only part phones and the hub can read. Keeping it
     in step by hand is the price of not running Cloud Functions.      */
  function reindex(id, g) {
    const th = SA.theme.resolve(g.theme);
    return SA.db.ref('sa/gameIndex/' + id).set({
      title: g.info.title,
      subtitle: g.info.subtitle || '',
      type: g.info.type,
      icon: g.info.icon || '🎯',
      primary: th.primary,
      bg: th.bg,
      published: !!g.info.published,
      updatedAt: Date.now()
    });
  }

  async function remove(id) {
    await SA.db.ref('sa/gameIndex/' + id).remove();
    await SA.db.ref(P(id)).remove();
  }

  async function duplicate(id) {
    const g = await load(id);
    if (!g) throw new Error('Game not found');
    g.info.title = g.info.title + ' (copy)';
    g.info.published = false;
    g.info.createdAt = g.info.updatedAt = Date.now();
    return create(g);
  }

  /* ---------- rounds ---------- */
  async function addRound(gameId, type, title) {
    const t = SA.types.get(type);
    const existing = (await SA.db.ref(P(gameId) + '/rounds').once()) || {};
    const round = {
      order: Object.keys(existing).length,
      type,
      title: title || SA.types.name(type),
      config: (t && t.defaults && t.defaults()) || {}
    };
    return SA.db.ref(P(gameId) + '/rounds').push(round);
  }

  const roundsOf = g => Object.entries((g && g.rounds) || {})
    .map(([id, r]) => Object.assign({ id }, r))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const itemsOf = (g, roundId) => Object.entries((g && g.content && g.content[roundId]) || {})
    .map(([id, it]) => Object.assign({ id }, it))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const addItem = (gameId, roundId, item) =>
    SA.db.ref(P(gameId) + '/content/' + roundId).push(item);

  const setItem = (gameId, roundId, itemId, item) =>
    SA.db.ref(P(gameId) + '/content/' + roundId + '/' + itemId).set(item);

  const delItem = (gameId, roundId, itemId) =>
    SA.db.ref(P(gameId) + '/content/' + roundId + '/' + itemId).remove();

  /* ---------- backup ---------- */
  function download(g, id) {
    const blob = new Blob([JSON.stringify({ _sa: 1, id, game: g }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (g.info.title || 'game').replace(/[^\wऀ-ॿ -]/g, '') + '.sagame.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return { blank, load, save, watch, create, reindex, remove, duplicate,
           addRound, roundsOf, itemsOf, addItem, setItem, delItem, download, P };
})();

/* ═══════════════════════════════════════════════════════════════
   LIVE SESSIONS
   ═══════════════════════════════════════════════════════════════ */
SA.sess = (function () {

  const P = sid => 'sa/sessions/' + sid;

  const TEAM_COLOURS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

  /* ---------- create ---------- */
  async function create(gameId, g, name) {
    const code = await freeCode();
    const sid = await SA.db.ref('sa/sessions').push({
      info: {
        gameId,
        title: name || g.info.title,
        type: g.info.type,
        icon: g.info.icon || '🎯',
        /* copied, not referenced: phones and projectors are not admins and
           cannot read sa/games at all, so the look of the show has to
           travel with the session */
        theme: g.theme || { preset: SA.theme.DEFAULT },
        /* the join form lives on a page that cannot read sa/games, so what
           to ask for travels with the session too */
        ask: {
          city:  (g.config && g.config.askCity)  || 'opt',
          phone: (g.config && g.config.askPhone) || 'opt',
          age:   (g.config && g.config.askAge)   || 'opt'
        },
        code,
        status: 'lobby',
        combinedBoard: false,
        createdAt: Date.now(),
        owner: SA.auth.uid || 'demo-host'
      },
      hosts: { [SA.auth.uid || 'demo-host']: { name: (SA.auth.user && SA.auth.user.email) || 'Host', role: 'owner' } }
    });
    await SA.db.ref('sa/codes/' + code).set({ sid, at: Date.now() });
    /* every session starts with one venue, so a single-hall show needs no setup */
    await addVenue(sid, g, SA.t('def.main_stage'), '');
    return { sid, code };
  }

  /* Retries on collision rather than trusting 30^5 — two shows opened in
     the same minute must never share a code. */
  async function freeCode() {
    for (let i = 0; i < 12; i++) {
      const c = SA.code(5);
      const taken = await SA.db.ref('sa/codes/' + c).once();
      if (!taken) return c;
    }
    return SA.code(7);
  }

  async function addVenue(sid, g, name, city) {
    const vid = await SA.db.ref(P(sid) + '/venues').push({
      name: name || SA.t('def.new_venue'),
      city: city || '',
      online: false,
      createdAt: Date.now()
    });
    const cfg = (g && g.config) || {};
    if (cfg.playMode !== 'public') {
      const n = Math.max(0, Math.min(8, cfg.teamCount || 0));
      const names = cfg.teamNames || [];
      for (let i = 0; i < n; i++) {
        await SA.db.ref(P(sid) + '/teams/' + vid).push({
          name: names[i] || SA.t('def.group_n', { x: i + 1 }),
          colour: TEAM_COLOURS[i % TEAM_COLOURS.length],
          score: 0,
          order: i
        });
      }
    }
    await SA.db.ref(P(sid) + '/live/' + vid).set(blankLive());
    return vid;
  }

  const blankLive = () => ({
    roundId: '', itemId: '', phase: 'idle', screen: 'logo',
    open: false, reveal: false, startAt: 0, endAt: 0, payload: null, msg: ''
  });

  /* ---------- lookups ---------- */
  const byCode = async code => {
    const v = await SA.db.ref('sa/codes/' + String(code || '').toUpperCase().trim()).once();
    return v && v.sid ? v.sid : null;
  };
  const load  = sid => SA.db.ref(P(sid)).once();
  const info  = sid => SA.db.ref(P(sid) + '/info').once();

  /* ---------- live state ---------- */
  const live      = (sid, vid, cb) => { const r = SA.db.ref(P(sid) + '/live/' + vid); r.on(cb); return r; };
  const setLive   = (sid, vid, patch) => SA.db.ref(P(sid) + '/live/' + vid).update(patch);
  const resetLive = (sid, vid) => SA.db.ref(P(sid) + '/live/' + vid).set(blankLive());

  /* Copy one venue's round pointer onto every venue — the synchronised finale. */
  async function syncAll(sid, fromVid) {
    const [venues, src] = await Promise.all([
      SA.db.ref(P(sid) + '/venues').once(),
      SA.db.ref(P(sid) + '/live/' + fromVid).once()
    ]);
    const ids = Object.keys(venues || {});
    await Promise.all(ids.map(vid =>
      vid === fromVid ? null : SA.db.ref(P(sid) + '/live/' + vid).set(Object.assign({}, src))
    ));
    return ids.length - 1;
  }

  /* ---------- players ---------- */
  function join(sid, vid, name, city, extra) {
    const uid = SA.auth.uid || ('guest-' + SA.uid4());
    /* No score here on purpose — the rules let a player write their own
       name/city/venue but never their own score. The host owns points. */
    const rec = {
      name: SA.clean(name, 40) || SA.t('guest'),
      city: SA.clean(city, 40),
      venueId: vid,
      joinedAt: Date.now()
    };
    /* Only send these if they are actually valid. The rules reject a bad
       phone or age outright, and that would fail the whole join — better
       to drop an empty optional field than to lock somebody out. */
    const e = extra || {};
    if (SA.profile.validPhone(e.phone)) rec.phone = String(e.phone).replace(/[^0-9]/g, '');
    if (SA.profile.validAge(e.age))     rec.age = Number(e.age);
    return SA.db.ref(P(sid) + '/players/' + uid).update(rec).then(() => uid);
  }

  const players = (sid, cb) => { const r = SA.db.ref(P(sid) + '/players'); r.on(cb); return r; };
  const teams   = (sid, vid, cb) => { const r = SA.db.ref(P(sid) + '/teams/' + vid); r.on(cb); return r; };

  const addTeamPoints = (sid, vid, tid, delta) => {
    const ref = SA.db.ref(P(sid) + '/teams/' + vid + '/' + tid + '/score');
    if (SA.DEMO) return ref.once().then(v => ref.set((v || 0) + delta));
    return ref.raw.transaction(v => (v || 0) + delta);
  };

  const addPlayerPoints = (sid, uid, delta) => {
    const ref = SA.db.ref(P(sid) + '/players/' + uid + '/score');
    if (SA.DEMO) return ref.once().then(v => ref.set((v || 0) + delta));
    return ref.raw.transaction(v => (v || 0) + delta);
  };

  /* ---------- answers ---------- */
  const answerPath = (sid, rid, iid) => P(sid) + '/answers/' + rid + '/' + iid;

  const submit = (sid, rid, iid, value) =>
    SA.db.ref(answerPath(sid, rid, iid) + '/' + (SA.auth.uid || 'anon'))
      .set({ v: value, at: SA.db.STAMP() });

  const watchAnswers = (sid, rid, iid, cb) => {
    const r = SA.db.ref(answerPath(sid, rid, iid));
    r.on(cb);
    return r;
  };

  /* Scores every open answer for one item, writes the points back, and
     returns the ranked list the host and screen both display.          */
  async function settle(sid, round, item, opts) {
    const o = opts || {};
    const rid = round.id, iid = item.id;
    const raw = (await SA.db.ref(answerPath(sid, rid, iid)).once()) || {};
    const allPlayers = (await SA.db.ref(P(sid) + '/players').once()) || {};
    const cfg = o.config || {};
    const t = SA.types.get(round.type);

    const startAt = o.startAt || 0;
    const rows = Object.entries(raw).map(([uid, a]) => {
      const p = allPlayers[uid] || {};
      const ok = t && t.check ? t.check(item, a.v, round) : null;
      const ms = startAt && a.at ? Math.max(0, a.at - startAt) : 0;
      return { uid, v: a.v, at: a.at || 0, ms, ok, name: p.name || '—', city: p.city || '', venueId: p.venueId || '' };
    }).sort((a, b) => a.at - b.at);

    /* speed bonus tapers across whoever got it right, fastest first */
    const rightOnes = rows.filter(r => r.ok === true);
    const bonusPool = Number(cfg.speedBonus) || 0;

    rows.forEach(r => {
      let pts = 0;
      if (r.ok === true) {
        pts = Number(cfg.pointsCorrect) || 0;
        if (t && t.score) pts = t.score(item, r.v, r.ms, round, cfg);
        if (bonusPool > 0) {
          const rank = rightOnes.indexOf(r);
          pts += Math.max(0, Math.round(bonusPool * (1 - rank / Math.max(1, rightOnes.length))));
        }
      } else if (r.ok === false) {
        pts = Number(cfg.pointsWrong) || 0;
        /* Some types give part marks. Matching four photos and getting
           three right is not a wrong answer, it is most of a right one —
           so those types score every answer, not only the perfect ones,
           and are responsible for the wrong-answer figure themselves. */
        if (t && t.scoreAlways && t.score) pts = t.score(item, r.v, r.ms, round, cfg);
      }
      r.pts = pts;
    });

    await Promise.all(rows.map(r => {
      const p = [SA.db.ref(answerPath(sid, rid, iid) + '/' + r.uid).update({ ok: r.ok, pts: r.pts })];
      if (r.pts) p.push(addPlayerPoints(sid, r.uid, r.pts));
      return Promise.all(p);
    }));

    return rows;
  }

  /* ---------- leaderboard ---------- */
  function board(playersObj, vid, limit) {
    return Object.entries(playersObj || {})
      .map(([uid, p]) => Object.assign({ uid }, p))
      .filter(p => !vid || p.venueId === vid)
      .sort((a, b) => (b.score || 0) - (a.score || 0) || (a.joinedAt || 0) - (b.joinedAt || 0))
      .slice(0, limit || 10);
  }

  /* ---------- the board phones and projectors are allowed to see ----------
     sessions/<sid>/players holds mobile numbers and ages, so the rules
     let an audience phone read exactly one record — its own — and let a
     projector read none at all. Neither can therefore build a
     leaderboard, or even find out its own total.

     So the host publishes one into live state, which everybody reads:
     the top ten as name, city and score only, and a bare list of every
     score with no names attached. From that list a phone works out its
     own position exactly — 1 + however many scores beat it — without
     ever learning who anyone else is.                                  */
  /* Same shape SA.render.leaderboard already draws, minus the phone
     number and the age. The uid stays so a phone can pick out its own
     row; it is opaque, and the rules still let nobody read that
     player's record but the player. */
  function boardFor(playersObj, vid, limit) {
    return board(playersObj, vid, limit || 10)
      .map(r => ({ uid: r.uid, name: r.name, city: r.city || '', score: r.score || 0 }));
  }

  function publishBoard(sid, vid, playersObj, combined) {
    const mine = Object.values(playersObj || {}).filter(p => combined || p.venueId === vid);
    const rows = boardFor(playersObj, combined ? null : vid, 10);
    const scores = mine.map(p => Number(p.score) || 0)
      .sort((a, b) => b - a)
      .slice(0, 1000);          // plenty for any hall, and a couple of KB
    return setLive(sid, vid, {
      board:  rows.length ? rows : null,
      scores: scores.length ? scores : null,
      boardN: mine.length
    });
  }

  /* 1 + how many people are ahead of you. Ties share a place, which is
     what anybody in the room would say if you asked them. */
  const rankIn = (scores, myScore) =>
    1 + (scores || []).filter(s => Number(s) > Number(myScore || 0)).length;

  /* ---------- used pool ---------- */
  const markUsed  = (sid, vid, rid, iid) => SA.db.ref(P(sid) + '/used/' + vid + '/' + rid + '/' + iid).set(true);
  const clearUsed = (sid, vid, rid) => SA.db.ref(P(sid) + '/used/' + vid + '/' + rid).remove();

  /* ---------- presence ---------- */
  function presence(sid, vid, role) {
    if (SA.DEMO) return () => {};
    const uid = SA.auth.uid || SA.uid4();
    const r = SA.db.ref(P(sid) + '/present/' + vid + '/' + role + '_' + uid);
    const conn = SA.db.rtdb.ref('.info/connected');
    const handler = s => {
      if (!s.val()) return;
      r.onDisconnect().remove();
      r.set({ role, at: SA.db.STAMP(), uid });
    };
    conn.on('value', handler);
    return () => { conn.off('value', handler); r.remove(); };
  }

  /* ---------- the public "live now" board ----------
     sessions/ is admin-only, so the hub cannot list running shows. This
     tiny node is the one thing an audience phone is allowed to see, and
     it carries nothing but a title, an icon and the join code.          */
  async function announce(sid, g) {
    const i = await info(sid);
    if (!i) return;
    const th = SA.theme.resolve(g && g.theme);
    return SA.db.ref('sa/liveNow/' + sid).set({
      title: i.title || 'Live',
      code: i.code || '',
      icon: (g && g.info && g.info.icon) || '🎯',
      primary: th.primary,
      at: Date.now()
    });
  }
  const unannounce = sid => SA.db.ref('sa/liveNow/' + sid).remove();

  async function setStatus(sid, status, g) {
    await SA.db.ref(P(sid) + '/info').update({ status });
    if (status === 'live') await announce(sid, g);
    else await unannounce(sid);
  }

  async function end(sid) {
    await SA.db.ref(P(sid) + '/info').update({ status: 'ended', endedAt: Date.now() });
    await unannounce(sid);
  }

  async function destroy(sid) {
    const i = await info(sid);
    if (i && i.code) await SA.db.ref('sa/codes/' + i.code).remove();
    await unannounce(sid);
    await SA.db.ref(P(sid)).remove();
  }

  return {
    P, TEAM_COLOURS, create, addVenue, blankLive, byCode, freeCode, load, info,
    live, setLive, resetLive, syncAll,
    join, players, teams, addTeamPoints, addPlayerPoints,
    submit, watchAnswers, settle, board, boardFor, publishBoard, rankIn,
    markUsed, clearUsed,
    presence, announce, unannounce, setStatus, end, destroy
  };
})();

/* ═══════════════════════════════════════════════════════════════
   ALTERNATIVE ANSWERS

   Stored as "main|alt|alt" because that is what check() already reads,
   but nobody should have to type pipe characters. The Studio shows a
   main answer and a plain list, and these convert between the two.
   ═══════════════════════════════════════════════════════════════ */
SA.alts = {
  main: s => String(s == null ? '' : s).split('|')[0].trim(),
  list: s => String(s == null ? '' : s).split('|').slice(1).map(x => x.trim()).filter(Boolean),
  text: s => SA.alts.list(s).join('\n'),
  join(main, listText) {
    const alts = String(listText == null ? '' : listText)
      .split(/[\n,]/).map(x => x.trim()).filter(Boolean);
    return [String(main == null ? '' : main).trim(), ...alts].filter(Boolean).join('|');
  }
};

/* ═══════════════════════════════════════════════════════════════
   PHOTOS — without paying for storage

   Firebase's own file storage is a billable product, and the brief for
   this whole site is that it must not cost anything. So a picture never
   leaves the browser as a file: it is drawn onto a canvas at a size a
   phone can actually use, squeezed to JPEG, and saved as text inside
   the game itself — the same trick the brand logo already uses.

   A 4 MB photo off a phone camera comes out around 25 KB this way.
   Only the question currently on air is published to phones, so the
   rest of the pictures are never downloaded by anybody.
   ═══════════════════════════════════════════════════════════════ */
SA.photo = (function () {

  const MAX_SIDE = 420;     // plenty for a phone card and a projector tile
  const QUALITY  = 0.68;
  const CAP      = 260000;  // refuse anything still this big afterwards

  /* Returns a data URI, or rejects with a message worth showing. */
  function fromFile(file, opts) {
    const o = opts || {};
    const side = Number(o.maxSide) || MAX_SIDE;
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || '')) return reject(new Error(SA.t('m.bad_file')));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error(SA.t('m.bad_file')));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error(SA.t('m.bad_file')));
        img.onload = () => {
          const scale = Math.min(1, side / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const g = c.getContext('2d');
          /* white underneath, so a transparent PNG does not turn black
             the moment it becomes a JPEG */
          g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
          g.drawImage(img, 0, 0, w, h);
          let out;
          try { out = c.toDataURL('image/jpeg', Number(o.quality) || QUALITY); }
          catch (e) { return reject(new Error(SA.t('m.bad_file'))); }
          if (out.length > (Number(o.cap) || CAP)) return reject(new Error(SA.t('m.too_big')));
          resolve(out);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* roughly what it will cost in the database, for the Studio to show */
  const kb = dataUri => Math.round(String(dataUri || '').length * 0.75 / 1024);

  /* A picture the game can draw: our own data URI, or a link somebody
     pasted to a picture hosted elsewhere. Anything else is ignored. */
  const usable = src => {
    const s = String(src || '').trim();
    return s.startsWith('data:image/') || /^https?:\/\//i.test(s);
  };

  return { fromFile, kb, usable, MAX_SIDE };
})();

/* ═══════════════════════════════════════════════════════════════
   SHARED RENDER PRIMITIVES
   The built-in types and anything built in the custom builder draw
   from the same set, so every game looks like part of one product.
   ═══════════════════════════════════════════════════════════════ */
SA.render = (function () {

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /* One options list, used by the projector (disabled) and phones (live). */
  function options(opts, o) {
    const cfg = o || {};
    return (opts || []).map((text, i) => {
      const cls = ['opt'];
      if (cfg.locked === i) cls.push('locked');
      if (cfg.correct === i && cfg.reveal) cls.push('correct');
      if (cfg.wrong === i) cls.push('wrong');
      if ((cfg.hidden || []).includes(i)) cls.push('dim');
      return `<button class="${cls.join(' ')}" ${cfg.disabled ? 'disabled' : ''} data-opt="${i}">
                <span class="lbl">${LETTERS[i] || i + 1}</span>
                <span class="tx grow">${SA.esc(text)}</span>
              </button>`;
    }).join('');
  }

  function timerRing(msLeft, total) {
    const s = Math.max(0, Math.ceil(msLeft / 1000));
    const warn = total && msLeft < total * 0.25;
    return `<div class="timer ${warn ? 'warn' : ''}">${s}</div>`;
  }

  function bar(pct) {
    return `<div class="tbar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
  }

  function leaderboard(rows, o) {
    const cfg = o || {};
    if (!rows || !rows.length) {
      return `<div class="mut tc" style="padding:26px">${SA.esc(cfg.empty || SA.t('host.no_score'))}</div>`;
    }
    return `<div class="lb">` + rows.map((r, i) => `
      <div class="r${cfg.meUid && r.uid === cfg.meUid ? ' mine' : ''}">
        <span class="n">${i + 1}</span>
        <span class="grow nm">
          <b>${SA.esc(r.name)}</b>
          ${r.city ? `<span class="sm mut"> · ${SA.esc(r.city)}</span>` : ''}
        </span>
        <span class="s">${r.score || 0}</span>
      </div>`).join('') + `</div>`;
  }

  /* The other top 10: who scored on the question just settled, rather
     than who is winning the show. Rows are the compact shape the host
     publishes into live state — {n:name, c:city, p:points, ms:time} —
     because phones and projectors cannot read the answers node itself. */
  function qtop(rows, o) {
    const cfg = o || {};
    if (!rows || !rows.length) {
      return `<div class="mut tc" style="padding:26px">${SA.esc(cfg.empty || SA.t('play.board_q_wait'))}</div>`;
    }
    return `<div class="lb">` + rows.slice(0, cfg.limit || 10).map((r, i) => `
      <div class="r${cfg.meUid && r.u === cfg.meUid ? ' mine' : ''}">
        <span class="n">${i + 1}</span>
        <span class="grow nm">
          <b>${SA.esc(r.n || r.name || '—')}</b>
          ${r.c ? `<span class="sm mut"> · ${SA.esc(r.c)}</span>` : ''}
          ${r.ms ? `<span class="xs mut" style="display:block">${(r.ms / 1000).toFixed(1)}s</span>` : ''}
        </span>
        <span class="s">+${r.p || 0}</span>
      </div>`).join('') + `</div>`;
  }

  function teamBoard(teamsObj, o) {
    const cfg = o || {};
    const list = Object.entries(teamsObj || {})
      .map(([id, t]) => Object.assign({ id }, t))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!list.length) return '';
    const top = Math.max(1, ...list.map(t => t.score || 0));
    return `<div class="grid g3">` + list.map(t => `
      <div class="sub col" style="gap:7px;border-left:4px solid ${t.colour};align-items:center;text-align:center"
           data-team="${t.id}">
        <div class="xs mut">${SA.esc(t.name)}</div>
        <div style="font:800 30px/1 var(--fd);color:${t.colour}">${t.score || 0}</div>
        ${cfg.bars ? `<div class="tbar" style="width:100%"><i style="width:${((t.score || 0) / top) * 100}%;background:${t.colour}"></i></div>` : ''}
        ${cfg.buttons ? `<div class="row" style="gap:5px;justify-content:center">
            <button class="btn sm" data-t-minus="${t.id}">−</button>
            <button class="btn sm p" data-t-plus="${t.id}">+</button>
          </div>` : ''}
      </div>`).join('') + `</div>`;
  }

  /* Big centred text — the projector's default for a prompt or a word. */
  function big(text, sub) {
    return `<div class="col center tc" style="gap:14px;padding:18px">
              <div class="q-text">${SA.esc(text)}</div>
              ${sub ? `<div class="mut" style="font-size:.6em">${SA.esc(sub)}</div>` : ''}
            </div>`;
  }

  function logoScreen(title, sub) {
    return `<div class="col center tc" style="gap:20px;height:100%;padding:30px">
              <img src="${SA.brand.logo}" alt="" style="width:min(320px,38vw);filter:drop-shadow(0 10px 40px var(--glow))">
              <div>
                <div style="font:800 clamp(24px,3vw,46px)/1.2 var(--fd);color:var(--primary)">${SA.esc(title || SA.brand.name)}</div>
                <div class="mut" style="font-size:clamp(13px,1.2vw,20px);letter-spacing:.14em;text-transform:uppercase;margin-top:8px">
                  ${SA.esc(sub || SA.brand.tagline)}</div>
              </div>
            </div>`;
  }

  /* Shown the moment an answer lands. A line of small grey text is not
     enough — on a phone, in a hall, people need to SEE that it went in,
     otherwise they press Send again and again. */
  function sentCard(value, canEdit) {
    const shown = Array.isArray(value) ? value.join(', ') : String(value == null ? '' : value);
    return `
      <div class="card tc pop-in" style="border-color:var(--ok);box-shadow:0 0 30px var(--ok-glow)">
        <div style="font-size:40px;line-height:1">✅</div>
        <div style="font:800 19px/1.3 var(--fd);color:var(--ok);margin-top:5px">
          ${SA.esc(SA.t('play.sent_big'))}</div>
        <div class="sub" style="margin-top:11px;font:800 20px/1.4 var(--fs);word-break:break-word">
          ${SA.esc(shown)}</div>
        <div class="sm mut" style="margin-top:9px">
          ${SA.esc(canEdit ? SA.t('play.sent_sub') : SA.t('play.sent_locked'))}</div>
        ${canEdit ? `<button class="btn ghost wide" id="ans-edit" style="margin-top:11px">
          ✏ ${SA.esc(SA.t('play.edit_answer'))}</button>` : ''}
      </div>`;
  }

  return { LETTERS, options, timerRing, bar, leaderboard, qtop, teamBoard, big, logoScreen, sentCard };
})();

