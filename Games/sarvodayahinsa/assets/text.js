/* ── सर्वोदय अहिंसा — typing help ──────────────────────────────────
   Two problems this file solves, both of them the audience's:

     1. They cannot spell.  Hindi has three ways to write half the words
        in it — हिंदी / हिन्दी, अहिंसा / अहिन्सा, दीप / दिप — and a
        player who knows the answer perfectly well should not lose the
        point to a matra. SA.match folds those differences away and then
        allows a percentage of honest typos on top.

     2. They have no Devanagari keyboard.  SA.translit lets them type
        "ahinsaa" and watch अहिंसा appear. It is our own converter, not
        the phone's — nothing to install, works on every handset.

   Both are plain functions on window.SA, loaded before the game types.
   ────────────────────────────────────────────────────────────────── */
window.SA = window.SA || {};

/* ═══════════════════════════════════════════════════════════════
   ROMAN → DEVANAGARI

   Phonetic, in the style people already know from phone keyboards:
   "namaste" → नमस्ते, "bharat" → भरत, "kya" → क्या.

   Deliberately case-blind. The usual ITRANS convention where capitals
   mean the retroflex letters reads "Tirthankar" as टीर्थंकर, and a
   sentence typed with an ordinary capital first letter is far more
   likely than somebody reaching for ट on purpose. The ट/त and श/ष
   distinctions are handled where they belong instead — in SA.match,
   which treats them as the same sound when it compares answers.
   ═══════════════════════════════════════════════════════════════ */
