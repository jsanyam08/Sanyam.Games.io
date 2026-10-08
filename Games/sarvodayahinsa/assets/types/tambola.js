/* ── type: TAMBOLA / HOUSIE ────────────────────────────────────────
   The अक्षय निधि format, made live.

   The rule that shapes everything here: a phone may see the text behind
   a number ONLY after that number is drawn. So the content (all 90
   facts) never leaves the host. What goes out is `drawn` — a growing
   list of {n, text} — and a phone renders a fact only if its number is
   in that list. An undrawn cell has nothing to show and nothing to leak.

   Two ways to play at once:
     • digital ticket on the phone, daubed automatically
     • printed paper ticket, for anyone who would rather not use a phone.
       Paper tickets are generated from the session code + serial, so the
       host can retype a serial and see that exact ticket to check a claim.
   ────────────────────────────────────────────────────────────────── */
(function () {

  const ROWS = 3, COLS = 9, PER_ROW = 5, TOTAL = 15;

  /* seeded PRNG — the same (code, serial) must always rebuild the same
     ticket, on the host's laptop and on the printer, months apart */
  function rng(seed) {
    let s = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) | 0;
    s = Math.abs(s) || 7;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  const colRange = c => c === 0 ? [1, 9] : c === 8 ? [80, 90] : [c * 10, c * 10 + 9];

  /* A real housie ticket: 3×9, 15 numbers, exactly 5 per row, every
     column holding 1–3 numbers in ascending order down the column. */
  function makeTicket(seed) {
    const rnd = rng(seed);
    for (let attempt = 0; attempt < 400; attempt++) {
      /* how many numbers each column gets */
      const counts = Array(COLS).fill(1);
      let left = TOTAL - COLS;
      while (left > 0) {
        const c = Math.floor(rnd() * COLS);
        if (counts[c] < 3) { counts[c]++; left--; }
      }

      /* which rows each column occupies, keeping every row at 5 */
      const rowLoad = [0, 0, 0];
      const colRows = [];
      let ok = true;
      const order = Array.from({ length: COLS }, (_, i) => i)
        .sort((a, b) => counts[b] - counts[a] || rnd() - 0.5);

      for (const c of order) {
        const want = counts[c];
        const avail = [0, 1, 2]
          .filter(r => rowLoad[r] < PER_ROW)
          .sort((a, b) => rowLoad[a] - rowLoad[b] || rnd() - 0.5);
        if (avail.length < want) { ok = false; break; }
        const rows = avail.slice(0, want);
        rows.forEach(r => rowLoad[r]++);
        colRows[c] = rows.sort((a, b) => a - b);
      }
      if (!ok || rowLoad.some(v => v !== PER_ROW)) continue;

      /* fill the numbers, ascending down each column */
      const grid = [Array(COLS).fill(0), Array(COLS).fill(0), Array(COLS).fill(0)];
      for (let c = 0; c < COLS; c++) {
        const [lo, hi] = colRange(c);
        const pool = [];
        for (let v = lo; v <= hi; v++) pool.push(v);
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const picked = pool.slice(0, counts[c]).sort((a, b) => a - b);
        colRows[c].forEach((r, i) => { grid[r][c] = picked[i]; });
      }
      return grid;
    }
    return null;   // effectively unreachable; 400 attempts always succeed
  }

  const flat = grid => grid.flat().filter(Boolean);

  const CLAIMS = [
    { key:'early5',  labelKey:'t.cl.early5',  pts:20, test:(g,d) => flat(g).filter(n => d.has(n)).length >= 5 },
    { key:'top',     labelKey:'t.cl.top',     pts:30, test:(g,d) => g[0].filter(Boolean).every(n => d.has(n)) },
    { key:'middle',  labelKey:'t.cl.middle',  pts:30, test:(g,d) => g[1].filter(Boolean).every(n => d.has(n)) },
    { key:'bottom',  labelKey:'t.cl.bottom',  pts:30, test:(g,d) => g[2].filter(Boolean).every(n => d.has(n)) },
    { key:'corners', labelKey:'t.cl.corners', pts:25, test:(g,d) => corners(g).every(n => d.has(n)) },
    { key:'full',    labelKey:'t.cl.full',    pts:100, test:(g,d) => flat(g).every(n => d.has(n)) }
  ];

  function corners(g) {
    const t = g[0].filter(Boolean), b = g[2].filter(Boolean);
    return [t[0], t[t.length - 1], b[0], b[b.length - 1]].filter(Boolean);
  }

  SA.types.register({
    key: 'tambola',
    label: 'Tambola / Housie',
    icon: '🎟️',
    /* one long round rather than item-by-item, so the host console hides
       its "load the next question" controls for this type */
    continuous: true,

    defaults: () => ({
      autoDraw: 0,              // seconds between draws; 0 = host clicks
      showBoard: true,
      claims: CLAIMS.map(c => ({ key: c.key, pts: c.pts, on: true })),
      revealFactOnScreen: true,
      /* Levels are separate sets of facts for the same 90 numbers, the way
         अक्षय निधि has always worked. Level 0 means "mixed" — draw from
         every level at once. */
      levelCount: 3,
      showCheckpoints: true,
      onceOnly: true,           // a checkpoint can only be won once

      /* Hybrid play: phones and printed tickets in the same game. The two
         must never issue the same ticket number — same seed means the same
         grid, so two people would be holding one ticket without knowing.
         Printed tickets take 1…paperUpto, phones start above that. */
      playMode: 'hybrid',
      paperUpto: 200,
      digitalFrom: 201
    }),

    newItem: () => ({ n: 0, text: '', level: 1, order: Date.now() }),

    /* fed to this type's own screenView by the Studio preview. Tambola
       draws itself from live state rather than from an item, so the
       sample is a board part-way through a game. */
    sample: () => ({
      item: { id: 'prev', n: 0, text: '', level: 1 },
      live: { phase: 'draw',
              drawn: [7, 23, 41, 8, 66, 15, 52, 30, 77, 19, 84]
                .map(n => ({ n, text: '' }))
                .concat([{ n: 3, text: SA.t('st.smp_fact') }]) }
    }),

    itemSummary: it => 'L' + (it.level || 1) + ' · ' +
      (it.n ? '#' + it.n + '  ' : '') + (it.text || SA.t('r.empty')).slice(0, 70),

    /* The whole security model in one function: only drawn entries go out. */
    payload(item, live, round) { return null; },   // tambola publishes from the host panel instead

    check() { return null; },                       // scored by claims, not answers

    /* ═══ STUDIO ═══════════════════════════════════════════════ */
    configForm(box, round, ctx) {
      const c = round.config || {};
      const claims = c.claims || CLAIMS.map(x => ({ key:x.key, pts:x.pts, on:true }));
      box.innerHTML = `
        <div class="grid g3">
          <div><label class="f">${SA.t('t.auto_draw')}</label>
            <input type="number" min="0" max="120" data-k="autoDraw" value="${c.autoDraw ?? 0}">
            <div class="sm mut" style="margin-top:4px">${SA.t('t.auto_note')}</div></div>
        </div>
        <div style="border-top:1px solid var(--bd);margin-top:14px;padding-top:12px">
          <label class="f">${SA.t('t.play_mode')}</label>
          <div class="col" style="gap:7px">
            ${['mobile','paper','hybrid'].map(m => `
              <label class="chk sub" style="align-items:flex-start">
                <input type="radio" name="tpm" value="${m}" ${(c.playMode||'hybrid')===m?'checked':''} style="margin-top:3px">
                <span><b>${SA.esc(SA.t('t.pm.' + m))}</b>
                  <span class="sm mut" style="display:block">${SA.esc(SA.t('t.pm.' + m + '_d'))}</span></span>
              </label>`).join('')}
          </div>
          ${(c.playMode || 'hybrid') !== 'mobile' ? `
            <div class="grid g3" style="margin-top:11px">
              <div><label class="f">${SA.t('t.paper_upto')}</label>
                <input type="number" min="0" max="5000" data-k="paperUpto" value="${c.paperUpto ?? 200}"></div>
              ${(c.playMode || 'hybrid') === 'hybrid' ? `
                <div><label class="f">${SA.t('t.digital_from')}</label>
                  <input type="number" min="1" max="9999" data-k="digitalFrom" value="${c.digitalFrom ?? 201}"></div>` : ''}
            </div>
            ${(c.playMode || 'hybrid') === 'hybrid' ? `
              <div class="sub sm ${Number(c.digitalFrom ?? 201) <= Number(c.paperUpto ?? 200) ? '' : 'mut'}"
                   style="margin-top:9px;${Number(c.digitalFrom ?? 201) <= Number(c.paperUpto ?? 200)
                     ? 'border-color:var(--bad);color:var(--bad)' : ''}">
                ${Number(c.digitalFrom ?? 201) <= Number(c.paperUpto ?? 200)
                  ? '⚠️ ' + SA.t('t.serial_clash') : SA.t('t.serial_note')}</div>` : ''}` : ''}
        </div>

        <div class="grid g3" style="margin-top:12px">
          <div><label class="f">${SA.t('t.level_count')}</label>
            <select data-k="levelCount">
              ${[1,2,3,4,5].map(n => `<option value="${n}" ${(c.levelCount||3)==n?'selected':''}>${n}</option>`).join('')}
            </select>
            <div class="sm mut" style="margin-top:4px">${SA.t('t.level_note')}</div></div>
        </div>
        <div class="col" style="gap:9px;margin-top:12px">
          <label class="chk"><input type="checkbox" data-k="showBoard" ${c.showBoard!==false?'checked':''}>
            ${SA.t('t.show_board')}</label>
          <label class="chk"><input type="checkbox" data-k="revealFactOnScreen" ${c.revealFactOnScreen!==false?'checked':''}>
            ${SA.t('t.reveal_fact')}</label>
          <label class="chk"><input type="checkbox" data-k="showCheckpoints" ${c.showCheckpoints!==false?'checked':''}>
            ${SA.t('t.cp_show')}</label>
          <label class="chk"><input type="checkbox" data-k="onceOnly" ${c.onceOnly!==false?'checked':''}>
            ${SA.t('t.cp_once')}</label>
        </div>
        ${SA.packs && SA.packs.akshaynidhi ? `
          <div style="border-top:1px solid var(--bd);margin-top:14px;padding-top:12px">
            <label class="f">${SA.t('t.pack')}</label>
            <div class="sm mut" style="margin-bottom:9px">${SA.t('t.pack_note', {
              x: SA.packs.akshaynidhi.facts.length, y: SA.esc(SA.packs.akshaynidhi.credit) })}</div>
            <button class="btn" id="tb-pack">📚 ${SA.esc(SA.t('t.pack_load', {
              x: SA.packs.akshaynidhi.facts.length }))}</button>
          </div>` : ''}

        <div style="border-top:1px solid var(--bd);margin-top:14px;padding-top:12px">
          <label class="f">${SA.t('t.claims_pts')}</label>
          <div class="col" style="gap:7px" id="cl-rows">
            ${claims.map((cl, i) => `
              <div class="row" style="gap:9px">
                <label class="chk" style="min-width:150px">
                  <input type="checkbox" data-cl-on="${i}" ${cl.on !== false ? 'checked' : ''}>
                  ${SA.esc(claimLabel(cl))}</label>
                <input type="number" data-cl-pts="${i}" value="${cl.pts}" style="max-width:110px">
                <span class="sm mut">${SA.t('points')}</span>
              </div>`).join('')}
          </div>
        </div>`;
      round.config.claims = claims;
      const redraw = () => { ctx.change(); SA.types.get('tambola').configForm(box, round, ctx); };
      box.querySelectorAll('[name="tpm"]').forEach(el => el.onchange = () => {
        round.config.playMode = el.value; redraw();
      });
      box.querySelectorAll('[data-k]').forEach(el => el.onchange = () => {
        round.config[el.dataset.k] = el.type === 'checkbox' ? el.checked : Number(el.value);
        /* these two decide whether the clash warning shows */
        if (el.dataset.k === 'paperUpto' || el.dataset.k === 'digitalFrom') redraw();
        else ctx.change();
      });
      box.querySelectorAll('[data-cl-on]').forEach(el => el.onchange = () => {
        claims[Number(el.dataset.clOn)].on = el.checked; ctx.change();
      });
      box.querySelectorAll('[data-cl-pts]').forEach(el => el.onchange = () => {
        claims[Number(el.dataset.clPts)].pts = Number(el.value); ctx.change();
      });

      const packBtn = box.querySelector('#tb-pack');
      if (packBtn) packBtn.onclick = async () => {
        if (!ctx.addItems) { SA.toast('—', true); return; }
        const existing = ctx.itemCount ? ctx.itemCount() : 0;
        if (existing && !await SA.ui.confirm(SA.t('t.pack_q'),
              SA.t('t.pack_replace', { x: existing }), SA.t('t.pack_yes'))) return;

        /* Numbers 1–90 take the first ninety facts; whatever is left over
           starts level 2, so nothing from the original board is dropped. */
        const facts = SA.packs.akshaynidhi.facts;
        const items = facts.map((text, i) => ({
          n: (i % 90) + 1,
          level: Math.floor(i / 90) + 1,
          text,
          order: i
        }));
        ctx.addItems(items);
        SA.toast(SA.t('t.pack_done', { x: items.length }));
      };
    },

    editItem(box, item, ctx) {
      const levels = Math.max(1, Number((ctx.round.config || {}).levelCount) || 3);
      box.innerHTML = `
        <div class="grid g2">
          <div><label class="f">${SA.t('t.item_level')}</label>
            <select data-k="level">
              ${Array.from({ length: levels }, (_, i) => i + 1).map(n =>
                `<option value="${n}" ${(item.level || 1) == n ? 'selected' : ''}>${SA.esc(SA.t('t.level_n', { x: n }))}</option>`).join('')}
            </select></div>
          <div><label class="f">${SA.t('t.number')}</label>
            <input type="number" min="1" max="90" data-k="n" value="${item.n || ''}"></div>
        </div>
        <div style="margin-top:12px"><label class="f">${SA.t('t.fact')}</label>
          <textarea data-k="text" rows="3"
            placeholder="${SA.esc(SA.t('t.fact_ph'))}">${SA.esc(item.text)}</textarea></div>
        <div class="sm mut" style="margin-top:6px">
          ${SA.t('t.fact_note')}</div>`;
      box.querySelector('[data-k="n"]').oninput    = e => { item.n = Number(e.target.value) || 0; ctx.change(); };
      box.querySelector('[data-k="text"]').oninput = e => { item.text = e.target.value; ctx.change(); };
    },

    /* ═══ HOST ═════════════════════════════════════════════════ */
    hostPanel(box, ctx) {
      const { live, round } = ctx;
      const cfg = round.config || {};
      const items = ctx.items || [];
      const drawn = live.drawn || [];
      const drawnSet = new Set(drawn.map(d => d.n));
      const levels = Math.max(1, Number(cfg.levelCount) || 3);
      const lvl = live.level == null ? 1 : Number(live.level);   // 0 = mixed

      /* pool = every number that has a fact written for it, in the level
         being played (or any level, when mixed) */
      const inLevel = it => lvl === 0 || Number(it.level || 1) === lvl;
      const withText = items.filter(it => it.n >= 1 && it.n <= 90 && String(it.text || '').trim());
      const pool = withText.filter(inLevel).filter(it => !drawnSet.has(it.n));
      const levelCounts = Array.from({ length: levels }, (_, i) =>
        withText.filter(it => Number(it.level || 1) === i + 1).length);
      const claimCfg = cfg.claims || CLAIMS;
      const claims = Object.entries(ctx.claims || {})
        .map(([id, c]) => Object.assign({ id }, c))
        .sort((a, b) => (b.at || 0) - (a.at || 0));

      const last = drawn[drawn.length - 1];
      const withTickets = Object.values(ctx.players || {}).filter(p => p.ticket).length;
      const noTicket = Object.entries(ctx.players || {}).filter(([, p]) => !p.ticket).length;

      box.innerHTML = `
        <div class="card col" style="gap:13px">
          <div class="spread">
            <span class="pill p">${SA.esc(round.title)}</span>
            <span class="pill">${SA.t('t.drawn_of', { a: drawn.length, b: drawn.length + pool.length })}</span>
          </div>

          <div class="sub tc">
            ${last ? `<div style="font:800 54px/1 var(--fd);color:var(--primary)">${last.n}</div>
                      <div style="margin-top:8px;font-size:16px">${SA.esc(last.text)}</div>`
                   : `<div class="mut" style="padding:16px">${SA.t('t.none_drawn')}</div>`}
          </div>

          <div class="row wrap-r" style="gap:7px;align-items:center">
            <span class="xs mut">${SA.t('t.playing_level')}</span>
            ${Array.from({ length: levels }, (_, i) => i + 1).map(n => `
              <button class="btn sm ${lvl === n ? 'p' : ''}" data-lvl="${n}"
                title="${SA.esc(SA.t('t.level_counts', { x: n, n: levelCounts[n - 1] }))}">
                ${SA.esc(SA.t('t.level_n', { x: n }))}</button>`).join('')}
            <button class="btn sm ${lvl === 0 ? 'p' : ''}" data-lvl="0">${SA.esc(SA.t('t.mixed_short'))}</button>
            <span class="grow"></span>
            <span class="sm mut">${SA.t('t.level_counts', { x: lvl === 0 ? SA.t('t.mixed_short') : lvl,
              n: lvl === 0 ? withText.length : levelCounts[lvl - 1] })}</span>
          </div>
          ${!pool.length && !drawn.length ? `<div class="sub sm" style="border-color:var(--bad);color:var(--bad)">
            ${SA.t('t.level_empty')}</div>` : ''}

          <div class="row wrap-r" style="gap:8px">
            <button class="btn p grow big" id="tb-draw" ${pool.length ? '' : 'disabled'}>
              🎲 ${SA.t('t.draw_next')} (${SA.t('t.left_n', { x: pool.length })})</button>
            <button class="btn ${live.auto ? 'on' : ''}" id="tb-auto" ${cfg.autoDraw ? '' : 'disabled'}
              title="${cfg.autoDraw ? SA.t('t.one_every', { x: cfg.autoDraw }) : SA.t('t.auto_off_hint')}">
              ${live.auto ? '⏸ ' + SA.t('t.pause') : '▶ ' + SA.t('t.auto_on')}</button>
            <button class="btn ghost" id="tb-undo" ${drawn.length ? '' : 'disabled'}>↶ ${SA.t('t.undo')}</button>
            <button class="btn ghost bad" id="tb-reset" ${drawn.length ? '' : 'disabled'}>↺ ${SA.t('t.new_game')}</button>
          </div>

          <div class="row wrap-r" style="gap:8px;border-top:1px solid var(--bd);padding-top:11px">
            <span class="sm mut grow">🎟️ ${SA.t('t.tickets_out', { x: withTickets })}${noTicket ? ' · ' + SA.t('t.tickets_left', { x: noTicket }) : ''}</span>
            <button class="btn sm ${noTicket ? 'p' : ''}" id="tb-assign" ${noTicket ? '' : 'disabled'}>
              ${SA.t('t.give_tickets')}</button>
            <button class="btn sm ghost" id="tb-paper">📄 ${SA.t('t.check_paper')}</button>
            ${(cfg.playMode || 'hybrid') !== 'mobile'
              ? `<button class="btn sm ghost" id="tb-pclaim">✋ ${SA.t('t.paper_claim')}</button>` : ''}
            <button class="btn sm ghost" id="tb-lucky">🍀 ${SA.t('t.lucky')}</button>
          </div>

          ${cfg.showCheckpoints !== false ? `
            <div class="col" style="gap:7px;border-top:1px solid var(--bd);padding-top:11px">
              <span class="xs mut">${SA.t('t.checkpoints')}</span>
              <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px">
                ${claimCfg.map(cl => {
                  const w = (live.won || {})[cl.key];
                  const off = cl.on === false;
                  return `<div class="sub" style="padding:8px 10px;${
                    off ? 'opacity:.45' : w ? 'border-color:var(--ok)' : ''}">
                    <div class="xs mut">${SA.esc(claimLabel(cl))}</div>
                    <div class="sm" style="font-weight:700;color:${w ? 'var(--ok)' : 'var(--tx-mut)'};margin-top:3px">
                      ${off ? SA.esc(SA.t('t.cp_off'))
                            : w ? '✓ ' + SA.esc(w) : SA.esc(SA.t('t.cp_open'))}</div>
                  </div>`;
                }).join('')}
              </div>
            </div>` : ''}

          <div class="col" style="gap:8px;border-top:1px solid var(--bd);padding-top:11px">
            <span class="xs mut">${SA.t('t.claims')}</span>
            <div class="lb" style="max-height:230px;overflow:auto">
              ${claims.length ? claims.map(c => {
                const cd = claimCfg.find(x => x.key === c.type) || { key: c.type, pts: 0 };
                const valid = c.status === 'ok';
                return `<div class="r" style="border-color:${valid ? 'var(--ok)' : c.status === 'no' ? 'var(--bad)' : 'var(--bd)'}">
                  <span class="n">${valid ? '✓' : c.status === 'no' ? '✗' : '?'}</span>
                  <span class="grow"><b>${SA.esc(c.name || '—')}</b>
                    <span class="sm mut" style="display:block">${SA.esc(claimLabel(cd))}</span></span>
                  ${c.status === 'new' ? `
                    <button class="btn sm ok" data-cl-ok="${c.id}">${SA.t('t.accept')} +${cd.pts}</button>
                    <button class="btn sm ghost" data-cl-no="${c.id}">${SA.t('t.reject')}</button>`
                    : `<span class="s">${valid ? '+' + cd.pts : '—'}</span>`}
                </div>`;
              }).join('') : `<div class="mut sm tc" style="padding:14px">${SA.t('t.no_claims')}</div>`}
            </div>
          </div>

          <div class="col" style="gap:7px;border-top:1px solid var(--bd);padding-top:11px">
            <span class="xs mut">${SA.t('t.board')}</span>
            <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:3px">
              ${Array.from({ length: 90 }, (_, i) => {
                const n = i + 1;
                const has = items.some(it => it.n === n && String(it.text || '').trim());
                const out = drawnSet.has(n);
                return `<div style="aspect-ratio:1;display:grid;place-items:center;border-radius:5px;
                  font:700 11px/1 var(--fd);
                  background:${out ? 'var(--primary)' : has ? 'var(--panel-2)' : 'transparent'};
                  color:${out ? 'var(--on-primary)' : has ? 'var(--tx-mut)' : 'var(--bd)'};
                  border:1px solid ${out ? 'transparent' : 'var(--bd)'}">${n}</div>`;
              }).join('')}
            </div>
          </div>
        </div>`;

      /* --- draw --- */
      const draw = () => {
        if (!pool.length) return;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const next = drawn.concat([{ n: pick.n, text: pick.text }]);
        ctx.act({ drawn: next, phase: 'open', screen: 'round', lastAt: SA.db.now() });
      };
      box.querySelector('#tb-draw').onclick = draw;

      box.querySelector('#tb-auto').onclick = () => ctx.act({ auto: !live.auto });
      box.querySelector('#tb-undo').onclick = () => ctx.act({ drawn: drawn.slice(0, -1) });
      box.querySelector('#tb-reset').onclick = async () => {
        if (!await SA.ui.confirm(SA.t('t.new_game_q'), SA.t('t.new_game_b'), SA.t('t.new_game'))) return;
        await SA.db.ref(SA.sess.P(ctx.sid) + '/claims/' + ctx.vid).remove();
        ctx.act({ drawn: null, auto: false, lastAt: 0 });
      };

      /* the auto-draw ticker lives on the host page only, so two hosts
         watching the same venue cannot double-draw */
      clearTimeout(box._auto);
      if (live.auto && cfg.autoDraw && pool.length) {
        const wait = Math.max(0, (live.lastAt || 0) + cfg.autoDraw * 1000 - SA.db.now());
        box._auto = setTimeout(draw, wait || cfg.autoDraw * 1000);
      }

      box.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => {
        ctx.act({ level: Number(b.dataset.lvl) });
      });

      /* --- tickets ---
         In hybrid play the printed tickets own 1…paperUpto, so phone
         tickets must start above that. Same seed = same grid, so an
         overlap would silently hand two people one ticket. */
      box.querySelector('#tb-assign').onclick = async () => {
        const code = (ctx.info && ctx.info.code) || ctx.sid;
        const mode = cfg.playMode || 'hybrid';
        const floor = mode === 'mobile' ? 0 : Number(cfg.digitalFrom ?? 201) - 1;
        let n = 0;
        let serial = Object.values(ctx.players || {})
          .reduce((m, p) => Math.max(m, (p.ticket && p.ticket.serial) || 0), floor);
        for (const [uid, p] of Object.entries(ctx.players || {})) {
          if (p.ticket) continue;
          serial++;
          const grid = makeTicket(code + '-' + serial);
          await SA.db.ref(SA.sess.P(ctx.sid) + '/players/' + uid + '/ticket').set({ serial, grid });
          n++;
        }
        SA.toast(SA.t('t.gave_n', { x: n }));
      };

      box.querySelector('#tb-paper').onclick = () => paperCheck(ctx, drawnSet);

      const pc = box.querySelector('#tb-pclaim');
      if (pc) pc.onclick = () => paperClaim(ctx, drawnSet, claimCfg, live);

      box.querySelector('#tb-lucky').onclick = () => luckyDraw(ctx, cfg, live);

      /* --- claims --- */
      box.querySelectorAll('[data-cl-ok]').forEach(b => b.onclick = async () => {
        const c = claims.find(x => x.id === b.dataset.clOk);
        const cd = claimCfg.find(x => x.key === c.type) || { pts: 0 };
        await SA.db.ref(SA.sess.P(ctx.sid) + '/claims/' + ctx.vid + '/' + c.id).update({ status: 'ok' });
        if (c.uid && cd.pts) await SA.sess.addPlayerPoints(ctx.sid, c.uid, cd.pts);
        /* the checkpoint board is part of the live state, so the projector
           and every phone show the same winners without another listener */
        ctx.act({ won: Object.assign({}, live.won || {}, { [c.type]: c.name }) });
        SA.toast(SA.t('t.accepted', { x: c.name }));
      });
      box.querySelectorAll('[data-cl-no]').forEach(b => b.onclick = () =>
        SA.db.ref(SA.sess.P(ctx.sid) + '/claims/' + ctx.vid + '/' + b.dataset.clNo).update({ status: 'no' }));
    },

    /* ═══ PROJECTOR ════════════════════════════════════════════ */
    screenView(box, ctx) {
      const { live, round } = ctx;
      const cfg = (round && round.config) || {};
      const drawn = live.drawn || [];
      const drawnSet = new Set(drawn.map(d => d.n));
      const last = drawn[drawn.length - 1];

      /* a lucky draw takes over the screen until the host clears it */
      if (live.lucky) {
        box.innerHTML = `
          <div class="col center tc" style="height:100%;gap:2vh;padding:3vh 4vw">
            <div style="font-size:clamp(40px,6vw,110px)">🍀</div>
            <div class="mut" style="font-size:clamp(14px,1.5vw,26px);letter-spacing:.16em;text-transform:uppercase">
              ${SA.esc(SA.t('t.lucky_winner'))}</div>
            <div class="pop-in" style="font:800 clamp(70px,12vw,220px)/1 var(--fd);color:var(--primary);
                 text-shadow:0 0 60px var(--glow-hard)">#${live.lucky.serial}</div>
            ${live.lucky.name ? `<div style="font:800 clamp(24px,3vw,56px)/1.2 var(--fs)">
              ${SA.esc(live.lucky.name)}</div>` : ''}
          </div>`;
        return;
      }

      if (!drawn.length) { box.innerHTML = SA.render.logoScreen(ctx.title, SA.t('t.get_ready')); return; }

      /* The original अक्षय निधि board, rebuilt: the drawn number and its
         line on the left, the 90-cell board in the middle, and a running
         history down the right, with a progress bar across the top. */
      const total = 90;
      const pct = Math.round(drawn.length / total * 100);

      box.innerHTML = `
        <div class="col" style="height:100%;gap:0">
          <div style="height:5px;background:var(--panel-2);flex:none">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--primary),var(--accent));
                        transition:width .4s ease"></div>
          </div>

          <div class="row" style="flex:1;min-height:0;gap:1.6vw;padding:1.6vh 1.6vw;align-items:stretch">

            <!-- ── the draw ── -->
            <div class="col center" style="flex:1.05;gap:1.6vh;min-width:0">
              <div class="pop-in" key="${last.n}" style="
                width:clamp(130px,15vw,260px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;
                background:radial-gradient(circle at 34% 28%,var(--primary-lt),var(--primary));
                color:var(--on-primary);font:800 clamp(56px,7.2vw,132px)/1 var(--fd);
                box-shadow:0 0 70px var(--glow-hard);flex:none">${last.n}</div>

              ${cfg.revealFactOnScreen !== false ? `
                <div class="card fade-in" style="width:100%;text-align:center;border-color:var(--primary)">
                  <div style="font:700 clamp(17px,1.9vw,34px)/1.35 var(--fs)">${SA.esc(last.text)}</div>
                </div>` : ''}

              <div class="row" style="gap:clamp(12px,2vw,34px);justify-content:center;flex:none">
                <div class="tc">
                  <div style="font:800 clamp(20px,2.2vw,40px)/1 var(--fd);color:var(--primary)">${drawn.length}</div>
                  <div class="mut" style="font-size:.5em;letter-spacing:.16em;text-transform:uppercase">
                    ${SA.esc(SA.t('t.drawn_lbl'))}</div>
                </div>
                <div class="tc">
                  <div style="font:800 clamp(20px,2.2vw,40px)/1 var(--fd)">${total - drawn.length}</div>
                  <div class="mut" style="font-size:.5em;letter-spacing:.16em;text-transform:uppercase">
                    ${SA.esc(SA.t('t.remain_lbl'))}</div>
                </div>
              </div>

              ${cfg.showCheckpoints !== false ? `
                <div class="row wrap-r" style="justify-content:center;gap:6px;font-size:.5em">
                  ${(cfg.claims || CLAIMS).filter(c => c.on !== false).map(c => {
                    const w = (live.won || {})[c.key];
                    return `<span class="pill ${w ? 'ok' : ''}">${w ? '✓ ' : ''}${SA.esc(claimLabel(c))}${
                      w ? ' · ' + SA.esc(w) : ''}</span>`;
                  }).join('')}
                </div>` : ''}
            </div>

            <!-- ── the board ── -->
            ${cfg.showBoard !== false ? `
              <div class="card col" style="flex:1.25;min-width:0;gap:1vh;padding:1.4vh 1vw">
                <div class="mut tc" style="font-size:.5em;letter-spacing:.2em;text-transform:uppercase;flex:none">
                  ${SA.esc(SA.t('t.board_head'))}</div>
                <div style="flex:1;display:grid;grid-template-columns:repeat(10,1fr);
                            gap:clamp(3px,.35vw,7px);align-content:center">
                  ${Array.from({ length: 90 }, (_, i) => {
                    const n = i + 1, out = drawnSet.has(n), isLast = last.n === n;
                    return `<div style="aspect-ratio:1;display:grid;place-items:center;border-radius:clamp(4px,.5vw,9px);
                      font:800 clamp(10px,1.05vw,21px)/1 var(--fd);
                      background:${isLast ? 'var(--accent)' : out ? 'var(--primary)' : 'var(--panel-2)'};
                      color:${isLast ? 'var(--on-accent)' : out ? 'var(--on-primary)' : 'var(--tx-mut)'};
                      ${isLast ? 'box-shadow:0 0 18px var(--accent-glow);transform:scale(1.12)' : ''};
                      transition:.25s">${n}</div>`;
                  }).join('')}
                </div>
              </div>` : ''}

            <!-- ── history ── -->
            <div class="card col" style="flex:.72;min-width:0;gap:.8vh;padding:1.4vh .9vw">
              <div class="mut tc" style="font-size:.5em;letter-spacing:.2em;text-transform:uppercase;flex:none">
                ${SA.esc(SA.t('t.history'))}</div>
              <div class="col" style="flex:1;min-height:0;overflow:hidden;gap:.6vh;justify-content:flex-start">
                ${drawn.slice().reverse().slice(0, 12).map((d, i) => `
                  <div class="row ${i === 0 ? 'pop-in' : ''}" style="gap:8px;align-items:center;
                       padding:.5vh .6vw;border-radius:9px;flex:none;
                       background:${i === 0 ? 'var(--glow)' : 'var(--panel-2)'};
                       ${i === 0 ? 'border:1px solid var(--primary)' : ''};
                       opacity:${Math.max(.35, 1 - i * 0.06)}">
                    <span style="font:800 clamp(12px,1.1vw,21px)/1 var(--fd);color:var(--primary);
                                 min-width:2.2em;text-align:center;flex:none">${d.n}</span>
                    <span style="font-size:clamp(9px,.72vw,15px);line-height:1.25;overflow:hidden;
                                 display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">
                      ${SA.esc(d.text)}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </div>`;
    },

    /* ═══ PHONE ════════════════════════════════════════════════ */
    playerView(box, ctx) {
      const { live, me } = ctx;
      const drawn = live.drawn || [];
      const drawnSet = new Set(drawn.map(d => d.n));
      const last = drawn[drawn.length - 1];
      const ticket = me && me.ticket;
      const cfg = (ctx.round && ctx.round.config) || {};
      const claimCfg = (cfg.claims || CLAIMS).filter(c => c.on !== false);
      const mineClaims = Object.values(ctx.claims || {}).filter(c => c.uid === (SA.auth.uid || ''));

      if (!ticket) {
        box.innerHTML = `
          <div class="col center tc" style="gap:14px;padding:34px 10px">
            <img src="${SA.brand.logo}" style="width:96px;opacity:.55" alt="">
            <div class="mut">${SA.esc(SA.t('t.making_ticket'))}</div>
            ${last ? factCard(last) : ''}
          </div>`;
        return;
      }

      const grid = ticket.grid || [];
      const marked = grid.flat().filter(n => n && drawnSet.has(n)).length;

      box.innerHTML = `
        <div class="col" style="gap:13px">

          ${last ? factCard(last) : `<div class="sub tc mut sm">${SA.esc(SA.t('t.waiting_first'))}</div>`}

          <div class="card" style="padding:9px">
            <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px">
              ${grid.map(row => row.map(n => {
                if (!n) return `<div style="aspect-ratio:.86;border-radius:6px;background:var(--bg-deep);opacity:.35"></div>`;
                const out = drawnSet.has(n);
                return `<button data-cell="${n}" style="
                  aspect-ratio:.86;border-radius:6px;border:1px solid ${out ? 'transparent' : 'var(--bd)'};
                  background:${out ? 'var(--primary)' : 'var(--panel-2)'};
                  color:${out ? 'var(--on-primary)' : 'var(--tx)'};
                  font:800 clamp(12px,3.4vw,17px)/1 var(--fd);cursor:${out ? 'pointer' : 'default'};
                  transition:.2s;${out ? 'box-shadow:0 0 12px var(--glow)' : ''}">${n}</button>`;
              }).join('')).join('')}
            </div>
            <div class="spread" style="margin-top:9px">
              <span class="xs mut">${SA.esc(SA.t('t.ticket_no'))} #${ticket.serial}</span>
              <span class="xs" style="color:var(--primary)">${SA.t('t.marked', { a: marked })}</span>
            </div>
          </div>

          <div id="tb-fact" class="sub sm hide"></div>

          <div class="col" style="gap:7px">
            <span class="xs mut">${SA.t('t.make_claim')}</span>
            <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:7px">
              ${claimCfg.map(c => {
                const done = mineClaims.find(x => x.type === c.key);
                const valid = (CLAIMS.find(x => x.key === c.key) || {}).test;
                const can = valid ? valid(grid, drawnSet) : false;
                /* somebody already took this one — show who, and stop the
                   button rather than letting a doomed claim be sent */
                const taken = cfg.onceOnly !== false && (live.won || {})[c.key];
                if (taken && !done) {
                  return `<button class="btn sm ghost" disabled style="opacity:.55">
                    ✓ ${SA.esc(claimLabel(c))} · ${SA.esc(String(taken).slice(0, 14))}</button>`;
                }
                return `<button class="btn sm ${done ? '' : can ? 'p' : 'ghost'}"
                  data-claim="${c.key}" ${done || !can ? 'disabled' : ''}>
                  ${done ? (done.status === 'ok' ? '✓ ' : done.status === 'no' ? '✗ ' : '⏳ ') : ''}${SA.esc(claimLabel(c))}
                </button>`;
              }).join('')}
            </div>
            <div class="xs mut">${SA.t('t.claim_hint')}</div>
          </div>
        </div>`;

      /* tapping a cut number shows its fact — but only if it is drawn */
      box.querySelectorAll('[data-cell]').forEach(b => b.onclick = () => {
        const n = Number(b.dataset.cell);
        const d = drawn.find(x => x.n === n);
        const el = SA.$('tb-fact');
        if (!d) { el.classList.add('hide'); return; }
        el.classList.remove('hide');
        el.innerHTML = `<b style="color:var(--primary)">${n}</b> — ${SA.esc(d.text)}`;
      });

      box.querySelectorAll('[data-claim]').forEach(b => b.onclick = async () => {
        b.disabled = true;
        const type = b.dataset.claim;
        await SA.db.ref(SA.sess.P(ctx.sid) + '/claims/' + ctx.vid).push({
          uid: SA.auth.uid || 'anon',
          name: (ctx.me && ctx.me.name) || SA.t('guest'),
          type, at: Date.now(), status: 'new'
        });
        SA.toast(SA.t('t.claim_sent'));
      });

      function factCard(d) {
        return `<div class="card fade-in tc" style="border-color:var(--primary)">
          <div style="font:800 40px/1 var(--fd);color:var(--primary)">${d.n}</div>
          <div style="margin-top:8px;font-size:16px;font-weight:600">${SA.esc(d.text)}</div>
        </div>`;
      }
    }
  });

  /* ---------- paper ticket checker (host) ---------- */
  function paperCheck(ctx, drawnSet) {
    const code = (ctx.info && ctx.info.code) || ctx.sid;
    const el = document.createElement('div');
    el.className = 'ovl';
    el.innerHTML = `
      <div class="box card col" style="gap:13px">
        <h3 style="font-size:18px">${SA.t('t.paper_title')}</h3>
        <div class="sm mut">${SA.t('t.paper_note')}</div>
        <div class="row" style="gap:8px">
          <input type="number" id="ps" min="1" placeholder="${SA.esc(SA.t('t.ticket_num'))}" autofocus>
          <button class="btn p" id="pgo">${SA.t('t.see')}</button>
        </div>
        <div id="pout"></div>
        <button class="btn ghost" data-no>${SA.t('close')}</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('[data-no]').onclick = () => el.remove();
    el.onclick = e => { if (e.target === el) el.remove(); };

    const show = async () => {
      const s = Number(el.querySelector('#ps').value);
      if (!s) return;
      /* re-read: numbers are still being drawn while this is open */
      const fresh = await SA.db.ref(SA.sess.P(ctx.sid) + '/live/' + ctx.vid).once() || {};
      drawnSet = new Set((fresh.drawn || []).map(d => d.n));
      const grid = makeTicket(code + '-' + s);
      const hit = grid.flat().filter(n => n && drawnSet.has(n)).length;
      el.querySelector('#pout').innerHTML = `
        <div class="sub">
          <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px">
            ${grid.map(r => r.map(n => n
              ? `<div style="aspect-ratio:.86;display:grid;place-items:center;border-radius:6px;
                   font:800 13px/1 var(--fd);
                   background:${drawnSet.has(n) ? 'var(--primary)' : 'var(--panel-2)'};
                   color:${drawnSet.has(n) ? 'var(--on-primary)' : 'var(--tx)'}">${n}</div>`
              : `<div style="aspect-ratio:.86;border-radius:6px;background:var(--bg-deep);opacity:.3"></div>`
            ).join('')).join('')}
          </div>
          <div class="spread" style="margin-top:9px">
            <span class="xs mut">${SA.esc(SA.t('t.ticket_no'))} #${s}</span>
            <b style="color:${hit === 15 ? 'var(--ok)' : 'var(--primary)'}">${SA.t('t.marked', { a: hit })}${hit === 15 ? ' — ' + SA.t('t.full_house_ok') : ''}</b>
          </div>
        </div>`;
    };
    el.querySelector('#pgo').onclick = show;
    el.querySelector('#ps').addEventListener('keydown', e => { if (e.key === 'Enter') show(); });
  }

  /* ---------- paper claim (host registers it on the player's behalf) ---------- */
  /* drawnSet and live are re-read on validate, so they are `let` not `const` */
  function paperClaim(ctx, drawnSet, claimCfg, live) {
    const code = (ctx.info && ctx.info.code) || ctx.sid;
    const open = claimCfg.filter(c => c.on !== false);
    const el = document.createElement('div');
    el.className = 'ovl';
    el.innerHTML = `
      <div class="box card col" style="gap:13px">
        <h3 style="font-size:18px">${SA.esc(SA.t('t.paper_claim'))}</h3>
        <div class="grid g2">
          <div><label class="f">${SA.t('t.ticket_num')}</label>
            <input type="number" id="pc-s" min="1" autofocus></div>
          <div><label class="f">${SA.t('t.paper_who')}</label>
            <input type="text" id="pc-n" maxlength="40"></div>
        </div>
        <div><label class="f">${SA.t('t.which_claim')}</label>
          <select id="pc-c">
            ${open.map(c => `<option value="${c.key}" ${(live.won || {})[c.key] ? 'disabled' : ''}>
              ${SA.esc(claimLabel(c))} (+${c.pts})${(live.won || {})[c.key] ? ' — ' + SA.esc(SA.t('t.cp_taken')) : ''}
            </option>`).join('')}
          </select></div>
        <div id="pc-out"></div>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button class="btn ghost" data-no>${SA.esc(SA.t('close'))}</button>
          <button class="btn p" id="pc-go">${SA.esc(SA.t('t.validate'))}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('[data-no]').onclick = () => el.remove();
    el.onclick = e => { if (e.target === el) el.remove(); };

    el.querySelector('#pc-go').onclick = async () => {
      const s = Number(el.querySelector('#pc-s').value);
      const name = el.querySelector('#pc-n').value.trim() || SA.t('guest');
      const key = el.querySelector('#pc-c').value;
      if (!s) { el.querySelector('#pc-s').focus(); return; }

      /* Numbers keep being drawn while this dialog is open, so the snapshot
         taken when it opened is already out of date. Read the live list now
         or a genuine claim gets rejected. */
      const fresh = await SA.db.ref(SA.sess.P(ctx.sid) + '/live/' + ctx.vid).once() || {};
      drawnSet = new Set((fresh.drawn || []).map(d => d.n));
      live = fresh;

      const grid = makeTicket(code + '-' + s);
      const def = CLAIMS.find(x => x.key === key);
      const ok = def && def.test(grid, drawnSet);
      const cd = claimCfg.find(x => x.key === key) || { pts: 0 };

      el.querySelector('#pc-out').innerHTML = `
        <div class="sub" style="border-color:${ok ? 'var(--ok)' : 'var(--bad)'}">
          <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px">
            ${grid.map(r => r.map(n => n
              ? `<div style="aspect-ratio:.86;display:grid;place-items:center;border-radius:6px;font:800 13px/1 var(--fd);
                   background:${drawnSet.has(n) ? 'var(--primary)' : 'var(--panel-2)'};
                   color:${drawnSet.has(n) ? 'var(--on-primary)' : 'var(--tx)'}">${n}</div>`
              : `<div style="aspect-ratio:.86;border-radius:6px;background:var(--bg-deep);opacity:.3"></div>`
            ).join('')).join('')}
          </div>
          <div style="margin-top:9px;font-weight:800;color:${ok ? 'var(--ok)' : 'var(--bad)'}">
            ${ok ? '✓ ' + SA.esc(SA.t('t.claim_true', { x: name, y: claimLabel(cd) }))
                 : '✗ ' + SA.esc(SA.t('t.claim_false'))}</div>
        </div>`;

      if (!ok) return;
      await SA.db.ref(SA.sess.P(ctx.sid) + '/claims/' + ctx.vid).push({
        uid: SA.auth.uid || 'paper', name: name + ' (#' + s + ')',
        type: key, at: Date.now(), status: 'ok'
      });
      ctx.act({ won: Object.assign({}, live.won || {}, { [key]: name + ' (#' + s + ')' }) });
      SA.toast(SA.t('t.accepted', { x: name }));
      setTimeout(() => el.remove(), 1600);
    };
  }

  /* ---------- lucky draw ---------- */
  function luckyDraw(ctx, cfg, live) {
    const mode = cfg.playMode || 'hybrid';
    const paperUpto = Number(cfg.paperUpto ?? 200);
    const phonePlayers = Object.entries(ctx.players || {})
      .filter(([, p]) => p.ticket)
      .map(([uid, p]) => ({ uid, name: p.name, serial: p.ticket.serial }));

    const el = document.createElement('div');
    el.className = 'ovl';
    const sources = [
      mode !== 'mobile' && paperUpto > 0 ? 'paper' : null,
      phonePlayers.length ? 'phone' : null
    ].filter(Boolean);
    const allowAll = sources.length > 1;

    el.innerHTML = `
      <div class="box card col" style="gap:13px">
        <h3 style="font-size:18px">🍀 ${SA.esc(SA.t('t.lucky'))}</h3>
        ${sources.length ? `
          <div><label class="f">${SA.t('t.lucky_from')}</label>
            <select id="lk-src">
              ${allowAll ? `<option value="all">${SA.esc(SA.t('t.lf.all'))}</option>` : ''}
              ${sources.includes('paper') ? `<option value="paper">${SA.esc(SA.t('t.lf.paper'))} (1–${paperUpto})</option>` : ''}
              ${sources.includes('phone') ? `<option value="phone">${SA.esc(SA.t('t.lf.phone'))} (${phonePlayers.length})</option>` : ''}
            </select></div>
          <div id="lk-out" class="tc"></div>
          <div class="row" style="justify-content:flex-end;gap:8px">
            <button class="btn ghost" data-no>${SA.esc(SA.t('close'))}</button>
            <button class="btn ghost" id="lk-clear">${SA.esc(SA.t('t.lucky_clear'))}</button>
            <button class="btn p" id="lk-go">🍀 ${SA.esc(SA.t('t.lucky_btn'))}</button>
          </div>`
        : `<div class="mut sm">${SA.esc(SA.t('t.lucky_none'))}</div>
           <button class="btn ghost" data-no>${SA.esc(SA.t('close'))}</button>`}
      </div>`;
    document.body.appendChild(el);
    el.querySelector('[data-no]').onclick = () => el.remove();
    el.onclick = e => { if (e.target === el) el.remove(); };
    if (!sources.length) return;

    const pick = () => {
      const src = el.querySelector('#lk-src').value;
      let winner = null;

      const pickPaper = () => ({ serial: 1 + Math.floor(Math.random() * paperUpto), name: '', paper: true });
      const pickPhone = () => phonePlayers[Math.floor(Math.random() * phonePlayers.length)];

      if (src === 'paper') winner = pickPaper();
      else if (src === 'phone') winner = pickPhone();
      else {
        /* weight the two pools by how many tickets each really holds, so a
           hall of 200 paper tickets is not out-drawn by 5 phones */
        const total = paperUpto + phonePlayers.length;
        winner = Math.random() * total < paperUpto ? pickPaper() : pickPhone();
      }
      if (!winner) return;

      el.querySelector('#lk-out').innerHTML = `
        <div class="pop-in" style="padding:14px">
          <div class="xs mut">${SA.esc(SA.t('t.lucky_winner'))}</div>
          <div style="font:800 46px/1 var(--fd);color:var(--primary);margin-top:6px">#${winner.serial}</div>
          ${winner.name ? `<div style="font-weight:700;margin-top:6px">${SA.esc(winner.name)}</div>` : ''}
          <div class="sm mut" style="margin-top:4px">${SA.esc(winner.paper
            ? SA.t('t.lf.paper') : SA.t('t.lf.phone'))}</div>
        </div>`;
      el.querySelector('#lk-go').textContent = '🍀 ' + SA.t('t.lucky_again');
      /* put it on the projector too */
      ctx.act({ lucky: { serial: winner.serial, name: winner.name || '', paper: !!winner.paper, at: SA.db.now() } });
    };

    el.querySelector('#lk-go').onclick = pick;
    el.querySelector('#lk-clear').onclick = () => { ctx.act({ lucky: null }); el.querySelector('#lk-out').innerHTML = ''; };
  }

  /* claim names live in the dictionary so they follow the interface language */
  function claimLabel(c) { return SA.t(c.labelKey || ('t.cl.' + c.key)); }

  SA.tambola = { makeTicket, CLAIMS, corners, flat, claimLabel };
})();

