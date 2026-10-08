/* ── type: JUMBLE ──────────────────────────────────────────────────
   Scrambled letters or scrambled words; players type the answer.

   The hard part is Devanagari. Naively splitting "प्रतिमा" by character
   gives प ् र त ि म ा — matras torn off their consonants, which is both
   unreadable and a giveaway. So letters are split into *graphemes*:
   a consonant carries its matras, and a virama binds it to the next
   consonant, keeping क्ष and त्र whole.
   ────────────────────────────────────────────────────────────────── */
(function () {

  /* U+0900–U+0903 signs, U+093A–U+094C matras, U+094D virama,
     U+0951–U+0957 accents, U+0962–U+0963 vowel signs, U+200C/D joiners */
  const MARK = /[ऀ-ःऺ-ौॎॏ॑-ॗॢॣ‌‍̀-ͯ︀-️]/;
  const VIRAMA = '्';

  function graphemes(str) {
    const s = String(str || '');
    let base;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      base = [...new Intl.Segmenter('hi', { granularity: 'grapheme' }).segment(s)].map(x => x.segment);
    } else {
      base = [];
      for (const ch of s) {
        if (base.length && MARK.test(ch)) base[base.length - 1] += ch;
        else base.push(ch);
      }
    }
    /* glue conjuncts: anything ending in a virama absorbs the next cluster */
    const out = [];
    for (const g of base) {
      if (out.length && out[out.length - 1].endsWith(VIRAMA)) out[out.length - 1] += g;
      else out.push(g);
    }
    return out;
  }

  /* Comparison ignores case, spaces, danda and punctuation, so a player
     typing "प्रतिमा।" or " Pratima " still counts as right. */
  const norm = s => String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\s​-‍]+/g, '')
    .replace(/[।.,!?;:'"()\-–—_/\\]+/g, '')
    .trim();

  function scramble(item) {
    /* only the MAIN answer is scrambled — the alternatives are spellings
       we also accept, never something to show or shuffle */
    const ans = SA.alts.main(item.answer);
    const seed = item.id || ans;

    if (item.mode === 'words') {
      const w = ans.split(/\s+/).filter(Boolean);
      if (w.length < 2) return ans;
      let out = SA.shuffle(w, seed);
      /* a "scramble" that returns the original is a bug the room will notice */
      for (let i = 0; i < 6 && out.join(' ') === ans; i++) out = SA.shuffle(w, seed + i);
      return out.join('  ·  ');
    }

    const g = graphemes(ans.replace(/\s+/g, ''));
    if (g.length < 2) return ans;
    let out = SA.shuffle(g, seed);
    for (let i = 0; i < 6 && out.join('') === g.join(''); i++) out = SA.shuffle(g, seed + i);
    return out.join(' ');
  }

  /* Build the answer by tapping tiles. Joining with '' for letters and
     ' ' for words matches how the answer was written, so the existing
     comparison (which strips spaces anyway) keeps working unchanged. */
  const joinPicked = (p, pick) =>
    pick.map(i => (p.tiles || [])[i]).join(p.mode === 'words' ? ' ' : '');

  function tapUI(p, live, ctx) {
    const tiles = p.tiles || [];
    const pick = ctx.scratch.pick || (ctx.scratch.pick = []);
    const built = joinPicked(p, pick);
    const left = tiles.length - pick.length;
    const canAct = !!live.open;

    return `
      <div class="col" style="gap:11px">
        <div class="card tc" style="border-color:${built ? 'var(--primary)' : 'var(--bd)'};min-height:62px">
          <div class="xs mut">${SA.esc(SA.t('j.your_word'))}</div>
          <div style="font:800 26px/1.4 var(--fs);color:var(--primary);word-break:break-word;margin-top:3px">
            ${built ? SA.esc(built) : '—'}</div>
        </div>

        <div class="xs mut tc">${SA.esc(SA.t('j.tap_order'))}${
          left ? ' · ' + SA.esc(SA.t('j.tap_left', { x: left })) : ''}</div>

        <div class="row wrap-r" style="justify-content:center;gap:8px">
          ${tiles.map((tx, i) => {
            const used = pick.includes(i);
            return `<button class="btn ${used ? 'ghost' : 'p'}" data-tile="${i}"
              ${canAct && !used ? '' : 'disabled'}
              style="font:800 ${p.mode === 'words' ? '17' : '22'}px/1 var(--fs);
                     padding:${p.mode === 'words' ? '12px 16px' : '14px 18px'};
                     ${used ? 'opacity:.3' : ''}">${SA.esc(tx)}</button>`;
          }).join('')}
        </div>

        <div class="row" style="gap:8px">
          <button class="btn ghost grow" id="jm-undo" ${canAct && pick.length ? '' : 'disabled'}>
            ⌫ ${SA.esc(SA.t('j.undo'))}</button>
          <button class="btn ghost grow" id="jm-clear" ${canAct && pick.length ? '' : 'disabled'}>
            ↺ ${SA.esc(SA.t('j.clear'))}</button>
        </div>
        <button class="btn p wide big" id="jm-tapsend"
          ${canAct && pick.length === tiles.length && tiles.length ? '' : 'disabled'}>
          ${SA.esc(SA.t('play.send'))}</button>
      </div>`;
  }

  SA.types.register({
    key: 'jumble',
    label: 'Jumble word',
    icon: '🔤',

    /* answerMode 'tap' is the default on purpose. Typing punishes slow
       typists and anyone without a Devanagari keyboard, and a long
       conjunct word is painful to type under a clock. Tapping the tiles
       tests whether they know the word, which is the point. */
    defaults: () => ({ timer: 45, mode: 'letters', showLength: true, firstOnly: false,
                       answerMode: 'tap',
                       /* typed answers are judged kindly by default — see
                          SA.match in assets/text.js for what that means */
                       fuzzy: true, fuzzyPct: 90, roman: true }),

    newItem: () => ({ answer: '', hint: '', mode: 'letters', order: Date.now() }),

    /* fed to this type's own screenView by the Studio preview */
    sample: () => ({
      item: { id: 'prev', answer: SA.t('st.smp_word'), hint: SA.t('st.smp_hint'), mode: 'letters' },
      live: { phase: 'open', showHint: true }
    }),

    itemSummary: it => (SA.alts.main(it.answer) || SA.t('r.empty')) +
      (SA.alts.list(it.answer).length ? '  (+' + SA.alts.list(it.answer).length + ')' : '') +
      (it.hint ? '  · ' + SA.t('r.hint') + ': ' + it.hint : ''),

    payload(item, live, round) {
      const cfg = (round && round.config) || {};
      const it = Object.assign({}, item, { mode: item.mode || cfg.mode || 'letters' });
      const scrambled = scramble(it);
      const p = {
        scrambled,
        /* the same tiles the projector shows, so the phone and the big
           screen can never disagree about what there is to arrange */
        tiles: it.mode === 'words'
          ? scrambled.split('·').map(s => s.trim()).filter(Boolean)
          : scrambled.split(' ').filter(Boolean),
        answerMode: cfg.answerMode || 'tap',
        /* the phone cannot read sa/games, so whether it may offer English
           typing has to travel with the question */
        roman: cfg.roman !== false,
        hint: item.hint || '',
        mode: it.mode,
        len: cfg.showLength !== false
          ? (it.mode === 'words' ? SA.alts.main(item.answer).split(/\s+/).filter(Boolean).length
                                 : graphemes(SA.alts.main(item.answer).replace(/\s+/g, '')).length)
          : 0
      };
      if (live && live.reveal) p.answer = SA.alts.main(item.answer);
      return p;
    },

    /* "उत्तर1 | उत्तर2" accepts either spelling — useful when a word has
       two common transliterations. Beyond that, SA.match folds away the
       differences Hindi spells more than one way and, when the round
       allows it, forgives a typo or two on top. */
    check(item, value, round) {
      if (value == null || String(value).trim() === '') return null;
      if (!String(item.answer || '').trim()) return null;
      const cfg = (round && round.config) || {};
      /* Only typed rounds get the typo allowance. Tapping tiles is exact
         by construction — a near miss there means they built a different
         word, not that their thumb slipped. */
      const typed = (cfg.answerMode || 'tap') === 'type';
      return SA.match.test(value, item.answer, {
        fuzzy: typed && cfg.fuzzy !== false,
        pct: cfg.fuzzyPct || 90
      }).ok;
    },

    score(item, value, ms, round, cfg) {
      return Number((cfg && cfg.pointsCorrect) || 10);
    },

    /* ═══ STUDIO ═══════════════════════════════════════════════ */
    configForm(box, round, ctx) {
      const c = round.config || {};
      box.innerHTML = `
        <div class="grid g3">
          <div><label class="f">${SA.t('j.kind')}</label>
            <select data-k="mode">
              <option value="letters" ${c.mode!=='words'?'selected':''}>${SA.t('j.letters')}</option>
              <option value="words"   ${c.mode==='words'?'selected':''}>${SA.t('j.words')}</option>
            </select></div>
          <div><label class="f">${SA.t('r.timer')}</label>
            <input type="number" min="0" max="600" data-k="timer" value="${c.timer ?? 45}"></div>
        </div>
        <div style="border-top:1px solid var(--bd);margin-top:14px;padding-top:12px">
          <label class="f">${SA.t('j.answer_mode')}</label>
          <div class="col" style="gap:7px">
            ${['tap','type'].map(m => `
              <label class="chk sub" style="align-items:flex-start">
                <input type="radio" name="jam" value="${m}" ${(c.answerMode||'tap')===m?'checked':''} style="margin-top:3px">
                <span><b>${SA.esc(SA.t('j.mode_' + m))}</b>
                  <span class="sm mut" style="display:block">${SA.esc(SA.t('j.mode_' + m + '_d'))}</span></span>
              </label>`).join('')}
          </div>
        </div>
        <div class="col" style="gap:9px;margin-top:12px">
          <label class="chk"><input type="checkbox" data-k="showLength" ${c.showLength!==false?'checked':''}>
            ${SA.t('j.show_len')}</label>
          <label class="chk"><input type="checkbox" data-k="firstOnly" ${c.firstOnly?'checked':''}>
            ${SA.t('j.first_only')}</label>
        </div>
        ${(c.answerMode || 'tap') === 'type' ? SA.match.optionsForm(c) : ''}`;
      box.querySelectorAll('[name="jam"]').forEach(el => {
        el.onchange = () => {
          round.config.answerMode = el.value;
          if (ctx.redraw) ctx.redraw(); else ctx.change();
        };
      });
      box.querySelectorAll('[data-k]').forEach(el => {
        el.onchange = () => {
          round.config[el.dataset.k] = el.type === 'checkbox' ? el.checked
            : el.type === 'number' ? Number(el.value) : el.value;
          ctx.change();
        };
      });
    },

    editItem(box, item, ctx) {
      const mode = item.mode || (ctx.round.config && ctx.round.config.mode) || 'letters';
      const preview = scramble(Object.assign({}, item, { mode, id: item.id || 'preview' }));
      box.innerHTML = `
        <div><label class="f">${SA.t('j.answer')}</label>
          <input type="text" data-a="main" value="${SA.esc(SA.alts.main(item.answer))}"
                 placeholder="${SA.esc(SA.t('j.answer_ph'))}"></div>

        <div style="margin-top:11px"><label class="f">${SA.t('alt.label')}
            <span class="mut">(${SA.esc(SA.t('optional'))})</span></label>
          <textarea data-a="alts" rows="3"
            placeholder="${SA.esc(SA.t('alt.ph'))}">${SA.esc(SA.alts.text(item.answer))}</textarea>
          <div class="sm mut" style="margin-top:5px">${SA.t('alt.note')}</div></div>

        <div class="grid g2" style="margin-top:12px">
          <div><label class="f">${SA.t('r.hint')} (${SA.t('optional')})</label>
            <input type="text" data-k="hint" value="${SA.esc(item.hint)}"
                   placeholder="${SA.esc(SA.t('j.hint_ph'))}"></div>
          <div><label class="f">${SA.t('j.item_kind')}</label>
            <select data-k="mode">
              <option value="letters" ${mode!=='words'?'selected':''}>${SA.t('j.letters')}</option>
              <option value="words"   ${mode==='words'?'selected':''}>${SA.t('j.words')}</option>
            </select></div>
        </div>

        <div class="sub tc" style="margin-top:12px">
          <div class="xs mut">${SA.t('j.preview')}</div>
          <div style="font:800 24px/1.5 var(--fd);color:var(--primary);letter-spacing:.06em;margin-top:6px"
               id="jm-prev">${SA.esc(preview)}</div>
        </div>`;

      const redraw = () => {
        box.querySelector('#jm-prev').textContent =
          scramble(Object.assign({}, item, { mode: item.mode || mode, id: item.id || 'preview' }));
      };
      const syncAnswer = () => {
        item.answer = SA.alts.join(box.querySelector('[data-a="main"]').value,
                                   box.querySelector('[data-a="alts"]').value);
        redraw(); ctx.change();
      };
      box.querySelector('[data-a="main"]').oninput = syncAnswer;
      box.querySelector('[data-a="alts"]').oninput = syncAnswer;
      box.querySelector('[data-k="hint"]').oninput   = e => { item.hint = e.target.value; ctx.change(); };
      box.querySelector('[data-k="mode"]').onchange  = e => { item.mode = e.target.value; redraw(); ctx.change(); };
    },

    /* ═══ HOST ═════════════════════════════════════════════════ */
    hostPanel(box, ctx) {
      const { item, live, round } = ctx;
      const cfg = round.config || {};
      const phase = live.phase || 'idle';
      const self = SA.types.get('jumble');

      const rows = Object.entries(ctx.answers || {})
        .map(([uid, a]) => {
          const p = (ctx.players || {})[uid] || {};
          /* pct comes along so the host can see WHY a misspelling was
             let through — "88% match" beside the name, not a mystery */
          const m = SA.match.test(a.v, item.answer, {
            fuzzy: (cfg.answerMode || 'tap') === 'type' && cfg.fuzzy !== false,
            pct: cfg.fuzzyPct || 90
          });
          return { uid, v: a.v, at: a.at || 0, ok: self.check(item, a.v, round),
                   pct: m.pct, name: p.name || '—', city: p.city || '' };
        })
        .sort((a, b) => a.at - b.at);
      const right = rows.filter(r => r.ok);

      box.innerHTML = `
        <div class="card col" style="gap:13px">
          <div class="spread">
            <span class="pill p">${SA.esc(round.title)}</span>
            <span class="pill">${SA.t('r.phase.' + phase)}</span>
          </div>

          <div class="sub">
            <div class="xs mut">${SA.t('r.on_screen')}</div>
            <div style="font:800 22px/1.5 var(--fd);color:var(--primary);letter-spacing:.06em">
              ${SA.esc(self.payload(item, {}, round).scrambled)}</div>
            <div style="margin-top:9px"><span class="xs mut">${SA.t('r.correct_ans')} </span>
              <b style="color:var(--ok);font-size:17px">${SA.esc(SA.alts.main(item.answer) || '—')}</b>${
                SA.alts.list(item.answer).length ? "<span class='sm mut'> · " + SA.esc(SA.t('alt.count', { x: SA.alts.list(item.answer).length })) + "</span>" : ''}</div>
            ${item.hint ? `<div class="sm mut" style="margin-top:4px">${SA.t('r.hint')}: ${SA.esc(item.hint)}</div>` : ''}
          </div>

          <div class="row wrap-r" style="gap:7px">
            <button class="btn ${phase==='open'?'p':''}"   data-go="open">1 · ${SA.t('r.send')} ⏱</button>
            <button class="btn ${phase==='closed'?'p':''}" data-go="closed" ${phase!=='open'?'disabled':''}>2 · ${SA.t('r.close')}</button>
            <button class="btn ${live.reveal?'p':''}"      data-go="reveal" ${phase==='idle'?'disabled':''}>3 · ${SA.t('r.reveal')}</button>
            <button class="btn sm ghost" data-go="hint" ${phase==='idle'?'disabled':''}>
              ${live.showHint ? '🙈 ' + SA.t('r.hide_hint') : '💡 ' + SA.t('r.show_hint')}</button>
          </div>

          ${ctx.teams && Object.keys(ctx.teams).length ? `
            <div class="col" style="gap:8px;border-top:1px solid var(--bd);padding-top:11px">
              <span class="xs mut">${SA.t('r.teams_award')}</span>
              ${Object.entries(ctx.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).map(([tid,t]) => `
                <div class="row" style="gap:7px">
                  <span class="pill" style="border-color:${t.colour};color:${t.colour};min-width:96px">${SA.esc(t.name)}</span>
                  <button class="btn sm ok" data-tp="${tid}">+${cfg.pointsCorrect || ctx.cfg.pointsCorrect || 10} ${SA.t('r.right')}</button>
                  <span class="grow"></span><span class="sm mut">${t.score||0}</span>
                </div>`).join('')}
            </div>` : ''}

          <div class="col" style="gap:7px;border-top:1px solid var(--bd);padding-top:11px">
            <div class="spread">
              <span class="sm mut">📱 ${SA.t('r.n_answers', { x: rows.length })} · ${SA.t('r.n_right', { x: right.length })}</span>
              <button class="btn sm ok" data-settle ${phase==='idle'?'disabled':''}>⚖️ ${SA.t('host.give_points')}</button>
            </div>
            <div class="lb" style="max-height:230px;overflow:auto">
              ${rows.length ? rows.slice(0, 25).map((r, i) => `
                <div class="r" style="border-color:${r.ok ? 'var(--ok)' : 'var(--bd)'}">
                  <span class="n">${i + 1}</span>
                  <span class="grow nm"><b>${SA.esc(r.name)}</b>
                    <span class="sm mut"> · ${SA.esc(String(r.v).slice(0, 30))}</span>
                    ${r.pct > 0 && r.pct < 1 ? `<span class="xs mut" style="display:block">${
                      SA.esc(SA.t('host.near_miss', { x: Math.round(r.pct * 100) }))}</span>` : ''}</span>
                  <span class="s" style="color:${r.ok ? 'var(--ok)' : 'var(--bad)'}">${r.ok ? '✓' : '✗'}</span>
                </div>`).join('') : `<div class="mut sm tc" style="padding:16px">${SA.t('r.no_answers')}</div>`}
            </div>
          </div>
        </div>`;

      box.querySelectorAll('[data-go]').forEach(b => {
        b.onclick = () => {
          const k = b.dataset.go;
          if (k === 'hint')   { ctx.act({ showHint: !live.showHint }); return; }
          /* screen:'round' — if the projector is parked on the logo, the QR or
             the leaderboard, revealing must bring it back to the round, or the
             answer goes up where nobody can see it. */
          if (k === 'reveal') { ctx.act({ reveal: !live.reveal, phase: 'reveal', open: false, screen: 'round' }); return; }
          if (k === 'open') {
            const secs = Number(cfg.timer) || 0;
            ctx.act({ phase: 'open', screen: 'round', open: true, reveal: false, showHint: false,
                      startAt: SA.db.now(), endAt: secs ? SA.db.now() + secs * 1000 : 0 });
            return;
          }
          ctx.act({ phase: 'closed', open: false });
        };
      });
      box.querySelectorAll('[data-tp]').forEach(b => {
        b.onclick = () => {
          SA.sess.addTeamPoints(ctx.sid, ctx.vid, b.dataset.tp,
            Number(cfg.pointsCorrect || ctx.cfg.pointsCorrect || 10));
          SA.toast(SA.t('host.points_added'));
        };
      });
      const s = box.querySelector('[data-settle]');
      if (s) s.onclick = () => ctx.settle();
    },

    /* ═══ PROJECTOR ════════════════════════════════════════════ */
    screenView(box, ctx) {
      const { live } = ctx;
      const p = live.payload || {};
      if ((live.phase || 'idle') === 'idle' || !p.scrambled) {
        box.innerHTML = SA.render.logoScreen(ctx.title); return;
      }

      const tiles = p.mode === 'words'
        ? p.scrambled.split('·').map(s => s.trim()).filter(Boolean)
        : p.scrambled.split(' ').filter(Boolean);

      box.innerHTML = `
        <div class="col center" style="gap:clamp(16px,3vh,38px);height:100%;padding:2vh 3vw">
          <div class="row wrap-r" style="justify-content:center;gap:clamp(8px,1.2vw,18px)">
            ${tiles.map(t => `
              <span class="pop-in" style="
                display:grid;place-items:center;
                min-width:clamp(52px,${p.mode === 'words' ? 9 : 5}vw,${p.mode === 'words' ? 220 : 120}px);
                padding:clamp(10px,1.4vw,22px) clamp(12px,1.6vw,26px);
                border-radius:16px;background:var(--panel);border:2px solid var(--primary);
                box-shadow:0 0 26px var(--glow);
                font:800 clamp(26px,3.4vw,64px)/1.1 var(--fs);color:var(--primary)">
                ${SA.esc(t)}</span>`).join('')}
          </div>

          ${p.len ? `<div class="mut" style="font-size:.62em;letter-spacing:.14em">
            ${p.len} ${p.mode === 'words' ? SA.t('j.n_words') : SA.t('j.n_letters')}</div>` : ''}

          ${live.showHint && p.hint ? `<div class="card fade-in" style="border-color:var(--accent);font-size:.62em">
            💡 ${SA.esc(p.hint)}</div>` : ''}

          ${live.reveal && p.answer ? `<div class="col center fade-in" style="gap:6px">
            <div class="xs mut">${SA.t('r.correct_ans')}</div>
            <div style="font:800 clamp(30px,4.4vw,76px)/1.1 var(--fs);color:var(--ok);
                        text-shadow:0 0 34px var(--ok-glow)">${SA.esc(p.answer)}</div>
          </div>` : ''}

          <div id="q-timer"></div>
        </div>`;
    },

    /* ═══ PHONE ════════════════════════════════════════════════ */
    playerView(box, ctx) {
      const { live, mine } = ctx;
      const p = live.payload || {};
      if ((live.phase || 'idle') === 'idle' || !p.scrambled) {
        box.innerHTML = `<div class="col center tc mut" style="gap:12px;padding:40px 10px">
            <img src="${SA.brand.logo}" style="width:96px;opacity:.55" alt="">
            <div>${SA.esc(SA.t('play.wait_puzzle'))}</div></div>`;
        return;
      }
      const answered = mine && mine.v != null;
      /* judged with the same settings the host used, so the phone never
         says "wrong" about an answer the panel counted */
      const ok = answered && SA.types.get('jumble').check({ answer: p.answer }, mine.v, ctx.round);

      box.innerHTML = `
        <div class="col" style="gap:14px">
          <div class="card tc">
            <div class="xs mut">${SA.esc(SA.t('j.arrange'))}</div>
            <div style="font:800 26px/1.5 var(--fd);color:var(--primary);letter-spacing:.08em;margin-top:6px;word-break:break-word">
              ${SA.esc(p.scrambled)}</div>
            ${p.len ? `<div class="sm mut" style="margin-top:6px">${p.len} ${
              p.mode === 'words' ? SA.t('j.n_words') : SA.t('j.n_letters')}</div>` : ''}
          </div>

          ${live.showHint && p.hint ? `<div class="sub sm fade-in">💡 ${SA.esc(p.hint)}</div>` : ''}

          ${answered && !ctx.scratch.editing
            ? (live.reveal
              ? `<div class="card tc" style="border-color:${ok ? 'var(--ok)' : 'var(--bad)'}">
                   <div class="xs mut">${SA.esc(SA.t('play.your_answer'))}</div>
                   <div style="font:800 21px/1.4 var(--fs);margin-top:4px">${SA.esc(mine.v)}</div>
                   <div style="margin-top:9px;font-weight:800;color:${ok ? 'var(--ok)' : 'var(--bad)'}">
                     ${ok ? '🎉 ' + SA.esc(SA.t('play.correct')) : '✗ ' + SA.esc(SA.t('play.wrong'))}</div>
                 </div>`
              : SA.render.sentCard(mine.v, !!live.open))
            : (p.answerMode === 'type'
              ? `<div class="col" style="gap:9px">
                   ${SA.match.inputBox('jm-in', { roman: p.roman !== false, disabled: !live.open })}
                   <button class="btn p wide big" id="jm-send" ${live.open ? '' : 'disabled'}>${SA.esc(SA.t('play.send'))}</button>
                 </div>`
              : tapUI(p, live, ctx))}

          ${live.reveal && p.answer ? `<div class="sub tc fade-in">
            <span class="xs mut">${SA.esc(SA.t('r.correct_ans'))}</span>
            <div style="font:800 21px/1.3 var(--fd);color:var(--ok);margin-top:3px">${SA.esc(p.answer)}</div>
          </div>` : ''}

          <div class="tc sm mut">${SA.esc(live.open ? SA.t('play.faster') :
            answered ? SA.t('play.recorded_s') : SA.t('play.wait_open'))}</div>
        </div>`;

      const ed = box.querySelector('#ans-edit');
      if (ed) ed.onclick = () => {
        ctx.scratch.editing = true; ctx.scratch.pick = []; ctx.rerender();
      };

      const inp = box.querySelector('#jm-in'), btn = box.querySelector('#jm-send');
      /* tl is null when the round did not offer English typing, in which
         case what is in the box is what gets sent */
      const tl = inp ? SA.match.wireInput(box, 'jm-in') : null;
      if (btn) {
        const send = () => {
          const v = tl ? tl.value() : inp.value.trim();
          if (!v) { inp.focus(); return; }
          btn.disabled = inp.disabled = true;
          btn.textContent = SA.t('play.sending');
          ctx.scratch.editing = false;
          ctx.submit(v);
        };
        btn.onclick = send;
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
      }

      /* ---- tap-to-build ---- */
      box.querySelectorAll('[data-tile]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.tile);
        const cur = ctx.scratch.pick || (ctx.scratch.pick = []);
        if (!cur.includes(i)) cur.push(i);
        ctx.rerender();
      });
      const un = box.querySelector('#jm-undo'), cl = box.querySelector('#jm-clear'),
            ts = box.querySelector('#jm-tapsend');
      if (un) un.onclick = () => { (ctx.scratch.pick || []).pop(); ctx.rerender(); };
      if (cl) cl.onclick = () => { ctx.scratch.pick = []; ctx.rerender(); };
      if (ts) ts.onclick = () => {
        const v = joinPicked(p, ctx.scratch.pick || []);
        if (!v) return;
        ts.disabled = true; ts.textContent = SA.t('play.sending');
        ctx.scratch.editing = false;
        ctx.submit(v);
      };
    }
  });

  /* exposed so the custom builder and tests can reuse the same logic */
  SA.jumble = { graphemes, scramble, norm };
})();