SA.translit = (function () {

  const CONS = {
    /* clusters first — longest match wins */
    'ksh':'क्ष','kshh':'क्ष','gny':'ज्ञ','dny':'ज्ञ','jny':'ज्ञ',
    'chh':'छ','shh':'ष','shr':'श्र',
    'kh':'ख','gh':'घ','ch':'च','jh':'झ','th':'थ','dh':'ध',
    'ph':'फ','bh':'भ','sh':'श','gy':'ज्ञ','jn':'ज्ञ','tr':'त्र','rh':'ढ़',
    'k':'क','g':'ग','c':'च','j':'ज','t':'त','d':'द','n':'न',
    'p':'प','b':'ब','m':'म','y':'य','r':'र','l':'ल',
    'v':'व','w':'व','s':'स','h':'ह',
    'f':'फ़','z':'ज़','q':'क़','x':'क्ष'
  };

  /* [ standalone letter, matra ] */
  const VOW = {
    'aa':['आ','ा'], 'ii':['ई','ी'], 'ee':['ई','ी'], 'uu':['ऊ','ू'], 'oo':['ऊ','ू'],
    'ai':['ऐ','ै'], 'au':['औ','ौ'], 'ou':['औ','ौ'],
    'a':['अ',''], 'i':['इ','ि'], 'u':['उ','ु'], 'e':['ए','े'], 'o':['ओ','ो']
  };

  /* Where a nasal collapses into the anusvara dot instead of becoming a
     half letter. Before a stop or a sibilant Hindi writes हिंदी, गंगा,
     अहिंसा, कंपनी, रंग; before य र ल व it writes the conjunct — अन्य,
     जन्म. Following that split gets the common words right without
     asking anybody to think about it. */
  const DOT_BEFORE = 'कखगघचछजझटठडढतथदधपफबभसशषह';

  const CK = Object.keys(CONS).sort((a, b) => b.length - a.length);
  const VK = Object.keys(VOW).sort((a, b) => b.length - a.length);

  const isLatin = ch => ch >= 'a' && ch <= 'z';

  function pick(low, i, keys, map) {
    for (const k of keys) if (low.startsWith(k, i)) return { k, v: map[k] };
    return null;
  }

  function to(src) {
    const s = String(src == null ? '' : src);
    const low = s.toLowerCase();
    let out = '', i = 0;

    while (i < s.length) {
      const ch = low[i];

      /* escapes, so the odd word that breaks the rules can still be
         written by hand: ".n" forces the dot, "~" the moon dot,
         "." on its own forces a half letter */
      if (ch === '.' && low[i + 1] === 'n') { out += 'ं'; i += 2; continue; }
      if (ch === '~') { out += 'ँ'; i++; continue; }
      if (ch === '.') { if (/[क-हक़-य़]$/.test(out)) out += '्'; i++; continue; }

      if (!isLatin(ch)) { out += s[i]; i++; continue; }

      const c = pick(low, i, CK, CONS);
      if (c) {
        const after = i + c.k.length;
        const v = pick(low, after, VK, VOW);

        /* न / म with no vowel of their own become the dot in front of a
           stop — the one rule that makes ordinary words come out looking
           the way they are printed */
        if (!v && (c.v === 'न' || c.v === 'म') && out) {
          const nxt = after < s.length && isLatin(low[after]) ? pick(low, after, CK, CONS) : null;
          if (nxt && DOT_BEFORE.includes(nxt.v[0])) { out += 'ं'; i = after; continue; }
        }

        out += c.v;
        if (v) { out += v.v[1]; i = after + v.k.length; continue; }

        i = after;
        /* a consonant with a consonant behind it takes a halant; one at
           the end of a word keeps the silent 'a' Hindi never writes */
        const nxt = i < s.length && isLatin(low[i]) ? pick(low, i, CK, CONS) : null;
        if (nxt) out += '्';
        continue;
      }

      const v = pick(low, i, VK, VOW);
      if (v) { out += v.v[0]; i += v.k.length; continue; }

      out += s[i]; i++;
    }
    return out;
  }

  /* ---------- live field ----------
     The box keeps exactly what the player typed and the Hindi appears
     underneath it as they go. The obvious alternative — rewriting the
     box itself on every key — depends on being able to cancel each
     keystroke, and a phone's on-screen keyboard does not reliably give
     you one keystroke to cancel: Android sends composition events, swipe
     input sends whole words, and the caret jumps. This way there is
     nothing to cancel and nothing to get out of step, on any handset.

     What gets sent is value(), which is the converted line — the one
     they can see. Typing straight Devanagari passes through untouched,
     so a player with a Hindi keyboard notices nothing at all.         */
  function attach(el, opts) {
    const o = opts || {};
    let on = o.on !== false;

    const out = () => (on ? to(el.value) : el.value);

    const paint = () => {
      if (o.prevEl) {
        const v = out();
        /* nothing to preview when it converted to itself — a player
           already typing Hindi does not need to be shown their own words */
        const show = on && el.value.trim() !== '' && v !== el.value;
        (o.prevEl.querySelector('[data-out]') || o.prevEl).textContent = v;
        o.prevEl.style.display = show ? 'block' : 'none';
      }
      if (o.onChange) o.onChange(out());
    };

    el.addEventListener('input', paint);
    el.addEventListener('change', paint);

    const api = {
      get on() { return on; },
      value: () => out().trim(),
      set(v) { on = v; try { localStorage.setItem('sa.translit', v ? '1' : '0'); } catch (e) {} paint(); },
      clear() { el.value = ''; paint(); }
    };

    if (o.toggleEl) {
      const label = () => {
        o.toggleEl.textContent = on ? 'अ' : 'A';
        o.toggleEl.title = on ? SA.t('tl.off_tip') : SA.t('tl.on_tip');
        o.toggleEl.classList.toggle('p', on);
      };
      o.toggleEl.onclick = () => { api.set(!on); label(); el.focus(); };
      label();
    }
    paint();
    return api;
  }

  /* what the player chose last time, so they do not toggle every round */
  function pref(dflt) {
    try {
      const v = localStorage.getItem('sa.translit');
      return v == null ? dflt !== false : v === '1';
    } catch (e) { return dflt !== false; }
  }

  return { to, attach, pref };
})();

