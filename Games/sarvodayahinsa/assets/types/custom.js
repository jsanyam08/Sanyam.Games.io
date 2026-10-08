/* ── type: CUSTOM ──────────────────────────────────────────────────
   Invent your own format without writing code.

   A custom round is a stack of decisions:

     1. PROJECTOR  which blocks appear, in what order, and how each one
                   is sized, aligned and coloured
     2. PHONE      what the player is asked for — nothing, choose one,
                   choose several, type, number, slider, rating, order,
                   true/false, buzzer
     3. TIMER      length, whether it shows, when it turns red, whether
                   it closes and reveals by itself
     4. SCORING    flat points, position points, speed bonus, part marks,
                   first-only, tolerance on numbers
     5. PER ITEM   any item can override the round's timer and points

   Nothing is drawn from scratch — every block reuses the renderers the
   built-in types use, so a format you invent still looks like part of
   the product rather than a bolted-on page.
   ────────────────────────────────────────────────────────────────── */
(function () {

  /* Blocks are objects, not bare names, so each one carries its own
     look. Older rounds stored plain strings; `normBlocks` upgrades
     those on read so nothing built earlier breaks. */
  const BLOCK_KEYS = ['title', 'text', 'image', 'options', 'timer', 'answerBig', 'leaderboard', 'teams', 'spacer'];

  const SIZES  = ['s', 'm', 'l', 'xl'];
  const ALIGNS = ['left', 'center', 'right'];
  const COLS   = ['default', 'primary', 'accent', 'ok', 'bad'];

  const INPUTS = ['none', 'mcq', 'multi', 'truefalse', 'text', 'number', 'slider', 'rating', 'order', 'buzz'];

  const SIZE_SCALE = { s: .66, m: 1, l: 1.45, xl: 2.05 };
  const COL_VAR = { default: 'var(--tx)', primary: 'var(--primary)', accent: 'var(--accent)',
                    ok: 'var(--ok)', bad: 'var(--bad)' };

  function normBlocks(list) {
    return (list || []).map(b => (typeof b === 'string'
      ? { type: b, size: 'm', align: 'center', colour: b === 'title' ? 'primary' : 'default' }
      : Object.assign({ size: 'm', align: 'center', colour: 'default' }, b)))
      .filter(b => BLOCK_KEYS.includes(b.type));
  }

  const needsOptions = input => ['mcq', 'multi', 'order'].includes(input);

  /* an item may override the round */
  const timerOf  = (item, cfg) => (item && item.timer  != null && item.timer  !== '') ? Number(item.timer)  : Number(cfg.timer || 0);
  const pointsOf  = (item, cfg, gcfg) => (item && item.points != null && item.points !== '') ? Number(item.points)
                                       : Number(cfg.pointsCorrect != null ? cfg.pointsCorrect : (gcfg && gcfg.pointsCorrect) || 10);

  SA.types.register({
    key: 'custom',
    label: 'Custom builder',
    icon: '🧩',

    defaults: () => ({
      blocks: [
        { type:'title', size:'l',  align:'center', colour:'primary' },
        { type:'text',  size:'m',  align:'center', colour:'default' },
        { type:'options', size:'m', align:'left',  colour:'default' },
        { type:'timer', size:'m',  align:'center', colour:'default' }
      ],
      layout: 'stack',
      optionCols: 0,            // 0 = automatic
      optionStyle: 'letters',
      animate: true,

      input: 'mcq',
      shuffleOptions: false,
      allowChange: false,
      sliderMin: 0, sliderMax: 100, sliderStep: 1,
      ratingMax: 5,

      timer: 30,
      showTimer: true,
      warnAt: 5,
      autoClose: true,
      autoReveal: false,

      pointsCorrect: 10,
      pointsWrong: 0,
      speedBonus: 0,
      firstOnly: false,
      rankPoints: false, topPoints: 50, floorPoints: 5, rankDepth: 10,
      partialCredit: false,
      caseSensitive: false,
      tolerance: 0,
      /* typed answers are judged kindly by default — SA.match in
         assets/text.js says exactly how kindly */
      fuzzy: true, fuzzyPct: 90, roman: true,

      phoneScore: true,
      phoneBoard: false
    }),

    newItem: () => ({ title: '', text: '', image: '', opts: ['', '', '', ''],
                      correct: 0, correctSet: [], answer: '', explain: '',
                      timer: '', points: '', order: Date.now() }),

    /* fed to this type's own screenView by the Studio preview, so the
       blocks the host actually chose are what they see */
    sample: () => ({
      item: { id: 'prev', title: SA.t('st.smp_title'), text: SA.t('st.smp_q'),
              opts: [SA.t('st.opt_first'), SA.t('st.opt_right'),
                     SA.t('st.opt_third'), SA.t('st.opt_fourth')],
              correct: 1, answer: SA.t('st.opt_right') },
      live: { phase: 'open', reveal: true }
    }),

    itemSummary: it => (it.title || it.text || SA.t('r.empty')).slice(0, 80),

    /* ---------- what leaves the host's machine ---------- */
    payload(item, live, round) {
      const cfg = round.config || {};
      const blocks = normBlocks(cfg.blocks);
      const input = cfg.input || 'none';
      const p = {
        blocks, input,
        layout: cfg.layout || 'stack',
        optionCols: cfg.optionCols || 0,
        optionStyle: cfg.optionStyle || 'letters',
        animate: cfg.animate !== false,
        allowChange: !!cfg.allowChange,
        showTimer: cfg.showTimer !== false,
        warnAt: Number(cfg.warnAt) || 5,
        phoneScore: cfg.phoneScore !== false,
        phoneBoard: !!cfg.phoneBoard
      };

      if (blocks.some(b => b.type === 'title'))  p.title = item.title || '';
      if (blocks.some(b => b.type === 'text'))   p.text  = item.text || '';
      if (blocks.some(b => b.type === 'image'))  p.image = item.image || '';

      if (input === 'slider') { p.min = Number(cfg.sliderMin) || 0; p.max = Number(cfg.sliderMax) || 100; p.step = Number(cfg.sliderStep) || 1; }
      if (input === 'rating') p.ratingMax = Number(cfg.ratingMax) || 5;
      if (input === 'truefalse') p.opts = [SA.t('c.true'), SA.t('c.false')];
      /* the phone cannot read sa/games, so whether it may offer English
         typing has to travel with the question */
      if (input === 'text') p.roman = cfg.roman !== false;

      if (blocks.some(b => b.type === 'options') || needsOptions(input)) {
        const opts = (item.opts || []).filter(s => String(s).trim() !== '');
        if (input === 'order') {
          p.opts = SA.shuffle(opts.map((t, i) => ({ i, t })), item.id);
        } else if (cfg.shuffleOptions) {
          const map = SA.shuffle(opts.map((_, i) => i), item.id);
          p.opts = map.map(i => opts[i]);
          p.map = map;
        } else {
          p.opts = opts;
        }
      }

      /* answers only ever ride along once the host has revealed */
      if (live && live.reveal) {
        if (input === 'mcq' || input === 'truefalse') {
          p.correct = p.map ? p.map.indexOf(item.correct || 0) : (item.correct || 0);
        }
        if (input === 'multi') {
          const set = item.correctSet || [];
          p.correctSet = p.map ? set.map(i => p.map.indexOf(i)).filter(i => i >= 0) : set;
        }
        if (input === 'order')  p.answer = (item.opts || []).filter(s => String(s).trim() !== '');
        if (['text', 'number', 'slider', 'rating'].includes(input)) p.answer = item.answer || '';
        p.explain = item.explain || '';
      }
      return p;
    },

    check(item, value, round) {
      const cfg = (round && round.config) || {};
      const input = cfg.input || 'none';
      if (value == null || value === '') return null;

      if (input === 'mcq' || input === 'truefalse') return Number(value) === Number(item.correct || 0);

      if (input === 'multi') {
        if (!Array.isArray(value)) return null;
        const want = (item.correctSet || []).map(Number).sort();
        const got = value.map(Number).sort();
        return want.length === got.length && want.every((v, i) => v === got[i]);
      }

      if (input === 'number' || input === 'slider' || input === 'rating') {
        if (item.answer === '' || item.answer == null) return null;
        const tol = Math.abs(Number(cfg.tolerance) || 0);
        return Math.abs(Number(value) - Number(item.answer)) <= tol;
      }

      if (input === 'text') {
        if (!String(item.answer || '').trim()) return null;
        return SA.match.test(value, item.answer, {
          caseSensitive: !!cfg.caseSensitive,
          fuzzy: cfg.fuzzy !== false,
          pct: cfg.fuzzyPct || 90
        }).ok;
      }

      if (input === 'order') {
        if (!Array.isArray(value)) return null;
        const correct = (item.opts || []).filter(s => String(s).trim() !== '').map((_, i) => i);
        return value.length === correct.length && value.every((v, i) => Number(v) === correct[i]);
      }
      return null;   // buzz / none — the host decides
    },

    /* Part marks matter for multi-select and ordering, where "almost
       right" is a real thing and all-or-nothing feels unfair. Because
       part marks by definition apply to answers that are NOT right,
       this type scores every answer and owns the wrong-answer figure
       too — see scoreAlways in SA.sess.settle. */
    scoreAlways: true,

    score(item, value, ms, round, gcfg) {
      const cfg = (round && round.config) || {};
      const full = pointsOf(item, cfg, gcfg);
      const input = cfg.input || 'none';

      if (cfg.partialCredit && input === 'multi' && Array.isArray(value)) {
        const want = new Set((item.correctSet || []).map(Number));
        if (want.size) {
          let hit = 0, miss = 0;
          value.map(Number).forEach(v => want.has(v) ? hit++ : miss++);
          return Math.round(full * Math.max(0, (hit - miss) / want.size));
        }
      }
      if (cfg.partialCredit && input === 'order' && Array.isArray(value)) {
        const correct = (item.opts || []).filter(s => String(s).trim() !== '').map((_, i) => i);
        if (correct.length) {
          const hit = value.filter((v, i) => Number(v) === correct[i]).length;
          return Math.round(full * (hit / correct.length));
        }
      }
      /* everything else is all or nothing */
      const ok = SA.types.get('custom').check(item, value, round);
      return ok === true ? full : (Number(cfg.pointsWrong) || 0);
    },

    /* ═══ STUDIO ═══════════════════════════════════════════════ */
    configForm(box, round, ctx) {
      const c = round.config || (round.config = {});
      c.blocks = normBlocks(c.blocks.length ? c.blocks : ['title', 'text']);
      const input = c.input || 'none';
      const redraw = () => { ctx.change(); SA.types.get('custom').configForm(box, round, ctx); };

      const sel = (k, list, labeller, cur) => `
        <select data-k="${k}">
          ${list.map(v => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>
            ${SA.esc(labeller(v))}</option>`).join('')}
        </select>`;

      box.innerHTML = `
        <div class="col" style="gap:18px">

          <!-- ══ 1. PROJECTOR ══ -->
          <div>
            <label class="f">${SA.t('c.step1')}</label>
            <div class="col" style="gap:7px" id="blk-list">
              ${c.blocks.map((b, i) => `
                <div class="sub col" style="gap:8px;padding:9px 11px">
                  <div class="row" style="gap:8px">
                    <span class="pill p" style="min-width:26px;justify-content:center">${i + 1}</span>
                    <span class="grow"><b class="sm">${SA.esc(SA.t('c.blk.' + b.type))}</b>
                      <span class="sm mut" style="display:block">${SA.esc(SA.t('c.blk.' + b.type + '.h'))}</span></span>
                    <button class="btn sm ghost" data-bup="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
                    <button class="btn sm ghost" data-bdn="${i}" ${i === c.blocks.length - 1 ? 'disabled' : ''}>▼</button>
                    <button class="btn sm ghost" data-brm="${i}">✕</button>
                  </div>
                  ${b.type === 'spacer' ? '' : `
                  <div class="row wrap-r" style="gap:8px">
                    <span class="xs mut" style="align-self:center">${SA.t('c.size')}</span>
                    ${SIZES.map(s => `<button class="btn sm ${b.size === s ? 'p' : ''}"
                       data-bsize="${i}|${s}">${SA.esc(SA.t('c.size.' + s))}</button>`).join('')}
                    <span class="xs mut" style="align-self:center;margin-left:6px">${SA.t('c.align')}</span>
                    ${ALIGNS.map(a => `<button class="btn sm ${b.align === a ? 'p' : ''}"
                       data-balign="${i}|${a}">${SA.esc(SA.t('c.align.' + a))}</button>`).join('')}
                    <span class="xs mut" style="align-self:center;margin-left:6px">${SA.t('c.colour')}</span>
                    ${COLS.map(k => `<button class="btn sm ${b.colour === k ? 'p' : ''}"
                       data-bcol="${i}|${k}" title="${SA.esc(SA.t('c.col.' + k))}"
                       style="min-width:30px;${k === 'default' ? '' : 'color:' + COL_VAR[k]}">
                       ${k === 'default' ? '–' : '●'}</button>`).join('')}
                  </div>`}
                </div>`).join('') || `<div class="mut sm">${SA.t('c.no_blocks')}</div>`}
            </div>
            <div class="row wrap-r" style="gap:6px;margin-top:9px">
              <span class="xs mut" style="align-self:center">${SA.t('c.blk_add')}</span>
              ${BLOCK_KEYS.map(k => `<button class="btn sm" data-badd="${k}">+ ${SA.esc(SA.t('c.blk.' + k))}</button>`).join('')}
            </div>

            <div class="grid g3" style="margin-top:12px">
              <div><label class="f">${SA.t('c.layout')}</label>
                ${sel('layout', ['stack','split','centered'], v => SA.t('c.lay.' + v), c.layout || 'stack')}</div>
              <div><label class="f">${SA.t('c.opt_cols')}</label>
                ${sel('optionCols', [0,1,2,3], v => v === 0 ? SA.t('c.auto') : String(v), c.optionCols || 0)}</div>
              <div><label class="f">${SA.t('c.opt_style')}</label>
                ${sel('optionStyle', ['letters','numbers','plain'], v => SA.t('c.opt.' + v), c.optionStyle || 'letters')}</div>
            </div>
            <label class="chk" style="margin-top:10px"><input type="checkbox" data-k="animate"
              ${c.animate !== false ? 'checked' : ''}>${SA.t('c.animate')}</label>
          </div>

          <!-- ══ 2. PHONE ══ -->
          <div style="border-top:1px solid var(--bd);padding-top:14px">
            <label class="f">${SA.t('c.step2')}</label>
            <div class="grid g2">
              ${INPUTS.map(i => `
                <label class="chk sub"><input type="radio" name="cin" value="${i}"
                  ${input === i ? 'checked' : ''}>${SA.esc(SA.t('c.in.' + i))}</label>`).join('')}
            </div>

            ${needsOptions(input) ? `
              <div class="col" style="gap:9px;margin-top:11px">
                ${input !== 'order' ? `<label class="chk"><input type="checkbox" data-k="shuffleOptions"
                  ${c.shuffleOptions ? 'checked' : ''}>${SA.t('c.shuffle')}</label>` : ''}
              </div>` : ''}

            ${input === 'slider' ? `
              <div class="grid g3" style="margin-top:11px">
                <div><label class="f">${SA.t('c.sl_min')}</label>
                  <input type="number" data-k="sliderMin" value="${c.sliderMin ?? 0}"></div>
                <div><label class="f">${SA.t('c.sl_max')}</label>
                  <input type="number" data-k="sliderMax" value="${c.sliderMax ?? 100}"></div>
                <div><label class="f">${SA.t('c.sl_step')}</label>
                  <input type="number" min="1" data-k="sliderStep" value="${c.sliderStep ?? 1}"></div>
              </div>` : ''}

            ${input === 'rating' ? `
              <div class="grid g3" style="margin-top:11px">
                <div><label class="f">${SA.t('c.rate_max')}</label>
                  <input type="number" min="2" max="10" data-k="ratingMax" value="${c.ratingMax ?? 5}"></div>
              </div>` : ''}

            ${input !== 'none' ? `
              <label class="chk" style="margin-top:10px"><input type="checkbox" data-k="allowChange"
                ${c.allowChange ? 'checked' : ''}>${SA.t('c.allow_change')}</label>` : ''}
          </div>

          <!-- ══ 3. TIMER ══ -->
          <div style="border-top:1px solid var(--bd);padding-top:14px">
            <label class="f">${SA.t('c.sec_timer')}</label>
            <div class="grid g3">
              <div><label class="f">${SA.t('r.timer')}</label>
                <input type="number" min="0" max="3600" data-k="timer" value="${c.timer ?? 30}"></div>
              <div><label class="f">${SA.t('c.warn_at')}</label>
                <input type="number" min="0" max="120" data-k="warnAt" value="${c.warnAt ?? 5}"></div>
              <div><label class="f">${SA.t('c.reveal_when')}</label>
                ${sel('revealMode', ['manual','auto'], v => SA.t('c.reveal_' + (v === 'manual' ? 'man' : 'auto')), c.revealMode || 'manual')}</div>
            </div>
            <div class="col" style="gap:9px;margin-top:11px">
              <label class="chk"><input type="checkbox" data-k="showTimer" ${c.showTimer !== false ? 'checked' : ''}>
                ${SA.t('c.show_timer')}</label>
              <label class="chk"><input type="checkbox" data-k="autoClose" ${c.autoClose !== false ? 'checked' : ''}>
                ${SA.t('c.auto_close')}</label>
            </div>
          </div>

          <!-- ══ 4. SCORING ══ -->
          <div style="border-top:1px solid var(--bd);padding-top:14px">
            <label class="f">${SA.t('c.sec_score')}</label>
            <div class="grid g3">
              <div><label class="f">${SA.t('st.pts_right')}</label>
                <input type="number" data-k="pointsCorrect" value="${c.pointsCorrect ?? 10}"></div>
              <div><label class="f">${SA.t('st.pts_wrong')}</label>
                <input type="number" data-k="pointsWrong" value="${c.pointsWrong ?? 0}"></div>
              <div><label class="f">${SA.t('st.speed_bonus')}</label>
                <input type="number" min="0" data-k="speedBonus" value="${c.speedBonus ?? 0}"></div>
            </div>

            <div class="col" style="gap:9px;margin-top:11px">
              <label class="chk"><input type="checkbox" data-k="firstOnly" ${c.firstOnly ? 'checked' : ''}>
                ${SA.t('c.first_only')}</label>
              <label class="chk"><input type="checkbox" data-k="rankPoints" ${c.rankPoints ? 'checked' : ''}>
                ${SA.t('c.rank_pts')}</label>
              ${['multi','order'].includes(input) ? `
                <label class="chk"><input type="checkbox" data-k="partialCredit" ${c.partialCredit ? 'checked' : ''}>
                  ${SA.t('c.partial')}</label>` : ''}
              ${input === 'text' ? `
                <label class="chk"><input type="checkbox" data-k="caseSensitive" ${c.caseSensitive ? 'checked' : ''}>
                  ${SA.t('c.case')}</label>` : ''}
            </div>

            ${c.rankPoints ? `
              <div class="grid g3" style="margin-top:11px">
                <div><label class="f">${SA.t('b.top_pts')}</label>
                  <input type="number" min="0" data-k="topPoints" value="${c.topPoints ?? 50}"></div>
                <div><label class="f">${SA.t('b.floor_pts')}</label>
                  <input type="number" min="0" data-k="floorPoints" value="${c.floorPoints ?? 5}"></div>
                <div><label class="f">${SA.t('b.depth')}</label>
                  <input type="number" min="1" max="50" data-k="rankDepth" value="${c.rankDepth ?? 10}"></div>
              </div>` : ''}

            ${['number','slider','rating'].includes(input) ? `
              <div class="grid g3" style="margin-top:11px">
                <div><label class="f">${SA.t('c.tolerance')}</label>
                  <input type="number" min="0" step="any" data-k="tolerance" value="${c.tolerance ?? 0}"></div>
              </div>` : ''}

            ${input === 'text' ? SA.match.optionsForm(c) : ''}
          </div>

          <!-- ══ 5. PHONE EXTRAS ══ -->
          <div style="border-top:1px solid var(--bd);padding-top:14px">
            <label class="f">${SA.t('c.sec_phone')}</label>
            <div class="col" style="gap:9px">
              <label class="chk"><input type="checkbox" data-k="phoneScore" ${c.phoneScore !== false ? 'checked' : ''}>
                ${SA.t('c.phone_score')}</label>
              <label class="chk"><input type="checkbox" data-k="phoneBoard" ${c.phoneBoard ? 'checked' : ''}>
                ${SA.t('c.phone_lb')}</label>
            </div>
          </div>

          <div class="sub sm">
            <b>${SA.t('c.summary')}:</b> ${SA.esc(SA.t('c.built_screen', {
              x: c.blocks.length ? c.blocks.map(b => SA.t('c.blk.' + b.type)).join(' → ') : SA.t('c.nothing'),
              y: SA.t('c.in.' + input)
            }))}
          </div>
        </div>`;

      /* --- block list --- */
      box.querySelectorAll('[data-badd]').forEach(b => b.onclick = () => {
        c.blocks.push({ type: b.dataset.badd, size: 'm', align: 'center', colour: 'default' }); redraw();
      });
      box.querySelectorAll('[data-brm]').forEach(b => b.onclick = () => { c.blocks.splice(Number(b.dataset.brm), 1); redraw(); });
      box.querySelectorAll('[data-bup]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.bup); [c.blocks[i - 1], c.blocks[i]] = [c.blocks[i], c.blocks[i - 1]]; redraw();
      });
      box.querySelectorAll('[data-bdn]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.bdn); [c.blocks[i + 1], c.blocks[i]] = [c.blocks[i], c.blocks[i + 1]]; redraw();
      });
      box.querySelectorAll('[data-bsize]').forEach(b => b.onclick = () => {
        const [i, s] = b.dataset.bsize.split('|'); c.blocks[Number(i)].size = s; redraw();
      });
      box.querySelectorAll('[data-balign]').forEach(b => b.onclick = () => {
        const [i, a] = b.dataset.balign.split('|'); c.blocks[Number(i)].align = a; redraw();
      });
      box.querySelectorAll('[data-bcol]').forEach(b => b.onclick = () => {
        const [i, k] = b.dataset.bcol.split('|'); c.blocks[Number(i)].colour = k; redraw();
      });

      box.querySelectorAll('[name="cin"]').forEach(el => el.onchange = () => { c.input = el.value; redraw(); });

      box.querySelectorAll('[data-k]').forEach(el => el.onchange = () => {
        const k = el.dataset.k;
        c[k] = el.type === 'checkbox' ? el.checked
             : el.type === 'number' ? Number(el.value)
             : (k === 'optionCols' ? Number(el.value) : el.value);
        /* these change which controls exist, so the form has to come back */
        if (['rankPoints', 'layout', 'optionStyle', 'optionCols', 'animate'].includes(k)) redraw();
        else ctx.change();
      });
    },

    editItem(box, item, ctx) {
      const c = (ctx.round.config) || {};
      const blocks = normBlocks(c.blocks);
      const input = c.input || 'none';
      const wantOpts = blocks.some(b => b.type === 'options') || needsOptions(input);
      while ((item.opts || []).length < 4) (item.opts = item.opts || []).push('');
      item.correctSet = item.correctSet || [];

      box.innerHTML = `
        ${blocks.some(b => b.type === 'title') ? `<div><label class="f">${SA.t('c.blk.title')}</label>
          <input type="text" data-k="title" value="${SA.esc(item.title)}"></div>` : ''}

        ${blocks.some(b => b.type === 'text') ? `<div style="margin-top:11px"><label class="f">${SA.t('c.blk.text')}</label>
          <textarea data-k="text" rows="2">${SA.esc(item.text)}</textarea></div>` : ''}

        ${blocks.some(b => b.type === 'image') ? `<div style="margin-top:11px"><label class="f">${SA.t('c.image_link')}</label>
          <input type="text" data-k="image" value="${SA.esc(item.image)}" placeholder="https://…"></div>` : ''}

        ${input === 'truefalse' ? `<div style="margin-top:11px">
          <label class="f">${SA.t('c.correct_set')}</label>
          <div class="row" style="gap:8px">
            <label class="chk"><input type="radio" name="ctf" value="0" ${(item.correct||0)===0?'checked':''}>${SA.t('c.true')}</label>
            <label class="chk"><input type="radio" name="ctf" value="1" ${(item.correct||0)===1?'checked':''}>${SA.t('c.false')}</label>
          </div></div>` : ''}

        ${wantOpts ? `<div style="margin-top:11px">
          <label class="f">${input === 'order' ? SA.t('b.write_order')
            : input === 'multi' ? SA.t('c.pick_several') : SA.t('c.blk.options')}</label>
          <div class="col" style="gap:7px">
            ${item.opts.map((v, i) => `
              <div class="row" style="gap:8px">
                ${input === 'mcq' ? `<label class="chk"><input type="radio" name="ccor" value="${i}"
                    ${(item.correct||0)===i?'checked':''} style="width:18px;height:18px"></label>` : ''}
                ${input === 'multi' ? `<label class="chk"><input type="checkbox" data-cset="${i}"
                    ${item.correctSet.includes(i)?'checked':''} style="width:18px;height:18px"></label>` : ''}
                <span class="pill ${input === 'order' ? 'p' : ''}" style="min-width:30px;justify-content:center">
                  ${input === 'order' ? i + 1 : SA.render.LETTERS[i]}</span>
                <input type="text" data-opt="${i}" class="grow" value="${SA.esc(v)}">
              </div>`).join('')}
          </div>
          <div class="row" style="gap:7px;margin-top:8px">
            <button class="btn sm" data-oadd>+ ${SA.t('add')}</button>
            <button class="btn sm ghost" data-odel ${item.opts.length<=2?'disabled':''}>− ${SA.t('delete')}</button>
          </div>
          ${input === 'mcq' ? `<div class="sm mut" style="margin-top:6px">${SA.t('c.tick_right')}</div>` : ''}
        </div>` : ''}

        ${['number','slider','rating'].includes(input) ? `<div style="margin-top:11px">
          <label class="f">${SA.t('c.correct_set')}</label>
          <input type="number" data-k="answer" value="${SA.esc(item.answer)}">
        </div>` : ''}

        ${input === 'text' ? `
          <div style="margin-top:11px"><label class="f">${SA.t('c.correct_set')}</label>
            <input type="text" data-a="main" value="${SA.esc(SA.alts.main(item.answer))}"></div>
          <div style="margin-top:11px"><label class="f">${SA.t('alt.label')}
              <span class="mut">(${SA.esc(SA.t('optional'))})</span></label>
            <textarea data-a="alts" rows="3"
              placeholder="${SA.esc(SA.t('alt.ph'))}">${SA.esc(SA.alts.text(item.answer))}</textarea>
            <div class="sm mut" style="margin-top:5px">${SA.t('alt.note')}</div></div>` : ''}

        <div style="margin-top:11px"><label class="f">${SA.t('c.explain')}</label>
          <textarea data-k="explain" rows="2">${SA.esc(item.explain)}</textarea></div>

        <div style="border-top:1px solid var(--bd);margin-top:14px;padding-top:12px">
          <label class="f">${SA.t('c.item_over')}</label>
          <div class="grid g2">
            <div><label class="f">${SA.t('c.item_timer')}</label>
              <input type="number" min="0" data-k="timer" value="${SA.esc(item.timer)}"
                     placeholder="${Number(c.timer) || 0}"></div>
            <div><label class="f">${SA.t('c.item_points')}</label>
              <input type="number" data-k="points" value="${SA.esc(item.points)}"
                     placeholder="${Number(c.pointsCorrect) || 10}"></div>
          </div>
        </div>`;

      box.querySelectorAll('[data-k]').forEach(el => el.oninput = () => { item[el.dataset.k] = el.value; ctx.change(); });
      const mainEl = box.querySelector('[data-a="main"]'), altEl = box.querySelector('[data-a="alts"]');
      if (mainEl && altEl) {
        const sync = () => { item.answer = SA.alts.join(mainEl.value, altEl.value); ctx.change(); };
        mainEl.oninput = sync; altEl.oninput = sync;
      }
      box.querySelectorAll('[data-opt]').forEach(el => el.oninput = () => {
        item.opts[Number(el.dataset.opt)] = el.value; ctx.change();
      });
      box.querySelectorAll('[name="ccor"],[name="ctf"]').forEach(el =>
        el.onchange = () => { item.correct = Number(el.value); ctx.change(); });
      box.querySelectorAll('[data-cset]').forEach(el => el.onchange = () => {
        const i = Number(el.dataset.cset);
        const s = new Set(item.correctSet);
        el.checked ? s.add(i) : s.delete(i);
        item.correctSet = [...s];
        ctx.change();
      });
      const a = box.querySelector('[data-oadd]'), d = box.querySelector('[data-odel]');
      if (a) a.onclick = () => { item.opts.push(''); ctx.redraw(); };
      if (d) d.onclick = () => { item.opts.pop(); ctx.redraw(); };
    },

    /* ═══ HOST ═════════════════════════════════════════════════ */
    hostPanel(box, ctx) {
      const { item, live, round } = ctx;
      const cfg = round.config || {};
      const input = cfg.input || 'none';
      const phase = live.phase || 'idle';
      const self = SA.types.get('custom');
      const secs = timerOf(item, cfg);

      const rows = Object.entries(ctx.answers || {}).map(([uid, a]) => {
        const p = (ctx.players || {})[uid] || {};
        return { uid, v: a.v, at: a.at || 0, ok: self.check(item, a.v, round), name: p.name || '—' };
      }).sort((a, b) => a.at - b.at);

      const shown = v => Array.isArray(v) ? v.join(', ') : String(v);

      box.innerHTML = `
        <div class="card col" style="gap:13px">
          <div class="spread">
            <span class="pill p">${SA.esc(round.title)}</span>
            <span class="pill">${SA.t('r.phase.' + phase)}</span>
          </div>

          <div class="sub">
            ${item.title ? `<div style="font-weight:800;font-size:17px">${SA.esc(item.title)}</div>` : ''}
            ${item.text ? `<div style="margin-top:5px">${SA.esc(item.text)}</div>` : ''}
            ${(input === 'mcq' || input === 'multi') ? `<div class="col" style="gap:4px;margin-top:9px">
              ${(item.opts || []).filter(o => o).map((o, i) => {
                const right = input === 'multi' ? (item.correctSet || []).includes(i) : i === (item.correct || 0);
                return `<div class="row sm" style="gap:8px">
                  <span class="pill ${right ? 'ok' : ''}" style="min-width:28px;justify-content:center">
                    ${SA.render.LETTERS[i]}</span><span>${SA.esc(o)}</span></div>`;
              }).join('')}
            </div>` : ''}
            ${input === 'truefalse' ? `<div class="sm" style="margin-top:8px">${SA.t('c.correct_set')}:
              <b style="color:var(--ok)">${(item.correct||0)===0 ? SA.t('c.true') : SA.t('c.false')}</b></div>` : ''}
            ${['text','number','slider','rating'].includes(input) && item.answer !== ''
              ? `<div class="sm" style="margin-top:8px">${SA.t('r.correct_ans')}:
                   <b style="color:var(--ok)">${SA.esc(item.answer)}</b></div>` : ''}
            ${input === 'order' ? `<div class="col" style="gap:3px;margin-top:8px">
              ${(item.opts || []).filter(o => o).map((o, i) =>
                `<div class="sm"><b>${i + 1}.</b> ${SA.esc(o)}</div>`).join('')}</div>` : ''}
            ${secs ? `<div class="xs mut" style="margin-top:8px">⏱ ${secs}s</div>` : ''}
          </div>

          <div class="row wrap-r" style="gap:7px">
            <button class="btn ${phase==='shown'?'p':''}"  data-go="shown">1 · ${SA.t('c.show')}</button>
            ${input !== 'none' ? `
              <button class="btn ${phase==='open'?'p':''}"   data-go="open" ${phase==='idle'?'disabled':''}>2 · ${SA.t('c.open')} ⏱</button>
              <button class="btn ${phase==='closed'?'p':''}" data-go="closed" ${phase!=='open'?'disabled':''}>3 · ${SA.t('r.close')}</button>` : ''}
            <button class="btn ${live.reveal?'p':''}" data-go="reveal" ${phase==='idle'?'disabled':''}>
              ${input === 'none' ? '2' : '4'} · ${SA.t('r.reveal')}</button>
          </div>

          <div class="row wrap-r" style="gap:7px;border-top:1px solid var(--bd);padding-top:11px">
            <span class="xs mut" style="align-self:center">${SA.t('host.screen')}</span>
            <button class="btn sm ${live.screen==='leaderboard'?'on':''}" data-sc="leaderboard">🏆 ${SA.t('host.sc_top')}</button>
            <button class="btn sm ${live.screen==='teams'?'on':''}" data-sc="teams">👥 ${SA.t('host.sc_teams')}</button>
            <button class="btn sm ${live.screen==='round'?'on':''}" data-sc="round">↩ ${SA.t('host.sc_game')}</button>
          </div>

          ${ctx.teams && Object.keys(ctx.teams).length ? `
            <div class="col" style="gap:8px;border-top:1px solid var(--bd);padding-top:11px">
              <span class="xs mut">${SA.t('host.stage_teams')}</span>
              ${Object.entries(ctx.teams).sort((a,b)=>(a[1].order||0)-(b[1].order||0)).map(([tid,t]) => {
                const pts = pointsOf(item, cfg, ctx.cfg);
                return `<div class="row" style="gap:7px">
                  <span class="pill" style="border-color:${t.colour};color:${t.colour};min-width:90px">${SA.esc(t.name)}</span>
                  <button class="btn sm ok" data-tp="${tid}|${pts}">+${pts}</button>
                  <button class="btn sm ghost" data-tp="${tid}|-${pts}">−</button>
                  <span class="grow"></span><span class="sm mut">${t.score||0}</span>
                </div>`;
              }).join('')}
            </div>` : ''}

          ${input !== 'none' ? `
            <div class="col" style="gap:7px;border-top:1px solid var(--bd);padding-top:11px">
              <div class="spread">
                <span class="sm mut">📱 ${SA.t('r.n_answers', { x: rows.length })}${
                  rows.some(r=>r.ok!==null) ? ' · ' + SA.t('r.n_right', { x: rows.filter(r=>r.ok).length }) : ''}</span>
                <button class="btn sm ok" data-settle ${phase==='idle'?'disabled':''}>⚖️ ${SA.t('host.give_points')}</button>
              </div>
              <div class="lb" style="max-height:200px;overflow:auto">
                ${rows.length ? rows.slice(0, 20).map((r, i) => `
                  <div class="r" style="border-color:${r.ok === true ? 'var(--ok)' : 'var(--bd)'}">
                    <span class="n">${i + 1}</span>
                    <span class="grow"><b>${SA.esc(r.name)}</b>
                      <span class="sm mut"> · ${SA.esc(shown(r.v).slice(0, 26))}</span></span>
                    <span class="s">${r.ok === true ? '✓' : r.ok === false ? '✗' : '—'}</span>
                  </div>`).join('') : `<div class="mut sm tc" style="padding:14px">${SA.t('r.no_answers')}</div>`}
              </div>
            </div>` : ''}
        </div>`;

      box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
        const k = b.dataset.go;
        if (k === 'reveal') { ctx.act({ reveal: !live.reveal, phase: 'reveal', open: false, screen: 'round' }); return; }
        const patch = { phase: k, screen: 'round', open: k === 'open' };
        if (k === 'shown') patch.reveal = false;
        if (k === 'open') {
          patch.startAt = SA.db.now();
          patch.endAt = secs ? SA.db.now() + secs * 1000 : 0;
        }
        ctx.act(patch);
      });
      box.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => ctx.act({ screen: b.dataset.sc }));
      box.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => {
        const [tid, pts] = b.dataset.tp.split('|');
        SA.sess.addTeamPoints(ctx.sid, ctx.vid, tid, Number(pts));
      });
      const s = box.querySelector('[data-settle]');
      if (s) s.onclick = () => ctx.settle();
    },

    /* ═══ PROJECTOR ════════════════════════════════════════════ */
    screenView(box, ctx) {
      const { live } = ctx;
      const p = live.payload || {};
      if ((live.phase || 'idle') === 'idle') { box.innerHTML = SA.render.logoScreen(ctx.title); return; }

      const anim = p.animate !== false ? 'fade-in' : '';
      const wrap = (b, inner) => {
        if (!inner) return '';
        const scale = SIZE_SCALE[b.size] || 1;
        return `<div class="${anim}" style="width:100%;text-align:${b.align || 'center'};
          color:${COL_VAR[b.colour] || 'var(--tx)'};font-size:${scale}em">${inner}</div>`;
      };

      const optionCols = p.optionCols || 0;
      const gridCols = optionCols
        ? `repeat(${optionCols},minmax(0,1fr))`
        : 'repeat(auto-fit,minmax(min(420px,100%),1fr))';

      const parts = (p.blocks || []).map(b => {
        switch (b.type) {
          case 'title':  return wrap(b, p.title ? `<div style="font-family:var(--fd);font-weight:800;line-height:1.2;
                                      font-size:clamp(24px,3vw,54px)">${SA.esc(p.title)}</div>` : '');
          case 'text':   return wrap(b, p.text ? `<div class="q-text">${SA.esc(p.text)}</div>` : '');
          case 'image':  return wrap(b, p.image ? `<img src="${SA.esc(p.image)}" alt=""
                                      style="max-height:44vh;max-width:100%;border-radius:var(--r);box-shadow:var(--shadow)">` : '');
          case 'spacer': return `<div style="height:${(SIZE_SCALE[b.size] || 1) * 3}vh"></div>`;
          case 'options':
            if (!p.opts || !p.opts.length) return '';
            return wrap(b, `<div class="grid" style="grid-template-columns:${gridCols};gap:clamp(9px,1.2vw,18px)">
              ${p.input === 'order'
                ? p.opts.map((it, i) => `<div class="opt" style="cursor:default">
                    ${label(i)}<span class="tx grow">${SA.esc(it.t)}</span></div>`).join('')
                : SA.render.options(p.opts, { disabled: true, reveal: live.reveal,
                    correct: p.correct,
                    hidden: [] }).replace(/<span class="lbl">[^<]*<\/span>/g,
                      m => p.optionStyle === 'plain' ? '' : m)}
            </div>`);
          case 'timer':
            return p.showTimer === false ? '' : `<div class="row" style="justify-content:center"><div id="q-timer"></div></div>`;
          case 'answerBig':
            if (!live.reveal) return '';
            if (Array.isArray(p.answer)) return wrap(b, `<div class="col" style="gap:6px">
              ${p.answer.map((t, i) => `<div class="opt correct" style="cursor:default">
                <span class="lbl">${i + 1}</span><span class="tx grow">${SA.esc(t)}</span></div>`).join('')}</div>`);
            if (p.answer) return wrap(b, `<div style="font-family:var(--fs);font-weight:800;
              font-size:clamp(28px,4vw,72px);color:var(--ok);text-shadow:0 0 34px var(--ok-glow)">
              ${SA.esc(p.answer)}</div>`);
            return '';
          case 'leaderboard':
            /* the board the host published — a projector signs in
               anonymously and may not read the player list at all */
            return wrap(b, `<div style="font-size:.66em">${
              SA.render.leaderboard((ctx.live && ctx.live.board) || [])}</div>`);
          case 'teams':
            return wrap(b, SA.render.teamBoard(ctx.teams, { bars: true }));
          default: return '';
        }
      }).filter(Boolean);

      const layout = p.layout || 'stack';
      const inner = layout === 'split'
        ? `<div class="grid" style="grid-template-columns:1fr 1fr;gap:clamp(14px,2vw,32px);align-items:center;width:100%">
             ${parts.join('')}</div>`
        : parts.join('');

      box.innerHTML = `<div class="col center" style="gap:clamp(${layout === 'centered' ? '18px,3vh,44px' : '12px,2vh,28px'});
        height:100%;padding:2vh 3vw">
        ${inner}
        ${live.reveal && p.explain ? `<div class="card ${anim}" style="border-color:var(--accent);font-size:.6em">
          📖 ${SA.esc(p.explain)}</div>` : ''}
      </div>`;

      function label(i) {
        if (p.optionStyle === 'plain') return '';
        return `<span class="lbl">${p.optionStyle === 'numbers' ? i + 1 : SA.render.LETTERS[i]}</span>`;
      }
    },

    /* ═══ PHONE ════════════════════════════════════════════════ */
    playerView(box, ctx) {
      const { live, mine } = ctx;
      const p = live.payload || {};
      const input = p.input || 'none';
      if ((live.phase || 'idle') === 'idle') {
        box.innerHTML = `<div class="col center tc mut" style="gap:12px;padding:40px 10px">
          <img src="${SA.brand.logo}" style="width:96px;opacity:.55" alt=""><div>${SA.esc(SA.t('play.wait'))}</div></div>`;
        return;
      }
      const answered = mine && mine.v != null;
      const locked = answered && !p.allowChange;
      const canAnswer = live.open && !locked;

      const head = `
        ${p.title ? `<div class="card tc" style="font:800 19px/1.3 var(--fd);color:var(--primary)">${SA.esc(p.title)}</div>` : ''}
        ${p.text ? `<div class="card" style="font-size:16px;font-weight:600;line-height:1.5">${SA.esc(p.text)}</div>` : ''}
        ${p.image ? `<img src="${SA.esc(p.image)}" alt="" style="width:100%;border-radius:var(--r)">` : ''}`;

      if (input === 'none') {
        box.innerHTML = `<div class="col" style="gap:13px">${head}
          <div class="tc sm mut">${SA.esc(SA.t('c.watch'))}</div></div>`;
        return;
      }

      let body = '';

      if (input === 'mcq' || input === 'truefalse') {
        body = `<div class="col" style="gap:9px">${SA.render.options(p.opts || [], {
          disabled: !canAnswer,
          locked: answered ? Number(mine.v) : undefined,
          reveal: live.reveal, correct: p.correct
        })}</div>`;

      } else if (input === 'multi') {
        const picked = answered ? (mine.v || []) : (ctx.scratch.multi || []);
        body = `<div class="col" style="gap:9px">
            ${(p.opts || []).map((o, i) => {
              const on = picked.map(Number).includes(i);
              const right = live.reveal && (p.correctSet || []).includes(i);
              return `<button class="opt ${on ? 'locked' : ''} ${right ? 'correct' : ''}"
                data-multi="${i}" ${canAnswer ? '' : 'disabled'}>
                <span class="lbl">${on ? '✓' : SA.render.LETTERS[i]}</span>
                <span class="tx grow">${SA.esc(o)}</span></button>`;
            }).join('')}
          </div>
          ${answered && !p.allowChange ? '' : `<button class="btn p wide" id="cu-multi"
            ${live.open && picked.length ? '' : 'disabled'}>${SA.esc(SA.t('play.send'))} (${picked.length})</button>`}`;

      } else if (input === 'text' || input === 'number') {
        body = (answered && !ctx.scratch.editing)
          ? SA.render.sentCard(mine.v, !!live.open)
          : `<div class="col" style="gap:9px">
               ${SA.match.inputBox('cu-in', {
                  type: input === 'number' ? 'number' : 'text',
                  value: answered ? mine.v : '',
                  disabled: !live.open,
                  roman: input === 'text' && p.roman !== false
                })}
               <button class="btn p wide big" id="cu-send" ${live.open ? '' : 'disabled'}>${SA.esc(SA.t('play.send'))}</button></div>`;

      } else if (input === 'slider') {
        const cur = answered ? Number(mine.v) : (ctx.scratch.slider != null ? ctx.scratch.slider : Math.round(((p.min || 0) + (p.max || 100)) / 2));
        body = `<div class="col" style="gap:12px">
            <div class="tc" style="font:800 40px/1 var(--fd);color:var(--primary)" id="cu-slv">${cur}</div>
            <input type="range" id="cu-sl" min="${p.min || 0}" max="${p.max || 100}" step="${p.step || 1}"
              value="${cur}" ${canAnswer ? '' : 'disabled'}>
            <div class="spread sm mut"><span>${p.min || 0}</span><span>${p.max || 100}</span></div>
            ${locked ? '' : `<button class="btn p wide" id="cu-slsend" ${live.open ? '' : 'disabled'}>${SA.esc(SA.t('play.send'))}</button>`}
          </div>`;

      } else if (input === 'rating') {
        const max = p.ratingMax || 5;
        const cur = answered ? Number(mine.v) : (ctx.scratch.rating || 0);
        body = `<div class="col" style="gap:12px">
            <div class="row" style="justify-content:center;gap:6px">
              ${Array.from({ length: max }, (_, i) => `
                <button class="btn ${i < cur ? 'p' : 'ghost'}" data-rate="${i + 1}"
                  ${canAnswer ? '' : 'disabled'} style="font-size:26px;padding:8px 12px">★</button>`).join('')}
            </div>
            <div class="tc sm mut">${cur} ${SA.esc(SA.t('c.of'))} ${max}</div>
            ${locked ? '' : `<button class="btn p wide" id="cu-ratesend"
              ${live.open && cur ? '' : 'disabled'}>${SA.esc(SA.t('play.send'))}</button>`}
          </div>`;

      } else if (input === 'buzz') {
        body = `<button class="btn ${answered ? '' : 'p'}" id="cu-bz" ${live.open && !answered ? '' : 'disabled'}
          style="height:170px;width:170px;border-radius:50%;font-size:31px;margin:6px auto">
          ${answered ? '✓' : 'BUZZ'}</button>`;

      } else if (input === 'order') {
        const items = p.opts || [];
        const picked = answered ? (mine.v || []) : (ctx.scratch.pick || []);
        body = `<div class="col" style="gap:8px">
            ${items.map(it => {
              const pos = picked.indexOf(it.i);
              return `<button class="opt ${pos >= 0 ? 'locked' : ''}" data-pick="${it.i}"
                ${canAnswer ? '' : 'disabled'}>
                <span class="lbl">${pos >= 0 ? pos + 1 : '·'}</span>
                <span class="tx grow">${SA.esc(it.t)}</span></button>`;
            }).join('')}
          </div>
          ${locked ? '' : `<div class="row" style="gap:8px">
            <button class="btn ghost grow" id="cu-clr">↺</button>
            <button class="btn p grow" id="cu-ord" ${picked.length === items.length && live.open ? '' : 'disabled'}>
              ${SA.esc(SA.t('play.send'))} (${picked.length}/${items.length})</button></div>`}`;
      }

      box.innerHTML = `<div class="col" style="gap:13px">${head}${body}
        ${live.reveal && p.explain ? `<div class="sub sm fade-in">📖 ${SA.esc(p.explain)}</div>` : ''}
        ${live.reveal && p.answer && !Array.isArray(p.answer) ? `<div class="sub tc fade-in">
          <span class="xs mut">${SA.esc(SA.t('r.correct_ans'))}</span>
          <div style="font:800 20px/1.3 var(--fd);color:var(--ok)">${SA.esc(p.answer)}</div></div>` : ''}
        <div class="tc sm mut">${SA.esc(answered ? SA.t('play.recorded_s')
          : live.open ? SA.t('play.answer_now') : SA.t('play.wait_open'))}</div>
        ${live.reveal && p.phoneBoard ? `<div class="card"><div class="xs mut" style="margin-bottom:8px">🏆 ${
          SA.esc(SA.t('play.top10'))}</div>${SA.render.leaderboard(live.board || [],
            { meUid: SA.auth.uid || '' })}</div>` : ''}
      </div>`;

      /* --- wiring --- */
      box.querySelectorAll('.opt[data-opt]').forEach(b => b.onclick = () => {
        if (!canAnswer) return;
        ctx.submit(Number(b.dataset.opt));
        box.querySelectorAll('.opt').forEach(x => { if (!p.allowChange) x.disabled = true; x.classList.remove('locked'); });
        b.classList.add('locked');
      });

      box.querySelectorAll('[data-multi]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.multi);
        const cur = ctx.scratch.multi || (ctx.scratch.multi = []);
        const at = cur.indexOf(i); if (at >= 0) cur.splice(at, 1); else cur.push(i);
        ctx.rerender();
      });
      const ms = box.querySelector('#cu-multi');
      if (ms) ms.onclick = () => { ctx.submit((ctx.scratch.multi || []).slice()); ms.disabled = true; ms.textContent = '✓ ' + SA.t('play.sent'); };

      /* one shared Edit button for every confirmation card */
      const ed = box.querySelector('#ans-edit');
      if (ed) ed.onclick = () => { ctx.scratch.editing = true; ctx.rerender(); };

      const si = box.querySelector('#cu-in'), sb = box.querySelector('#cu-send');
      const cutl = si ? SA.match.wireInput(box, 'cu-in') : null;
      if (sb) {
        const go = () => {
          const v = cutl ? cutl.value() : si.value.trim(); if (!v) return;
          sb.disabled = si.disabled = true;
          sb.textContent = SA.t('play.sending');
          ctx.scratch.editing = false;
          ctx.submit(input === 'number' ? Number(v) : v);
        };
        sb.onclick = go;
        si.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      }

      const sl = box.querySelector('#cu-sl');
      if (sl) sl.oninput = () => { ctx.scratch.slider = Number(sl.value); box.querySelector('#cu-slv').textContent = sl.value; };
      const sls = box.querySelector('#cu-slsend');
      if (sls) sls.onclick = () => { ctx.submit(Number(sl.value)); sls.disabled = true; sls.textContent = '✓ ' + SA.t('play.sent'); };

      box.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => {
        ctx.scratch.rating = Number(b.dataset.rate); ctx.rerender();
      });
      const rs = box.querySelector('#cu-ratesend');
      if (rs) rs.onclick = () => { ctx.submit(Number(ctx.scratch.rating)); rs.disabled = true; rs.textContent = '✓ ' + SA.t('play.sent'); };

      const bz = box.querySelector('#cu-bz');
      if (bz) bz.onclick = () => { ctx.submit(SA.db.now()); bz.disabled = true; bz.textContent = '✓'; bz.classList.remove('p'); };

      box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.pick);
        const cur = ctx.scratch.pick || (ctx.scratch.pick = []);
        const at = cur.indexOf(i); if (at >= 0) cur.splice(at, 1); else cur.push(i);
        ctx.rerender();
      });
      const clr = box.querySelector('#cu-clr'), ord = box.querySelector('#cu-ord');
      if (clr) clr.onclick = () => { ctx.scratch.pick = []; ctx.rerender(); };
      if (ord) ord.onclick = () => { ctx.submit((ctx.scratch.pick || []).slice()); ord.disabled = true; ord.textContent = '✓ ' + SA.t('play.sent'); };
    }
  });

  SA.custom = { BLOCK_KEYS, INPUTS, normBlocks, timerOf, pointsOf };
})();

