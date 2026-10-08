/* ── type: MATCH THE PAIRS ─────────────────────────────────────────
   Photos down one side, names down the other, and the room joins them
   up. One question holds one set of pairs — four Tirthankars and their
   four names, say — and everybody solves the whole set at once.

   The names are shuffled with a seed taken from the question's own id,
   so every phone and the projector show them in the same order and the
   shuffle is reproducible. That matters, because the shuffle IS the
   answer key: check() re-derives it rather than publishing it. A phone
   is sent the pictures and the names and no way to tell which goes
   with which until the host reveals.

   Photos cost nothing to keep — see SA.photo in engine.js.
   ────────────────────────────────────────────────────────────────── */
(function () {

  const LET = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  /* Only pairs that are actually finished are played. A half-filled row
     left in the Studio should not put an empty card on the projector. */
  const good = item => (item && item.pairs || []).filter(
    p => p && SA.photo.usable(p.img) && String(p.name || '').trim() !== '');

  /* names[j] belongs to photo order[j].

     A seeded shuffle can land on the identity — one time in twenty-four
     with four pairs — and then the names sit in the same order as the
     photos, which gives the whole question away to anybody who notices.
     One rotation is enough to make sure that never reaches a room. */
  function order(item) {
    const n = good(item).length;
    const m = SA.shuffle(Array.from({ length: n }, (_, i) => i), item.id || 'seed');
    if (n > 1 && m.every((v, i) => v === i)) return m.slice(1).concat(m[0]);
    return m;
  }

  /* what a full, correct answer looks like: for photo i, the position of
     its name in the shuffled list */
  function key(item) {
    const map = order(item);
    const inv = new Array(map.length);
    map.forEach((src, j) => { inv[src] = j; });
    return inv;
  }

  const rightCount = (item, value) => {
    if (!Array.isArray(value)) return 0;
    const k = key(item);
    return k.reduce((n, want, i) => n + (Number(value[i]) === want ? 1 : 0), 0);
  };

  SA.types.register({
    key: 'match',
    label: 'Match the pairs',
    icon: '🖼️',

    defaults: () => ({
      timer: 60, pointsCorrect: 10, pointsWrong: 0,
      partialCredit: true, fit: 'cover', firstOnly: false
    }),

    newItem: () => ({ title: '', pairs: [{ img: '', name: '' }, { img: '', name: '' },
                                         { img: '', name: '' }, { img: '', name: '' }],
                      order: Date.now() }),

    /* fed to this type's own screenView by the Studio preview. The four
       stand-in photos are drawn here rather than shipped as files —
       nothing to download, and they take the game's own colours. */
    sample(g) {
      const th = SA.theme.resolve(g && g.theme);
      const tint = [th.primary, th.accent, th.ok, th.bad];
      const pic = (n, colour) => {
        const c = document.createElement('canvas'); c.width = c.height = 300;
        const x = c.getContext('2d');
        x.fillStyle = colour; x.fillRect(0, 0, 300, 300);
        x.fillStyle = SA.theme.readableOn(colour);
        x.font = '700 150px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(n), 150, 158);
        return c.toDataURL('image/jpeg', 0.7);
      };
      return {
        item: { id: 'prev', title: SA.t('st.smp_match'),
                pairs: [1, 2, 3, 4].map((n, i) => ({
                  img: pic(n, tint[i] || th.primary),
                  name: SA.t('st.smp_name' + (i + 1))
                })) },
        live: { phase: 'shown' }
      };
    },

    itemSummary(it) {
      const n = good(it).length, total = (it.pairs || []).length;
      const head = it.title || (good(it)[0] || {}).name || SA.t('r.empty');
      return head + '  · ' + SA.t('m.n_pairs', { x: n }) +
        (n < total ? '  ⚠ ' + SA.t('m.incomplete', { x: total - n }) : '');
    },

    /* ═══ WHAT LEAVES THE HOST'S MACHINE ══════════════════════ */
    payload(item, live, round) {
      const cfg = (round && round.config) || {};
      const pairs = good(item);
      const map = order(item);
      const p = {
        title: item.title || '',
        photos: pairs.map(x => x.img),
        names: map.map(i => pairs[i].name),
        fit: cfg.fit || 'cover'
      };
      /* the pairing itself only ever rides along after the reveal */
      if (live && live.reveal) p.answer = key(item);
      return p;
    },

    check(item, value) {
      const n = good(item).length;
      if (!n || !Array.isArray(value)) return null;
      if (value.filter(v => v != null && v !== '').length === 0) return null;
      return rightCount(item, value) === n;
    },

    /* Part marks are the default here. Getting three of four right and
       scoring nothing feels like a bug to the person who did it — which
       is why this type scores every answer, not just the perfect ones. */
    scoreAlways: true,

    score(item, value, ms, round, gcfg) {
      const cfg = (round && round.config) || {};
      const full = Number(cfg.pointsCorrect != null ? cfg.pointsCorrect
                    : (gcfg && gcfg.pointsCorrect) || 10);
      const n = good(item).length;
      if (!n) return 0;
      const right = rightCount(item, value);
      if (cfg.partialCredit === false) {
        return right === n ? full : (Number(cfg.pointsWrong) || 0);
      }
      return Math.round(full * right / n);
    },

    /* ═══ STUDIO — round settings ═════════════════════════════ */
    configForm(box, round, ctx) {
      const c = round.config || {};
      box.innerHTML = `
        <div class="grid g3">
          <div><label class="f">${SA.t('r.timer')}</label>
            <input type="number" min="0" max="600" data-k="timer" value="${c.timer ?? 60}"></div>
          <div><label class="f">${SA.t('r.pts_right')}</label>
            <input type="number" data-k="pointsCorrect" value="${c.pointsCorrect ?? 10}"></div>
          <div><label class="f">${SA.t('m.fit')}</label>
            <select data-k="fit">
              <option value="cover"   ${c.fit !== 'contain' ? 'selected' : ''}>${SA.t('m.fit_cover')}</option>
              <option value="contain" ${c.fit === 'contain' ? 'selected' : ''}>${SA.t('m.fit_contain')}</option>
            </select></div>
        </div>
        <div class="col" style="gap:9px;margin-top:12px">
          <label class="chk sub" style="align-items:flex-start">
            <input type="checkbox" data-k="partialCredit" ${c.partialCredit !== false ? 'checked' : ''} style="margin-top:3px">
            <span><b>${SA.esc(SA.t('m.partial'))}</b>
              <span class="sm mut" style="display:block">${SA.esc(SA.t('m.partial_d'))}</span></span>
          </label>
        </div>
        <div class="sub sm mut" style="margin-top:12px">📁 ${SA.esc(SA.t('m.storage_free'))}</div>`;
      box.querySelectorAll('[data-k]').forEach(el => {
        el.onchange = () => {
          round.config[el.dataset.k] = el.type === 'checkbox' ? el.checked
            : el.type === 'number' ? Number(el.value) : el.value;
          ctx.change();
        };
      });
    },

    /* ═══ STUDIO — one question ═══════════════════════════════
       The photo tile IS the button. The first version put a "Choose a
       photo" button underneath a 96px tile, where the label was wider
       than the column it sat in, and then spent a third of the row on a
       URL field that most people never touch. Now the tile takes a
       click or a dropped file, the link box is folded away until asked
       for, and a whole folder of photos can arrive at once. */
    editItem(box, item, ctx) {
      item.pairs = item.pairs && item.pairs.length ? item.pairs : [{ img: '', name: '' }, { img: '', name: '' }];
      const fit = (ctx.round && ctx.round.config && ctx.round.config.fit) || 'cover';
      const ready = good(item).length, total = item.pairs.length;
      /* The style attribute is written with double quotes, so the url()
         inside it has to use single ones — and escape any of its own. */
      const cssURL = s => String(s).replace(/['\\]/g, '\\$&');

      box.innerHTML = `
        <div><label class="f">${SA.t('m.title')}</label>
          <input type="text" data-k="title" value="${SA.esc(item.title || '')}"
                 placeholder="${SA.esc(SA.t('m.title_ph'))}"></div>

        <div class="spread" style="margin-top:16px;margin-bottom:8px">
          <label class="f" style="margin:0">${SA.t('m.pairs')}</label>
          <span class="sm ${ready === total ? 'mut' : ''}"
                style="${ready === total ? '' : 'color:var(--primary)'}"
                data-ready>${SA.esc(SA.t('m.ready_n', { a: ready, b: total }))}</span>
        </div>

        <div class="col" style="gap:9px">
          ${item.pairs.map((p, i) => {
            const has = SA.photo.usable(p.img);
            const isLink = has && !String(p.img).startsWith('data:');
            return `
            <div class="pair-row ${has && String(p.name || '').trim() ? 'ready' : ''}" data-row="${i}">

              <label class="drop ${has ? 'has' : ''}" data-drop="${i}"
                     style="${has ? `background-image:url('${cssURL(p.img)}');background-size:${fit}` : ''}">
                <span class="num">${i + 1}</span>
                ${has ? `<span class="swap">${SA.esc(SA.t('m.change_photo'))}</span>`
                      : `<span><span class="plus">＋</span>
                          <span class="cap">${SA.esc(SA.t('m.add_photo'))}</span></span>`}
                <input type="file" accept="image/*" data-file="${i}" hidden>
              </label>

              <div class="col" style="gap:6px;min-width:0">
                <input type="text" data-name="${i}" value="${SA.esc(p.name || '')}"
                       placeholder="${SA.esc(SA.t('m.name_ph'))}">
                <div class="row wrap-r" style="gap:6px">
                  <button class="chip" data-link="${i}">🔗 ${SA.esc(SA.t('m.link_toggle'))}</button>
                  ${has ? `<button class="chip" data-clear="${i}">✕ ${SA.esc(SA.t('m.remove_photo'))}</button>
                    <span class="kb">${isLink ? '🔗' : SA.photo.kb(p.img) + ' KB'}</span>` : ''}
                </div>
                <input type="url" data-url="${i}" class="${isLink ? '' : 'hide'}"
                       placeholder="${SA.esc(SA.t('m.url_ph'))}"
                       value="${SA.esc(isLink ? p.img : '')}">
              </div>

              <button class="btn sm ghost" data-kill="${i}" title="${SA.esc(SA.t('m.del_pair'))}"
                      ${item.pairs.length <= 2 ? 'disabled' : ''}>🗑</button>
            </div>`;
          }).join('')}
        </div>

        <div class="row wrap-r" style="gap:7px;margin-top:12px">
          <button class="btn sm" data-add>+ ${SA.t('m.add_pair')}</button>
          <label class="btn sm p" style="cursor:pointer">📁 ${SA.esc(SA.t('m.bulk'))}
            <input type="file" accept="image/*" multiple data-bulk hidden></label>
          <span class="grow"></span>
          <span class="sm mut">${SA.esc(SA.t('m.n_pairs', { x: ready }))}</span>
        </div>
        <div class="sm mut" style="margin-top:6px">${SA.esc(SA.t('m.bulk_d'))}</div>
        ${ready < 2 ? `<div class="sm" style="color:var(--bad);margin-top:8px">
          ⚠ ${SA.esc(SA.t('m.no_pairs'))}</div>` : ''}`;

      box.querySelector('[data-k="title"]').oninput = e => { item.title = e.target.value; ctx.change(); };

      /* Typing a name must not redraw — that would steal the caret — so
         the ready count and the row's tick are patched in place. */
      const repaintReady = () => {
        const el = box.querySelector('[data-ready]');
        if (el) el.textContent = SA.t('m.ready_n', { a: good(item).length, b: item.pairs.length });
      };
      box.querySelectorAll('[data-name]').forEach(el => {
        el.oninput = () => {
          const i = Number(el.dataset.name);
          item.pairs[i].name = el.value;
          const row = box.querySelector(`.pair-row[data-row="${i}"]`);
          if (row) row.classList.toggle('ready',
            SA.photo.usable(item.pairs[i].img) && el.value.trim() !== '');
          repaintReady(); ctx.change();
        };
      });

      box.querySelectorAll('[data-link]').forEach(el => {
        el.onclick = () => {
          const f = box.querySelector(`[data-url="${el.dataset.link}"]`);
          if (!f) return;
          f.classList.toggle('hide');
          if (!f.classList.contains('hide')) f.focus();
        };
      });

      /* A pasted link replaces an uploaded photo and the other way round —
         one picture per pair, whichever they gave last. */
      box.querySelectorAll('[data-url]').forEach(el => {
        el.onchange = () => {
          const i = Number(el.dataset.url), v = el.value.trim();
          if (v && !SA.photo.usable(v)) { SA.toast(SA.t('m.bad_file'), true); return; }
          item.pairs[i].img = v;
          ctx.change(); ctx.redraw();
        };
      });

      box.querySelectorAll('[data-clear]').forEach(el => {
        el.onclick = () => { item.pairs[Number(el.dataset.clear)].img = ''; ctx.change(); ctx.redraw(); };
      });

      const takeFile = async (i, f) => {
        if (!f) return;
        try {
          const uri = await SA.photo.fromFile(f);
          item.pairs[i].img = uri;
          SA.toast(SA.t('m.shrunk', { x: SA.photo.kb(uri) }));
          ctx.change(); ctx.redraw();
        } catch (e) { SA.toast(e.message || SA.t('m.bad_file'), true); }
      };

      box.querySelectorAll('[data-file]').forEach(el => {
        el.onchange = () => takeFile(Number(el.dataset.file), el.files && el.files[0]);
      });

      /* Dragging a photo straight onto the tile — the way anybody who has
         used a computer expects a picture to get into a box. */
      box.querySelectorAll('[data-drop]').forEach(el => {
        const i = Number(el.dataset.drop);
        el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
        el.addEventListener('dragleave', () => el.classList.remove('over'));
        el.addEventListener('drop', e => {
          e.preventDefault(); el.classList.remove('over');
          takeFile(i, e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
        });
      });

      /* A folder of photos in one go. Each file becomes a pair and the
         file name becomes the name, because that is how anybody with a
         folder of portraits has already labelled them. */
      const bulk = box.querySelector('[data-bulk]');
      if (bulk) bulk.onchange = async () => {
        const files = [...(bulk.files || [])];
        if (!files.length) return;
        SA.toast(SA.t('m.bulk_doing', { x: files.length }));
        let added = 0, failed = 0;
        /* Fill the empty rows first so an untouched question does not end
           up with two blanks above the photos that were just added. */
        for (const f of files) {
          let uri;
          try { uri = await SA.photo.fromFile(f); } catch (e) { failed++; continue; }
          const name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
          const slot = item.pairs.findIndex(p => !SA.photo.usable(p.img) && !String(p.name || '').trim());
          if (slot >= 0) item.pairs[slot] = { img: uri, name };
          else item.pairs.push({ img: uri, name });
          added++;
        }
        SA.toast(failed ? SA.t('m.bulk_some', { a: added, b: failed })
                        : SA.t('m.bulk_done', { x: added }), !!failed);
        ctx.change(); ctx.redraw();
      };

      box.querySelectorAll('[data-kill]').forEach(el => {
        el.onclick = () => {
          item.pairs.splice(Number(el.dataset.kill), 1);
          ctx.change(); ctx.redraw();
        };
      });
      const add = box.querySelector('[data-add]');
      if (add) add.onclick = () => { item.pairs.push({ img: '', name: '' }); ctx.change(); ctx.redraw(); };
    },

    /* ═══ HOST ════════════════════════════════════════════════ */
    hostPanel(box, ctx) {
      const { item, live, round } = ctx;
      const cfg = round.config || {};
      const phase = live.phase || 'idle';
      const pairs = good(item);
      const k = key(item);
      const names = order(item).map(i => pairs[i].name);

      const rows = Object.entries(ctx.answers || {}).map(([uid, a]) => {
        const p = (ctx.players || {})[uid] || {};
        return { uid, at: a.at || 0, n: rightCount(item, a.v),
                 ok: rightCount(item, a.v) === pairs.length,
                 name: p.name || '—' };
      }).sort((a, b) => b.n - a.n || a.at - b.at);

      box.innerHTML = `
        <div class="card col" style="gap:13px">
          <div class="spread">
            <span class="pill p">${SA.esc(round.title)}</span>
            <span class="pill">${SA.t('r.phase.' + phase)}</span>
          </div>

          ${item.title ? `<div class="sub"><div class="xs mut">${SA.t('r.on_screen')}</div>
            <div style="font:800 19px/1.4 var(--fs);color:var(--primary)">${SA.esc(item.title)}</div></div>` : ''}

          <div class="sub col" style="gap:7px">
            <div class="xs mut">${SA.t('m.answer_key')}</div>
            ${pairs.map((p, i) => `
              <div class="row" style="gap:9px">
                <span class="pill p" style="min-width:30px;justify-content:center">${i + 1}</span>
                <span class="pill" style="min-width:30px;justify-content:center">${LET[k[i]]}</span>
                <b style="font-family:var(--fs)">${SA.esc(p.name)}</b>
              </div>`).join('') || `<div class="mut sm">${SA.t('m.no_pairs')}</div>`}
          </div>

          <div class="row wrap-r" style="gap:7px">
            <button class="btn ${phase === 'shown' ? 'p' : ''}" data-go="shown">1 · ${SA.t('r.show')}</button>
            <button class="btn ${phase === 'open' ? 'p' : ''}" data-go="open"
              ${phase === 'idle' ? 'disabled' : ''}>2 · ${SA.t('r.send')} ⏱</button>
            <button class="btn ${phase === 'closed' ? 'p' : ''}" data-go="closed"
              ${phase !== 'open' ? 'disabled' : ''}>3 · ${SA.t('r.close')}</button>
            <button class="btn ${live.reveal ? 'p' : ''}" data-go="reveal"
              ${phase === 'idle' ? 'disabled' : ''}>4 · ${SA.t('r.reveal')}</button>
          </div>

          ${ctx.teams && Object.keys(ctx.teams).length ? `
            <div class="col" style="gap:8px;border-top:1px solid var(--bd);padding-top:11px">
              <span class="xs mut">${SA.t('r.teams_award')}</span>
              ${Object.entries(ctx.teams).sort((a, b) => (a[1].order || 0) - (b[1].order || 0)).map(([tid, t]) => `
                <div class="row" style="gap:7px">
                  <span class="pill" style="border-color:${t.colour};color:${t.colour};min-width:96px">${SA.esc(t.name)}</span>
                  <button class="btn sm ok" data-tp="${tid}">+${cfg.pointsCorrect || 10}</button>
                  <span class="grow"></span><span class="sm mut">${t.score || 0}</span>
                </div>`).join('')}
            </div>` : ''}

          <div class="col" style="gap:7px;border-top:1px solid var(--bd);padding-top:11px">
            <div class="spread">
              <span class="sm mut">📱 ${SA.t('r.n_answers', { x: rows.length })}</span>
              <button class="btn sm ok" data-settle ${phase === 'idle' ? 'disabled' : ''}>⚖️ ${SA.t('host.give_points')}</button>
            </div>
            <div class="lb" style="max-height:230px;overflow:auto">
              ${rows.length ? rows.slice(0, 25).map((r, i) => `
                <div class="r" style="border-color:${r.ok ? 'var(--ok)' : 'var(--bd)'}">
                  <span class="n">${i + 1}</span>
                  <span class="grow nm"><b>${SA.esc(r.name)}</b></span>
                  <span class="s" style="color:${r.ok ? 'var(--ok)' : 'var(--tx-mut)'}">${
                    SA.esc(SA.t('m.n_right', { a: r.n, b: pairs.length }))}</span>
                </div>`).join('') : `<div class="mut sm tc" style="padding:16px">${SA.t('r.no_answers')}</div>`}
            </div>
          </div>
        </div>`;

      box.querySelectorAll('[data-go]').forEach(b => {
        b.onclick = () => {
          const kk = b.dataset.go;
          /* screen:'round' on every step — the projector may be parked on
             the logo or a leaderboard, and the pairs have to come back */
          if (kk === 'reveal') {
            ctx.act({ reveal: !live.reveal, phase: 'reveal', open: false, screen: 'round' });
            return;
          }
          const patch = { phase: kk, screen: 'round', open: kk === 'open' };
          if (kk === 'shown') patch.reveal = false;
          if (kk === 'open') {
            const secs = Number(cfg.timer) || 0;
            patch.startAt = SA.db.now();
            patch.endAt = secs ? SA.db.now() + secs * 1000 : 0;
          }
          ctx.act(patch);
        };
      });
      box.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => {
        SA.sess.addTeamPoints(ctx.sid, ctx.vid, b.dataset.tp, Number(cfg.pointsCorrect || 10));
        SA.toast(SA.t('host.points_added'));
      });
      const s = box.querySelector('[data-settle]');
      if (s) s.onclick = () => ctx.settle();
    },

    /* ═══ PROJECTOR ═══════════════════════════════════════════ */
    screenView(box, ctx) {
      const { live } = ctx;
      const p = live.payload || {};
      if ((live.phase || 'idle') === 'idle' || !(p.photos || []).length) {
        box.innerHTML = SA.render.logoScreen(p.title || '', SA.t('r.phase.idle'));
        return;
      }
      const fit = p.fit === 'contain' ? 'contain' : 'cover';
      const ans = live.reveal ? (p.answer || []) : null;

      /* one column up to two photos, two up to six, three beyond —
         so the tiles stay as large as the stage allows */
      const cols = p.photos.length <= 2 ? 1 : p.photos.length <= 6 ? 2 : 3;

      box.innerHTML = `
        <div class="col" style="height:100%;gap:1.6vh;padding:2vh 3vw;min-height:0">
          ${p.title ? `<div class="tc" style="flex:none;font:800 clamp(20px,2.4vw,44px)/1.2 var(--fd);color:var(--primary)">
            ${SA.esc(p.title)}</div>` : ''}
          <div class="mgrid">
            <div class="mcol photos" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">
              ${p.photos.map((src, i) => `
                <div class="mcard">
                  <span class="tag">${i + 1}</span>
                  <div class="mph big" style="background-image:url('${String(src).replace(/'/g, "\\'")}');
                       background-size:${fit}"></div>
                  ${ans ? `<span class="pair">${LET[ans[i]]}</span>` : ''}
                </div>`).join('')}
            </div>
            <div class="mcol names">
              ${p.names.map((n, j) => `
                <div class="mname">
                  <span class="tag">${LET[j]}</span>
                  <span class="grow">${SA.esc(n)}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>`;
    },

    /* ═══ PHONE ═══════════════════════════════════════════════ */
    playerView(box, ctx) {
      const { live, mine, scratch } = ctx;
      const p = live.payload || {};
      if ((live.phase || 'idle') === 'idle' || !(p.photos || []).length) {
        box.innerHTML = `<div class="col center tc mut" style="gap:12px;padding:40px 10px">
            <img src="${SA.brand.logo}" style="width:96px;opacity:.55" alt="">
            <div>${SA.esc(SA.t('play.wait_show'))}</div></div>`;
        return;
      }

      const n = p.photos.length;
      const fit = p.fit === 'contain' ? 'contain' : 'cover';
      const answered = mine && mine.v != null;
      const editing = !!scratch.editing;

      if (answered && !editing) {
        const my = Array.isArray(mine.v) ? mine.v : [];
        const ans = live.reveal ? (p.answer || []) : null;
        box.innerHTML = `
          <div class="col" style="gap:13px">
            ${p.title ? `<div class="card tc"><b style="font:800 18px/1.4 var(--fs)">${SA.esc(p.title)}</b></div>` : ''}
            <div class="card col" style="gap:8px">
              <div class="xs mut">${SA.esc(SA.t('play.your_answer'))}</div>
              ${p.photos.map((src, i) => {
                const right = ans ? Number(my[i]) === ans[i] : null;
                return `<div class="mrow ${right === true ? 'ok' : right === false ? 'bad' : ''}">
                    <div class="mph" style="background-image:url('${String(src).replace(/'/g, "\\'")}');
                         background-size:${fit}"></div>
                    <span class="grow">
                      <b>${SA.esc(my[i] != null && p.names[my[i]] != null ? p.names[my[i]] : '—')}</b>
                      ${ans && right === false ? `<span class="sm" style="display:block;color:var(--ok)">
                        ✓ ${SA.esc(p.names[ans[i]] || '')}</span>` : ''}
                    </span>
                    ${ans ? `<span style="flex:none;font-size:19px">${right ? '✅' : '❌'}</span>` : ''}
                  </div>`;
              }).join('')}
            </div>
            ${live.open ? `<button class="btn ghost wide" id="ans-edit">✏ ${SA.esc(SA.t('play.edit_answer'))}</button>`
                        : `<div class="sm mut tc">${SA.esc(SA.t('play.sent_locked'))}</div>`}
          </div>`;
        const ed = box.querySelector('#ans-edit');
        if (ed) ed.onclick = () => { scratch.editing = true; scratch.msel = null; ctx.rerender(); };
        return;
      }

      /* ---- building an answer ---- */
      const sel = (scratch.msel && scratch.msel.length === n) ? scratch.msel
                : (scratch.msel = new Array(n).fill(null));
      const focus = scratch.mfocus == null ? sel.findIndex(v => v == null) : scratch.mfocus;
      const used = new Set(sel.filter(v => v != null).map(Number));
      const left = sel.filter(v => v == null).length;

      /* Photos down one side, names down the other — the same shape as
         the projector, so a player glancing up from the phone is looking
         at the same puzzle. Stacking them instead put the names so far
         below the photos that you could not see both at once. The two
         columns share a row height, so photo 1 sits level with name A. */
      box.innerHTML = `
        <div class="col" style="gap:13px">
          ${p.title ? `<div class="card tc"><b style="font:800 18px/1.4 var(--fs)">${SA.esc(p.title)}</b></div>` : ''}

          <div class="sub tc sm">${SA.esc(
            !live.open ? SA.t('play.wait_open')
            : focus >= 0 ? SA.t('m.pick_name', { x: focus + 1 })
            : SA.t('m.all_done'))}</div>

          <div class="mpair">
            <div class="mcol-ph">
              ${p.photos.map((src, i) => `
                <button class="mpick ${i === focus ? 'on' : ''} ${sel[i] != null ? 'set' : ''}"
                        data-ph="${i}" ${live.open ? '' : 'disabled'}>
                  <span class="im" style="background-image:url('${String(src).replace(/'/g, "\\'")}');
                        background-size:${fit}"></span>
                  <span class="no">${i + 1}</span>
                  ${sel[i] != null ? `<span class="let">${LET[sel[i]]}</span>` : ''}
                </button>`).join('')}
            </div>
            <div class="mcol-nm">
              ${p.names.map((nm, j) => `
                <button class="opt mname-b ${used.has(j) ? 'dim' : ''}" data-nm="${j}"
                        ${!live.open || focus < 0 || used.has(j) ? 'disabled' : ''}>
                  <span class="lbl">${LET[j]}</span>
                  <span class="tx grow">${SA.esc(nm)}</span>
                </button>`).join('')}
            </div>
          </div>

          <div class="row" style="gap:7px">
            <button class="btn sm ghost" id="m-clear" ${sel.every(v => v == null) ? 'disabled' : ''}>
              ${SA.esc(SA.t('m.clear'))}</button>
            <span class="grow sm mut tc">${SA.esc(left ? SA.t('m.left', { x: left }) : SA.t('m.all_done'))}</span>
          </div>

          <button class="btn p wide big" id="m-send" ${live.open && left === 0 ? '' : 'disabled'}>
            ${SA.esc(SA.t('play.send'))}</button>
        </div>`;

      box.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.ph);
        /* tapping a filled photo takes its name back off */
        if (sel[i] != null) { sel[i] = null; scratch.mfocus = i; }
        else scratch.mfocus = i;
        ctx.rerender();
      });

      box.querySelectorAll('[data-nm]').forEach(b => b.onclick = () => {
        const j = Number(b.dataset.nm);
        const i = scratch.mfocus == null ? sel.findIndex(v => v == null) : scratch.mfocus;
        if (i < 0) return;
        sel[i] = j;
        /* move on to the next empty photo by itself, so a whole set can be
           done with one tap per name after the first */
        const next = sel.findIndex(v => v == null);
        scratch.mfocus = next >= 0 ? next : null;
        ctx.rerender();
      });

      const cl = box.querySelector('#m-clear');
      if (cl) cl.onclick = () => { scratch.msel = new Array(n).fill(null); scratch.mfocus = 0; ctx.rerender(); };

      const sd = box.querySelector('#m-send');
      if (sd) sd.onclick = () => {
        if (sel.some(v => v == null)) return;
        sd.disabled = true; sd.textContent = SA.t('play.sending');
        scratch.editing = false;
        ctx.submit(sel.map(Number));
      };
    }
  });
})();