/* ═══════════════════════════════════════════════════════════════
   ANSWER MATCHING

   loose()  strips everything Hindi spells more than one way.
   sim()    how close two strings are, 0 to 1.
   test()   the whole decision for one typed answer.
   ═══════════════════════════════════════════════════════════════ */
SA.match = (function () {

  /* ं and ् both reduce to a plain न, so हिंदी, हिन्दी and हिंदि all end
     up the same — and so do संयम and सन्यम. Long vowels fold onto short
     ones because दीप and दिप are one word badly spelled, not two. The
     retroflex row folds onto the dental one for the same reason: almost
     nobody types ट where they meant त on purpose. */
  const FOLD = {
    'ं':'न', 'ँ':'न', 'ः':'', '़':'', '्':'',
    'ी':'ि', 'ू':'ु', 'ै':'े', 'ौ':'ो', 'ॉ':'ो', 'ॅ':'े',
    'आ':'अ', 'ई':'इ', 'ऊ':'उ', 'ऐ':'ए', 'औ':'ओ', 'ऑ':'ओ',
    'ट':'त', 'ठ':'थ', 'ड':'द', 'ढ':'ध', 'ण':'न', 'ऋ':'रि', 'ृ':'रि',
    'ष':'श', 'श':'स', 'ळ':'ल', 'ऩ':'न', 'ऱ':'र'
  };

  function loose(s) {
    let x = String(s == null ? '' : s);
    try { x = x.normalize('NFD'); } catch (e) {}
    x = x.toLowerCase()
         .replace(/[​-‍﻿]/g, '')
         .replace(/[\s।.,!?;:'"()\[\]{}\-–—_/\\]+/g, '');
    let out = '';
    for (const ch of x) out += (ch in FOLD ? FOLD[ch] : ch);
    return out;
  }

  /* plain Levenshtein over code points, two rows at a time */
  function dist(a, b) {
    const A = Array.from(a), B = Array.from(b);
    if (!A.length) return B.length;
    if (!B.length) return A.length;
    let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
    let cur = new Array(B.length + 1);
    for (let i = 1; i <= A.length; i++) {
      cur[0] = i;
      for (let j = 1; j <= B.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      }
      const t = prev; prev = cur; cur = t;
    }
    return prev[B.length];
  }

  function sim(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const n = Math.max(Array.from(a).length, Array.from(b).length);
    return n ? Math.max(0, 1 - dist(a, b) / n) : 0;
  }

  /* answerField is the "main|alt|alt" string the Studio writes.
     Returns { ok, pct, hit } — pct is how close the best match got, so
     the host panel can show "88%" beside a near miss and judge it. */
  function test(value, answerField, opts) {
    const o = opts || {};
    const accepted = String(answerField == null ? '' : answerField)
      .split('|').map(s => s.trim()).filter(Boolean);
    if (!accepted.length) return { ok: null, pct: 0, hit: '' };
    const v = String(value == null ? '' : value).trim();
    if (!v) return { ok: null, pct: 0, hit: '' };

    /* A host who ticked "case sensitive" wants it judged exactly as
       written — folding and typo allowance would make that tick a lie. */
    if (o.caseSensitive) {
      const exact = accepted.find(a => a === v);
      return { ok: !!exact, pct: exact ? 1 : 0, hit: exact || accepted[0] };
    }

    const lv = loose(v);
    let best = 0, hit = accepted[0], bestD = 99, bestN = 1;
    for (const a of accepted) {
      const la = loose(a);
      if (la && la === lv) return { ok: true, pct: 1, hit: a };
      const s = sim(lv, la);
      if (s > best) {
        best = s; hit = a;
        bestD = dist(lv, la);
        bestN = Math.max(Array.from(lv).length, Array.from(la).length);
      }
    }
    if (!o.fuzzy) return { ok: false, pct: best, hit };   // fold only

    /* A straight percentage is unfair to short words: 90% of a six letter
       word is 0.6 of a letter, so महावीर typed as महवीर — one honest slip —
       would be marked wrong while a fifteen letter answer gets a free
       letter and a half. Anything four letters or longer is allowed at
       least one mistake, and longer answers get the percentage on top. */
    const need = Math.max(0.5, Math.min(1, (Number(o.pct) || 90) / 100));
    let allow = Math.floor(bestN * (1 - need));
    if (bestN >= 4) allow = Math.max(allow, 1);
    return { ok: bestD <= allow, pct: best, hit };
  }

  /* The three settings every typed round wants, drawn the same way in
     every type's Studio panel. They use the plain data-k convention the
     config forms already wire up, so nothing extra is needed there. */
  function optionsForm(c) {
    const cfg = c || {};
    return `
      <div style="border-top:1px solid var(--bd);margin-top:14px;padding-top:12px">
        <label class="f">⌨ ${SA.t('w.typing')}</label>
        <div class="col" style="gap:9px">
          <label class="chk sub" style="align-items:flex-start">
            <input type="checkbox" data-k="fuzzy" ${cfg.fuzzy !== false ? 'checked' : ''} style="margin-top:3px">
            <span><b>${SA.esc(SA.t('w.fuzzy'))}</b>
              <span class="sm mut" style="display:block">${SA.esc(SA.t('w.fuzzy_d'))}</span></span>
          </label>
          <div><label class="f">${SA.esc(SA.t('w.fuzzy_pct'))}</label>
            <input type="number" min="50" max="100" step="1" data-k="fuzzyPct" value="${cfg.fuzzyPct ?? 90}">
            <div class="sm mut" style="margin-top:4px">
              ${SA.esc(SA.t('w.fuzzy_pct_d', { x: cfg.fuzzyPct ?? 90 }))}</div></div>
          <label class="chk sub" style="align-items:flex-start">
            <input type="checkbox" data-k="roman" ${cfg.roman !== false ? 'checked' : ''} style="margin-top:3px">
            <span><b>${SA.esc(SA.t('w.roman'))}</b>
              <span class="sm mut" style="display:block">${SA.esc(SA.t('w.roman_d'))}</span></span>
          </label>
        </div>
      </div>`;
  }

  /* One text box with the अ/A switch beside it and the Hindi it is
     turning into shown underneath, live. */
  function inputBox(id, o) {
    const cfg = o || {};
    return `
      <div class="col" style="gap:6px">
        <div class="row" style="gap:7px">
          <input type="${cfg.type || 'text'}" id="${id}" class="grow" autocomplete="off"
                 value="${SA.esc(cfg.value == null ? '' : cfg.value)}" ${cfg.disabled ? 'disabled' : ''}
                 placeholder="${SA.esc(cfg.placeholder || SA.t('play.type_here'))}"
                 style="font-size:19px;text-align:center;padding:15px">
          ${cfg.roman ? `<button class="btn" id="${id}-tl" type="button"
             style="flex:none;width:52px;font-size:20px;padding:15px 0">अ</button>` : ''}
        </div>
        ${cfg.roman ? `
          <div class="sub tc" id="${id}-prev" style="display:none;padding:9px 12px">
            <span class="xs mut" style="display:block;margin-bottom:2px">${SA.esc(SA.t('tl.becomes'))}</span>
            <span data-out style="font:800 23px/1.35 var(--fs);word-break:break-word"></span>
          </div>
          <div class="xs mut tc" style="text-transform:none;letter-spacing:0">${SA.esc(SA.t('tl.hint'))}</div>` : ''}
      </div>`;
  }

  /* Wires the box above. Returns a handle whose value() is what should
     be sent — null when the round did not ask for English typing, in
     which case the caller reads the field directly. */
  function wireInput(box, id) {
    const el = box.querySelector('#' + id);
    const tog = box.querySelector('#' + id + '-tl');
    if (!el || !tog) return null;
    return SA.translit.attach(el, {
      toggleEl: tog,
      prevEl: box.querySelector('#' + id + '-prev'),
      on: SA.translit.pref(true)
    });
  }

  return { loose, sim, dist, test, optionsForm, inputBox, wireInput };
})();
