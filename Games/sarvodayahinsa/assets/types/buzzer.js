/* ── type: BUZZER / RAPID FIRE ─────────────────────────────────────
   Two shapes under one type, because both are scored by speed:

     buzz   — a prompt goes up, everyone taps BUZZ, the host sees the
              order they came in and decides who was right.
     order  — the fastest-finger round: four items, shuffled, players
              put them into the correct order. Correct first, then time.

   Timing uses the server clock (SA.db.now), never the device clock —
   a phone running five seconds fast would otherwise win every round.
   ────────────────────────────────────────────────────────────────── */
(function () {

  const eq = (a, b) => Array.isArray(a) && Array.isArray(b) &&
                       a.length === b.length && a.every((v, i) => String(v) === String(b[i]));

  /* 1st place gets the full amount, last place on the board gets the floor. */
  function rankPoints(rank, cfg) {
    const top = Number(cfg.topPoints) || 50;
    const floor = Number(cfg.floorPoints) || 5;
    const depth = Number(cfg.rankDepth) || 10;
    if (rank >= depth) return 0;
    return Math.round(top - (top - floor) * (rank / Math.max(1, depth - 1)));
  }

  SA.types.register({
    key: 'buzzer',
    label: 'Buzzer / rapid fire',
    icon: '⚡',

    defaults: () => ({
      mode: 'order', timer: 20,
      topPoints: 50, floorPoints: 5, rankDepth: 10,
      correctOnly: true        // only players with the right order get ranked
    }),

    newItem: () => ({ q: '', mode: '', items: ['', '', '', ''], order: Date.now() }),

    /* fed to this type's own screenView by the Studio preview */
    sample: () => ({
      item: { id: 'prev', q: SA.t('st.smp_order'), mode: 'order',
              items: [SA.t('st.opt_first'), SA.t('st.opt_right'), SA.t('st.opt_third'), SA.t('st.opt_fourth')] },
      live: { phase: 'open' }
    }),

    itemSummary: it => (it.q || SA.t('r.empty')).slice(0, 70) +
      (it.items && it.items.filter(Boolean).length ? '  · ' + it.items.filter(Boolean).length : ''),

    payload(item, live, round) {
      const cfg = (round && round.config) || {};
      const mode = item.mode || cfg.mode || 'order';
      const p = { q: item.q || '', mode };
      if (mode === 'order') {
        const items = (item.items || []).filter(s => String(s).trim() !== '');
        /* seeded by item id so every phone sees the same shuffle —
           otherwise players compare screens and get confused */
        p.items = SA.shuffle(items.map((t, i) => ({ i, t })), item.id);
        if (live && live.reveal) p.answer = items;
      }
      return p;
    },

    check(item, value, round) {
      const mode = item.mode || (round && round.config && round.config.mode) || 'order';
      if (mode !== 'order') return null;       // buzz rounds are judged by the host
      if (!Array.isArray(value)) return null;
      const correct = (item.items || []).filter(s => String(s).trim() !== '').map((_, i) => i);
      return eq(value.map(Number), correct);
    },

    score(item, value, ms, round, cfg) {
      return Number((cfg && cfg.pointsCorrect) || 10);   // rank points are added in the host panel
    },

    /* ═══ STUDIO ═══════════════════════════════════════════════ */
    configForm(box, round, ctx) {
      const c = round.config || {};
      box.innerHTML = `
        <div class="grid g3">
          <div><label class="f">${SA.t('b.kind')}</label>
            <select data-k="mode">
              <option value="order" ${c.mode!=='buzz'?'selected':''}>${SA.t('b.order')}</option>
              <option value="buzz"  ${c.mode==='buzz'?'selected':''}>${SA.t('b.buzz')}</option>
            </select></div>
          <div><label class="f">${SA.t('r.timer')}</label>
            <input type="number" min="0" max="300" data-k="timer" value="${c.timer ?? 20}"></div>
        </div>
        <div class="grid g3" style="margin-top:12px">
          <div><label class="f">${SA.t('b.top_pts')}</label>
            <input type="number" min="0" data-k="topPoints" value="${c.topPoints ?? 50}"></div>
          <div><label class="f">${SA.t('b.floor_pts')}</label>
            <input type="number" min="0" data-k="floorPoints" value="${c.floorPoints ?? 5}"></div>
          <div><label class="f">${SA.t('b.depth')}</label>
            <input type="number" min="1" max="50" data-k="rankDepth" value="${c.rankDepth ?? 10}"></div>
        </div>
        <label class="chk" style="margin-top:12px">
          <input type="checkbox" data-k="correctOnly" ${c.correctOnly!==false?'checked':''}>
          ${SA.t('b.correct_only')}</label>
        <div class="sub sm mut" style="margin-top:10px">
          ${SA.t('b.scale_note', { a: c.topPoints ?? 50, b: c.rankDepth ?? 10, c: c.floorPoints ?? 5 })}</div>`;
      box.querySelectorAll('[data-k]').forEach(el => {
        el.onchange = () => {
          round.config[el.dataset.k] = el.type === 'checkbox' ? el.checked
            : el.type === 'number' ? Number(el.value) : el.value;
          ctx.change();
        };
      });
    },

    editItem(box, item, ctx) {
      const mode = item.mode || (ctx.round.config && ctx.round.config.mode) || 'order';
      while ((item.items || []).length < 4) (item.items = item.items || []).push('');
      box.innerHTML = `
        <div><label class="f">${SA.t('b.prompt')}</label>
          <textarea data-k="q" rows="2"
            placeholder="${SA.esc(mode === 'order' ? SA.t('b.prompt_ph') : SA.t('q.question'))}">${SA.esc(item.q)}</textarea></div>

        <div class="grid g2" style="margin-top:12px">
          <div><label class="f">${SA.t('b.item_kind')}</label>
            <select data-k="mode">
              <option value="" ${!item.mode?'selected':''}>${SA.esc(SA.t('b.same_round', {
                x: mode === 'order' ? SA.t('b.order') : SA.t('b.buzz') }))}</option>
              <option value="order" ${item.mode==='order'?'selected':''}>${SA.t('b.order')}</option>
              <option value="buzz"  ${item.mode==='buzz'?'selected':''}>${SA.t('b.buzz')}</option>
            </select></div>
        </div>

        <div id="ord-box" class="${mode === 'buzz' && item.mode !== 'order' ? 'hide' : ''}"
             style="margin-top:12px">
          <label class="f">${SA.t('b.write_order')}</label>
          <div class="col" style="gap:7px">
            ${item.items.map((v, i) => `
              <div class="row" style="gap:8px">
                <span class="pill p" style="min-width:32px;justify-content:center">${i + 1}</span>
                <input type="text" data-it="${i}" class="grow" value="${SA.esc(v)}"
                       placeholder="${SA.esc(SA.t('b.nth', { x: i + 1 }))}">
              </div>`).join('')}
          </div>
          <div class="row" style="gap:7px;margin-top:9px">
            <button class="btn sm" data-add>+ ${SA.t('b.add_more')}</button>
            <button class="btn sm ghost" data-del ${item.items.length <= 2 ? 'disabled' : ''}>− ${SA.t('b.remove_last')}</button>
          </div>
        </div>`;

      box.querySelector('[data-k="q"]').oninput = e => { item.q = e.target.value; ctx.change(); };
      box.querySelector('[data-k="mode"]').onchange = e => { item.mode = e.target.value; ctx.redraw(); };
      box.querySelectorAll('[data-it]').forEach(el => {
        el.oninput = () => { item.items[Number(el.dataset.it)] = el.value; ctx.change(); };
      });
      const add = box.querySelector('[data-add]'), del = box.querySelector('[data-del]');
      if (add) add.onclick = () => { item.items.push(''); ctx.redraw(); };
      if (del) del.onclick = () => { item.items.pop(); ctx.redraw(); };
    },

    /* ═══ HOST ═════════════════════════════════════════════════ */
    hostPanel(box, ctx) {
      const { item, live, round } = ctx;
      const cfg = round.config || {};
      const mode = item.mode || cfg.mode || 'order';
      const phase = live.phase || 'idle';
      const self = SA.types.get('buzzer');
      const correctItems = (item.items || []).filter(s => String(s).trim() !== '');

      const rows = Object.entries(ctx.answers || {})
        .map(([uid, a]) => {
          const p = (ctx.players || {})[uid] || {};
          return {
            uid, v: a.v, at: a.at || 0,
            ms: live.startAt ? Math.max(0, (a.at || 0) - live.startAt) : 0,
            ok: mode === 'order' ? self.check(item, a.v, round) : null,
            name: p.name || '—', city: p.city || '', awarded: a.pts
          };
        })
        .sort((a, b) => a.at - b.at);

      const ranked = (cfg.correctOnly !== false && mode === 'order')
        ? rows.filter(r => r.ok) : rows;

      box.innerHTML = `
        <div class="card col" style="gap:13px">
          <div class="spread">
            <span class="pill p">${SA.esc(round.title)}</span>
            <span class="pill">${mode === 'order' ? SA.t('b.order') : SA.t('b.buzz')} · ${SA.t('r.phase.' + phase)}</span>
          </div>

          <div class="sub">
            <div style="font-weight:700">${SA.esc(item.q || SA.t('r.empty'))}</div>
            ${mode === 'order' ? `<div class="col" style="gap:4px;margin-top:9px">
              ${correctItems.map((t, i) => `<div class="row sm" style="gap:8px">
                 <span class="pill ok" style="min-width:28px;justify-content:center">${i + 1}</span>
                 <span>${SA.esc(t)}</span></div>`).join('')}
            </div>` : ''}
          </div>

          <div class="row wrap-r" style="gap:7px">
            <button class="btn ${phase==='open'?'p':''}"   data-go="open">1 · ${SA.t('r.send')} ⏱</button>
            <button class="btn ${phase==='closed'?'p':''}" data-go="closed" ${phase!=='open'?'disabled':''}>2 · ${SA.t('r.close')}</button>
            <button class="btn ${live.reveal?'p':''}"      data-go="reveal" ${phase==='idle'?'disabled':''}>3 · ${SA.t('b.result')}</button>
            <button class="btn sm ghost" data-go="board" ${!ranked.length?'disabled':''}>📊 ${SA.t('b.top_screen')}</button>
          </div>

          ${ctx.teams && Object.keys(ctx.teams).length ? `
            <div class="col" style="gap:8px;border-top:1px solid var(--bd);padding-top:11px">
              <span class="xs mut">${SA.t('host.stage_teams')}</span>
              ${Object.entries(ctx.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).map(([tid,t]) => `
                <div class="row" style="gap:7px">
                  <span class="pill" style="border-color:${t.colour};color:${t.colour};min-width:96px">${SA.esc(t.name)}</span>
                  <button class="btn sm ok" data-tp="${tid}|${cfg.topPoints||50}">+${cfg.topPoints||50}</button>
                  <button class="btn sm" data-tp="${tid}|${Math.round((cfg.topPoints||50)/2)}">+${Math.round((cfg.topPoints||50)/2)}</button>
                  <span class="grow"></span><span class="sm mut">${t.score||0}</span>
                </div>`).join('')}
            </div>` : ''}

          <div class="col" style="gap:7px;border-top:1px solid var(--bd);padding-top:11px">
            <div class="spread">
              <span class="sm mut">📱 ${SA.t('b.n_in', { x: rows.length })}${
                mode === 'order' ? ' · ' + SA.t('r.n_right', { x: rows.filter(r=>r.ok).length }) : ''}</span>
              <button class="btn sm ok" data-award ${!ranked.length?'disabled':''}>🏅 ${SA.t('b.award')}</button>
            </div>
            <div class="lb" style="max-height:250px;overflow:auto">
              ${ranked.length ? ranked.slice(0, 25).map((r, i) => `
                <div class="r">
                  <span class="n">${i + 1}</span>
                  <span class="grow"><b>${SA.esc(r.name)}</b>
                    ${r.city ? `<span class="sm mut"> · ${SA.esc(r.city)}</span>` : ''}
                    <span class="sm mut"> · ${(r.ms / 1000).toFixed(2)}s</span></span>
                  <span class="s">${rankPoints(i, cfg)}</span>
                </div>`).join('') : `<div class="mut sm tc" style="padding:16px">${SA.t('r.no_answers')}</div>`}
            </div>
          </div>
        </div>`;

      box.querySelectorAll('[data-go]').forEach(b => {
        b.onclick = () => {
          const k = b.dataset.go;
          if (k === 'open') {
            const secs = Number(cfg.timer) || 0;
            ctx.act({ phase: 'open', screen: 'round', open: true, reveal: false, top: null,
                      startAt: SA.db.now(), endAt: secs ? SA.db.now() + secs * 1000 : 0 });
            return;
          }
          if (k === 'closed') { ctx.act({ phase: 'closed', open: false }); return; }
          if (k === 'reveal') { ctx.act({ reveal: !live.reveal, phase: 'reveal', open: false, screen: 'round' }); return; }
          if (k === 'board') {
            ctx.act({ top: ranked.slice(0, 10).map((r, i) => ({
              name: r.name, city: r.city || '', ms: r.ms, pts: rankPoints(i, cfg)
            })) });
          }
        };
      });

      box.querySelectorAll('[data-tp]').forEach(b => {
        b.onclick = () => {
          const [tid, pts] = b.dataset.tp.split('|');
          SA.sess.addTeamPoints(ctx.sid, ctx.vid, tid, Number(pts));
          SA.toast('+' + pts);
        };
      });

      const aw = box.querySelector('[data-award]');
      if (aw) aw.onclick = async () => {
        aw.disabled = true; aw.textContent = SA.t('b.awarding');
        let given = 0;
        for (let i = 0; i < ranked.length; i++) {
          const pts = rankPoints(i, cfg);
          if (!pts) break;
          await SA.sess.addPlayerPoints(ctx.sid, ranked[i].uid, pts);
          await SA.db.ref(SA.sess.P(ctx.sid) + '/answers/' + round.id + '/' + item.id + '/' + ranked[i].uid)
                     .update({ ok: ranked[i].ok === null ? true : ranked[i].ok, pts });
          given++;
        }
        SA.toast(SA.t('host.scored', { x: given }));
      };
    },

    /* ═══ PROJECTOR ════════════════════════════════════════════ */
    screenView(box, ctx) {
      const { live } = ctx;
      const p = live.payload || {};
      if ((live.phase || 'idle') === 'idle' || !p.q) { box.innerHTML = SA.render.logoScreen(ctx.title); return; }

      /* the ranked board replaces everything once the host pushes it */
      if (live.top && live.top.length) {
        box.innerHTML = `
          <div class="col" style="gap:clamp(10px,1.6vh,22px);height:100%;justify-content:center;padding:2vh 4vw">
            <div class="tc" style="font:800 clamp(22px,2.6vw,46px)/1.2 var(--fd);color:var(--primary)">
              🏅 ${SA.esc(SA.t('b.fastest'))}</div>
            <div class="lb" style="font-size:.66em">
              ${live.top.map((r, i) => `
                <div class="r pop-in" style="animation-delay:${i * 60}ms">
                  <span class="n">${i + 1}</span>
                  <span class="grow"><b>${SA.esc(r.name)}</b>
                    ${r.city ? `<span class="mut" style="font-size:.8em"> · ${SA.esc(r.city)}</span>` : ''}</span>
                  <span class="mut" style="font-size:.78em;margin-right:12px">${(r.ms / 1000).toFixed(2)}s</span>
                  <span class="s">+${r.pts}</span>
                </div>`).join('')}
            </div>
          </div>`;
        return;
      }

      box.innerHTML = `
        <div class="col center" style="gap:clamp(14px,2.4vh,34px);height:100%;padding:2vh 3vw">
          <div class="q-text tc">${SA.esc(p.q)}</div>

          ${p.mode === 'order' ? `
            <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(400px,100%),1fr));
                                     gap:clamp(9px,1.2vw,18px);width:100%">
              ${(p.items || []).map((it, i) => `
                <div class="opt" style="cursor:default">
                  <span class="lbl">${SA.render.LETTERS[i]}</span>
                  <span class="tx grow">${SA.esc(it.t)}</span>
                </div>`).join('')}
            </div>` : `
            <div style="font:800 clamp(40px,7vw,120px)/1 var(--fd);color:var(--primary);
                        text-shadow:0 0 50px var(--glow)">⚡</div>`}

          ${live.reveal && p.answer ? `
            <div class="col fade-in" style="gap:7px;width:100%">
              <div class="xs mut tc">${SA.esc(SA.t('b.order'))}</div>
              ${p.answer.map((t, i) => `
                <div class="opt correct" style="cursor:default">
                  <span class="lbl">${i + 1}</span><span class="tx grow">${SA.esc(t)}</span>
                </div>`).join('')}
            </div>` : ''}

          <div id="q-timer"></div>
        </div>`;
    },

    /* ═══ PHONE ════════════════════════════════════════════════ */
    playerView(box, ctx) {
      const { live, mine } = ctx;
      const p = live.payload || {};
      if ((live.phase || 'idle') === 'idle' || !p.q) {
        box.innerHTML = `<div class="col center tc mut" style="gap:12px;padding:40px 10px">
            <img src="${SA.brand.logo}" style="width:96px;opacity:.55" alt="">
            <div>${SA.esc(SA.t('play.wait_round'))}</div></div>`;
        return;
      }
      const answered = mine && mine.v != null;

      /* ---- simple buzz ---- */
      if (p.mode !== 'order') {
        box.innerHTML = `
          <div class="col" style="gap:16px">
            <div class="card tc" style="font-size:17px;font-weight:700">${SA.esc(p.q)}</div>
            <button class="btn ${answered ? '' : 'p'}" id="bz"
                    ${live.open && !answered ? '' : 'disabled'}
                    style="height:180px;font-size:34px;border-radius:50%;width:180px;margin:6px auto">
              ${answered ? '✓' : 'BUZZ'}</button>
            <div class="tc sm mut">${SA.esc(answered ? SA.t('b.buzz_saved') :
              live.open ? SA.t('b.press_first') : SA.t('play.wait_open'))}</div>
          </div>`;
        const b = box.querySelector('#bz');
        if (b) b.onclick = () => {
          ctx.submit(SA.db.now());
          b.disabled = true; b.textContent = '✓'; b.classList.remove('p');
        };
        return;
      }

      /* ---- ordering ---- */
      const items = p.items || [];
      const picked = answered ? (mine.v || []) : (ctx.scratch.pick || []);

      box.innerHTML = `
        <div class="col" style="gap:13px">
          <div class="card tc" style="font-size:16px;font-weight:700">${SA.esc(p.q)}</div>
          <div class="xs mut tc">${SA.esc(SA.t('b.tap_order'))}</div>

          <div class="col" style="gap:8px">
            ${items.map(it => {
              const pos = picked.indexOf(it.i);
              return `<button class="opt ${pos >= 0 ? 'locked' : ''}" data-pick="${it.i}"
                        ${answered || !live.open ? 'disabled' : ''}>
                        <span class="lbl">${pos >= 0 ? pos + 1 : '·'}</span>
                        <span class="tx grow">${SA.esc(it.t)}</span>
                      </button>`;
            }).join('')}
          </div>

          ${answered ? `<div class="tc sm"><b style="color:var(--primary)">✓ ${SA.esc(SA.t('b.order_saved'))}</b></div>`
            : `<div class="row" style="gap:8px">
                 <button class="btn ghost grow" id="bz-clear" ${picked.length ? '' : 'disabled'}>↺ ${SA.esc(SA.t('b.again'))}</button>
                 <button class="btn p grow" id="bz-send"
                   ${live.open && picked.length === items.length ? '' : 'disabled'}>
                   ${SA.esc(SA.t('play.send'))} (${picked.length}/${items.length})</button>
               </div>`}

          ${live.reveal && p.answer ? `<div class="sub fade-in">
            <div class="xs mut">${SA.esc(SA.t('b.order'))}</div>
            ${p.answer.map((t, i) => `<div class="sm"><b>${i + 1}.</b> ${SA.esc(t)}</div>`).join('')}
          </div>` : ''}
        </div>`;

      box.querySelectorAll('[data-pick]').forEach(b => {
        b.onclick = () => {
          const i = Number(b.dataset.pick);
          const cur = ctx.scratch.pick || (ctx.scratch.pick = []);
          const at = cur.indexOf(i);
          if (at >= 0) cur.splice(at, 1); else cur.push(i);
          ctx.rerender();
        };
      });
      const clr = box.querySelector('#bz-clear'), snd = box.querySelector('#bz-send');
      if (clr) clr.onclick = () => { ctx.scratch.pick = []; ctx.rerender(); };
      if (snd) snd.onclick = () => {
        ctx.submit((ctx.scratch.pick || []).slice());
        snd.disabled = true; snd.textContent = '✓ ' + SA.t('play.sent');
      };
    }
  });

  SA.buzzer = { rankPoints };
})();

