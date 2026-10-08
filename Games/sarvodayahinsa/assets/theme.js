/* ── सर्वोदय अहिंसा — theming ──────────────────────────────────────
   One game = one look. A theme is eight colours; everything else in
   ui.css is derived from them, so applying a theme is a single call.

   Every page calls SA.theme.apply(themeObj) as soon as it knows which
   game it is showing. Before that it sits on the house theme (gold).
   ────────────────────────────────────────────────────────────────── */
window.SA = window.SA || {};

SA.theme = (function () {

  /* Each preset gives the dark values. Light values are derived, so a
     new preset never has to hand-write a second palette.              */
  const PRESETS = {
    gold:  { label:'Royal Gold',  hi:'शाही स्वर्ण',  primary:'#ffcf2e', accent:'#2f6bff', bg:'#070b16', panel:'#0e1526', ok:'#10b981', bad:'#ef4444', deep:'#050811' },
    neon:  { label:'Neon',        hi:'नियॉन',        primary:'#00f0ff', accent:'#ff007b', bg:'#050510', panel:'#121026', ok:'#22d3ee', bad:'#ff2d6f', deep:'#03030a' },
    saffron:{label:'Saffron',     hi:'केसरिया',      primary:'#ff8c1a', accent:'#c2410c', bg:'#170d05', panel:'#241408', ok:'#84cc16', bad:'#e11d48', deep:'#0f0803' },
    emerald:{label:'Emerald',     hi:'पन्ना',        primary:'#34d399', accent:'#0ea5e9', bg:'#04140f', panel:'#072019', ok:'#4ade80', bad:'#f43f5e', deep:'#020d09' },
    crimson:{label:'Crimson',     hi:'क्रिमसन',      primary:'#fb7185', accent:'#facc15', bg:'#16060c', panel:'#240b14', ok:'#4ade80', bad:'#ef4444', deep:'#0e0408' },
    indigo:{ label:'Indigo',      hi:'नील',          primary:'#a78bfa', accent:'#f472b6', bg:'#0b0820', panel:'#150f33', ok:'#34d399', bad:'#fb7185', deep:'#070515' },
    ocean: { label:'Ocean',       hi:'सागर',         primary:'#38bdf8', accent:'#14b8a6', bg:'#04101c', panel:'#071a2c', ok:'#2dd4bf', bad:'#fb7185', deep:'#020a13' },
    mono:  { label:'Monochrome',  hi:'श्वेत-श्याम',  primary:'#e2e8f0', accent:'#94a3b8', bg:'#0a0a0a', panel:'#161616', ok:'#a3e635', bad:'#f87171', deep:'#050505' }
  };

  const DEFAULT = 'gold';

  /* ---------- colour maths (hex ⇄ hsl), used to derive light mode ---------- */
  function hex2rgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb2hex = ([r, g, b]) =>
    '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  function rgb2hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
    }
    h = (h * 60 + 360) % 360;
    const l = (mx + mn) / 2;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return [h, s, l];
  }

  function hsl2rgb([h, s, l]) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
            : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return t.map(v => (v + m) * 255);
  }

  /* l and s are clamped, not scaled — scaling washes saturated brand colours out */
  function shift(hex, dl, ds) {
    const [h, s, l] = rgb2hsl(hex2rgb(hex));
    return rgb2hex(hsl2rgb([h, Math.max(0, Math.min(1, s + (ds || 0))), Math.max(0, Math.min(1, l + dl))]));
  }
  const fade = (hex, a) => { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; };

  /* Relative luminance → which text colour survives on this background.
     Matters most for the projector, where a wrong pick is unreadable from
     row 20, and on the header's active tab, which is brand colour. */
  function lum(hex) {
    return hex2rgb(hex).map(v => v / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  }

  /* Black and white swap places at a luminance of about 0.18, where both
     give the same contrast. The old cut-off of 0.45 was far above that,
     so every pastel brand colour — Indigo's #a78bfa, Ocean's #38bdf8 —
     got white text at around 2.7:1, which is what made the active tab in
     the header unreadable. 0.21 is the real crossover with a nudge, so a
     saturated mid-blue still keeps white while the pastels turn black. */
  const readableOn = hex => lum(hex) > 0.21 ? '#0b0b0f' : '#ffffff';

  /* ---------- resolve a stored theme object into a full palette ---------- */
  function resolve(t) {
    const base = PRESETS[(t && t.preset) || DEFAULT] || PRESETS[DEFAULT];
    /* stored custom colours win over the preset, field by field */
    return Object.assign({}, base, {
      primary: (t && t.primary) || base.primary,
      accent:  (t && t.accent)  || base.accent,
      bg:      (t && t.bg)      || base.bg,
      panel:   (t && t.panel)   || base.panel
    });
  }

  /* ---------- apply ---------- */
  function apply(t, mode) {
    const p = resolve(t);
    const dark = (mode || document.documentElement.dataset.mode || 'dark') !== 'light';
    const r = document.documentElement.style;

    const set = (k, v) => r.setProperty(k, v);

    if (dark) {
      set('--bg',       p.bg);
      set('--bg-deep',  p.deep || shift(p.bg, -0.03));
      set('--panel',    p.panel);
      set('--panel-2',  shift(p.panel, 0.04));
      set('--bd',       shift(p.panel, 0.10));
      set('--bd-lt',    shift(p.panel, 0.18));
      set('--tx',       '#f1f5f9');
      set('--tx-mut',   shift(p.panel, 0.45, -0.15));
    } else {
      /* Light mode is for printing host sheets and for bright halls.
         Backgrounds go near-white with a trace of the brand hue, and the
         primary is darkened until it holds up as text on paper.          */
      set('--bg',       shift(p.bg, 0.92, -0.55));
      set('--bg-deep',  shift(p.bg, 0.95, -0.6));
      set('--panel',    '#ffffff');
      set('--panel-2',  shift(p.bg, 0.90, -0.5));
      set('--bd',       shift(p.bg, 0.76, -0.45));
      set('--bd-lt',    shift(p.bg, 0.64, -0.4));
      set('--tx',       '#14161c');
      set('--tx-mut',   '#5b6070');
    }

    const prim = dark ? p.primary : shift(p.primary, -0.28, 0.05);
    const acc  = dark ? p.accent  : shift(p.accent,  -0.25, 0.05);

    set('--primary',    prim);
    set('--primary-dk', shift(prim, dark ? -0.28 : -0.12));
    set('--primary-lt', shift(prim, dark ? 0.15 : 0.30));
    set('--on-primary', readableOn(prim));
    set('--glow',       fade(prim, dark ? 0.24 : 0.16));
    set('--glow-hard',  fade(prim, dark ? 0.55 : 0.35));
    set('--accent',     acc);
    set('--on-accent',  readableOn(acc));
    set('--accent-glow',fade(acc, dark ? 0.25 : 0.16));
    set('--ok',         dark ? p.ok  : shift(p.ok,  -0.22, 0.05));
    set('--bad',        dark ? p.bad : shift(p.bad, -0.20, 0.05));
    set('--ok-glow',    fade(p.ok, 0.22));
    set('--bad-glow',   fade(p.bad, 0.22));

    document.documentElement.dataset.mode = dark ? 'dark' : 'light';
    /* remembered per browser, not per game — it is about the room, not the show */
    try { localStorage.setItem('sa.mode', dark ? 'dark' : 'light'); } catch (e) {}
    current = t;
    document.dispatchEvent(new CustomEvent('sa:theme', { detail: { theme: t, dark } }));
  }

  let current = null;

  function toggleMode() {
    apply(current, document.documentElement.dataset.mode === 'light' ? 'dark' : 'light');
  }

  function savedMode() {
    try { return localStorage.getItem('sa.mode') || 'dark'; } catch (e) { return 'dark'; }
  }

  /* Swatch strip for the Studio's theme picker. */
  function swatches() {
    return Object.keys(PRESETS).map(k => ({ key: k, ...PRESETS[k] }));
  }

  return { PRESETS, DEFAULT, apply, resolve, toggleMode, savedMode, swatches, shift, fade, readableOn,
           get current() { return current; } };
})();
