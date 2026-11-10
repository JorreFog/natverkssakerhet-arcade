// ============================================================
//  SPRITES: pixel characters drawn to their own canvases.
//  The 3D world puts them on lit billboards.
// ============================================================
const SPR = (() => {
  // ---------- tiny 3x5 pixel font (+ wide M/W) ----------
  const FONT = {
    A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227',
    J: '11156', K: '55655', L: '44447', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655',
    S: '34216', T: '72222', U: '55557', V: '55522', X: '55255', Y: '55222', Z: '71247',
    0: '75557', 1: '26227', 2: '71747', 3: '71717', 4: '55711', 5: '74717', 6: '74757', 7: '71111', 8: '75757', 9: '75717',
    '!': '22202', '-': '00700', '.': '00002', '?': '71202', ' ': '00000', ':': '02020', '+': '02720', '/': '11244', "'": '22000'
  };
  const WIDE = { M: ['10001', '11011', '10101', '10001', '10001'], W: ['10001', '10001', '10101', '11011', '10001'] };
  function pxText(c, str, x, y, col, s) {
    s = s || 1; c.fillStyle = col;
    for (let ch of String(str).toUpperCase()) {
      let dia = 0;
      if (ch === 'Å') { dia = 2; ch = 'A'; } else if (ch === 'Ä') { dia = 5; ch = 'A'; } else if (ch === 'Ö') { dia = 5; ch = 'O'; }
      const wide = WIDE[ch];
      if (wide) { for (let r = 0; r < 5; r++) for (let b = 0; b < 5; b++) if (wide[r][b] === '1') c.fillRect(x + b * s, y + r * s, s, s); x += 6 * s; continue; }
      const gl = FONT[ch] || '00000';
      if (dia) for (let b = 0; b < 3; b++) if (dia & (4 >> b)) c.fillRect(x + b * s, y - 2 * s, s, s);
      for (let r = 0; r < 5; r++) { const v = +gl[r]; for (let b = 0; b < 3; b++) if (v & (4 >> b)) c.fillRect(x + b * s, y + r * s, s, s); }
      x += 4 * s;
    }
  }
  const pxW = (str, s) => { let w = 0; for (const ch of String(str).toUpperCase()) w += WIDE[ch] ? 6 : 4; return (w - 1) * (s || 1); };

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; return { c, x, w, h }; }

  // ---------- outline + coloured rim light (the "HD-2D" sprite finish) ----------
  // left edge picks up the magenta neon, right edge the cyan neon, everything gets a dark 1px outline
  function finish(s, rimL, rimR, outline, hover) {
    const { x: c, w, h } = s, img = c.getImageData(0, 0, w, h), d = img.data, a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 40 ? 1 : 0;
    const L = rimL || [255, 70, 180], R = rimR || [70, 230, 240], O = outline || (hover ? [255, 214, 70] : [10, 6, 20]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4;
      if (a[i]) {
        const l = x === 0 || !a[i - 1], r = x === w - 1 || !a[i + 1], up = y === 0 || !a[i - w];
        if (l) { d[p] += (L[0] - d[p]) * 0.5; d[p + 1] += (L[1] - d[p + 1]) * 0.5; d[p + 2] += (L[2] - d[p + 2]) * 0.5; }
        else if (r) { d[p] += (R[0] - d[p]) * 0.45; d[p + 1] += (R[1] - d[p + 1]) * 0.45; d[p + 2] += (R[2] - d[p + 2]) * 0.45; }
        else if (up) { d[p] = Math.min(255, d[p] * 1.25 + 12); d[p + 1] = Math.min(255, d[p + 1] * 1.25 + 10); d[p + 2] = Math.min(255, d[p + 2] * 1.25 + 14); }
      } else {
        const n = (x > 0 && a[i - 1]) || (x < w - 1 && a[i + 1]) || (y > 0 && a[i - w]) || (y < h - 1 && a[i + w]);
        if (n) { d[p] = O[0]; d[p + 1] = O[1]; d[p + 2] = O[2]; d[p + 3] = 255; }
      }
    }
    c.putImageData(img, 0, 0);
  }

  // ============================================================
  //  DOORMAN  (84 x 160)
  // ============================================================
  const SKIN = ['#e2a273', '#e49a6b', '#e78b5e', '#ea7450', '#ee5a41', '#f23c30'];
  const SKIN2 = ['#c4855a', '#c67d54', '#c8704a', '#c95c40', '#cb4634', '#c92c24'];
  function doorman(s, t, st) {
    const c = s.x, lvl = st.lvl;
    c.clearRect(0, 0, s.w, s.h);
    let ox = 6, oy = 18;
    const re = t - st.reactT, reacting = re >= 0 && re < 0.7;
    if (lvl >= 4) ox += Math.floor(t * (lvl === 5 ? 22 : 12)) & 1;
    if (reacting) oy -= Math.round(Math.abs(Math.sin(re / 0.7 * Math.PI * 2)) * 4);
    const sway = lvl < 2 ? (Math.sin(t * 0.35) > 0.6 ? 1 : 0) : 0;
    const br = Math.sin(t * (1.6 + lvl * 0.7)) > 0 ? 1 : 0;
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x + ox, y + oy, w, h); };
    const sk = SKIN[lvl], sk2 = SKIN2[lvl], BL = '#3a3a52', BL2 = '#50506e', BL3 = '#242434';
    const tap = lvl >= 2 && lvl < 5 && Math.sin(t * 9) > 0.3 ? 2 : 0;
    R(15, 84, 19, 46, '#191922'); R(38, 84, 19, 46, '#191922'); R(23, 84, 2, 46, '#262633'); R(46, 84, 2, 46, '#262633');
    R(11, 130 - tap, 23, 7, '#07070a'); R(38, 130, 23, 7, '#07070a'); R(11, 130 - tap, 23, 1, '#33333f'); R(38, 130, 23, 1, '#33333f');
    const X = sway;
    R(3 + X, 33 - br, 66, 52 + br, BL); R(1 + X, 35 - br, 70, 12, BL); R(5 + X, 31 - br, 62, 3, BL);
    R(1 + X, 35 - br, 70, 1, BL2); R(3 + X, 84, 16, 2, BL3); R(53 + X, 84, 16, 2, BL3);
    R(19 + X, 32 - br, 34, 50 + br, '#f4f4ee'); R(19 + X, 77, 34, 5, '#d9d9d0');
    for (let i = 0; i < 14; i++) { const w = Math.round((14 - i) * 0.9); R(19 + X, 32 - br + i, w, 1, BL2); R(53 - w + X, 32 - br + i, w, 1, BL2); }
    R(16 + X, 32 - br, 3, 53 + br, BL2); R(53 + X, 32 - br, 3, 53 + br, BL2); R(15 + X, 46, 1, 39, BL3); R(56 + X, 46, 1, 39, BL3);
    R(8 + X, 66, 6, 1, BL3); R(58 + X, 66, 6, 1, BL3); R(13 + X, 72, 2, 2, '#8a8aa0'); R(13 + X, 78, 2, 2, '#8a8aa0');
    pxText(c, 'MARIAMS', ox + X + 21, oy + 47, '#15151b'); pxText(c, 'DÖRRVAKT', ox + X + 21, oy + 57, '#15151b');
    R(19 + X, 82, 34, 3, '#0b0b0f'); R(34 + X, 82, 4, 3, '#c9a227');
    if (lvl <= 1) {
      R(-3 + X, 35 - br, 9, 34, BL); R(66 + X, 35 - br, 9, 34, BL); R(-3 + X, 35 - br, 2, 34, BL3); R(73 + X, 35 - br, 2, 34, BL3);
      R(-1 + X, 64, 16, 8, BL); R(57 + X, 64, 16, 8, BL); R(12 + X, 69, 18, 7, BL); R(42 + X, 69, 18, 7, BL); R(12 + X, 75, 18, 1, BL3); R(42 + X, 75, 18, 1, BL3);
      R(29 + X, 68, 14, 9, sk); R(29 + X, 72, 14, 1, sk2); R(35 + X, 68, 1, 9, sk2); R(28 + X, 68, 1, 9, '#fff'); R(43 + X, 68, 1, 9, '#fff');
    } else if (lvl === 2) {
      R(-5, 35 - br, 9, 26, BL); R(68, 35 - br, 9, 26, BL); R(-5, 57, 14, 8, BL); R(63, 57, 14, 8, BL); R(-5, 35 - br, 2, 30, BL3); R(75, 35 - br, 2, 30, BL3);
      R(6, 62, 9, 8, sk); R(57, 62, 9, 8, sk); R(6, 69, 9, 1, sk2); R(57, 69, 9, 1, sk2);
    } else if (lvl === 3) {
      const p = Math.sin(t * 7) > 0 ? 0 : 6;
      R(-3, 35 - br, 9, 34, BL); R(66, 35 - br, 9, 34, BL); R(-1, 64, 16, 8, BL); R(57 + p, 64, 16 - p, 8, BL);
      R(12, 68, 16, 8, BL); R(45 + p, 68, 14, 8, BL);
      R(26, 66, 9, 12, sk); R(26, 66, 2, 12, sk2); R(35 + p, 67, 10, 10, sk); R(35 + p, 70, 10, 1, sk2); R(35 + p, 73, 10, 1, sk2);
      if (!p) { R(33, 62, 1, 3, '#fff'); R(36, 60, 1, 4, '#fff'); R(39, 62, 1, 3, '#fff'); R(33, 79, 1, 2, '#fff'); R(37, 80, 1, 2, '#fff'); }
    } else {
      const sh = Math.floor(t * 16) & 1;
      R(-4, 35 - br, 9, 40, BL); R(-4, 35 - br, 2, 40, BL3); R(-5, 74 + sh, 11, 10, sk); R(-5, 78 + sh, 11, 1, sk2); R(-5, 81 + sh, 11, 1, sk2);
      if (lvl === 4) { R(67, 35 - br, 9, 40, BL); R(74, 35 - br, 2, 40, BL3); R(66, 74 - sh, 11, 10, sk); R(66, 78 - sh, 11, 1, sk2); R(66, 81 - sh, 11, 1, sk2); }
      else { R(65, 12, 11, 30, BL); R(74, 12, 2, 30, BL3); R(64, -2 - sh * 2, 13, 13, sk); R(64, 2 - sh * 2, 13, 1, sk2); R(64, 6 - sh * 2, 13, 1, sk2); R(64, -2 - sh * 2, 1, 13, sk2); }
    }
    const nod = (t - st.nodT >= 0 && t - st.nodT < 0.5) ? (Math.sin((t - st.nodT) / 0.5 * Math.PI * 2) > 0 ? 2 : 0) : 0;
    const hy = -br + nod, hx = X;
    R(31 + hx, 25 + hy, 10, 8, sk2);
    R(27 + hx, 3 + hy, 18, 24, sk); R(25 + hx, 6 + hy, 22, 18, sk); R(28 + hx, 26 + hy, 16, 2, sk);
    R(27 + hx, 2 + hy, 18, 5, '#2b2119'); R(25 + hx, 5 + hy, 3, 6, '#2b2119'); R(44 + hx, 5 + hy, 3, 6, '#2b2119'); R(29 + hx, 1 + hy, 14, 1, '#2b2119');
    R(23 + hx, 12 + hy, 2, 6, sk2); R(47 + hx, 12 + hy, 2, 6, sk2);
    R(49 + hx, 13 + hy, 1, 4, '#e8e8e8'); R(48 + hx, 17 + hy, 1, 10, '#b8b8b8');
    c.fillStyle = 'rgba(50,35,28,.28)'; c.fillRect(27 + hx + ox, 19 + hy + oy, 18, 8);
    const blink = (t % 4.3) < 0.14 && lvl < 4;
    const look = lvl >= 2 ? 0 : ((t % 11) > 8 ? -1 : (t % 11) > 5.5 ? 1 : 0);
    if (blink) { R(30 + hx, 14 + hy, 4, 1, sk2); R(38 + hx, 14 + hy, 4, 1, sk2); }
    else {
      R(30 + hx, 13 + hy, 4, 2, '#fff'); R(38 + hx, 13 + hy, 4, 2, '#fff');
      R(31 + look + hx, 13 + hy, 2, 2, '#101010'); R(39 + look + hx, 13 + hy, 2, 2, '#101010');
      if (lvl >= 5) { R(30 + hx, 15 + hy, 4, 1, '#c22'); R(38 + hx, 15 + hy, 4, 1, '#c22'); }
    }
    const BR = '#20170f';
    if (lvl === 0) { R(29 + hx, 10 + hy, 6, 1, BR); R(37 + hx, 10 + hy, 6, 1, BR); }
    else if (lvl === 1) { R(29 + hx, 10 + hy, 4, 1, BR); R(33 + hx, 11 + hy, 2, 1, BR); R(37 + hx, 11 + hy, 2, 1, BR); R(39 + hx, 10 + hy, 4, 1, BR); }
    else { const th = lvl >= 4 ? 2 : 1; R(28 + hx, 9 + hy, 3, th, BR); R(31 + hx, 10 + hy, 2, th, BR); R(33 + hx, 11 + hy, 2, th, BR); R(37 + hx, 11 + hy, 2, th, BR); R(39 + hx, 10 + hy, 2, th, BR); R(41 + hx, 9 + hy, 3, th, BR); }
    R(35 + hx, 14 + hy, 2, 5, sk2);
    if (lvl === 0) { R(32 + hx, 22 + hy, 8, 1, '#7a3b2a'); }
    else if (lvl === 1) { R(32 + hx, 22 + hy, 8, 1, '#7a3b2a'); R(31 + hx, 23 + hy, 1, 1, '#7a3b2a'); R(40 + hx, 23 + hy, 1, 1, '#7a3b2a'); }
    else if (lvl <= 3) { R(31 + hx, 21 + hy, 10, 3, '#5a1a14'); R(32 + hx, 21 + hy, 8, 2, '#fff'); R(32 + hx, 22 + hy, 8, 1, '#c9c9c9'); R(35 + hx, 21 + hy, 1, 2, '#999'); R(38 + hx, 21 + hy, 1, 2, '#999'); }
    else { const op = lvl === 5 ? (Math.floor(t * 8) & 1) : 0; R(31 + hx, 20 + hy, 10, 5 + op, '#3a0d0d'); R(32 + hx, 20 + hy, 8, 1, '#fff'); R(33 + hx, 23 + hy + op, 6, 1, '#d55'); }
    if (lvl >= 4) { R(42 + hx, 5 + hy, 1, 3, '#a01818'); R(43 + hx, 6 + hy, 2, 1, '#a01818'); R(43 + hx, 8 + hy, 1, 2, '#a01818'); }
    if (lvl >= 3) {
      const n = lvl - 1;
      for (let i = 0; i < n; i++) {
        const ph = (t * (0.9 + lvl * 0.25) + i * 0.37) % 1, side = i & 1 ? 1 : -1;
        const px = 36 + side * (14 + ph * 8) + Math.round(Math.sin(ph * 9 + i) * 1.5), py = 6 - ph * 22, sz = ph < 0.5 ? 3 : 2;
        c.fillStyle = `rgba(255,255,255,${0.8 * (1 - ph)})`; c.fillRect(px + ox, py + oy, sz, sz); c.fillRect(px + ox + side, py + oy - 2, sz - 1, sz - 1);
      }
    }
    if (reacting) {
      const mx = 52, my = -8, cc = '#ff2a2a';
      R(mx + 2, my, 2, 3, cc); R(mx + 2, my + 6, 2, 3, cc); R(mx - 1, my + 3, 3, 2, cc); R(mx + 5, my + 3, 3, 2, cc);
      R(mx, my + 1, 2, 1, cc); R(mx + 4, my + 1, 2, 1, cc); R(mx, my + 7, 2, 1, cc); R(mx + 4, my + 7, 2, 1, cc);
    }
    finish(s);
  }

  // ============================================================
  //  RICKARD  (136 x 252, standing straight; the world tilts the billboard so he leans)
  // ============================================================
  function rickard(s, t, st) {
    const c = s.x; c.clearRect(0, 0, s.w, s.h);
    const bx = 8, by = 4, mode = st.mode;
    const K = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(bx + x, by + y, w, h); };
    const br = Math.sin(t * 1.3) > 0 ? 0 : 1;
    const J = '#17171f', J2 = '#30303e', J3 = '#0b0b10', SK = '#e9b48c', SK2 = '#c98f68', TEE = '#cfcfd8';
    // legs + boots
    K(26, 150, 25, 86, '#1d2338'); K(53, 150, 25, 86, '#1d2338'); K(30, 152, 2, 84, '#2c3554'); K(57, 152, 2, 84, '#2c3554'); K(50, 150, 3, 86, '#10141f');
    K(60, 196, 14, 2, '#151a27'); K(32, 204, 12, 2, '#151a27');
    K(22, 234, 31, 10, '#0a0a0e'); K(52, 234, 31, 10, '#0a0a0e'); K(22, 234, 31, 2, '#2a2a33'); K(52, 234, 31, 2, '#2a2a33'); K(22, 242, 31, 2, '#000'); K(52, 242, 31, 2, '#000');
    // tee + leather jacket
    K(40, 46 + br, 24, 104 - br, TEE); K(40, 62, 24, 2, '#b8b8c2'); K(40, 96, 24, 1, '#b8b8c2');
    K(14, 52 + br, 30, 98 - br, J); K(60, 52 + br, 30, 98 - br, J); K(18, 47 + br, 24, 8, J); K(62, 47 + br, 24, 8, J);
    K(42, 50 + br, 3, 98 - br, J2); K(59, 50 + br, 3, 98 - br, J2);
    K(36, 44 + br, 8, 20, J2); K(60, 44 + br, 8, 20, J2); K(38, 46 + br, 4, 16, '#3c3c4c'); K(62, 46 + br, 4, 16, '#3c3c4c');
    K(20, 62, 2, 46, J2); K(84, 60, 2, 34, J2); K(22, 142, 20, 3, J3); K(62, 142, 26, 3, J3); K(66, 112, 14, 2, J3);
    K(24, 72, 1, 30, '#4a4a5c'); K(78, 70, 1, 22, '#4a4a5c');   // leather highlights
    K(24, 146, 56, 5, '#08080b'); K(48, 146, 8, 5, '#b9b9c6');
    // arm resting on the cabinet, hand in pocket
    K(6, 54 + br, 14, 60 - br, J); K(6, 54 + br, 3, 60 - br, J3); K(9, 58, 2, 40, J2); K(10, 110, 18, 11, J); K(24, 119, 14, 3, J3);
    // coin arm
    const T = 2.3, paid = mode === 'paid', ask = mode === 'ask';
    let thumb = 0, coin = null;
    if (!ask) {
      const pp = ((t * (paid ? 1.6 : 1)) % T) / T;
      if (pp < 0.07) thumb = 3;
      if (pp >= 0.07 && pp < 0.7) { const u = (pp - 0.07) / 0.63; coin = { y: 82 - 4 * 64 * u * (1 - u), h: Math.max(1, Math.round(Math.abs(Math.cos(u * Math.PI * 7)) * 8)), u }; }
      else coin = { y: 84, h: 3 };
    }
    const hb = ask ? Math.round(Math.sin(t * 5) * 1.5) : 0;
    K(82, 54 + br, 14, 46 - br, J); K(93, 54 + br, 3, 46 - br, J3); K(84, 58, 2, 34, J2);
    K(84, 92 + hb, 22, 11, J); K(84, 101 + hb, 22, 2, J3); K(102, 92 + hb, 3, 11, J2);
    K(105, 90 + hb, 10, 10, SK); K(105, 98 + hb, 10, 2, SK2); K(107, 86 + hb - thumb, 3, 5 + thumb, SK); K(112, 92 + hb, 3, 2, SK2);
    if (ask) K(106, 91 + hb, 8, 2, '#f6cfae');
    if (coin) {
      const cy = Math.round(coin.y - coin.h / 2);
      K(105, cy, 8, coin.h, '#b97f00'); K(106, cy, 6, Math.max(1, coin.h - 1), '#ffd23f');
      if (coin.h > 5) K(107, cy + 1, 2, 2, '#fff6c0');
      if (coin.u && coin.u > 0.42 && coin.u < 0.58) { K(109, cy - 3, 1, 3, '#fff'); K(108, cy - 2, 3, 1, '#fff'); }
    }
    // head
    const tilt = (!ask && coin && coin.u) ? (coin.u > 0.25 && coin.u < 0.75 ? -1 : 0) : 0;
    const hy = br + tilt;
    K(44, 38 + hy, 15, 10, SK2);
    K(37, 2 + hy, 28, 6, SK); K(34, 6 + hy, 34, 30, SK); K(36, 35 + hy, 30, 4, SK); K(40, 38 + hy, 22, 2, SK);
    K(39, 1 + hy, 24, 1, SK); K(44, 4 + hy, 9, 2, '#fbe0c6'); K(42, 6 + hy, 4, 1, '#fbe0c6');
    K(32, 18 + hy, 2, 8, SK2); K(68, 18 + hy, 2, 8, SK2);
    c.globalAlpha = 0.22; K(38, 28 + hy, 26, 10, '#3c2d23'); c.globalAlpha = 1;
    K(36, 13 + hy, 30, 2, SK2);
    K(34, 15 + hy, 34, 3, '#000'); K(36, 15 + hy, 14, 9, '#07070b'); K(53, 15 + hy, 14, 9, '#07070b'); K(37, 23 + hy, 12, 1, '#000'); K(54, 23 + hy, 12, 1, '#000');
    const gp = (t % 3.4) / 0.5;
    if (gp < 1) { const gx = Math.round(gp * 9); K(37 + gx, 17 + hy, 2, 1, '#fff'); K(36 + gx, 18 + hy, 2, 1, '#cfe'); K(54 + gx, 17 + hy, 2, 1, '#fff'); K(53 + gx, 18 + hy, 2, 1, '#cfe'); }
    else { K(38, 17 + hy, 3, 1, '#2a2a3a'); K(55, 17 + hy, 3, 1, '#2a2a3a'); }
    K(49, 22 + hy, 4, 6, SK2); K(49, 27 + hy, 5, 1, '#b07b58');
    const grin = paid || t - st.grinT < 1.4;
    if (grin) { K(43, 30 + hy, 15, 3, '#5a2a1a'); K(44, 30 + hy, 13, 2, '#fff'); K(58, 29 + hy, 2, 1, '#5a2a1a'); K(42, 29 + hy, 1, 1, '#5a2a1a'); }
    else { K(44, 31 + hy, 12, 1, '#5a2a1a'); K(56, 30 + hy, 2, 1, '#5a2a1a'); K(58, 29 + hy, 1, 1, '#5a2a1a'); }
    finish(s, [255, 90, 190], [90, 200, 255], null, st.hover);
  }

  // ============================================================
  //  CROWD PEOPLE  (48 x 100): three views and a set of poses
  // ============================================================
  const SKINS = [['#f1c7a3', '#d9a47f'], ['#e3a77a', '#c4875c'], ['#c68a5c', '#a46c42'], ['#8d5a3b', '#6e4229'], ['#f5d2b8', '#dcae90']];
  const HAIRS = ['#2b1d14', '#5a3a22', '#d8b25a', '#111111', '#b8452a', '#7a7a86', '#3a2a6a'];
  const TOPS = [['#d6452f', '#a52f1d'], ['#2f6fd6', '#1f4c99'], ['#2fbf71', '#1e8a50'], ['#f0c23a', '#b98d16'], ['#8a4fd8', '#5f2fa6'], ['#e8e8ee', '#b9b9c6'], ['#2a2a35', '#17171f'], ['#ff7aa8', '#c94f7a']];
  const PANTS = ['#27314f', '#3a3a44', '#4a3a2a', '#1d1d24', '#5a6a8a', '#6b2f3a'];
  function person(seed) {
    let r = seed * 9301 + 49297; const rnd = n => { r = (r * 9301 + 49297) % 233280; return Math.floor(r / 233280 * n); };
    const top = TOPS[rnd(TOPS.length)];
    return { skin: SKINS[rnd(SKINS.length)], hair: HAIRS[rnd(HAIRS.length)], style: rnd(6), top, pants: PANTS[rnd(PANTS.length)], shoe: ['#eeeeee', '#1a1a1a', '#c0392b', '#3a6ad6'][rnd(4)], hood: rnd(3) === 0, glasses: rnd(5) === 0, stripe: rnd(3) === 0 ? ['#ffffff', '#ffd23f', '#2de2e6'][rnd(3)] : null, height: 0.86 + rnd(20) / 100 };
  }
  // pose: {view:'front'|'back'|'side', act, t, frame, flip}
  // acts: idle, walk, play, look, laugh, point, cheer, clap, sad, hips
  function drawPerson(s, P, pose) {
    const c = s.x; c.clearRect(0, 0, s.w, s.h);
    const t = pose.t, act = pose.act, view = pose.view;
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const SK = P.skin[0], SK2 = P.skin[1], H = P.hair, T1 = P.top[0], T2 = P.top[1], PA = P.pants, SH = P.shoe;
    let bob = 0, jump = 0;
    if (act === 'laugh') bob = Math.floor(t * 9) & 1;
    if (act === 'cheer') jump = Math.max(0, Math.round(Math.sin(t * 9) * 6));
    if (act === 'clap' || act === 'play') bob = (Math.floor(t * 6) & 1) ? 1 : 0;
    if (act === 'idle' || act === 'look' || act === 'hips') bob = Math.sin(t * 1.7) > 0.7 ? 1 : 0;
    const y0 = -jump + bob;
    const walk = act === 'walk', fr = pose.frame & 3;
    if (view === 'side') {
      // ---- side view (facing right; the world flips the texture for left)
      const lg = walk ? [0, 3, 0, -3][fr] : 0;
      R(19 - lg, 64 + y0, 7, 28 - y0, PA); R(22 + lg, 64 + y0, 7, 28 - y0, PA); R(22 + lg, 64 + y0, 1, 28, 'rgba(0,0,0,.25)');
      R(17 - lg, 91, 10, 6, SH); R(21 + lg, 91, 11, 6, SH); R(17 - lg, 96, 10, 1, '#000'); R(21 + lg, 96, 11, 1, '#000');
      R(17, 30 + y0, 15, 35, T1); R(17, 30 + y0, 3, 35, T2); if (P.stripe) R(17, 44 + y0, 15, 2, P.stripe);
      const ar = walk ? [0, -3, 0, 3][fr] : 0;
      R(23 + ar, 33 + y0, 6, 21, T2); R(23 + ar, 54 + y0, 6, 5, SK);
      R(22, 26 + y0, 6, 6, SK2);
      R(17, 9 + y0, 15, 18, SK); R(31, 15 + y0, 3, 4, SK); R(32, 19 + y0, 1, 1, SK2);
      R(28, 14 + y0, 2, 2, '#111'); R(29, 21 + y0, 3, 1, '#6a2a1a');
      hairSide(R, P, y0);
      if (P.glasses) { R(26, 13 + y0, 6, 3, '#111'); R(27, 14 + y0, 4, 1, '#6ad'); }
      R(21, 18 + y0, 3, 4, SK2);
    } else {
      const back = view === 'back';
      // ---- legs
      let lgL = 0, lgR = 0;
      if (walk) { lgL = [0, -2, 0, 2][fr]; lgR = -lgL; }
      R(14, 64 + y0 + Math.max(0, lgL), 9, 28 - y0 - Math.max(0, lgL), PA); R(25, 64 + y0 + Math.max(0, lgR), 9, 28 - y0 - Math.max(0, lgR), PA);
      R(23, 64 + y0, 2, 10, PA); R(22, 66 + y0, 1, 26, 'rgba(0,0,0,.25)');
      R(13, 91 + Math.min(0, lgL), 10, 6, SH); R(25, 91 + Math.min(0, lgR), 10, 6, SH); R(13, 96, 10, 1, '#000'); R(25, 96, 10, 1, '#000');
      // ---- torso
      R(13, 31 + y0, 22, 34, T1); R(12, 33 + y0, 24, 6, T1); R(13, 61 + y0, 22, 3, T2); R(13, 31 + y0, 2, 34, T2);
      if (P.stripe) R(13, 45 + y0, 22, 2, P.stripe);
      if (P.blazer && !back) {
        // open-collar light blue shirt, a hint of white tee, blazer lapels
        const S1 = P.shirt, S2 = '#8fb0d4';
        R(19, 31 + y0, 10, 30, S1); for (let i = 0; i < 30; i += 2) R(19, 31 + y0 + i, 10, 1, S2);
        R(22, 31 + y0, 4, 4, '#f4f4f0'); R(21, 31 + y0, 1, 2, SK); R(26, 31 + y0, 1, 2, SK);
        R(18, 30 + y0, 3, 4, S1); R(27, 30 + y0, 3, 4, S1);                       // collar points
        for (let i = 0; i < 16; i++) { const w = Math.max(1, Math.round((16 - i) * 0.35)); R(19, 33 + y0 + i, w, 1, T2); R(29 - w, 33 + y0 + i, w, 1, T2); }
        R(18, 33 + y0, 1, 30, T2); R(29, 33 + y0, 1, 30, T2);
        R(23, 52 + y0, 2, 2, '#1a1a20');                                          // button
        R(13, 61 + y0, 22, 3, T1);
      } else if (P.blazer) { R(13, 31 + y0, 22, 3, T2); R(19, 29 + y0, 10, 3, P.shirt); }
      else if (!back) { R(21, 31 + y0, 6, 3, SK2); if (P.hood) { R(19, 40 + y0, 10, 6, T2); R(20, 31 + y0, 1, 8, '#ddd'); R(27, 31 + y0, 1, 8, '#ddd'); } }
      else if (P.hood) { R(16, 30 + y0, 16, 7, T2); }
      // ---- arms by act
      const arm = (x, y, w, h) => R(x, y + y0, w, h, T1), hand = (x, y) => R(x, y + y0, 4, 4, SK);
      if (back && act === 'play') {
        const m = Math.floor(t * 7) & 1;
        arm(8, 33 + m, 6, 12); arm(10, 43 + m, 7, 5); arm(34, 33 + (1 - m), 6, 12); arm(31, 43 + (1 - m), 7, 5);
      } else if (act === 'cheer') {
        const w = Math.floor(t * 8) & 1;
        arm(8, 14 - w, 5, 20); arm(35, 14 + w, 5, 20); hand(8, 10 - w); hand(36, 10 + w);
      } else if (act === 'clap') {
        const k = Math.floor(t * 7) & 1;
        arm(9, 33, 5, 13); arm(34, 33, 5, 13); arm(12, 44, 9 - k * 2, 5); arm(27 + k * 2, 44, 9 - k * 2, 5);
        hand(20 - k * 2, 43); hand(24 + k * 2, 43);
      } else if (act === 'point') {
        const dir = pose.flip ? -1 : 1, sh = Math.floor(t * 5) & 1;
        if (dir > 0) { arm(9, 33, 5, 22); hand(9, 55); arm(34, 34, 12, 5); R(44, 34 + y0 - sh, 4, 4, SK); R(47, 35 + y0 - sh, 1, 2, SK); }
        else { arm(34, 33, 5, 22); hand(35, 55); arm(2, 34, 12, 5); R(0, 34 + y0 - sh, 4, 4, SK); }
      } else if (act === 'laugh') {
        arm(9, 33, 5, 12); arm(34, 33, 5, 12); arm(12, 45, 8, 5); arm(28, 45, 8, 5); hand(18, 47); hand(26, 47);
      } else if (act === 'sad') {
        arm(9, 22, 5, 14); arm(34, 22, 5, 14); hand(12, 14); hand(32, 14);
      } else if (act === 'hips') {
        arm(8, 33, 5, 10); arm(35, 33, 5, 10); arm(10, 43, 5, 8); arm(33, 43, 5, 8); hand(13, 49); hand(31, 49);
      } else {
        const sw = walk ? [0, 2, 0, -2][fr] : 0;
        arm(9, 33 + sw, 5, 22); arm(34, 33 - sw, 5, 22); hand(9, 55 + sw); hand(35, 55 - sw);
      }
      // ---- head
      const hx = act === 'laugh' ? (Math.floor(t * 9) & 1) : 0, hy = y0 + (act === 'laugh' ? -1 : 0);
      R(21, 27 + y0, 6, 5, SK2);
      R(16 + hx, 9 + hy, 16, 19, SK); R(15 + hx, 12 + hy, 18, 13, SK); R(17 + hx, 27 + hy, 14, 1, SK2);
      if (!back) {
        R(14 + hx, 16 + hy, 1, 5, SK2); R(33 + hx, 16 + hy, 1, 5, SK2);
        face(R, P, act, t, hx, hy);
      }
      hairFront(R, P, hx, hy, back);
    }
    if (pose.emote) emote(R, pose.emote, t);
    finish(s, [255, 80, 180], [80, 220, 240]);
  }
  function face(R, P, act, t, hx, hy) {
    const X = (v) => v + hx, Y = (v) => v + hy;
    const blink = (t % 3.7) < 0.12;
    if (act === 'laugh' || act === 'cheer') {
      R(X(18), Y(16), 4, 1, '#222'); R(X(26), Y(16), 4, 1, '#222'); R(X(18), Y(15), 1, 1, '#222'); R(X(21), Y(15), 1, 1, '#222'); R(X(26), Y(15), 1, 1, '#222'); R(X(29), Y(15), 1, 1, '#222');
      R(X(20), Y(20), 8, 5, '#5a1a14'); R(X(20), Y(20), 8, 1, '#fff'); R(X(22), Y(23), 4, 2, '#d55');
    } else if (act === 'sad') {
      R(X(19), Y(16), 2, 2, '#222'); R(X(27), Y(16), 2, 2, '#222'); R(X(18), Y(14), 3, 1, '#222'); R(X(27), Y(14), 3, 1, '#222');
      R(X(21), Y(23), 6, 1, '#6a2a1a'); R(X(20), Y(24), 1, 1, '#6a2a1a'); R(X(27), Y(24), 1, 1, '#6a2a1a');
    } else if (act === 'point') {
      R(X(19), Y(16), 2, 2, '#222'); R(X(27), Y(16), 2, 2, '#222'); R(X(20), Y(21), 8, 3, '#5a1a14'); R(X(21), Y(21), 6, 1, '#fff');
    } else if (act === 'look') {
      R(X(18), Y(15), 4, 3, '#fff'); R(X(26), Y(15), 4, 3, '#fff'); R(X(19), Y(16), 2, 2, '#111'); R(X(27), Y(16), 2, 2, '#111'); R(X(22), Y(22), 4, 3, '#5a1a14');
    } else if (P.eyes) {
      // calm, slightly serious face with blue eyes
      if (blink) { R(X(18), Y(17), 4, 1, '#3a2a22'); R(X(26), Y(17), 4, 1, '#3a2a22'); }
      else { R(X(18), Y(16), 4, 2, '#f4f4f4'); R(X(26), Y(16), 4, 2, '#f4f4f4'); R(X(19), Y(16), 2, 2, P.eyes); R(X(27), Y(16), 2, 2, P.eyes); R(X(19), Y(16), 1, 1, '#1a2a3a'); R(X(27), Y(16), 1, 1, '#1a2a3a'); }
      R(X(18), Y(14), 4, 1, '#7a5a3e'); R(X(26), Y(14), 4, 1, '#7a5a3e');
      if (act === 'cheer') { R(X(20), Y(21), 8, 3, '#5a1a14'); R(X(21), Y(21), 6, 1, '#fff'); }
      else if (act === 'look') { R(X(22), Y(22), 4, 2, '#7a3a2a'); }
      else { R(X(21), Y(22), 6, 1, '#9a5a48'); R(X(27), Y(21), 1, 1, '#9a5a48'); }
    } else {
      if (blink) { R(X(19), Y(17), 3, 1, '#222'); R(X(26), Y(17), 3, 1, '#222'); }
      else { R(X(19), Y(16), 2, 2, '#222'); R(X(27), Y(16), 2, 2, '#222'); }
      if (act === 'clap') { R(X(20), Y(21), 8, 2, '#5a1a14'); R(X(21), Y(21), 6, 1, '#fff'); }
      else R(X(21), Y(22), 6, 1, '#6a2a1a');
    }
    R(X(23), Y(18), 2, 3, P.skin[1]);
    if (P.stubble) { R(X(17), Y(24), 14, 2, 'rgba(150,100,70,.16)'); R(X(19), Y(26), 10, 1, 'rgba(150,100,70,.12)'); }
    if (P.glasses) { R(X(17), Y(15), 6, 4, '#111'); R(X(25), Y(15), 6, 4, '#111'); R(X(23), Y(16), 2, 1, '#111'); R(X(18), Y(16), 4, 2, 'rgba(140,200,255,.55)'); R(X(26), Y(16), 4, 2, 'rgba(140,200,255,.55)'); }
  }
  function hairFront(R, P, hx, hy, back) {
    const H = P.hair, X = (v) => v + hx, Y = (v) => v + hy;
    switch (P.style) {
      case 0: R(X(15), Y(7), 18, 6, H); R(X(15), Y(12), 2, 4, H); R(X(31), Y(12), 2, 4, H); if (back) R(X(15), Y(12), 18, 12, H); break;               // short
      case 1: R(X(14), Y(7), 20, 6, H); R(X(13), Y(12), 4, 18, H); R(X(31), Y(12), 4, 18, H); if (back) R(X(14), Y(12), 20, 20, H); break;            // long
      case 2: R(X(14), Y(8), 20, 5, '#c0392b'); R(X(14), Y(12), 26, 2, '#a12f22'); R(X(15), Y(13), 18, 2, H); if (back) { R(X(15), Y(13), 18, 10, H); R(X(14), Y(8), 20, 6, '#c0392b'); } break; // cap
      case 3: R(X(21), Y(1), 6, 10, H); R(X(22), Y(0), 4, 2, H); if (back) R(X(21), Y(1), 6, 22, H); break;                                            // mohawk
      case 4: R(X(15), Y(7), 18, 6, H); R(X(15), Y(12), 3, 3, H); R(X(30), Y(12), 3, 3, H); R(X(31), Y(16), 5, 14, H); if (back) { R(X(15), Y(12), 18, 12, H); R(X(21), Y(23), 6, 12, H); } break; // ponytail
      case 6: {  // side-swept fringe, medium length over the ears (the visitor)
        const H2 = P.hair2 || H;
        R(X(15), Y(6), 18, 5, H); R(X(14), Y(9), 20, 3, H); R(X(16), Y(5), 14, 1, H2);
        // fringe sweeping from a part on his right across the forehead and down to the left temple
        for (let i = 0; i < 14; i++) R(X(30 - i), Y(11 + Math.floor(i / 3)), 2, 2, i % 3 ? H : H2);
        R(X(15), Y(11), 3, 5, H); R(X(16), Y(15), 2, 2, H);
        // over the ears and down towards the collar
        R(X(13), Y(10), 3, 11, H); R(X(32), Y(10), 3, 10, H); R(X(13), Y(20), 2, 4, H2); R(X(33), Y(19), 2, 4, H2);
        R(X(18), Y(6), 2, 1, '#a07a50'); R(X(24), Y(7), 3, 1, '#a07a50');
        if (back) { R(X(13), Y(9), 22, 18, H); R(X(15), Y(26), 18, 2, H2); }
        break;
      }
      default: R(X(13), Y(5), 22, 9, H); R(X(12), Y(9), 3, 10, H); R(X(33), Y(9), 3, 10, H); R(X(15), Y(4), 6, 2, H); R(X(26), Y(4), 6, 2, H); if (back) R(X(12), Y(9), 24, 16, H); // curly
    }
  }
  function hairSide(R, P, y0) {
    const H = P.hair;
    switch (P.style) {
      case 1: R(16, 7 + y0, 15, 5, H); R(14, 10 + y0, 7, 20, H); break;
      case 2: R(16, 7 + y0, 16, 6, '#c0392b'); R(30, 11 + y0, 7, 2, '#a12f22'); R(15, 11 + y0, 5, 7, H); break;
      case 3: R(19, 2 + y0, 9, 9, H); break;
      case 4: R(16, 7 + y0, 15, 5, H); R(15, 10 + y0, 5, 6, H); R(11, 13 + y0, 5, 12, H); break;
      case 5: R(14, 5 + y0, 18, 8, H); R(13, 9 + y0, 7, 12, H); break;
      case 6: R(15, 6 + y0, 17, 6, H); R(27, 10 + y0, 6, 3, H); R(14, 9 + y0, 8, 14, H); R(14, 22 + y0, 5, 3, P.hair2 || H); break;
      default: R(16, 7 + y0, 15, 5, H); R(15, 10 + y0, 5, 8, H);
    }
  }
  // little floating symbols above heads
  function emote(R, e, t) {
    const y = 0 + (Math.floor(t * 4) & 1);
    if (e === '!') { R(22, y, 4, 7, '#ffd23f'); R(22, y + 8, 4, 3, '#ffd23f'); }
    else if (e === '?') { R(20, y, 8, 2, '#fff'); R(26, y + 2, 2, 3, '#fff'); R(23, y + 5, 3, 2, '#fff'); R(23, y + 9, 3, 2, '#fff'); }
    else if (e === 'heart') { const H = '#ff4d7a'; R(18, y + 1, 4, 3, H); R(26, y + 1, 4, 3, H); R(17, y + 3, 14, 3, H); R(19, y + 6, 10, 2, H); R(21, y + 8, 6, 1, H); R(23, y + 9, 2, 1, H); }
    else if (e === 'star') { const S = '#ffe066'; R(23, y, 2, 11, S); R(18, y + 4, 12, 2, S); R(20, y + 2, 2, 2, S); R(26, y + 2, 2, 2, S); R(20, y + 7, 2, 2, S); R(26, y + 7, 2, 2, S); }
    else if (e === 'dots') { R(17, y + 6, 3, 3, '#ccc'); R(23, y + 6, 3, 3, '#ccc'); R(29, y + 6, 3, 3, '#ccc'); }
    else if (e === 'note') { R(24, y, 6, 2, '#7ef'); R(28, y, 2, 8, '#7ef'); R(22, y + 7, 7, 3, '#7ef'); }
  }

  // ---- "HA HA" / "WOO" / "JA!" speech labels (drawn by the world on a shared canvas)
  function label(s, text, col) {
    const c = s.x; c.clearRect(0, 0, s.w, s.h);
    const w = pxW(text, 2), x = Math.floor((s.w - w) / 2);
    c.fillStyle = '#0a0612'; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]]) pxText(c, text, x + dx, 4 + dy, '#0a0612', 2);
    pxText(c, text, x, 4, col, 2);
  }

  // ---- the player, thrown out of the hall (30 x 44)
  function thrown(s, t) {
    const c = s.x; c.clearRect(0, 0, s.w, s.h);
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const k = Math.floor(t * 10) & 1;
    R(8, 15, 14, 14, '#2f6fd6'); R(8, 15, 14, 3, '#4b8cf0'); R(3, 16 - k * 3, 5, 10, '#2a5fb8'); R(22, 16 + k * 3 - 3, 5, 10, '#2a5fb8');
    R(3, 13 - k * 3, 5, 4, '#e9b48c'); R(22, 13 + k * 3 - 3, 5, 4, '#e9b48c');
    R(9, 3, 12, 12, '#e9b48c'); R(9, 2, 12, 4, '#4a2f1a'); R(11, 8, 3, 3, '#fff'); R(16, 8, 3, 3, '#fff'); R(12, 9, 1, 1, '#111'); R(17, 9, 1, 1, '#111'); R(13, 12, 4, 2, '#5a1a14');
    R(9, 29, 6, 11 - k * 2, '#27314f'); R(16, 29, 6, 9 + k * 2, '#27314f'); R(8, 38 - k * 2, 7, 4, '#eee'); R(16, 36 + k * 2, 7, 4, '#eee');
    finish(s, [255, 200, 120], [120, 160, 255]);
  }

  // ============================================================
  //  RARE CAMEOS (own designs)
  // ============================================================
  // Volt (40 x 44): small round yellow electric critter with antennae and a bolt on its belly
  function volt(s, pose) {
    const c = s.x; c.clearRect(0, 0, s.w, s.h);
    const t = pose.t, act = pose.act, view = pose.view;
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    let hop = 0;
    if (act === 'walk') hop = Math.round(Math.abs(Math.sin(t * 9)) * 4);
    if (act === 'cheer') hop = Math.round(Math.abs(Math.sin(t * 10)) * 7);
    if (act === 'laugh') hop = Math.floor(t * 12) & 1;
    const y0 = -hop, Y = '#ffd23f', Y2 = '#e3a812', Y3 = '#fff2a0';
    // body (egg)
    for (let y = 0; y < 30; y++) {
      const v = (y - 15) / 15, w = Math.round(13 * Math.sqrt(Math.max(0, 1 - v * v)) * (y > 15 ? 1.05 : 0.95));
      R(20 - w, 12 + y + y0, w * 2, 1, Y); R(20 + w - 3, 12 + y + y0, 3, 1, Y2);
      if (y < 12) R(20 - w + 1, 12 + y + y0, 3, 1, Y3);
    }
    R(9, 37 + y0, 22, 3, Y2);
    // feet
    const st = act === 'walk' ? (Math.floor(t * 9) & 1) : 0;
    R(10, 40 - st, 8, 3, '#ff9f1c'); R(22, 40 - (1 - st) * st, 8, 3, '#ff9f1c'); R(10, 42 - st, 8, 1, '#c96a00'); R(22, 42, 8, 1, '#c96a00');
    // antennae with glowing tips
    const glow = (Math.floor(t * 3) & 1) ? '#9ff6ff' : '#46d8ff';
    R(13, 4 + y0, 1, 9, '#5a4210'); R(12, 7 + y0, 1, 3, '#5a4210'); R(26, 4 + y0, 1, 9, '#5a4210'); R(27, 7 + y0, 1, 3, '#5a4210');
    R(11, 1 + y0, 4, 4, glow); R(25, 1 + y0, 4, 4, glow); R(12, 2 + y0, 1, 1, '#fff'); R(26, 2 + y0, 1, 1, '#fff');
    // arms
    if (act === 'cheer') { R(4, 14 + y0, 4, 8, Y); R(32, 14 + y0, 4, 8, Y); R(4, 14 + y0, 4, 2, Y3); R(32, 14 + y0, 4, 2, Y3); }
    else { const w2 = act === 'walk' ? (Math.floor(t * 9) & 1) : 0; R(5, 25 + y0 + w2, 4, 6, Y2); R(31, 25 + y0 - w2, 4, 6, Y2); }
    if (view === 'back') { R(17, 18 + y0, 6, 2, Y2); R(19, 20 + y0, 2, 8, '#ff9f1c'); }
    else if (view === 'side') { R(24, 19 + y0, 4, 5, '#111'); R(25, 19 + y0, 1, 1, '#fff'); R(28, 27 + y0, 3, 1, '#6a3a10'); }
    else {
      const blink = (t % 3.1) < 0.12;
      if (blink) { R(12, 22 + y0, 5, 1, '#111'); R(23, 22 + y0, 5, 1, '#111'); }
      else if (act === 'laugh') { R(12, 21 + y0, 5, 1, '#111'); R(11, 22 + y0, 1, 1, '#111'); R(17, 22 + y0, 1, 1, '#111'); R(23, 21 + y0, 5, 1, '#111'); R(22, 22 + y0, 1, 1, '#111'); R(28, 22 + y0, 1, 1, '#111'); }
      else { R(12, 19 + y0, 5, 6, '#111'); R(23, 19 + y0, 5, 6, '#111'); R(13, 20 + y0, 2, 2, '#fff'); R(24, 20 + y0, 2, 2, '#fff'); R(15, 23 + y0, 1, 1, '#6af'); R(26, 23 + y0, 1, 1, '#6af'); }
      if (act === 'laugh' || act === 'cheer') { R(17, 27 + y0, 6, 3, '#6a1a10'); R(18, 29 + y0, 4, 1, '#ff7a7a'); }
      else { R(17, 28 + y0, 2, 1, '#6a3a10'); R(19, 29 + y0, 2, 1, '#6a3a10'); R(21, 28 + y0, 2, 1, '#6a3a10'); }
      // belly patch with bolt
      R(15, 31 + y0, 10, 6, '#fff2c0'); R(20, 31 + y0, 2, 2, '#ff9f1c'); R(18, 33 + y0, 3, 1, '#ff9f1c'); R(19, 34 + y0, 2, 2, '#ff9f1c');
    }
    // sparks
    const spark = act === 'cheer' || act === 'laugh' || (t % 5) < 0.4;
    if (spark) { const k = Math.floor(t * 14) % 4; for (let i = 0; i < 3; i++) { const a = i * 2.1 + k, x = 20 + Math.cos(a) * 17, yy = 22 + Math.sin(a) * 15 + y0; R(x, yy, 2, 1, '#9ff6ff'); R(x + 1, yy + 1, 1, 2, '#fff'); R(x + 1, yy + 3, 2, 1, '#9ff6ff'); } }
    if (pose.emote) emote(R, pose.emote, t);
    finish(s, [255, 120, 200], [120, 230, 255]);
  }
  // Pixel-Pelle (48 x 84): stocky jumper with a blue star cap, full beard and an orange track jacket
  function pelle(s, pose) {
    const c = s.x; c.clearRect(0, 0, s.w, s.h);
    const t = pose.t, act = pose.act, view = pose.view;
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const SK = '#f0b98e', SK2 = '#d4976c', BE = '#5a3418', CAP = '#2f5fd6', CAP2 = '#1f3f99', JK = '#ff7a1c', JK2 = '#c95a10', JE = '#2e4a8a';
    const jumpK = pose.jump || 0, y0 = -Math.round(jumpK * 16) + (act === 'laugh' ? (Math.floor(t * 9) & 1) : 0);
    const walk = act === 'walk', fr = pose.frame & 3, lg = walk ? [0, 2, 0, -2][fr] : 0;
    if (pose.coin > 0) { const cy = 2 - Math.round(pose.coin * 8); R(21, cy, 6, 8, '#b97f00'); R(22, cy, 4, 7, '#ffd23f'); R(23, cy + 2, 1, 3, '#fff6c0'); }
    // legs + boots
    R(14, 62 + y0 + Math.max(0, lg), 9, 12 - Math.max(0, lg), JE); R(25, 62 + y0 + Math.max(0, -lg), 9, 12 - Math.max(0, -lg), JE);
    R(12, 74 + y0, 12, 6, '#6a3a1a'); R(24, 74 + y0, 12, 6, '#6a3a1a'); R(12, 79 + y0, 12, 1, '#2a160a'); R(24, 79 + y0, 12, 1, '#2a160a');
    // torso (round belly)
    R(10, 36 + y0, 28, 27, JK); R(8, 40 + y0, 32, 18, JK); R(10, 60 + y0, 28, 3, JK2); R(8, 40 + y0, 2, 18, JK2);
    if (view !== 'back') { R(23, 36 + y0, 2, 26, '#e8e8e8'); R(17, 36 + y0, 14, 3, JK2); }
    else { R(14, 42 + y0, 20, 2, '#fff'); }
    // arms with white stripes
    if (act === 'cheer' || jumpK > 0.2) { R(4, 18 + y0, 6, 22, JK); R(38, 18 + y0, 6, 22, JK); R(6, 18 + y0, 1, 22, '#fff'); R(41, 18 + y0, 1, 22, '#fff'); R(3, 13 + y0, 8, 6, SK); R(37, 13 + y0, 8, 6, SK); }
    else if (act === 'clap') { const k = Math.floor(t * 7) & 1; R(4, 38 + y0, 6, 12, JK); R(38, 38 + y0, 6, 12, JK); R(9, 48 + y0, 12 - k * 2, 6, JK); R(27 + k * 2, 48 + y0, 12 - k * 2, 6, JK); R(20 - k * 2, 47 + y0, 4, 6, SK); R(24 + k * 2, 47 + y0, 4, 6, SK); }
    else if (act === 'laugh') { R(4, 38 + y0, 6, 12, JK); R(38, 38 + y0, 6, 12, JK); R(8, 50 + y0, 10, 6, JK); R(30, 50 + y0, 10, 6, JK); R(16, 52 + y0, 6, 5, SK); R(26, 52 + y0, 6, 5, SK); }
    else { const sw = walk ? [0, 2, 0, -2][fr] : 0; R(4, 38 + y0 + sw, 6, 20, JK); R(38, 38 + y0 - sw, 6, 20, JK); R(6, 38 + y0 + sw, 1, 20, '#fff'); R(41, 38 + y0 - sw, 1, 20, '#fff'); R(4, 58 + y0 + sw, 6, 5, SK); R(38, 58 + y0 - sw, 6, 5, SK); }
    // head
    R(14, 12 + y0, 20, 22, SK); R(12, 16 + y0, 24, 14, SK); R(20, 33 + y0, 8, 4, SK2);
    if (view !== 'back') {
      // full beard
      R(12, 26 + y0, 24, 8, BE); R(14, 33 + y0, 20, 3, BE); R(17, 35 + y0, 14, 2, BE); R(12, 22 + y0, 3, 5, BE); R(33, 22 + y0, 3, 5, BE);
      const laugh = act === 'laugh' || act === 'cheer';
      if (laugh) { R(19, 28 + y0, 10, 4, '#5a1a14'); R(20, 28 + y0, 8, 1, '#fff'); } else R(20, 29 + y0, 8, 2, '#7a3a2a');
      R(22, 22 + y0, 5, 5, '#e8a07a'); R(23, 23 + y0, 2, 2, '#f6c4a2');                                   // round nose
      if ((t % 3.3) < 0.12) { R(17, 20 + y0, 4, 1, '#222'); R(28, 20 + y0, 4, 1, '#222'); }
      else { R(18, 18 + y0, 3, 4, '#fff'); R(28, 18 + y0, 3, 4, '#fff'); R(19, 19 + y0, 2, 3, '#2a4a8a'); R(28, 19 + y0, 2, 3, '#2a4a8a'); }
      R(16, 16 + y0, 6, 2, BE); R(27, 16 + y0, 6, 2, BE);
    } else { R(12, 14 + y0, 24, 18, BE); }
    // cap with a white star
    R(12, 6 + y0, 24, 10, CAP); R(14, 4 + y0, 20, 3, CAP); R(12, 14 + y0, 24, 2, CAP2);
    if (view !== 'back') { R(10, 15 + y0, 28, 2, CAP2); R(22, 7 + y0, 4, 4, '#fff'); R(21, 8 + y0, 6, 2, '#fff'); R(23, 6 + y0, 2, 6, '#fff'); }
    if (pose.emote) emote(R, pose.emote, t);
    finish(s, [255, 90, 190], [90, 210, 255]);
  }

  // the rare visitor: light-brown side-swept hair, fair skin, blue eyes, charcoal blazer over a light blue shirt
  const VISITOR = { skin: ['#f3cdb0', '#dcaa8a'], hair: '#7a5634', hair2: '#5e4026', style: 6, top: ['#2c2d36', '#1c1d24'], pants: '#25262e', shoe: '#141414', blazer: true, shirt: '#b8d2ee', eyes: '#4f7fb8', stubble: true, glasses: false, stripe: null, hood: false, height: 1.06 };

  return { pxText, pxW, mk, finish, doorman, rickard, person, drawPerson, label, thrown, FONT, VISITOR, volt, pelle };
})();
window.SPR = SPR;
