/* ── type: QUIZ ────────────────────────────────────────────────────
   Multiple choice, the कौन बनेगा सिद्धात्मा pattern made general.

   Flow the host drives:
     idle → shown (question only) → options → open (timer, phones answer)
          → closed → reveal (correct answer + explanation)

   The correct answer is never published until `reveal`. Up to that
   moment it exists only in the host's browser and in the admin-only
   part of the database.
   ────────────────────────────────────────────────────────────────── */
SA.types.register({
  key: 'quiz',
  label: 'Quiz',
  icon: '❓',

  defaults: () => ({
    optionCount: 4,
    timer: 30,
    shuffleOptions: false,
    lifelines: true,
    showTallyLive: false      // keep the bars hidden until the host pushes them
  }),

  newItem: () => ({ q: '', opts: ['', '', '', ''], correct: 0, explain: '', fifty: [], order: Date.now() }),

  /* What the Studio shows under "this is how the projector will look".
     It is fed to this type's own screenView, so the preview is the real
     thing rather than a drawing of it, and cannot drift out of date. */
  sample: () => ({
    item: { q: SA.t('st.smp_q'), opts: [SA.t('st.opt_first'), SA.t('st.opt_right'),
                                        SA.t('st.opt_third'), SA.t('st.opt_fourth')], correct: 1 },
    live: { phase: 'options', reveal: true, endAt: 0 }
  }),

  itemSummary: it => (it.q || SA.t('r.empty')).slice(0, 90) +
                     '  →  ' + (SA.render.LETTERS[it.correct || 0]),

  /* ---------- what leaves the host's machine ---------- */
  payload(item, live, round) {
    const cfg = (round && round.config) || {};
    let opts = (item.opts || []).slice(0, cfg.optionCount || 4);
    let map = opts.map((_, i) => i);
    if (cfg.shuffleOptions) {
      /* seeded by the item id so screen and every phone shuffle alike */
      map = SA.shuffle(map, item.id);
      opts = map.map(i => item.opts[i]);
    }
    const p = { q: item.q || '', opts, map };
    if (live && live.reveal) {
      p.correct = map.indexOf(item.correct || 0);
      p.explain = item.explain || '';
    }
    if (live && live.fifty) p.hidden = live.fifty;
    return p;
  },

  check(item, value) {
    if (value == null || value === '') return null;
    return Number(value) === Number(item.correct || 0);
  },

  score(item, value, ms, round, cfg) {
    return Number((cfg && cfg.pointsCorrect) || 10);
  },

  /* ═══ STUDIO ═════════════════════════════════════════════════ */
  configForm(box, round, ctx) {
    const c = round.config || {};
    box.innerHTML = `
      <div class="grid g3">
        <div><label class="f">${SA.t('q.opt_count')}</label>
          <select data-k="optionCount">
            ${[2,3,4,5,6].map(n => `<option value="${n}" ${(c.optionCount||4)==n?'selected':''}>${n}</option>`).join('')}
          </select></div>
        <div><label class="f">${SA.t('r.timer')}</label>
          <input type="number" min="0" max="600" data-k="timer" value="${c.timer ?? 30}"></div>
      </div>
      <div class="col" style="gap:9px;margin-top:12px">
        <label class="chk"><input type="checkbox" data-k="shuffleOptions" ${c.shuffleOptions?'checked':''}>
          ${SA.t('q.shuffle')}</label>
        <label class="chk"><input type="checkbox" data-k="lifelines" ${c.lifelines!==false?'checked':''}>
          ${SA.t('q.lifelines')}</label>
        <label class="chk"><input type="checkbox" data-k="showTallyLive" ${c.showTallyLive?'checked':''}>
          ${SA.t('q.show_tally')}</label>
      </div>`;
    box.querySelectorAll('[data-k]').forEach(el => {
      el.onchange = () => {
        const v = el.type === 'checkbox' ? el.checked
                : el.type === 'number' ? Number(el.value) : el.value;
        round.config[el.dataset.k] = el.dataset.k === 'optionCount' ? Number(v) : v;
        ctx.change();
      };
    });
  },

  editItem(box, item, ctx) {
    const n = (ctx.round.config && ctx.round.config.optionCount) || 4;
    while ((item.opts || []).length < n) (item.opts = item.opts || []).push('');
    box.innerHTML = `
      <div><label class="f">${SA.t('q.question')}</label>
        <textarea data-k="q" rows="2" placeholder="${SA.esc(SA.t('q.question_ph'))}">${SA.esc(item.q)}</textarea></div>

      <div class="col" style="gap:8px;margin-top:12px">
        <label class="f">${SA.t('q.options')}</label>
        ${Array.from({ length: n }, (_, i) => `
          <div class="row" style="gap:9px">
            <label class="chk" title="${SA.esc(SA.t('q.right_answer'))}">
              <input type="radio" name="corr" value="${i}" ${(item.correct||0)===i?'checked':''}
                     style="width:19px;height:19px">
            </label>
            <span class="pill" style="min-width:34px;justify-content:center">${SA.render.LETTERS[i]}</span>
            <input type="text" data-opt="${i}" class="grow" value="${SA.esc(item.opts[i] || '')}"
                   placeholder="${SA.esc(SA.t('q.option_n', { x: SA.render.LETTERS[i] }))}">
            <label class="chk sm mut" title="${SA.esc(SA.t('q.fifty_title'))}">
              <input type="checkbox" data-fifty="${i}" ${(item.fifty||[]).includes(i)?'checked':''}>50:50
            </label>
          </div>`).join('')}
      </div>

      <div style="margin-top:12px"><label class="f">${SA.t('q.explain')}</label>
        <textarea data-k="explain" rows="2" placeholder="${SA.esc(SA.t('q.explain_ph'))}">${SA.esc(item.explain)}</textarea></div>
      <div class="sm mut" style="margin-top:6px">${SA.t('q.fifty_note')}</div>`;

    box.querySelector('[data-k="q"]').oninput       = e => { item.q = e.target.value; ctx.change(); };
    box.querySelector('[data-k="explain"]').oninput = e => { item.explain = e.target.value; ctx.change(); };
    box.querySelectorAll('[data-opt]').forEach(el => {
      el.oninput = () => { item.opts[Number(el.dataset.opt)] = el.value; ctx.change(); };
    });
    box.querySelectorAll('[name="corr"]').forEach(el => {
      el.onchange = () => { item.correct = Number(el.value); ctx.change(); };
    });
    box.querySelectorAll('[data-fifty]').forEach(el => {
      el.onchange = () => {
        const i = Number(el.dataset.fifty);
        const s = new Set(item.fifty || []);
        el.checked ? s.add(i) : s.delete(i);
        item.fifty = [...s].slice(0, 2);
        ctx.change();
      };
    });
  },

  /* ═══ HOST ═══════════════════════════════════════════════════ */
  hostPanel(box, ctx) {
    const { item, live, round } = ctx;
    const cfg = round.config || {};
    const phase = live.phase || 'idle';
    const n = (item.opts || []).length;

    /* how phones have voted so far */
    const tally = Array(n).fill(0);
    let votes = 0;
    Object.values(ctx.answers || {}).forEach(a => {
      const i = Number(a.v);
      if (i >= 0 && i < n) { tally[i]++; votes++; }
    });

    const step = (k, label, on, disabled) =>
      `<button class="btn ${on ? 'p' : ''}" data-go="${k}" ${disabled ? 'disabled' : ''}>${label}</button>`;

    box.innerHTML = `
      <div class="card col" style="gap:13px">
        <div class="spread">
          <span class="pill p">${SA.esc(round.title)}</span>
          <span class="pill">${SA.t('r.phase.' + phase)}</span>
        </div>

        <div class="sub">
          <div style="font-weight:700;font-size:17px">${SA.esc(item.q || SA.t('r.empty'))}</div>
          <div class="col" style="gap:5px;margin-top:10px">
            ${(item.opts || []).map((o, i) => `
              <div class="row sm" style="gap:8px">
                <span class="pill ${i === (item.correct||0) ? 'ok' : ''}" style="min-width:30px;justify-content:center">
                  ${SA.render.LETTERS[i]}</span>
                <span class="grow">${SA.esc(o)}</span>
                <span class="mut" style="min-width:56px;text-align:right">
                  ${votes ? Math.round(tally[i] / votes * 100) + '%' : '—'} (${tally[i]})</span>
              </div>`).join('')}
          </div>
          ${item.explain ? `<div class="sm" style="margin-top:10px;color:var(--accent)">
            📖 ${SA.esc(item.explain)}</div>` : ''}
        </div>

        <div class="row wrap-r" style="gap:7px">
          ${step('shown',  '1 · ' + SA.t('q.s1'), phase === 'shown')}
          ${step('options','2 · ' + SA.t('q.s2'), phase === 'options', phase === 'idle')}
          ${step('open',   '3 · ' + SA.t('q.s3') + ' ⏱', phase === 'open', phase === 'idle' || phase === 'shown')}
          ${step('closed', '4 · ' + SA.t('q.s4'), phase === 'closed', phase !== 'open')}
          ${step('reveal', '5 · ' + SA.t('q.s5') + ' ✓', live.reveal, phase === 'idle' || phase === 'shown')}
        </div>

        ${cfg.lifelines !== false ? `
          <div class="row wrap-r" style="gap:7px;border-top:1px solid var(--bd);padding-top:11px">
            <span class="xs mut" style="align-self:center">${SA.t('q.lifeline')}</span>
            <button class="btn sm ${live.fifty ? 'on' : ''}" data-ll="fifty">50:50</button>
            <button class="btn sm ${live.showTally ? 'on' : ''}" data-ll="tally">📊 ${SA.t('q.graph')}</button>
          </div>` : ''}

        ${ctx.teams && Object.keys(ctx.teams).length ? teamRow(ctx, item, live) : ''}

        <div class="row" style="gap:7px;border-top:1px solid var(--bd);padding-top:11px">
          <span class="sm mut grow">📱 ${SA.t('host.answers_in', { x: votes })}</span>
          <button class="btn sm ok" data-settle ${phase === 'open' || phase === 'closed' ? '' : 'disabled'}>
            ⚖️ ${SA.t('host.give_points')}</button>
        </div>
      </div>`;

    /* --- wiring --- */
    box.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.go;
        if (k === 'reveal') {
          ctx.act({ reveal: !live.reveal, phase: 'reveal', open: false, screen: 'round' });
          if (!live.reveal) awardTeams(ctx, item);
          return;
        }
        const patch = { phase: k, screen: 'round' };
        patch.open = (k === 'open');
        if (k === 'shown') { patch.reveal = false; patch.fifty = null; patch.teamAns = null; patch.showTally = false; }
        if (k === 'open') {
          const secs = Number(cfg.timer) || 0;
          patch.startAt = SA.db.now();
          patch.endAt = secs ? SA.db.now() + secs * 1000 : 0;
        }
        ctx.act(patch);
      };
    });

    box.querySelectorAll('[data-ll]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.ll === 'tally') { ctx.act({ showTally: !live.showTally }); return; }
        if (live.fifty) { ctx.act({ fifty: null }); return; }
        let hide = (item.fifty || []).filter(i => i !== (item.correct || 0));
        if (hide.length < 2) {
          /* nothing marked in the CMS — drop two wrong ones at random and say so */
          const wrong = (item.opts || []).map((_, i) => i).filter(i => i !== (item.correct || 0));
          hide = SA.shuffle(wrong).slice(0, 2);
          SA.toast(SA.t('q.fifty_auto'));
        }
        ctx.act({ fifty: hide.slice(0, 2) });
      };
    });

    box.querySelectorAll('[data-team-ans]').forEach(b => {
      b.onclick = () => {
        const [tid, i] = b.dataset.teamAns.split('|');
        const cur = Object.assign({}, live.teamAns || {});
        if (String(cur[tid]) === i) delete cur[tid]; else cur[tid] = Number(i);
        ctx.act({ teamAns: Object.keys(cur).length ? cur : null });
      };
    });

    const s = box.querySelector('[data-settle]');
    if (s) s.onclick = () => ctx.settle();
  },

  /* ═══ PROJECTOR ══════════════════════════════════════════════ */
  screenView(box, ctx) {
    const { live } = ctx;
    const p = live.payload || {};
    const phase = live.phase || 'idle';

    if (phase === 'idle' || !p.q) { box.innerHTML = SA.render.logoScreen(ctx.title); return; }

    const showOpts = phase !== 'shown';
    const tally = live.showTally ? (live.tally || null) : null;

    box.innerHTML = `
      <div class="col" style="gap:clamp(14px,2vh,30px);height:100%;justify-content:center;padding:2vh 3vw">
        <div class="q-text tc">${SA.esc(p.q)}</div>

        ${showOpts ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:clamp(10px,1.4vw,20px)">
          ${SA.render.options(p.opts, {
            disabled: true,
            reveal: live.reveal,
            correct: p.correct,
            hidden: p.hidden || []
          })}
        </div>` : ''}

        ${tally ? tallyBars(p.opts, tally) : ''}

        ${live.reveal && p.explain ? `
          <div class="card fade-in" style="border-color:var(--accent);font-size:.62em;line-height:1.5">
            <b style="color:var(--accent)">📖 </b>${SA.esc(p.explain)}
          </div>` : ''}

        <div class="row" style="justify-content:center">
          <div id="q-timer"></div>
        </div>
      </div>`;

    function tallyBars(opts, t) {
      const total = t.reduce((a, b) => a + b, 0) || 1;
      return `<div class="col" style="gap:8px;font-size:.6em">` + opts.map((o, i) => `
        <div class="row" style="gap:10px">
          <span class="pill" style="min-width:36px;justify-content:center">${SA.render.LETTERS[i]}</span>
          <span class="grow">${SA.render.bar(t[i] / total * 100)}</span>
          <b style="min-width:58px;text-align:right">${Math.round(t[i] / total * 100)}%</b>
        </div>`).join('') + `</div>`;
    }
  },

  /* ═══ PHONE ══════════════════════════════════════════════════ */
  playerView(box, ctx) {
    const { live, mine } = ctx;
    const p = live.payload || {};
    const phase = live.phase || 'idle';

    if (phase === 'idle' || !p.q) {
      box.innerHTML = `<div class="col center tc mut" style="gap:12px;padding:40px 10px">
          <img src="${SA.brand.logo}" style="width:96px;opacity:.55" alt="">
          <div>${SA.esc(SA.t('play.wait_q'))}</div></div>`;
      return;
    }

    const answered = mine && mine.v != null;
    const canAnswer = live.open && !answered;

    box.innerHTML = `
      <div class="col" style="gap:14px">
        <div class="card" style="font-size:17px;font-weight:700;line-height:1.45">${SA.esc(p.q)}</div>

        ${phase === 'shown'
          ? `<div class="mut tc sm" style="padding:18px">${SA.esc(SA.t('play.reading'))}</div>`
          : `<div class="col" style="gap:9px">
               ${SA.render.options(p.opts, {
                 disabled: !canAnswer,
                 locked: answered ? Number(mine.v) : undefined,
                 reveal: live.reveal,
                 correct: p.correct,
                 wrong: (live.reveal && answered && Number(mine.v) !== p.correct) ? Number(mine.v) : undefined,
                 hidden: p.hidden || []
               })}
             </div>`}

        <div class="tc sm" id="p-status">${statusLine()}</div>
        ${live.reveal && p.explain
          ? `<div class="sub sm fade-in" style="border-color:var(--accent)">📖 ${SA.esc(p.explain)}</div>` : ''}
      </div>`;

    box.querySelectorAll('.opt').forEach(b => {
      b.onclick = () => {
        if (!canAnswer) return;
        const i = Number(b.dataset.opt);
        ctx.submit(i);
        /* lock the moment they tap — waiting for the round trip feels broken */
        box.querySelectorAll('.opt').forEach(x => { x.disabled = true; x.classList.remove('locked'); });
        b.classList.add('locked');
        SA.$('p-status').innerHTML = '<b style="color:var(--primary)">✓ ' + SA.esc(SA.t('play.recorded')) + '</b>';
      };
    });

    function statusLine() {
      if (live.reveal) {
        if (!answered) return '<span class="mut">' + SA.esc(SA.t('play.no_answer')) + '</span>';
        return Number(mine.v) === p.correct
          ? '<b style="color:var(--ok)">🎉 ' + SA.esc(SA.t('play.correct')) + '</b>'
          : '<b style="color:var(--bad)">' + SA.esc(SA.t('play.wrong')) + '</b>';
      }
      if (answered) return '<b style="color:var(--primary)">✓ ' + SA.esc(SA.t('play.recorded')) + '</b>';
      if (live.open) return '<span class="mut">' + SA.esc(SA.t('play.pick_one')) + '</span>';
      if (phase === 'closed') return '<span class="mut">' + SA.esc(SA.t('play.closed')) + '</span>';
      return '<span class="mut">' + SA.esc(SA.t('play.wait_open')) + '</span>';
    }
  }
});

/* ---------- stage-team helpers (shared by the panel above) ---------- */
function teamRow(ctx, item, live) {
  const list = Object.entries(ctx.teams)
    .map(([id, t]) => Object.assign({ id }, t))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const ans = live.teamAns || {};
  return `<div class="col" style="gap:8px;border-top:1px solid var(--bd);padding-top:11px">
    <span class="xs mut">${SA.t('q.teams_enter')}</span>
    ${list.map(t => `
      <div class="row" style="gap:7px">
        <span class="pill" style="border-color:${t.colour};color:${t.colour};min-width:96px">${SA.esc(t.name)}</span>
        ${(item.opts || []).map((_, i) => `
          <button class="btn sm ${String(ans[t.id]) === String(i) ? 'p' : ''}"
                  data-team-ans="${t.id}|${i}">${SA.render.LETTERS[i]}</button>`).join('')}
        <span class="grow"></span>
        <span class="sm mut">${t.score || 0}</span>
      </div>`).join('')}
  </div>`;
}

function awardTeams(ctx, item) {
  const ans = (ctx.live && ctx.live.teamAns) || {};
  const pts = Number((ctx.cfg && ctx.cfg.pointsCorrect) || 10);
  let hit = 0;
  Object.entries(ans).forEach(([tid, v]) => {
    if (Number(v) === Number(item.correct || 0)) {
      SA.sess.addTeamPoints(ctx.sid, ctx.vid, tid, pts);
      hit++;
    } else if (Number(ctx.cfg && ctx.cfg.pointsWrong)) {
      SA.sess.addTeamPoints(ctx.sid, ctx.vid, tid, Number(ctx.cfg.pointsWrong));
    }
  });
  if (hit) SA.toast(SA.t('q.teams_got', { a: hit, b: pts }));
}
