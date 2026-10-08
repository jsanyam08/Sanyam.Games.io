/* ── सर्वोदय अहिंसा — QR codes ─────────────────────────────────────
   A self-contained QR encoder. No CDN, no library.

   Why write this rather than load one: the QR is how the whole room
   gets into the game. A projector with a slow or blocked connection
   that cannot fetch a script would show no QR at all, at exactly the
   moment three hundred people are trying to join. This has no network
   dependency, so it draws even with the cable pulled out.

   Byte mode, EC level M (recovers ~15%, survives a hall photographed
   at an angle), versions 1–10 — far more than a join link needs.
   ────────────────────────────────────────────────────────────────── */
window.SA = window.SA || {};

SA.qr = (function () {

  /* ---------- GF(256), primitive polynomial 0x11d ---------- */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /* generator polynomial for `n` error-correction codewords */
  function genPoly(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  function ecBytes(data, n) {
    const g = genPoly(n);
    const res = new Array(data.length + n).fill(0);
    for (let i = 0; i < data.length; i++) res[i] = data[i];
    for (let i = 0; i < data.length; i++) {
      const f = res[i];
      if (!f) continue;
      for (let j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], f);
    }
    return res.slice(data.length);
  }

  /* ---------- per-version tables (EC level M) ----------
     [ecPerBlock, blocksInGroup1, dataPerBlockG1, blocksInGroup2, dataPerBlockG2] */
  const M_TABLE = {
    1:  [10, 1, 16, 0, 0],
    2:  [16, 1, 28, 0, 0],
    3:  [26, 1, 44, 0, 0],
    4:  [18, 2, 32, 0, 0],
    5:  [24, 2, 43, 0, 0],
    6:  [16, 4, 27, 0, 0],
    7:  [18, 4, 31, 0, 0],
    8:  [22, 2, 38, 2, 39],
    9:  [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44]
  };

  const ALIGN = {
    1: [], 2: [6,18], 3: [6,22], 4: [6,26], 5: [6,30],
    6: [6,34], 7: [6,22,38], 8: [6,24,42], 9: [6,26,46], 10: [6,28,50]
  };

  /* leftover bits after the interleaved stream, by version */
  const REMAINDER = { 1:0, 2:7, 3:7, 4:7, 5:7, 6:7, 7:0, 8:0, 9:0, 10:0 };

  const VERSION_INFO = { 7:0x07C94, 8:0x085BC, 9:0x09A99, 10:0x0A4D3 };

  const dataCapacity = v => {
    const [, b1, d1, b2, d2] = M_TABLE[v];
    return b1 * d1 + b2 * d2;
  };

  /* ---------- encode ----------
     forceMask is only for the test harness; leave it out and the best
     mask is chosen by the standard penalty rules. */
  function encode(text, forceMask) {
    /* UTF-8 bytes — the link is ASCII, but a title never has to be */
    const bytes = [];
    const s = unescape(encodeURIComponent(String(text)));
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);

    let version = 0;
    for (let v = 1; v <= 10; v++) {
      const countBits = v < 10 ? 8 : 16;
      const needed = 4 + countBits + bytes.length * 8;
      if (needed <= dataCapacity(v) * 8) { version = v; break; }
    }
    if (!version) throw new Error('[SA.qr] text too long for version 10');

    const [ecPer, b1, d1, b2, d2] = M_TABLE[version];
    const total = dataCapacity(version);

    /* --- bit stream --- */
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(0b0100, 4);                                   // byte mode
    push(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach(b => push(b, 8));
    for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);   // terminator
    while (bits.length % 8) bits.push(0);

    const words = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      words.push(b);
    }
    const PADS = [0xEC, 0x11];
    for (let i = 0; words.length < total; i++) words.push(PADS[i % 2]);

    /* --- split into blocks, compute EC --- */
    const dataBlocks = [], ecBlocks = [];
    let at = 0;
    for (let i = 0; i < b1; i++) { const d = words.slice(at, at + d1); at += d1; dataBlocks.push(d); ecBlocks.push(ecBytes(d, ecPer)); }
    for (let i = 0; i < b2; i++) { const d = words.slice(at, at + d2); at += d2; dataBlocks.push(d); ecBlocks.push(ecBytes(d, ecPer)); }

    /* --- interleave --- */
    const stream = [];
    const maxData = Math.max(d1, d2);
    for (let i = 0; i < maxData; i++)
      dataBlocks.forEach(b => { if (i < b.length) stream.push(b[i]); });
    for (let i = 0; i < ecPer; i++)
      ecBlocks.forEach(b => stream.push(b[i]));

    /* --- matrix --- */
    const size = version * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(null));   // null = free
    const reserve = Array.from({ length: size }, () => new Array(size).fill(false));

    const setF = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) { mod[r][c] = v; reserve[r][c] = true; } };

    /* finder patterns + separators */
    const finder = (R, C) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const inSquare = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const on = inSquare && ((r === 0 || r === 6 || c === 0 || c === 6) ||
                                (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setF(R + r, C + c, on ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    /* timing */
    for (let i = 8; i < size - 8; i++) { setF(6, i, i % 2 === 0 ? 1 : 0); setF(i, 6, i % 2 === 0 ? 1 : 0); }

    /* alignment */
    const ap = ALIGN[version];
    ap.forEach(r => ap.forEach(c => {
      /* skip the three that would sit on a finder */
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) return;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        setF(r + dr, c + dc, on ? 1 : 0);
      }
    }));

    setF(size - 8, 8, 1);                       // the always-dark module

    /* Reserve the format areas. Index 6 is skipped on purpose: (6,8) and
       (8,6) belong to the timing patterns, not to the format strip, and
       blanking them here quietly breaks the timing lines — which is
       exactly the kind of fault a scanner refuses without explanation. */
    for (let i = 0; i <= 8; i++) {
      if (i === 6) continue;
      setF(8, i, 0); setF(i, 8, 0);
    }
    for (let i = 0; i < 8; i++) { setF(8, size - 1 - i, 0); setF(size - 1 - i, 8, 0); }

    /* version info for 7+ */
    if (version >= 7) {
      const vi = VERSION_INFO[version];
      for (let i = 0; i < 18; i++) {
        const bit = (vi >> i) & 1;
        setF(Math.floor(i / 3), size - 11 + (i % 3), bit);
        setF(size - 11 + (i % 3), Math.floor(i / 3), bit);
      }
    }

    /* --- place data, zigzag up/down in 2-column strips --- */
    let bi = 0, up = true;
    const bitAt = i => {
      const byte = stream[i >> 3];
      return byte === undefined ? 0 : (byte >> (7 - (i & 7))) & 1;
    };
    const totalBits = stream.length * 8 + REMAINDER[version];
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;                       // the vertical timing column
      for (let i = 0; i < size; i++) {
        const row = up ? size - 1 - i : i;
        for (let c = 0; c < 2; c++) {
          const cc = col - c;
          if (reserve[row][cc]) continue;
          mod[row][cc] = bi < totalBits ? bitAt(bi) : 0;
          bi++;
        }
      }
      up = !up;
    }

    /* --- masking --- */
    const MASKS = [
      (r, c) => (r + c) % 2 === 0,
      (r) => r % 2 === 0,
      (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
      (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
      (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0
    ];

    const build = m => {
      const grid = mod.map((row, r) => row.map((v, c) =>
        reserve[r][c] ? v : (MASKS[m](r, c) ? v ^ 1 : v)));
      applyFormat(grid, m, size);
      return grid;
    };

    if (forceMask != null) return build(forceMask);

    let best = null, bestScore = Infinity, bestMask = 0;
    for (let m = 0; m < 8; m++) {
      const grid = build(m);
      const sc = penalty(grid, size);
      if (sc < bestScore) { bestScore = sc; best = grid; bestMask = m; }
    }
    best.mask = bestMask;
    return best;
  }

  /* format info: 5 data bits (EC level + mask), BCH(15,5), XOR 0x5412 */
  function applyFormat(grid, mask, size) {
    let v = (0b00 << 3) | mask;                  // 00 = EC level M
    let d = v << 10;
    for (let i = 4; i >= 0; i--) if (d & (1 << (i + 10))) d ^= 0x537 << i;
    const fmt = ((v << 10) | d) ^ 0x5412;

    /* The 15 bits go down these positions MOST significant first — writing
       them least-significant first lays the whole string in backwards,
       which is a scanner's idea of a corrupt code. */
    for (let i = 0; i < 15; i++) {
      const bit = (fmt >> (14 - i)) & 1;

      if (i < 6)        grid[8][i] = bit;        // row 8, columns 0–5
      else if (i === 6) grid[8][7] = bit;        // skip column 6 (timing)
      else if (i === 7) grid[8][8] = bit;
      else if (i === 8) grid[7][8] = bit;        // skip row 6 (timing)
      else              grid[14 - i][8] = bit;   // column 8, rows 5→0

      if (i < 7) grid[size - 1 - i][8] = bit;    // column 8, up from the bottom
      else       grid[8][size - 15 + i] = bit;   // row 8, along the right edge
    }
    grid[size - 8][8] = 1;                       // the always-dark module
  }

  /* the four standard penalty rules — lower is better */
  function penalty(g, n) {
    let p = 0;

    const run = line => {
      let score = 0, len = 1;
      for (let i = 1; i < n; i++) {
        if (line[i] === line[i - 1]) len++;
        else { if (len >= 5) score += 3 + (len - 5); len = 1; }
      }
      if (len >= 5) score += 3 + (len - 5);
      return score;
    };
    for (let r = 0; r < n; r++) p += run(g[r]);
    for (let c = 0; c < n; c++) p += run(g.map(row => row[c]));

    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const v = g[r][c];
      if (v === g[r][c + 1] && v === g[r + 1][c] && v === g[r + 1][c + 1]) p += 3;
    }

    const PAT = [1,0,1,1,1,0,1,0,0,0,0];
    const hasPat = (line, i) => PAT.every((v, k) => line[i + k] === v);
    const revPat = PAT.slice().reverse();
    const hasRev = (line, i) => revPat.every((v, k) => line[i + k] === v);
    for (let r = 0; r < n; r++) for (let c = 0; c + 11 <= n; c++) {
      if (hasPat(g[r], c) || hasRev(g[r], c)) p += 40;
    }
    for (let c = 0; c < n; c++) {
      const col = g.map(row => row[c]);
      for (let r = 0; r + 11 <= n; r++) if (hasPat(col, r) || hasRev(col, r)) p += 40;
    }

    let dark = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c]) dark++;
    p += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
    return p;
  }

  /* ---------- drawing ---------- */

  /* An SVG scales to any projector without going blurry, and prints
     cleanly, which a canvas of fixed pixels does not. */
  function svg(text, opts) {
    const o = opts || {};
    const g = encode(text);
    const n = g.length;
    const quiet = o.quiet == null ? 3 : o.quiet;   // the mandatory clear margin
    const box = n + quiet * 2;
    const dark = o.dark || '#000';
    const light = o.light || '#fff';

    /* one path for every dark module keeps the DOM tiny */
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
      if (g[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}"
      shape-rendering="crispEdges" width="100%" height="100%" role="img" aria-label="QR">
      <rect width="${box}" height="${box}" fill="${light}"/>
      <path d="${d}" fill="${dark}"/></svg>`;
  }

  /* exposed for the test harness only */
  function debug(text) {
    const bytes = [];
    const s = unescape(encodeURIComponent(String(text)));
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);
    let version = 0;
    for (let v = 1; v <= 10; v++) {
      const countBits = v < 10 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 <= dataCapacity(v) * 8) { version = v; break; }
    }
    const [ecPer, b1, d1, b2, d2] = M_TABLE[version];
    const total = dataCapacity(version);
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(0b0100, 4); push(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach(b => push(b, 8));
    for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const words = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      words.push(b);
    }
    const PADS = [0xEC, 0x11];
    for (let i = 0; words.length < total; i++) words.push(PADS[i % 2]);

    const dataBlocks = [], ecBlocks = [];
    let at = 0;
    for (let i = 0; i < b1; i++) { const d = words.slice(at, at + d1); at += d1; dataBlocks.push(d); ecBlocks.push(ecBytes(d, ecPer)); }
    for (let i = 0; i < b2; i++) { const d = words.slice(at, at + d2); at += d2; dataBlocks.push(d); ecBlocks.push(ecBytes(d, ecPer)); }
    const stream = [];
    const maxData = Math.max(d1, d2);
    for (let i = 0; i < maxData; i++) dataBlocks.forEach(b => { if (i < b.length) stream.push(b[i]); });
    for (let i = 0; i < ecPer; i++) ecBlocks.forEach(b => stream.push(b[i]));

    return { version, ecPer, b1, d1, b2, d2, total, words, stream };
  }

  return { encode, svg, debug };
})();
