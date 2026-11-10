// ============================================================
//  WORLD: three.js arcade hall rendered HD-2D style
//  low-res render target -> depth of field -> bloom -> grade -> pixel upscale
// ============================================================
import * as THREE from 'three';

const W = {};
window.World = W;
const SPR = () => window.SPR;
const GS = () => window.GS;

let renderer, canvas, camera, hall, street, cur, px = 3, iw = 640, ih = 360;
let rtScene, rtDof, rtB = [], rtT = [], quad, quadScene, quadCam, M = {};
const clock = { t: 0 };

// ---------- small helpers ----------
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = k => k * k * (3 - 2 * k);
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function cv(w, h) { return SPR().mk(w, h); }
function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c.c || c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = o.nomip ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = !o.nomip;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function normalFromHeight(h, strength) {
  const w = h.w, hh = h.h, src = h.x.getImageData(0, 0, w, hh).data, out = cv(w, hh), img = out.x.createImageData(w, hh), d = img.data;
  const H = (x, y) => src[(((y + hh) % hh) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    let nx = (H(x - 1, y) - H(x + 1, y)) * strength, ny = (H(x, y + 1) - H(x, y - 1)) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const p = (y * w + x) * 4; d[p] = (nx * 0.5 + 0.5) * 255; d[p + 1] = (ny * 0.5 + 0.5) * 255; d[p + 2] = (nz * 0.5 + 0.5) * 255; d[p + 3] = 255;
  }
  out.x.putImageData(img, 0, 0); return out;
}
function rgb(r, g, b) { return `rgb(${r | 0},${g | 0},${b | 0})`; }
function planeUV(w, h, tile) { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile); return g; }
function std(o) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o)); }
function add(parent, mesh, x, y, z, ry) { mesh.position.set(x, y, z); if (ry) mesh.rotation.y = ry; parent.add(mesh); mesh.castShadow = mesh.receiveShadow = true; return mesh; }
function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function glowMat(map, k, col) { const m = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }); m.color.set(col || 0xffffff).multiplyScalar(k); return m; }

// ============================================================
//  PROCEDURAL PIXEL TEXTURES
// ============================================================
const T = {};
function makeTextures() {
  const px = SPR().pxText;
  // ---- bricks (128px = 2 m)
  const brick = (base, seed) => {
    const c = cv(128, 128), h = cv(128, 128), r = rng(seed);
    for (let row = 0; row < 16; row++) {
      const off = row & 1 ? 8 : 0;
      for (let b = -1; b < 9; b++) {
        const x0 = b * 16 + off, y0 = row * 8, v = r(), blue = r() < 0.12, dark = r() < 0.15;
        let [R, G, B] = base; R += (v - 0.5) * 22; G += (v - 0.5) * 14; B += (v - 0.5) * 18;
        if (blue) { R *= 0.75; B *= 1.25; } if (dark) { R *= 0.7; G *= 0.7; B *= 0.7; }
        for (let y = 0; y < 7; y++) for (let x = 0; x < 15; x++) {
          const n = r() * 0.16 - 0.08, edge = (x === 0 || y === 0) ? 1.12 : (x === 14 || y === 6) ? 0.82 : 1;
          const k = (1 + n) * edge * (1 - (y0 + y) / 128 * 0.25);
          c.x.fillStyle = rgb(R * k, G * k, B * k); c.x.fillRect(((x0 + x) % 128 + 128) % 128, y0 + y, 1, 1);
          const hv = (x === 0 || y === 0 || x === 14 || y === 6) ? 150 : 205 + r() * 40;
          h.x.fillStyle = rgb(hv, hv, hv); h.x.fillRect(((x0 + x) % 128 + 128) % 128, y0 + y, 1, 1);
        }
        if (r() < 0.25) { const cx = x0 + 2 + (r() * 10 | 0), cy = y0 + 1 + (r() * 4 | 0); c.x.fillStyle = 'rgba(0,0,0,.35)'; c.x.fillRect(((cx % 128) + 128) % 128, cy, 2, 1); h.x.fillStyle = '#555'; h.x.fillRect(((cx % 128) + 128) % 128, cy, 2, 1); }
      }
      c.x.fillStyle = rgb(base[0] * 0.33, base[1] * 0.3, base[2] * 0.36); c.x.fillRect(0, row * 8 + 7, 128, 1);
      h.x.fillStyle = '#2a2a2a'; h.x.fillRect(0, row * 8 + 7, 128, 1);
      for (let b = 0; b < 8; b++) { const xx = b * 16 + off + 15; c.x.fillRect(xx % 128, row * 8, 1, 7); h.x.fillRect(xx % 128, row * 8, 1, 7); c.x.fillStyle = rgb(base[0] * 0.33, base[1] * 0.3, base[2] * 0.36); }
    }
    return { map: tex(c), normal: tex(normalFromHeight(h, 2.2), { data: true }) };
  };
  T.brick = brick([88, 52, 70], 3);
  T.brickRed = brick([120, 58, 46], 9);
  // ---- wood wainscot (64px = 1 m)
  {
    const c = cv(64, 64), h = cv(64, 64), r = rng(5);
    for (let x = 0; x < 64; x++) {
      const plank = x >> 3, pv = rng(plank + 11)();
      for (let y = 0; y < 64; y++) {
        const grain = Math.sin(y * 0.35 + plank * 3 + Math.sin(x * 1.3) * 0.8) * 0.08 + r() * 0.06;
        const k = 0.8 + pv * 0.35 + grain, edge = (x & 7) === 0 ? 0.55 : (x & 7) === 7 ? 0.8 : 1;
        c.x.fillStyle = rgb(78 * k * edge, 44 * k * edge, 34 * k * edge); c.x.fillRect(x, y, 1, 1);
        const hv = (x & 7) === 0 ? 60 : 200 + grain * 200; h.x.fillStyle = rgb(hv, hv, hv); h.x.fillRect(x, y, 1, 1);
      }
    }
    T.wood = { map: tex(c), normal: tex(normalFromHeight(h, 1.5), { data: true }) };
  }
  // ---- arcade carpet (128px = 2 m)
  {
    const c = cv(128, 128), h = cv(128, 128), r = rng(21);
    c.x.fillStyle = '#160d2c'; c.x.fillRect(0, 0, 128, 128);
    const cols = ['#c42a86', '#25b6c4', '#d8a61a', '#6a3ad8', '#2ad86a'];
    for (let i = 0; i < 46; i++) {
      const x = r() * 128 | 0, y = r() * 128 | 0, col = cols[i % cols.length], kind = r() * 5 | 0;
      for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) {
        c.x.fillStyle = col; const X = x + ox, Y = y + oy;
        if (kind === 0) { for (let k = 0; k < 6; k++) c.x.fillRect(X + k, Y + (k & 1 ? 1 : 0), 1, 2); }
        else if (kind === 1) { c.x.fillRect(X, Y, 4, 1); c.x.fillRect(X + 1, Y + 1, 2, 1); c.x.fillRect(X + 1, Y - 1, 2, 1); }
        else if (kind === 2) { for (let k = 0; k < 5; k++) c.x.fillRect(X + k, Y + 4 - k, 1, 1); for (let k = 0; k < 5; k++) c.x.fillRect(X + k, Y + 4, 1, 1); c.x.fillRect(X, Y, 1, 5); }
        else if (kind === 3) { c.x.fillRect(X, Y, 2, 2); }
        else { c.x.fillRect(X, Y + 1, 5, 1); c.x.fillRect(X + 2, Y - 1, 1, 5); }
      }
    }
    const id = c.x.getImageData(0, 0, 128, 128), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = 0.85 + r() * 0.3; d[i] *= n; d[i + 1] *= n; d[i + 2] *= n; }
    c.x.putImageData(id, 0, 0);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const v = 150 + r() * 80; h.x.fillStyle = rgb(v, v, v); h.x.fillRect(x, y, 1, 1); }
    T.carpet = { map: tex(c), normal: tex(normalFromHeight(h, 0.9), { data: true }) };
  }
  // ---- glossy floor tiles (64px = 1 m)
  {
    const c = cv(64, 64), h = cv(64, 64), r = rng(8);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const g = (x & 31) === 0 || (y & 31) === 0, chk = ((x >> 5) + (y >> 5)) & 1, n = r() * 10;
      c.x.fillStyle = g ? '#0c0a12' : chk ? rgb(30 + n, 26 + n, 40 + n) : rgb(22 + n, 20 + n, 32 + n); c.x.fillRect(x, y, 1, 1);
      h.x.fillStyle = g ? '#404040' : '#d0d0d0'; h.x.fillRect(x, y, 1, 1);
    }
    T.tile = { map: tex(c), normal: tex(normalFromHeight(h, 1.6), { data: true }) };
  }
  // ---- ceiling tiles (64px = 1 m)
  {
    const c = cv(64, 64), r = rng(4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const g = (x & 31) === 0 || (y & 31) === 0; const n = r() * 6;
      c.x.fillStyle = g ? '#2a2236' : (r() < 0.06 ? '#120e1a' : rgb(24 + n, 20 + n, 32 + n)); c.x.fillRect(x, y, 1, 1);
    }
    T.ceil = tex(c);
  }
  // ---- asphalt (64 = 2 m) and pavement (64 = 2 m)
  {
    const c = cv(64, 64), r = rng(77);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const n = r() * 16; c.x.fillStyle = rgb(26 + n, 26 + n, 34 + n); c.x.fillRect(x, y, 1, 1); }
    T.asphalt = tex(c);
    const p = cv(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const g = (x & 31) === 0 || (y & 15) === 0; const n = r() * 12; p.x.fillStyle = g ? '#2a2a33' : rgb(70 + n, 70 + n, 82 + n); p.x.fillRect(x, y, 1, 1); }
    T.pave = tex(p);
  }
  // ---- metal + plastic
  {
    const c = cv(16, 16), r = rng(2);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const n = r() * 14; c.x.fillStyle = rgb(70 + n, 72 + n, 84 + n); c.x.fillRect(x, y, 1, 1); }
    T.metal = tex(c);
  }
  // ---- speaker grill
  {
    const c = cv(32, 32); c.x.fillStyle = '#121016'; c.x.fillRect(0, 0, 32, 32);
    for (let y = 1; y < 32; y += 3) for (let x = 1 + (y % 2); x < 32; x += 3) { c.x.fillStyle = '#2a2633'; c.x.fillRect(x, y, 1, 1); }
    c.x.fillStyle = '#3a3546'; c.x.fillRect(0, 0, 32, 1); c.x.fillRect(0, 31, 32, 1);
    T.grill = tex(c, { clamp: true });
    const k = cv(32, 32); k.x.fillStyle = '#0d0b10'; k.x.fillRect(0, 0, 32, 32);
    for (let r0 = 15; r0 > 0; r0--) { k.x.fillStyle = r0 > 13 ? '#3a3440' : r0 > 5 ? (r0 & 1 ? '#1d1a22' : '#24202a') : r0 > 3 ? '#4a4452' : '#15121a'; k.x.beginPath(); k.x.arc(16, 16, r0, 0, 7); k.x.fill(); }
    T.cone = tex(k, { clamp: true });
  }
  // ---- leaf for plants
  {
    const c = cv(32, 48);
    const leaf = (x, y, dx, dy, n, col) => { for (let i = 0; i < n; i++) { c.x.fillStyle = col; c.x.fillRect(Math.round(x + dx * i), Math.round(y + dy * i), 3, 2); } };
    for (let i = 0; i < 9; i++) { const a = -1.2 + i * 0.3; leaf(15, 46, Math.sin(a) * 1.4, -1.6 + Math.abs(a) * 0.5, 18 + (i % 3) * 4, i % 2 ? '#2f8a4a' : '#3fae5c'); }
    T.leaf = tex(c, { clamp: true, nomip: true });
  }
  // ---- door
  {
    const c = cv(48, 64); c.x.fillStyle = '#26303f'; c.x.fillRect(0, 0, 48, 64);
    c.x.fillStyle = '#1a212c'; c.x.fillRect(23, 0, 2, 64); c.x.fillRect(4, 6, 15, 20); c.x.fillRect(29, 6, 15, 20);
    c.x.fillStyle = '#3c4a5f'; c.x.fillRect(0, 0, 48, 1);
    c.x.fillStyle = '#b9b9c6'; c.x.fillRect(5, 34, 14, 2); c.x.fillRect(29, 34, 14, 2);
    c.x.fillStyle = '#c33'; c.x.fillRect(8, 40, 8, 3); c.x.fillRect(32, 40, 8, 3);
    T.door = tex(c, { clamp: true });
  }
}

// ---------- cabinet art ----------
function sideArt(hue, seed, kind) {
  const c = cv(64, 128), r = rng(seed), x = c.x;
  x.fillStyle = `hsl(${hue},45%,14%)`; x.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 6; i++) { x.fillStyle = `hsl(${hue + i * 18},85%,${45 + i * 4}%)`; for (let y = 0; y < 128; y++) x.fillRect(Math.floor(y * 0.45) - 30 + i * 5, y, 3, 1); }
  x.fillStyle = `hsl(${hue + 180},90%,60%)`;
  const icon = [['00110', '01100', '11111', '00110', '01100'], ['00100', '01110', '11111', '01110', '01010'], ['01110', '11111', '10101', '11111', '01010']][kind % 3];
  for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 5; xx++) if (icon[yy][xx] === '1') x.fillRect(22 + xx * 5, 30 + yy * 5, 5, 5);
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.03 + r() * 0.05) + ')'; x.fillRect(r() * 64 | 0, r() * 128 | 0, 1, 1); }
  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 96, 64, 32);
  const t = tex(c, { clamp: true }); t.repeat.set(1, 1 / 1.95); t.offset.set(0.5, 0); return t;
}
function marqueeCanvas(title, hue) {
  const c = cv(128, 32), x = c.x, P = SPR();
  const g = x.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, `hsl(${hue},80%,22%)`); g.addColorStop(1, `hsl(${hue + 30},80%,10%)`);
  x.fillStyle = g; x.fillRect(0, 0, 128, 32);
  for (let i = 0; i < 8; i++) { x.fillStyle = `hsla(${hue + 40},90%,60%,.12)`; x.fillRect(i * 18, 0, 6, 32); }
  const s = P.pxW(title, 2) > 120 ? 1 : 2, w = P.pxW(title, s), x0 = (128 - w) >> 1, y0 = s === 2 ? 11 : 13;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 2]]) P.pxText(x, title, x0 + dx, y0 + dy, '#0a0612', s);
  P.pxText(x, title, x0, y0, `hsl(${hue + 180},100%,75%)`, s);
  P.pxText(x, title, x0, y0, '#fff8e0', s === 2 ? 1 : 1);
  P.pxText(x, title, x0, y0, `hsl(${hue + 180},100%,72%)`, s);
  return c;
}
function bezelCanvas(hue) {
  const c = cv(160, 128), x = c.x, P = SPR();
  x.fillStyle = '#0b0912'; x.fillRect(0, 0, 160, 128);
  x.fillStyle = `hsl(${hue},70%,40%)`; x.fillRect(0, 0, 160, 2); x.fillRect(0, 126, 160, 2);
  for (let i = 0; i < 4; i++) { x.fillStyle = `hsla(${hue + i * 30},80%,55%,.5)`; x.fillRect(2, 4 + i * 3, 10 - i * 2, 1); x.fillRect(148 + i * 2, 4 + i * 3, 10 - i * 2, 1); }
  P.pxText(x, 'INSERT COIN', 58, 120, `hsl(${hue + 40},80%,60%)`); P.pxText(x, '1 PLAYER', 4, 120, '#6a5a8a');
  return c;
}
function panelCanvas(hue) {
  const c = cv(128, 32), x = c.x;
  x.fillStyle = '#1a1030'; x.fillRect(0, 0, 128, 32);
  for (let i = 0; i < 5; i++) { x.fillStyle = `hsla(${hue + i * 25},90%,55%,.55)`; x.fillRect(0, 4 + i * 5, 34 - i * 4, 2); }
  x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(0, 0, 128, 1);
  return c;
}
function coinDoor(hue) {
  const c = cv(64, 128), e = cv(64, 128), x = c.x, P = SPR();
  x.fillStyle = `hsl(${hue},40%,10%)`; x.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 3; i++) { x.fillStyle = `hsl(${hue + 20 * i},85%,45%)`; x.fillRect(4 + i * 4, 0, 2, 128); x.fillRect(54 - i * 4, 0, 2, 128); }
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(4, 0, 12, 128); x.fillRect(48, 0, 12, 128);
  x.fillStyle = '#05040b'; x.fillRect(18, 14, 28, 34); x.fillStyle = '#231743'; x.fillRect(19, 15, 26, 32);
  x.fillStyle = '#3a2a66'; x.fillRect(19, 15, 26, 1);
  for (const sx of [22, 34]) { x.fillStyle = '#07040e'; x.fillRect(sx, 19, 8, 14); e.x.fillStyle = '#ffb347'; e.x.fillRect(sx + 3, 21, 2, 10); x.fillStyle = '#7a4a08'; x.fillRect(sx + 3, 21, 2, 10); }
  P.pxText(x, '5 KR', 24, 38, '#8d7fc0');
  e.x.fillStyle = '#000'; const em = e.x.getImageData(0, 0, 64, 128); for (let i = 3; i < em.data.length; i += 4) if (!em.data[i]) { em.data[i - 3] = em.data[i - 2] = em.data[i - 1] = 0; em.data[i] = 255; } e.x.putImageData(em, 0, 0);
  x.fillStyle = '#05040b'; x.fillRect(22, 70, 20, 4);
  return { map: tex(c, { clamp: true }), emissive: tex(e, { clamp: true }) };
}

// ---------- animated mini-game screens (64x48) ----------
const SCREENS = [];
function makeScreens() {
  for (let k = 0; k < 5; k++) { const c = cv(64, 48); SCREENS.push({ c, t: tex(c, { clamp: true, nomip: true }), kind: k, seed: k * 17 }); }
}
function drawScreens(t) {
  const P = SPR();
  for (const s of SCREENS) {
    const x = s.c.x, f = Math.floor(t * 10);
    x.fillStyle = '#04060f'; x.fillRect(0, 0, 64, 48);
    if (s.kind === 0) {  // space shooter
      for (let i = 0; i < 24; i++) { const sx = (i * 37) % 64, sy = (i * 13 + f * (1 + i % 3)) % 48; x.fillStyle = i % 4 ? '#556' : '#fff'; x.fillRect(sx, sy, 1, 1); }
      for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const ix = 6 + i * 9 + Math.round(Math.sin(t * 1.5) * 5), iy = 6 + r * 7; x.fillStyle = ['#ff4d7a', '#ffd23f', '#3dff8b'][r]; x.fillRect(ix, iy, 5, 3); x.fillRect(ix + (f & 1), iy + 3, 1, 1); x.fillRect(ix + 4 - (f & 1), iy + 3, 1, 1); }
      const sx = 32 + Math.round(Math.sin(t * 2.3) * 20); x.fillStyle = '#2de2e6'; x.fillRect(sx - 3, 41, 7, 3); x.fillRect(sx, 39, 1, 2);
      x.fillStyle = '#fff'; x.fillRect(sx, 38 - (f * 3) % 30, 1, 3);
    } else if (s.kind === 1) {  // racer
      for (let y = 20; y < 48; y++) { const k = (y - 20) / 28, w = 8 + k * 50, cx = 32 + Math.sin(t * 0.8 + k * 1.5) * 6 * (1 - k); x.fillStyle = ((y + f) >> 2) & 1 ? '#2a8a3a' : '#33a346'; x.fillRect(0, y, 64, 1); x.fillStyle = '#3a3a48'; x.fillRect(cx - w / 2, y, w, 1); if (((y + f * 2) >> 2) & 1) { x.fillStyle = '#eee'; x.fillRect(cx - 1, y, 2, 1); } }
      const g = x.createLinearGradient(0, 0, 0, 20); g.addColorStop(0, '#2a1a6a'); g.addColorStop(1, '#ff7a5a'); x.fillStyle = g; x.fillRect(0, 0, 64, 20);
      x.fillStyle = '#ffd23f'; x.fillRect(26, 12, 12, 8);
      x.fillStyle = '#e33'; x.fillRect(27, 39, 10, 5); x.fillStyle = '#111'; x.fillRect(27, 43, 3, 2); x.fillRect(34, 43, 3, 2);
    } else if (s.kind === 2) {  // blocks
      x.fillStyle = '#16163a'; x.fillRect(18, 0, 28, 48);
      const cols = ['#ff4d5e', '#3fa7ff', '#ffd23f', '#3dff8b', '#c86bff'], r = rng(7);
      for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) if (r() < 0.7) { x.fillStyle = cols[(row + col) % 5]; x.fillRect(18 + col * 4, 44 - row * 4, 3, 3); }
      const by = (f % 40); x.fillStyle = '#c86bff'; for (const [a, b] of [[0, 0], [1, 0], [2, 0], [1, 1]]) x.fillRect(26 + a * 4, by + b * 4, 3, 3);
      P.pxText(x, String(1200 + f * 10 % 9000), 2, 2, '#fff');
    } else if (s.kind === 3) {  // maze
      x.fillStyle = '#1a2ad8'; for (let i = 0; i < 6; i++) { x.fillRect(4, 4 + i * 8, 56, 1); } for (let i = 0; i < 8; i++) x.fillRect(4 + i * 8, 4, 1, 40);
      x.fillStyle = '#ffd8a0'; for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) if ((i + j + Math.floor(f / 8)) % 3) x.fillRect(8 + i * 8, 8 + j * 8, 1, 1);
      const px2 = 8 + ((f >> 1) % 49); x.fillStyle = '#ffe24d'; x.fillRect(px2 - 2, 22, 5, 5); x.fillStyle = '#04060f'; if (f & 2) x.fillRect(px2 + 1, 24, 2, 1);
      x.fillStyle = '#ff5ad0'; x.fillRect(px2 - 14, 22, 5, 5); x.fillRect(px2 - 14, 27, 1, 1); x.fillRect(px2 - 10, 27, 1, 1);
    } else {  // attract mode
      for (let y = 0; y < 48; y++) { x.fillStyle = `hsl(${(y * 6 + f * 8) % 360},80%,${20 + (y % 4 === 0 ? 10 : 0)}%)`; x.fillRect(0, y, 64, 1); }
      if (f % 10 < 6) { P.pxText(x, 'INSERT', 20, 14, '#fff'); P.pxText(x, 'COIN', 24, 24, '#ffd23f'); }
      P.pxText(x, 'HI 99999', 16, 38, '#2de2e6');
    }
    s.t.needsUpdate = true;
  }
}

// ============================================================
//  CABINET BUILDER
// ============================================================
const PROFILE = [[-0.50, 0], [-0.50, 1.95], [0.18, 1.95], [0.22, 1.92], [0.22, 1.70], [0.12, 1.66], [0.26, 1.14], [0.30, 1.12], [0.50, 1.02], [0.50, 0.94], [0.34, 0.88], [0.34, 0.06], [0.36, 0]];
const SCR_TOP = PROFILE[5], SCR_BOT = PROFILE[6];
function quadBetween(a, b, x0, x1, mat) {   // a,b = [z,y]
  const g = new THREE.BufferGeometry();
  const p = new Float32Array([x0, a[1], a[0], x1, a[1], a[0], x0, b[1], b[0], x1, b[1], b[0]]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2));
  g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
}
function makeCabinet(o) {
  const grp = new THREE.Group(), w = o.w || 0.72, hw = w / 2, hue = o.hue || 300;
  const shape = new THREE.Shape(PROFILE.map(([z, y]) => new THREE.Vector2(-z, y)));
  const sg = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  sg.rotateY(Math.PI / 2);
  const side = std({ map: sideArt(hue, o.seed || 1, o.seed || 0), roughness: 0.6 });
  const tmold = std({ color: new THREE.Color().setHSL(hue / 360, 0.9, 0.45), emissive: new THREE.Color().setHSL(hue / 360, 0.9, 0.3), emissiveIntensity: 0.55, roughness: 0.4 });
  for (const sx of [-hw - 0.03, hw]) { const m = new THREE.Mesh(sg, [side, tmold]); m.position.x = sx; m.castShadow = m.receiveShadow = true; grp.add(m); }
  const dark = std({ color: 0x120c1e, roughness: 0.7 }), x0 = -hw, x1 = hw;
  // marquee
  const mc = o.marquee || marqueeCanvas(o.title || 'ARCADE', hue), mt = o.marqueeTex || tex(mc, { clamp: true, nomip: true });
  const marq = std({ map: mt, emissiveMap: mt, emissive: 0xffffff, emissiveIntensity: o.player ? 2.6 : 1.8, roughness: 0.4 });
  const segs = [];
  for (let i = 2; i < PROFILE.length - 1; i++) {
    let mat = dark;
    if (i === 3) mat = marq;
    else if (i === 5) mat = std({ map: tex(bezelCanvas(hue), { clamp: true }), roughness: 0.35 });
    else if (i === 7) mat = std({ map: tex(panelCanvas(hue), { clamp: true }), roughness: 0.5 });
    else if (i === 8) mat = tmold;
    else if (i === 10) { const cd = coinDoor(hue); mat = std({ map: cd.map, emissiveMap: cd.emissive, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.6 }); }
    segs.push(grp.add(quadBetween(PROFILE[i], PROFILE[i + 1], x0, x1, mat)));
  }
  grp.add(quadBetween(PROFILE[1], PROFILE[2], x0, x1, dark));
  grp.add(quadBetween(PROFILE[0], PROFILE[1], x1, x0, dark));
  // screen (slightly recessed into the bezel)
  const [za, ya] = SCR_TOP, [zb, yb] = SCR_BOT, len = Math.hypot(zb - za, yb - ya);
  const n = V3(0, (zb - za) / len, -(yb - ya) / len);   // outward normal (+z,+y)
  const mid = V3(0, (ya + yb) / 2, (za + zb) / 2);
  const sw = w - 0.1, sh = o.player ? 0.62 / 1.45 : len - 0.1;
  const scrMat = o.player ? std({ color: 0x05070d, roughness: 0.75, metalness: 0, emissive: 0x0a1630, emissiveIntensity: 1, envMapIntensity: 0.2 }) : std({ map: o.screen.t, emissiveMap: o.screen.t, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.2 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(o.player ? 0.62 : sw, sh), scrMat);
  scr.position.copy(mid).addScaledVector(n, 0.004);
  scr.lookAt(scr.position.clone().add(n));
  grp.add(scr);
  // control panel hardware
  const pa = PROFILE[7], pb = PROFILE[8], pl = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  const pdir = V3(0, (pb[1] - pa[1]) / pl, (pb[0] - pa[0]) / pl), pn = V3(0, (pb[0] - pa[0]) / pl, -(pb[1] - pa[1]) / pl);
  const pAt = (s, x) => V3(x, pa[1], pa[0]).addScaledVector(pdir, s);
  const buttons = [];
  const BC = [0xff4d5e, 0x3fa7ff, 0xffd23f, 0x3dff8b];
  const bx = o.player ? [-0.03, 0.07, 0.17, 0.27] : [0.0, 0.08, 0.16];
  bx.forEach((x, i) => {
    const col = o.player ? BC[i] : BC[(i + (o.seed || 0)) % 4];
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.022, 12), std({ color: col, roughness: 0.35, emissive: col, emissiveIntensity: 0.25 }));
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.006, 12), std({ color: 0x0a0812, roughness: 0.6 }));
    const p = pAt(pl * 0.5, x * w / 0.72);
    b.position.copy(p).addScaledVector(pn, 0.01); ring.position.copy(p);
    b.quaternion.setFromUnitVectors(V3(0, 1, 0), pn); ring.quaternion.copy(b.quaternion);
    b.castShadow = true; grp.add(b); grp.add(ring);
    buttons.push({ mesh: b, base: b.position.clone(), n: pn.clone() });
  });
  const jx = (o.player ? -0.2 : -0.16) * w / 0.72, jp = pAt(pl * 0.5, jx);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 6), std({ color: 0xb0b0c0, metalness: 0.6, roughness: 0.3 }));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), std({ color: 0xd0202f, roughness: 0.3 }));
  const joy = new THREE.Group(); joy.position.copy(jp); joy.quaternion.setFromUnitVectors(V3(0, 1, 0), pn);
  stick.position.y = 0.045; ball.position.y = 0.095; joy.add(stick); joy.add(ball); stick.castShadow = ball.castShadow = true; grp.add(joy);
  grp.userData = { buttons, joy, scr, n, mid, marq, sh, len };
  return grp;
}

// ============================================================
//  HALL
// ============================================================
const L = {};          // named lights / objects
const SPOTS = { play: [], hang: [], gather: [] };
const OBST = [];
const ANIM = [];       // per-frame callbacks

function buildHall() {
  const s = new THREE.Scene();
  s.fog = new THREE.FogExp2(0x140b26, 0.045);
  s.background = new THREE.Color(0x07040e);
  // ---- floor
  const floor = new THREE.Mesh(planeUV(12, 12.5, 1), std({ map: T.tile.map, normalMap: T.tile.normal, roughness: 0.22, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -3.75); floor.receiveShadow = true; s.add(floor);
  const carpet = new THREE.Mesh(planeUV(10, 11.3, 2), std({ map: T.carpet.map, normalMap: T.carpet.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.003, -3.45); carpet.receiveShadow = true; s.add(carpet);
  // ---- walls: wood wainscot below, brick above, neon strips
  const wall = (w, x, z, ry) => {
    const up = new THREE.Mesh(planeUV(w, 2.6, 2), std({ map: T.brick.map, normalMap: T.brick.normal, roughness: 0.9 }));
    up.position.set(x, 2.3, z); up.rotation.y = ry; up.receiveShadow = true; s.add(up);
    const lo = new THREE.Mesh(planeUV(w, 1.0, 1), std({ map: T.wood.map, normalMap: T.wood.normal, roughness: 0.6 }));
    lo.position.set(x, 0.5, z); lo.rotation.y = ry; lo.receiveShadow = true; s.add(lo);
    const nx = Math.sin(ry) * 0.03, nz = Math.cos(ry) * 0.03;
    const rail = box(w, 0.06, 0.05, std({ color: 0x2a1a14, roughness: 0.5 })); rail.position.set(x + nx, 1.0, z + nz); rail.rotation.y = ry; s.add(rail);
    const n1 = box(w, 0.025, 0.02, glowMat(null, 3.2, 0x2de2e6)); n1.material.transparent = false; n1.position.set(x + nx * 1.8, 1.05, z + nz * 1.8); n1.rotation.y = ry; s.add(n1);
    const n2 = box(w, 0.035, 0.02, glowMat(null, 3.5, 0xff3caa)); n2.material.transparent = false; n2.position.set(x + nx * 1.5, 3.32, z + nz * 1.5); n2.rotation.y = ry; s.add(n2);
    return { n1, n2 };
  };
  const wb = wall(12, 0, -10, 0), wl = wall(12.5, -6, -3.75, Math.PI / 2), wr = wall(12.5, 6, -3.75, -Math.PI / 2); wall(12, 0, 2.5, Math.PI);
  L.neonStrips = [wb, wl, wr];
  // ---- ceiling, beams, fixtures
  const ceil = new THREE.Mesh(planeUV(12, 12.5, 1), std({ map: T.ceil, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 3.6, -3.75); s.add(ceil);
  for (let i = -2; i <= 2; i++) { const b = box(0.25, 0.3, 12.5, std({ color: 0x1a1424, roughness: 0.8 })); b.position.set(i * 2.6, 3.45, -3.75); s.add(b); }
  // hanging neon tubes
  const tube = (x, z, len, col) => {
    const t = box(0.05, 0.05, len, glowMat(null, 4, col)); t.material.transparent = false; t.position.set(x, 3.0, z); s.add(t);
    for (const dz of [-len / 2 + 0.3, len / 2 - 0.3]) { const w2 = box(0.008, 0.45, 0.008, std({ color: 0x333 })); w2.position.set(x, 3.25, z + dz); s.add(w2); }
    return t;
  };
  L.tubeM = tube(-2.6, -4.5, 5, 0xff3caa); L.tubeC = tube(2.6, -4.5, 5, 0x2de2e6);
  // ceiling fan
  {
    const f = new THREE.Group(); f.position.set(-1.2, 3.25, -5.5);
    const rod = box(0.03, 0.35, 0.03, std({ color: 0x2a2a33 })); rod.position.y = 0.17; f.add(rod);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.1, 10), std({ color: 0x3a2a22, roughness: 0.5 })); f.add(hub);
    const blades = new THREE.Group(); for (let i = 0; i < 4; i++) { const bl = box(0.6, 0.012, 0.12, std({ color: 0x4a3426, roughness: 0.6 })); bl.position.x = 0.36; const p = new THREE.Group(); p.rotation.y = i * Math.PI / 2; p.add(bl); blades.add(p); bl.castShadow = true; }
    f.add(blades); s.add(f); ANIM.push((t) => { blades.rotation.y = t * 3.2; });
  }
  // ---- exit door + sign (back wall, left)
  {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), std({ map: T.door, roughness: 0.5, metalness: 0.3 }));
    d.position.set(-4.4, 1.05, -9.97); s.add(d); d.receiveShadow = true;
    const fr = box(1.7, 0.1, 0.08, std({ color: 0x15151c })); fr.position.set(-4.4, 2.15, -9.95); s.add(fr);
    const c = cv(48, 16); c.x.fillStyle = '#0b3a1f'; c.x.fillRect(0, 0, 48, 16); c.x.fillStyle = '#1fbf62'; c.x.fillRect(1, 1, 46, 14); SPR().pxText(c.x, 'UTGÅNG', 12, 6, '#eafff2');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.2), glowMat(tex(c, { clamp: true, nomip: true }), 2.6)); sign.material.transparent = false;
    sign.position.set(-4.4, 2.45, -9.94); s.add(sign);
    L.exit = new THREE.PointLight(0x3dff8b, 1.6, 4, 2); L.exit.position.set(-4.4, 2.3, -9.6); s.add(L.exit);
  }
  // ---- neon signs
  const neonSign = (text, sc, col, glow, x, y, z, ry, heart) => {
    const P = SPR(), w = P.pxW(text, sc) + 8, c = cv(w + (heart ? 12 : 0), 5 * sc + 8);
    P.pxText(c.x, text, 4, 4, col, sc);
    if (heart) { const H = ['01010', '11111', '11111', '01110', '00100']; c.x.fillStyle = glow; for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) if (H[r][q] === '1') c.x.fillRect(w + 1 + q * 2, 4 + r * 2, 2, 2); }
    const t = tex(c, { clamp: true, nomip: true }), m = glowMat(t, 3.2);
    const k = 0.012, mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.w * k * sc / 3, c.h * k * sc / 3), m);
    mesh.position.set(x, y, z); mesh.rotation.y = ry; s.add(mesh);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(c.w * k * sc / 3 + 0.1, c.h * k * sc / 3 + 0.1), std({ color: 0x0a0612, roughness: 0.4 }));
    back.position.set(x - Math.sin(ry) * 0.01, y, z - Math.cos(ry) * 0.01); back.rotation.y = ry; s.add(back);
    return mesh;
  };
  L.signArcade = neonSign('ARCADE', 6, '#ffd0ee', '#ff3caa', 2.6, 2.75, -9.95, 0);
  L.signHi = neonSign('HI-SCORE', 4, '#d6ffff', '#ff6bbf', -5.95, 2.6, -6.4, Math.PI / 2, true);
  L.signPrize = neonSign('PRISER', 4, '#fff3b0', '#ffb347', -5.95, 2.55, -3.1, Math.PI / 2);
  L.signOpen = neonSign('ÖPPET 24H', 3, '#c6ffdd', '#3dff8b', 5.95, 2.6, -2.2, -Math.PI / 2);
  // ---- posters
  const poster = (title, sub, hue, x, y, z, ry) => {
    const P = SPR(), c = cv(48, 68), xx = c.x;
    const g = xx.createLinearGradient(0, 0, 0, 68); g.addColorStop(0, `hsl(${hue},70%,30%)`); g.addColorStop(1, `hsl(${hue + 50},70%,10%)`); xx.fillStyle = g; xx.fillRect(0, 0, 48, 68);
    for (let i = 0; i < 12; i++) { xx.fillStyle = `hsla(${hue + 180},90%,60%,.5)`; xx.fillRect((i * 13) % 44 + 2, 20 + (i * 7) % 30, 2, 2); }
    xx.fillStyle = `hsl(${hue + 180},90%,60%)`; xx.beginPath(); xx.arc(24, 38, 11, 0, 7); xx.fill(); xx.fillStyle = `hsl(${hue},70%,15%)`; xx.fillRect(14, 40, 20, 9);
    title.split(' ').forEach((wd, i) => P.pxText(xx, wd, (48 - P.pxW(wd)) >> 1, 4 + i * 7, '#fff8e0'));
    P.pxText(xx, sub, (48 - P.pxW(sub)) >> 1, 58, `hsl(${hue + 180},90%,70%)`);
    xx.strokeStyle = '#0a0612'; xx.strokeRect(0.5, 0.5, 47, 67);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.88), std({ map: tex(c, { clamp: true }), roughness: 0.55 }));
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; s.add(m);
  };
  poster('PAKET STORM', 'NU!', 280, -5.97, 1.75, -8.3, Math.PI / 2);
  poster('ZERO TRUST', 'ARENA', 190, -5.97, 1.75, -0.9, Math.PI / 2);
  poster('SYN FLOOD', '2 SPELARE', 20, 5.97, 1.7, -0.6, -Math.PI / 2);
  poster('ROOT QUEST', 'NYHET', 120, -1.6, 1.8, -9.97, 0);
  // ---- background cabinets
  const titles = ['PAKET STORM', 'FIREWALL II', 'BIT RACER', 'ZERO TRUST', 'PHISH TANK', 'ROOT QUEST', 'SYN FLOOD', 'PORT RUSH', 'LAN PARTY', 'STACK BLOX', 'DMZ RUN', 'PING PONG'];
  let k = 0;
  const cab = (x, z, ry, view) => {
    const c = makeCabinet({ title: titles[k % titles.length], hue: (k * 47 + 200) % 360, seed: k + 2, screen: SCREENS[k % SCREENS.length], w: 0.7 });
    c.position.set(x, 0, z); c.rotation.y = ry; c.scale.setScalar(0.98); s.add(c);
    const fwd = V3(Math.sin(ry), 0, Math.cos(ry));
    SPOTS.play.push({ x: x + fwd.x * 0.85, z: z + fwd.z * 0.85, view, flip: false, cab: c, busy: null });
    const h = 0.45, hx = Math.abs(fwd.x) > 0.5 ? 0.55 : 0.4, hz = Math.abs(fwd.x) > 0.5 ? 0.4 : 0.55;
    OBST.push([x - hx, z - hz, x + hx, z + hz]);
    k++; return c;
  };
  for (const x of [-2.7, -1.8, -0.9, 0.3, 1.2, 3.6, 4.5]) cab(x, -9.45, 0, 'back');
  for (const z of [-8.0, -7.1, -5.0, -4.1]) cab(5.45, z, -Math.PI / 2, 'side');
  // ---- pinball island
  const pinball = (x, z, hue) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); s.add(g);
    const legM = std({ color: 0x9a9aa8, metalness: 0.7, roughness: 0.3 });
    for (const [lx, lz] of [[-0.28, -0.55], [0.28, -0.55], [-0.28, 0.55], [0.28, 0.55]]) { const l = box(0.05, lz < 0 ? 0.95 : 0.8, 0.05, legM); l.position.set(lx, (lz < 0 ? 0.95 : 0.8) / 2, lz); g.add(l); l.castShadow = true; }
    const pf = cv(32, 64), x2 = pf.x; x2.fillStyle = `hsl(${hue},60%,18%)`; x2.fillRect(0, 0, 32, 64);
    for (let i = 0; i < 6; i++) { x2.fillStyle = `hsl(${hue + i * 50},90%,60%)`; x2.beginPath(); x2.arc(6 + (i * 11) % 22, 10 + i * 8, 2.5, 0, 7); x2.fill(); }
    x2.fillStyle = '#fff'; x2.fillRect(8, 56, 7, 2); x2.fillRect(18, 56, 7, 2);
    const pt = tex(pf, { clamp: true, nomip: true });
    const table = box(0.66, 0.16, 1.25, [std({ color: `hsl(${hue},50%,25%)` }), std({ color: `hsl(${hue},50%,25%)` }), std({ map: pt, emissiveMap: pt, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.15 }), std({ color: 0x111 }), std({ color: `hsl(${hue},50%,25%)` }), std({ color: `hsl(${hue},50%,25%)` })]);
    table.position.set(0, 0.95, 0); table.rotation.x = 0.1; g.add(table); table.castShadow = table.receiveShadow = true;
    const bb = box(0.66, 0.6, 0.15, std({ color: `hsl(${hue},50%,20%)` })); bb.position.set(0, 1.45, -0.62); g.add(bb); bb.castShadow = true;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.48), std({ map: SCREENS[4].t, emissiveMap: SCREENS[(hue >> 4) % 4].t, emissive: 0xffffff, emissiveIntensity: 1.4 }));
    art.position.set(0, 1.47, -0.54); g.add(art);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), std({ color: 0xffffff, metalness: 1, roughness: 0.1, emissive: 0x666666 }));
    g.add(ball); ANIM.push(t => { const u = t * 0.9 + hue; ball.position.set(Math.sin(u * 2.1) * 0.22, 1.05 + Math.cos(u * 1.3) * 0.04, Math.cos(u * 1.3) * 0.45); });
    SPOTS.play.push({ x, z: z + 0.95, view: 'back', flip: false, busy: null });
    OBST.push([x - 0.4, z - 0.75, x + 0.4, z + 0.7]);
  };
  pinball(0.9, -5.6, 280); pinball(2.0, -5.6, 30); pinball(-2.9, -5.6, 160);
  // ---- prize counter (left wall)
  {
    const g = new THREE.Group(); g.position.set(-5.35, 0, -3.1); s.add(g);
    const ctr = box(0.8, 1.0, 2.8, std({ color: 0x2a1530, roughness: 0.5 })); ctr.position.y = 0.5; g.add(ctr); ctr.castShadow = ctr.receiveShadow = true;
    const top = box(0.85, 0.04, 2.85, std({ color: 0x5a3a22, roughness: 0.35 })); top.position.y = 1.02; g.add(top);
    const glass = box(0.6, 0.45, 2.6, new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.15, roughness: 0.05, metalness: 0.2 })); glass.position.set(0.05, 1.26, 0); g.add(glass);
    const shelf = box(0.3, 1.6, 2.8, std({ color: 0x1c1024 })); shelf.position.set(-0.5, 1.6, 0); g.add(shelf);
    const r = rng(12), cols = [0xff6bbf, 0x2de2e6, 0xffd23f, 0x3dff8b, 0xc86bff, 0xff8a52];
    for (let i = 0; i < 26; i++) {
      const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + r() * 0.05, 0), std({ color: cols[i % 6], roughness: 0.9, flatShading: true }));
      const row = i % 3; pl.position.set(-0.42 + r() * 0.08, 1.05 + row * 0.5 + 0.08, -1.25 + (i / 26) * 2.5); g.add(pl); pl.castShadow = true;
      ANIM.push(t => { pl.rotation.y = Math.sin(t * 0.5 + i) * 0.3; });
    }
    for (let i = 0; i < 3; i++) { const sb = box(0.32, 0.03, 2.8, std({ color: 0x3a2a22 })); sb.position.set(-0.42, 1.05 + i * 0.5, 0); g.add(sb); }
    L.prize = new THREE.PointLight(0xffb060, 5, 5, 2); L.prize.position.set(-4.9, 2.1, -3.1); s.add(L.prize);
    OBST.push([-6, -4.6, -4.8, -1.6]);
  }
  // ---- jukebox
  {
    const g = new THREE.Group(); g.position.set(-5.55, 0, -7.6); g.rotation.y = Math.PI / 2; s.add(g);
    const body = box(0.9, 1.25, 0.6, std({ color: 0x5a2a1a, roughness: 0.4 })); body.position.y = 0.62; g.add(body); body.castShadow = true;
    const archC = cv(32, 32), a = archC.x;
    const archT = tex(archC, { clamp: true, nomip: true });
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 16, 1, false, -Math.PI / 2, Math.PI), std({ map: archT, emissiveMap: archT, emissive: 0xffffff, emissiveIntensity: 2.2 }));
    arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; arch.position.y = 1.25; g.add(arch);
    const grill = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), std({ map: T.grill })); grill.position.set(0, 0.45, 0.31); g.add(grill);
    L.juke = new THREE.PointLight(0xff8a52, 3, 4, 2); L.juke.position.set(-5.0, 1.4, -7.6); s.add(L.juke);
    ANIM.push(t => {
      for (let y = 0; y < 32; y++) { a.fillStyle = `hsl(${(y * 12 + t * 120) % 360},90%,${55 + (y % 3) * 6}%)`; a.fillRect(0, y, 32, 1); }
      a.fillStyle = 'rgba(0,0,0,.5)'; for (let x = 3; x < 32; x += 6) a.fillRect(x, 0, 2, 32);
      archT.needsUpdate = true; L.juke.color.setHSL((t * 0.33) % 1, 0.8, 0.6);
    });
    OBST.push([-6, -8.2, -5, -7.0]);
  }
  // ---- speakers (pulse with the music)
  L.speakers = [];
  const speaker = (x, y, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; s.add(g);
    const b = box(0.42, 0.62, 0.32, std({ color: 0x141218, roughness: 0.6 })); g.add(b); b.castShadow = true;
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), std({ map: T.cone, roughness: 0.8 })); cone.position.set(0, -0.08, 0.162); g.add(cone);
    const tw = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), std({ map: T.cone, roughness: 0.5 })); tw.position.set(0, 0.18, 0.162); g.add(tw);
    const led = box(0.02, 0.02, 0.01, glowMat(null, 3, 0x3dff8b)); led.material.transparent = false; led.position.set(0.15, 0.26, 0.165); g.add(led);
    g.rotation.x = 0.15; L.speakers.push({ cone, tw });
  };
  speaker(-3.2, 2.9, -9.8, 0); speaker(5.15, 2.9, -9.8, 0); speaker(-5.8, 2.9, -1.0, Math.PI / 2); speaker(5.8, 2.9, -6.0, -Math.PI / 2);
  // ---- plants + trash bin (foreground and corners)
  const plant = (x, z, sc) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(sc); s.add(g);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 10), std({ color: 0x8a4a2a, roughness: 0.7 })); pot.position.y = 0.2; g.add(pot); pot.castShadow = true;
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.1), std({ map: T.leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }));
      l.position.y = 0.4 + 0.55; l.rotation.y = i * Math.PI / 4; l.castShadow = true;
      l.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.leaf, alphaTest: 0.5 });
      g.add(l); ANIM.push(t => { l.rotation.z = Math.sin(t * 0.9 + i + x) * 0.03; });
    }
  };
  plant(1.75, 0.55, 1.05); plant(-5.4, -9.3, 1.1); plant(5.4, -9.3, 1.0); plant(-5.4, 0.9, 1.0);
  {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 12, 1, true), std({ map: T.metal, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
    bin.position.set(-1.3, 0.31, 0.75); s.add(bin); bin.castShadow = true;
    OBST.push([-1.6, 0.45, -1.0, 1.05]);
  }
  // ---- the player's cabinet
  {
    const mc = cv(256, 58); L.marqC = mc; L.marqT = tex(mc, { clamp: true, nomip: true });
    const c = makeCabinet({ player: true, title: 'NÄTVERKSSÄKERHET', hue: 320, seed: 7, marquee: mc, marqueeTex: L.marqT, w: 0.78 });
    s.add(c); L.cab = c;
    L.scrLight = new THREE.PointLight(0x6fa8ff, 1.4, 3.5, 2);
    L.scrLight.position.copy(c.userData.mid).addScaledVector(c.userData.n, 0.55).add(V3(0, -0.25, 0)); s.add(L.scrLight);
    OBST.push([-0.55, -0.7, 0.6, 1.2]);
    const nb = makeCabinet({ title: 'ROOT QUEST', hue: 150, seed: 31, screen: SCREENS[2], w: 0.7 });
    nb.position.set(1.3, 0, -2.45); nb.rotation.y = -0.28; s.add(nb);
    OBST.push([0.85, -3.1, 2.5, -1.7]);
  }
  // ---- lights
  s.add(new THREE.HemisphereLight(0x5a4a9a, 0x140a1e, 0.55));
  s.add(new THREE.AmbientLight(0x2a1e48, 0.35));
  const pl = (col, i, x, y, z, d) => { const l = new THREE.PointLight(col, i, d || 9, 2); l.position.set(x, y, z); s.add(l); return l; };
  L.neonL = pl(0xff3caa, 9, -2.6, 2.8, -4.5); L.neonR = pl(0x2de2e6, 9, 2.6, 2.8, -4.5);
  L.back1 = pl(0x7a6aff, 3.5, -1.2, 1.5, -8.6, 4); L.back2 = pl(0xff6b9a, 3, 4.0, 1.5, -8.6, 4);
  L.right1 = pl(0x4ad8ff, 3, 4.8, 1.5, -6.0, 4); L.pin = pl(0xffb060, 2.5, 1.4, 1.8, -4.9, 4);
  L.arcSign = pl(0xff3caa, 3, 2.6, 2.5, -9.4, 5); L.hiSign = pl(0x2de2e6, 2, -5.4, 2.5, -6.4, 4);
  const spot = (col, i, x, y, z, tx, ty, tz, ang, shadow) => {
    const l = new THREE.SpotLight(col, i, 9, ang, 0.55, 2); l.position.set(x, y, z); l.target.position.set(tx, ty, tz); s.add(l); s.add(l.target);
    if (shadow) { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.camera.near = 0.5; l.shadow.camera.far = 8; }
    // visible light shaft
    const h = y - 0.0, r = Math.tan(ang) * h * 0.85;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 24, 1, true), shaftMat(col));
    cone.position.set(x, y - h / 2, z); const dir = V3(tx - x, ty - y, tz - z).normalize(); cone.quaternion.setFromUnitVectors(V3(0, -1, 0), dir);
    cone.position.copy(V3(x, y, z).addScaledVector(dir, h / 2)); s.add(cone);
    const fx = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.16, 10), std({ color: 0x1a1a22, metalness: 0.5, roughness: 0.4 })); fx.position.set(x, y + 0.05, z); s.add(fx);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), glowMat(null, 4, col)); lens.material.transparent = false; lens.rotation.x = Math.PI / 2; lens.position.set(x, y - 0.035, z); s.add(lens);
    return l;
  };
  L.spotPlayer = spot(0xffd9a8, 22, 0.75, 3.5, 0.6, 0.45, 0.6, -0.2, 0.5, true);
  L.spotDoor = spot(0xa8c8ff, 18, -1.9, 3.5, -2.8, -1.9, 0, -3.5, 0.42, true);
  L.spotMid = spot(0xffb8e8, 14, 1.4, 3.5, -5.0, 1.4, 0, -5.4, 0.45, true);
  // ---- hang-out and gather spots for the crowd
  SPOTS.hang.push({ x: -3.6, z: -7.0 }, { x: -1.0, z: -7.4 }, { x: 3.2, z: -6.6 }, { x: -3.8, z: -3.4 }, { x: 3.4, z: -2.6 }, { x: -0.4, z: -3.6 }, { x: 2.6, z: -3.9 }, { x: -2.6, z: -6.2 }, { x: 0.2, z: -6.9 }, { x: 4.2, z: -5.0 }, { x: -4.3, z: -5.3 });
  SPOTS.gather.push({ x: -1.55, z: -1.75 }, { x: 2.75, z: -2.6 }, { x: -2.05, z: -2.5 }, { x: 2.55, z: -1.55 }, { x: -1.7, z: -3.2 }, { x: 3.2, z: -3.4 }, { x: -2.6, z: -1.7 }, { x: -2.95, z: -2.8 },
    { x: 3.55, z: -2.0 }, { x: 2.2, z: -3.6 }, { x: -3.5, z: -2.15 }, { x: -2.4, z: -3.75 }, { x: 3.9, z: -3.1 }, { x: -3.6, z: -3.4 });
  OBST.push([-2.75, -4.1, -1.95, -3.3]);   // doorman's spot
  return s;
}
function shaftMat(col) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(col) }, uI: { value: 0.16 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float e=abs(dot(vN,vV)); float a=pow(e,2.0)*pow(vUv.y,1.4)*uI; gl_FragColor=vec4(uCol*a,1.); }`
  });
}

// ============================================================
//  CHARACTERS IN THE WORLD
// ============================================================
function spriteMesh(canvasObj, wM, hM, footPad) {
  const t = tex(canvasObj, { clamp: true });
  t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  const mat = std({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.14 });
  const g = new THREE.PlaneGeometry(wM, hM); g.translate(0, hM / 2 - (footPad || 0), 0);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = false;
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: 0.5 });
  m.userData.tex = t; m.userData.sc = canvasObj; return m;
}
const C = { npcs: [], labels: [] };
const live = () => C.npcs.filter(n => !n.custom || n.active);
W.setCameos = (o) => {
  for (const n of C.npcs) if (n.custom) {
    const on = !!o[n.custom];
    if (on && !n.active) { const h = SPOTS.hang[(n.id * 3) % SPOTS.hang.length]; n.x = h.x + 0.3; n.z = h.z + 0.2; n.state = 'idle'; n.timer = 0.5; }
    if (!on) release(n);
    n.active = on; n.m.visible = on;
  }
};
function buildCharacters(s) {
  const P = SPR();
  // doorman
  C.dmS = P.mk(84, 160); C.dm = spriteMesh(C.dmS, 84 * 0.0142, 160 * 0.0142, 5 * 0.0142);
  C.dmBase = V3(-2.35, 0, -3.7); C.dm.position.copy(C.dmBase); s.add(C.dm);
  // Rickard (leans against the cabinet: the billboard pivots at his feet)
  C.rkS = P.mk(136, 252); C.rk = spriteMesh(C.rkS, 136 * 0.0074, 252 * 0.0074, 4 * 0.0074);
  C.rkPivot = new THREE.Group(); C.rkPivot.position.set(1.98, 0, -2.15); C.rkPivot.add(C.rk); C.rk.rotation.z = 0.1; s.add(C.rkPivot);
  // crowd
  const n = 11;
  for (let i = 0; i < n; i++) {
    const P0 = P.person(i * 7 + 3), cs = P.mk(48, 100), m = spriteMesh(cs, 48 * 0.0185 * P0.height, 100 * 0.0185 * P0.height, 3 * 0.0185 * P0.height);
    s.add(m);
    const npc = { id: i, P: P0, s: cs, m, x: 0, z: 0, path: [], state: 'idle', timer: 0, view: 'front', act: 'idle', flip: false, emote: null, emoteT: 0, spot: null, gathered: false, walkPh: 0, lastDraw: -1, speed: 0.9 + (i % 3) * 0.15, interest: 0, mood: 0 };
    const h = SPOTS.hang[i % SPOTS.hang.length]; npc.x = h.x + (i % 2) * 0.4; npc.z = h.z; m.position.set(npc.x, 0, npc.z);
    C.npcs.push(npc); routine(npc, true);
  }
  // rare cameos: hidden unless the round rolled them
  const cam = (kind, w, h, mpp, i) => {
    const cs = P.mk(w, h), m = spriteMesh(cs, w * mpp, h * mpp, (kind === 'volt' ? 1 : 4) * mpp); m.visible = false; s.add(m);
    const npc = { id: i, P: { height: kind === 'volt' ? 0.42 : 0.82 }, custom: kind, active: false, s: cs, m, x: 0, z: 0, path: [], state: 'idle', timer: 0, view: 'front', act: 'idle', flip: false, emote: null, emoteT: 0, spot: null, gathered: false, walkPh: 0, lastDraw: -1, speed: kind === 'volt' ? 1.25 : 0.95, jumpT: 6 + Math.random() * 8 };
    C.npcs.push(npc); return npc;
  };
  cam('volt', 40, 44, 0.0175, 7); cam('pelle', 48, 84, 0.0178, 8);
  // floating labels ("HAHA", "WOO!")
  for (let i = 0; i < 6; i++) { const ls = P.mk(64, 16), t = tex(ls, { clamp: true, nomip: true }), m = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.16), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, alphaTest: 0.1 })); m.visible = false; s.add(m); C.labels.push({ s: ls, t, m, t0: -9, npc: null }); }
}
function popLabel(npc, text, col) {
  const L0 = C.labels.reduce((a, b) => (a.t0 < b.t0 ? a : b));
  SPR().label(L0.s, text, col); L0.t.needsUpdate = true; L0.t0 = clock.t; L0.npc = npc; L0.m.visible = true;
}

// ---------- crowd navigation ----------
function segBlocked(ax, az, bx, bz, skip) {
  for (const o of OBST) {
    if (o === skip) continue;
    const [x0, z0, x1, z1] = o;
    if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) continue;
    for (let k = 0; k <= 20; k++) { const u = k / 20, x = ax + (bx - ax) * u, z = az + (bz - az) * u; if (x > x0 && x < x1 && z > z0 && z < z1) return o; }
  }
  return null;
}
function planPath(npc, tx, tz) {
  const b = segBlocked(npc.x, npc.z, tx, tz);
  if (!b) return [[tx, tz]];
  const e = 0.35, corners = [[b[0] - e, b[1] - e], [b[2] + e, b[1] - e], [b[0] - e, b[3] + e], [b[2] + e, b[3] + e]];
  let best = null, bd = 1e9;
  for (const c of corners) {
    if (segBlocked(npc.x, npc.z, c[0], c[1]) || segBlocked(c[0], c[1], tx, tz)) continue;
    const d = Math.hypot(c[0] - npc.x, c[1] - npc.z) + Math.hypot(tx - c[0], tz - c[1]);
    if (d < bd) { bd = d; best = c; }
  }
  if (best) return [best, [tx, tz]];
  // two-corner fallback
  for (const c1 of corners) for (const c2 of corners) { if (c1 === c2) continue; if (!segBlocked(npc.x, npc.z, c1[0], c1[1]) && !segBlocked(c1[0], c1[1], c2[0], c2[1]) && !segBlocked(c2[0], c2[1], tx, tz)) return [c1, c2, [tx, tz]]; }
  return [[tx, tz]];
}
function freeSpot(list, npc) { const f = list.filter(p => !p.busy || p.busy === npc); return f.length ? f[Math.random() * f.length | 0] : null; }
function release(npc) { if (npc.spot && npc.spot.busy === npc) npc.spot.busy = null; npc.spot = null; }
function goTo(npc, spot, then) {
  release(npc); npc.spot = spot; if (spot) spot.busy = npc;
  npc.path = planPath(npc, spot.x, spot.z); npc.state = 'walk'; npc.then = then;
}
function routine(npc, first) {
  npc.gathered = false; npc.reaction = null;
  const r = Math.random();
  const sp = r < 0.62 ? freeSpot(SPOTS.play, npc) : freeSpot(SPOTS.hang, npc);
  if (!sp) { npc.state = 'idle'; npc.timer = 2 + Math.random() * 3; return; }
  if (first) { npc.x = sp.x + (Math.random() - 0.5) * 0.2; npc.z = sp.z; npc.spot = sp; sp.busy = npc; arrive(npc, sp.view ? 'play' : 'hang'); return; }
  goTo(npc, sp, sp.view ? 'play' : 'hang');
}
function arrive(npc, what) {
  npc.path = [];
  if (what === 'play') { npc.state = 'play'; npc.timer = 9 + Math.random() * 18; }
  else if (what === 'hang') { npc.state = 'hang'; npc.timer = 4 + Math.random() * 7; }
  else if (what === 'gather') { npc.state = 'watchP'; npc.timer = 1e9; npc.gathered = true; npc.react = { act: 'clap', until: clock.t + 1.6 }; if (Math.random() < 0.6) popLabel(npc, ['WOW!', 'KOLLA!', 'SNYGGT!'][npc.id % 3], '#ffd23f'); }
}
function emote(npc, e, dur) { npc.emote = e; npc.emoteT = clock.t + (dur || 2); }

// ---------- crowd reactions to how the player is doing ----------
let crowdMood = { lastLaugh: -9, lastCheer: -9 };
W.crowdEvent = (kind, info) => {
  const t = clock.t, npcs = live(), sfx = window.SFX;
  if (kind === 'reset') { for (const n of npcs) { if (n.gathered || n.state === 'look' || n.state === 'laugh') routine(n); n.react = null; } return; }
  if (kind === 'right') {
    const st = info.streak;
    // people who were laughing lose interest
    for (const n of npcs) if (n.state === 'look' || n.state === 'laugh') { n.state = 'idle'; n.timer = 0.6 + Math.random(); emote(n, 'dots', 1.5); }
    if (st >= 3) {
      const want = Math.min(npcs.length, st === 3 ? 2 : st === 4 ? 3 : st < 7 ? 4 + (st - 5) : npcs.length);
      let have = npcs.filter(n => n.gathered).length;
      const cand = npcs.filter(n => !n.gathered).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      for (const n of cand) {
        if (have >= want) break;
        const sp = freeSpot(SPOTS.gather, n); if (!sp) break;
        n.gathered = true; have++; emote(n, '!', 1.6); n.state = 'notice'; n.timer = 0.4 + Math.random() * 0.6; n.pending = sp;
      }
      for (const n of npcs) if (n.gathered && n.state === 'watchP') { n.react = { act: 'cheer', until: t + 1.4 }; emote(n, st >= 5 ? 'star' : 'heart', 1.6); }
      if (st >= 5 && st % 5 === 0) { const g = npcs.filter(n => n.state === 'watchP'); if (g.length) popLabel(g[Math.random() * g.length | 0], st >= 10 ? 'LEGEND!' : 'WOOO!', '#3dff8b'); }
      if (have && t - crowdMood.lastCheer > 1) { crowdMood.lastCheer = t; sfx && sfx.cheer && sfx.cheer(Math.min(1, have / 5)); }
    } else {
      for (const n of npcs) if (n.gathered && n.state === 'watchP') n.react = { act: 'clap', until: t + 1.2 };
    }
    return;
  }
  if (kind === 'wrong') {
    const run = info.wrongRun, broke = info.prevStreak >= 3, anger = info.lvl;
    const gathered = npcs.filter(n => n.gathered);
    for (const n of gathered) {
      if (n.state !== 'watchP' && n.state !== 'walk' && n.state !== 'notice') continue;
      const leave = run >= 2 || Math.random() < (broke ? 0.45 : 0.6);
      n.react = { act: 'sad', until: t + 1.3 }; emote(n, run >= 2 ? 'dots' : '?', 1.6);
      if (leave) { n.leaveAt = t + 1.2 + Math.random() * 1.2; }
    }
    // bystanders start to notice when it goes badly, then point and laugh
    const bad = run >= 2 || info.recentWrong >= 3 || anger >= 3;
    if (!bad) return;
    let laughers = 0;
    for (const n of npcs) {
      if (n.gathered && !n.leaveAt) continue;
      if (n.state === 'walk' && Math.random() < 0.5) continue;
      const p = 0.35 + 0.15 * run + 0.08 * anger;
      if (Math.random() > p) continue;
      if (run >= 3 || anger >= 4 || (n.state === 'look' && run >= 2)) {
        n.state = 'laugh'; n.timer = 2.6 + Math.random() * 1.6; laughers++;
        if (Math.random() < 0.7) popLabel(n, ['HAHA!', 'HAHAHA', 'LOL', 'AJAJ!', 'FEL!'][(n.id + run) % 5], '#ff9aa2');
      } else if (n.state !== 'laugh') { n.prev = n.state; n.state = 'look'; n.timer = 2.2 + Math.random() * 1.5; emote(n, '!', 1.2); }
    }
    if (laughers && t - crowdMood.lastLaugh > 1.2) { crowdMood.lastLaugh = t; sfx && sfx.laugh && sfx.laugh(Math.min(1, laughers / 3)); }
    return;
  }
  if (kind === 'out') {
    for (const n of npcs) { n.gathered = false; n.state = 'laugh'; n.timer = 30; release(n); }
    sfx && sfx.laugh && sfx.laugh(1);
  }
};

function updateNPC(n, t, dt, camPos) {
  // timed reactions
  if (n.leaveAt && t > n.leaveAt) { n.leaveAt = 0; n.gathered = false; n.react = null; routine(n); }
  switch (n.state) {
    case 'walk': {
      const p = n.path[0];
      if (!p) { arrive(n, n.then); break; }
      const dx = p[0] - n.x, dz = p[1] - n.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { n.path.shift(); if (!n.path.length) arrive(n, n.then); break; }
      const sp = n.speed * (n.then === 'gather' ? 1.5 : 1);
      n.x += dx / d * Math.min(d, sp * dt); n.z += dz / d * Math.min(d, sp * dt); n.walkPh += dt * sp * 2.6;
      n.view = Math.abs(dx) > Math.abs(dz) * 0.7 ? 'side' : dz > 0 ? 'front' : 'back'; n.flip = dx < 0; n.act = 'walk';
      break;
    }
    case 'play': n.view = n.spot && n.spot.view === 'side' ? 'side' : 'back'; n.flip = false; n.act = n.view === 'side' ? 'idle' : 'play';
      if (n.view === 'side') n.act = 'idle';
      if ((n.timer -= dt) < 0) routine(n); break;
    case 'hang': n.view = 'front'; n.act = (n.id & 1) ? 'hips' : 'idle'; if (Math.random() < dt * 0.2) emote(n, 'note', 1.5); if ((n.timer -= dt) < 0) routine(n); break;
    case 'idle': n.view = 'front'; n.act = 'idle'; if ((n.timer -= dt) < 0) routine(n); break;
    case 'notice': n.view = 'front'; n.act = 'look'; if ((n.timer -= dt) < 0 && n.pending) { const sp = n.pending; n.pending = null; goTo(n, sp, 'gather'); } break;
    case 'look': n.view = 'front'; n.act = 'look'; if ((n.timer -= dt) < 0) { n.state = 'idle'; n.timer = 0.4; } break;
    case 'laugh': n.view = 'front'; n.act = (Math.floor(t * 0.8 + n.id) & 1) ? 'laugh' : 'point'; n.flip = n.x > 0; if ((n.timer -= dt) < 0) { emote(n, 'dots', 1); routine(n); } break;
    case 'watchP': n.view = 'front'; n.act = n.react && t < n.react.until ? n.react.act : (Math.sin(t * 0.7 + n.id) > 0.3 ? 'hips' : 'idle'); break;
  }
  if (n.custom === 'pelle' && (n.state === 'hang' || n.state === 'idle' || n.state === 'watchP') && (n.jumpT -= dt) < 0) { n.jumpT = 9 + Math.random() * 9; n.jumpAt = t; n.bumped = false; }
  if (n.custom === 'pelle' && n.react && n.react.act === 'cheer' && t < n.react.until && !(t - (n.jumpAt || -9) < 0.8)) { n.jumpAt = t; }
  // gentle separation so nobody stands inside anybody else
  for (const o of C.npcs) { if (o === n || (o.custom && !o.active)) continue; const dx = n.x - o.x, dz = n.z - o.z, d = Math.hypot(dx, dz); if (d < 0.38 && d > 1e-4) { const k = (0.38 - d) * 0.5; n.x += dx / d * k * dt * 4; n.z += dz / d * k * dt * 4; } }
  n.m.position.set(n.x, 0, n.z);
  n.m.rotation.y = Math.atan2(camPos.x - n.x, camPos.z - n.z);
  n.m.scale.x = (n.view === 'side' && n.flip) ? -1 : 1;
  const f = Math.floor(t * 12);
  if (f !== n.lastDraw) {
    n.lastDraw = f;
    const pose = { view: n.view, act: n.act, t: t + n.id * 0.37, frame: Math.floor(n.walkPh * 2), flip: n.flip, emote: t < n.emoteT ? n.emote : null };
    if (n.custom === 'pelle') {
      const j = t - (n.jumpAt || -9); pose.jump = j >= 0 && j < 0.6 ? Math.sin(j / 0.6 * Math.PI) : 0; pose.coin = j > 0.25 && j < 1.0 ? (j - 0.25) / 0.75 : 0;
      if (pose.coin > 0 && j < 0.35 && !n.bumped) { n.bumped = true; }
      SPR().pelle(n.s, pose);
    } else if (n.custom === 'volt') SPR().volt(n.s, pose);
    else SPR().drawPerson(n.s, n.P, pose);
    n.m.userData.tex.needsUpdate = true;
  }
}

// ---------- the rare visitor ----------
const VIS = { on: false };
function buildVisitor(s) {
  const h = SPR().VISITOR.height;
  VIS.s = SPR().mk(48, 100); VIS.m = spriteMesh(VIS.s, 48 * 0.0185 * h, 100 * 0.0185 * h, 3 * 0.0185 * h); VIS.m.visible = false; s.add(VIS.m);
}
W.startVisitor = () => {
  if (VIS.on || cur !== hall) return false;
  Object.assign(VIS, { on: true, x: -4.4, z: -9.35, phase: 'in', say: null, walkPh: 0, view: 'front', act: 'walk', flip: false, t0: clock.t, last: -1 });
  VIS.path = planPath(VIS, -1.85, -2.35); VIS.m.visible = true; return true;
};
W.visPhase = () => VIS.on ? VIS.phase : null;
W.visitorSay = () => VIS.on && VIS.say ? { text: VIS.say, pos: W.project(VIS.m.localToWorld(V3(0, 1.84, 0))) } : null;   // top of his hair
function updateVisitor(t, dt) {
  if (!VIS.on) return;
  const walk = () => {
    const p = VIS.path[0]; if (!p) return true;
    const dx = p[0] - VIS.x, dz = p[1] - VIS.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { VIS.path.shift(); return !VIS.path.length; }
    const sp = 1.05; VIS.x += dx / d * Math.min(d, sp * dt); VIS.z += dz / d * Math.min(d, sp * dt); VIS.walkPh += dt * sp * 2.6;
    VIS.view = Math.abs(dx) > Math.abs(dz) * 0.7 ? 'side' : dz > 0 ? 'front' : 'back'; VIS.flip = dx < 0; VIS.act = 'walk';
    return false;
  };
  const ph = t - VIS.t0;
  if (VIS.phase === 'in') { if (walk()) { VIS.phase = 'ask'; VIS.t0 = t; } }
  else if (VIS.phase === 'ask') { VIS.view = 'front'; VIS.act = 'idle'; VIS.say = 'Du använder väl Opensuse?'; if (ph > 3.6) { VIS.phase = 'look'; VIS.t0 = t; VIS.say = null; } }
  else if (VIS.phase === 'look') {
    const k = Math.floor(ph / 0.6) % 4; VIS.act = 'look';
    VIS.view = ['side', 'back', 'side', 'front'][k]; VIS.flip = k === 0;
    if (ph > 2.4) { VIS.phase = 'bankee'; VIS.t0 = t; }
  }
  else if (VIS.phase === 'bankee') { VIS.view = 'front'; VIS.act = 'cheer'; VIS.say = 'BANKEE-DEE'; if (ph > 2.3) { VIS.phase = 'out'; VIS.say = null; VIS.path = planPath(VIS, -4.4, -9.35); } }
  else if (VIS.phase === 'out') { if (walk()) { VIS.on = false; VIS.m.visible = false; return; } }
  VIS.m.position.set(VIS.x, 0, VIS.z);
  VIS.m.rotation.y = Math.atan2(camera.position.x - VIS.x, camera.position.z - VIS.z);
  VIS.m.scale.x = VIS.view === 'side' && VIS.flip ? -1 : 1;
  const f = Math.floor(t * 12);
  if (f !== VIS.last) { VIS.last = f; SPR().drawPerson(VIS.s, SPR().VISITOR, { view: VIS.view, act: VIS.act, t, frame: Math.floor(VIS.walkPh * 2), flip: VIS.flip }); VIS.m.userData.tex.needsUpdate = true; }
}

// ============================================================
//  STREET (thrown out)
// ============================================================
function buildStreet() {
  const s = new THREE.Scene(); s.fog = new THREE.FogExp2(0x0a0c1e, 0.06); s.background = new THREE.Color(0x070818);
  const S = {}; L.street = S;
  const road = new THREE.Mesh(planeUV(30, 10, 2), std({ map: T.asphalt, roughness: 0.18, metalness: 0.2 })); road.rotation.x = -Math.PI / 2; road.position.set(0, -0.15, 5.5); road.receiveShadow = true; s.add(road);
  const walk = new THREE.Mesh(planeUV(30, 3, 2), std({ map: T.pave, roughness: 0.5 })); walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0, 1.5); walk.receiveShadow = true; s.add(walk);
  const curb = box(30, 0.15, 0.2, std({ color: 0x55556a })); curb.position.set(0, -0.075, 3.0); s.add(curb);
  for (let i = -6; i <= 6; i++) { const m = box(1.2, 0.01, 0.12, std({ color: 0xd8c84a, emissive: 0x332a00 })); m.position.set(i * 2.4, -0.145, 6.5); s.add(m); }
  const facade = new THREE.Mesh(planeUV(30, 9, 2), std({ map: T.brickRed.map, normalMap: T.brickRed.normal, roughness: 0.85 })); facade.position.set(0, 4.5, 0); facade.receiveShadow = true; s.add(facade);
  // door (lit from inside)
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb85a).multiplyScalar(0.95) })); door.position.set(0, 1.15, 0.01); s.add(door);
  const frame = box(1.7, 0.15, 0.2, std({ color: 0x1a0e18 })); frame.position.set(0, 2.38, 0.08); s.add(frame);
  S.dmFill = new THREE.PointLight(0x8aa0ff, 1.2, 6, 2); S.dmFill.position.set(0.6, 1.6, 2.6); s.add(S.dmFill);
  for (const x of [-0.78, 0.78]) { const f = box(0.15, 2.4, 0.2, std({ color: 0x1a0e18 })); f.position.set(x, 1.2, 0.08); s.add(f); }
  S.doorLight = new THREE.PointLight(0xffb060, 2.6, 7, 2); S.doorLight.position.set(0, 0.6, 1.4); s.add(S.doorLight);
  // windows glowing with arcade colors
  for (const x of [-3.2, 3.2]) {
    const c = cv(32, 24); const t = tex(c, { clamp: true, nomip: true });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3), std({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.5 })); win.position.set(x, 1.6, 0.01); s.add(win);
    ANIM.push(tt => { if (cur !== street) return; const f = Math.floor(tt * 4); for (let y = 0; y < 24; y++) { c.x.fillStyle = `hsl(${(x > 0 ? 180 : 300) + Math.sin(tt + y * 0.2) * 30},70%,${12 + (y > 14 ? 6 : 0)}%)`; c.x.fillRect(0, y, 32, 1); } for (let i = 0; i < 3; i++) { c.x.fillStyle = '#05030a'; c.x.fillRect(3 + i * 10, 8, 6, 16); c.x.fillStyle = `hsl(${(f * 40 + i * 90) % 360},90%,60%)`; c.x.fillRect(4 + i * 10, 9, 4, 3); } c.x.fillStyle = '#05030a'; c.x.fillRect(15, 0, 2, 24); c.x.fillRect(0, 11, 32, 1); t.needsUpdate = true; });
    const sill = box(2.0, 0.08, 0.15, std({ color: 0x2a1a22 })); sill.position.set(x, 0.92, 0.07); s.add(sill);
  }
  // sign
  {
    const P = SPR(), c = cv(80, 22); P.pxText(c.x, 'ARCADE', 4, 3, '#ffd0ee', 3);
    const t = tex(c, { clamp: true, nomip: true });
    const back = box(4.4, 1.3, 0.15, std({ color: 0x12081c, roughness: 0.4 })); back.position.set(0, 3.05, 0.1); s.add(back);
    S.sign = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1.1), glowMat(t, 3.4)); S.sign.position.set(0, 3.05, 0.19); s.add(S.sign);
    S.signLight = new THREE.PointLight(0xff3caa, 4, 6, 2); S.signLight.position.set(0, 2.9, 1.2); s.add(S.signLight);
  }
  // street lamp
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 8), std({ color: 0x1a1a22, metalness: 0.6, roughness: 0.4 })); pole.position.set(-3.6, 2.1, 2.6); s.add(pole); pole.castShadow = true;
    const arm = box(0.9, 0.06, 0.06, std({ color: 0x1a1a22 })); arm.position.set(-3.2, 4.15, 2.6); s.add(arm);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 10, 1, true), std({ color: 0x22222a, side: THREE.DoubleSide })); head.position.set(-2.8, 4.05, 2.6); s.add(head);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glowMat(null, 5, 0xfff0c0)); bulb.material.transparent = false; bulb.position.set(-2.8, 3.97, 2.6); s.add(bulb);
    const l = new THREE.SpotLight(0xffe8b0, 30, 10, 0.75, 0.5, 2); l.position.set(-2.8, 3.95, 2.6); l.target.position.set(-2.4, 0, 2.2); l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0005; s.add(l); s.add(l.target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.9, 24, 1, true), shaftMat(0xffe8b0)); cone.material.uniforms.uI.value = 0.12; cone.position.set(-2.7, 2.0, 2.5); s.add(cone);
  }
  // trash cans
  S.cans = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group(); g.position.set(2.4 + i * 0.7, 0, 1.2); s.add(g);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.85, 14, 1, true), std({ map: T.metal, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide })); can.position.y = 0.425; can.castShadow = true; g.add(can);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 14), std({ map: T.metal, metalness: 0.6, roughness: 0.3 })); lid.position.y = 0.88; lid.castShadow = true; g.add(lid);
    S.cans.push({ g, lid });
  }
  // characters
  const P = SPR();
  S.dmS = P.mk(84, 160); S.dm = spriteMesh(S.dmS, 84 * 0.0142, 160 * 0.0142, 5 * 0.0142); S.dm.position.set(0, 0, 0.35); s.add(S.dm);
  S.plS = P.mk(30, 44); S.pl = spriteMesh(S.plS, 0.6, 0.88, 0); S.pl.geometry.translate(0, -0.44, 0); s.add(S.pl);
  S.starS = P.mk(48, 16); const st = tex(S.starS, { clamp: true, nomip: true });
  S.stars = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.2), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false })); S.stars.userData.t = st; s.add(S.stars);
  // rain
  const N = 700, pos = new Float32Array(N * 6), vel = [];
  for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 14, y = Math.random() * 6, z = Math.random() * 7 + 0.2; pos.set([x, y, z, x - 0.02, y + 0.25, z], i * 6); vel.push(6 + Math.random() * 3); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x8aa0d0, transparent: true, opacity: 0.35 })); s.add(rain);
  ANIM.push((t, dt) => { if (cur !== street) return; const p = rg.attributes.position.array; for (let i = 0; i < N; i++) { let y = p[i * 6 + 1] - vel[i] * dt; if (y < -0.1) y += 6; p[i * 6 + 1] = y; p[i * 6 + 4] = y + 0.25; } rg.attributes.position.needsUpdate = true; });
  s.add(new THREE.HemisphereLight(0x3a4a8a, 0x0a0a14, 0.5));
  return s;
}

// ============================================================
//  POST-PROCESSING
// ============================================================
const FSV = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
function makePost() {
  quadScene = new THREE.Scene(); quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quadScene.add(quad);
  const rt = (w, h, depth) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!depth, depthTexture: depth ? new THREE.DepthTexture(w, h) : undefined });
  rtScene = rt(iw, ih, true); rtDof = rt(iw, ih);
  for (let i = 0; i < 3; i++) { rtB.push(rt(8, 8)); rtT.push(rt(8, 8)); }
  M.dof = new THREE.ShaderMaterial({
    uniforms: { tC: { value: null }, tD: { value: null }, uRes: { value: new THREE.Vector2() }, uFocus: { value: 1.1 }, uRange: { value: 0.6 }, uMaxR: { value: 5 }, uNear: { value: 0.05 }, uFar: { value: 60 } },
    vertexShader: FSV, fragmentShader: `
      uniform sampler2D tC, tD; uniform vec2 uRes; uniform float uFocus, uRange, uMaxR, uNear, uFar; varying vec2 vUv;
      float lin(float d){ return (uNear*uFar)/(uFar - d*(uFar-uNear)); }
      float coc(float z){ return clamp(abs(z-uFocus)/(uRange*max(z,0.2)) - 0.12, 0., 1.); }
      void main(){
        float zc = lin(texture2D(tD,vUv).x), cc = coc(zc);
        vec3 acc = texture2D(tC,vUv).rgb; float tot = 1.;
        if (cc > 0.02 || true) {
          for (int i=0;i<28;i++){
            float fi=float(i)+0.5, r=sqrt(fi/28.), a=fi*2.39996;
            vec2 o = vec2(cos(a),sin(a))*r*uMaxR;
            vec2 suv = vUv + o/uRes;
            float zs = lin(texture2D(tD,suv).x), cs = coc(zs);
            float reach = (zs < zc ? max(cs, cc) : min(cs, cc)) * uMaxR;
            float w = clamp(reach - r*uMaxR + 1., 0., 1.);
            acc += texture2D(tC,suv).rgb*w; tot += w;
          }
        }
        gl_FragColor = vec4(acc/tot,1.);
      }` });
  M.bright = new THREE.ShaderMaterial({ uniforms: { tC: { value: null }, uTh: { value: 1.15 } }, vertexShader: FSV, fragmentShader: `uniform sampler2D tC; uniform float uTh; varying vec2 vUv; void main(){ vec3 c=texture2D(tC,vUv).rgb; float l=max(c.r,max(c.g,c.b)); float k=smoothstep(uTh, uTh+0.6, l); gl_FragColor=vec4(c*k,1.); }` });
  M.blur = new THREE.ShaderMaterial({ uniforms: { tC: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: FSV, fragmentShader: `uniform sampler2D tC; uniform vec2 uDir; varying vec2 vUv; void main(){ vec3 c=texture2D(tC,vUv).rgb*0.227; c+=texture2D(tC,vUv+uDir*1.385).rgb*0.316; c+=texture2D(tC,vUv-uDir*1.385).rgb*0.316; c+=texture2D(tC,vUv+uDir*3.23).rgb*0.07; c+=texture2D(tC,vUv-uDir*3.23).rgb*0.07; gl_FragColor=vec4(c,1.); }` });
  M.copy = new THREE.ShaderMaterial({ uniforms: { tC: { value: null } }, vertexShader: FSV, fragmentShader: `uniform sampler2D tC; varying vec2 vUv; void main(){ gl_FragColor=vec4(texture2D(tC,vUv).rgb,1.); }` });
  M.final = new THREE.ShaderMaterial({
    uniforms: { tC: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, uRes: { value: new THREE.Vector2() }, uBloom: { value: 0.5 }, uExp: { value: 1.25 }, uFlash: { value: 0 }, uFlashC: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 1 }, uT: { value: 0 }, uCA: { value: 0.7 } },
    vertexShader: FSV, fragmentShader: `
      uniform sampler2D tC,tB0,tB1,tB2; uniform vec2 uRes; uniform float uBloom,uExp,uFlash,uFade,uT,uCA; uniform vec3 uFlashC; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
      float bayer(vec2 p){ int x=int(mod(p.x,4.)), y=int(mod(p.y,4.)); int i=x+y*4;
        float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
        for(int k=0;k<16;k++){ if(k==i) return m[k]/16.; } return 0.; }
      void main(){
        vec2 d = (vUv-0.5); float r2 = dot(d,d);
        vec2 off = d*r2*uCA*8./uRes;
        vec3 c = vec3(texture2D(tC,vUv+off).r, texture2D(tC,vUv).g, texture2D(tC,vUv-off).b);
        vec3 b = texture2D(tB0,vUv).rgb*0.55 + texture2D(tB1,vUv).rgb*0.8 + texture2D(tB2,vUv).rgb*1.1;
        c += b*uBloom;
        c = aces(c*uExp);
        float l = dot(c, vec3(0.299,0.587,0.114));
        c = mix(c, c*vec3(0.82,0.95,1.22), (1.-l)*0.35);
        c = mix(c, c*vec3(1.12,1.0,0.86), smoothstep(0.4,1.,l)*0.3);
        c = pow(c, vec3(1./2.2));
        c *= 1. - smoothstep(0.25, 0.9, r2*2.2)*0.5;
        c = mix(c, uFlashC, uFlash);
        c *= uFade;
        c += (bayer(gl_FragCoord.xy)-0.5)/48.;
        c = floor(c*48.+0.5)/48.;
        gl_FragColor = vec4(c,1.);
      }` });
}
function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
function resizeTargets() {
  rtScene.setSize(iw, ih); rtDof.setSize(iw, ih);
  let w = iw, h = ih; for (let i = 0; i < 3; i++) { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); rtB[i].setSize(w, h); rtT[i].setSize(w, h); }
  M.dof.uniforms.uRes.value.set(iw, ih); M.final.uniforms.uRes.value.set(iw, ih);
}

// ============================================================
//  CAMERA + SCREEN MAPPING
// ============================================================
const CAM = { pos: V3(), look: V3(), focus: 1.1, k: 0, mode: 'screen', shake: 0, mx: 0, my: 0, sx: 0, sy: 0 };
function screenCam() {
  const u = L.cab.userData, c = u.mid.clone(), n = u.n.clone();
  return { pos: c.clone().addScaledVector(n, 1.3).add(V3(0, 0.02, 0)), look: c.clone().add(V3(0, 0.1, 0)), focus: 1.3 };
}
function rickCam() {
  const head = C.rk.localToWorld(V3(0.08, 1.62, 0));
  return { pos: head.clone().add(V3(-0.62, -0.2, 1.6)), look: head.clone().add(V3(-0.3, -0.38, 0)), focus: 1.75 };
}
const SC = { corners: [V3(), V3(), V3(), V3()] };
W.screenCorners = screenCorners;
function screenCorners() {
  const u = L.cab.userData, up = V3(0, u.n.z, -u.n.y), c = u.mid.clone().addScaledVector(u.n, 0.006), hw = 0.31, hh = 0.31 / 1.45;
  SC.corners[0].copy(c).addScaledVector(up, hh).x -= hw;
  SC.corners[1].copy(c).addScaledVector(up, hh).x += hw;
  SC.corners[2].copy(c).addScaledVector(up, -hh).x -= hw;
  SC.corners[3].copy(c).addScaledVector(up, -hh).x += hw;
  return SC.corners.map(v => W.project(v));
}
W.project = (v) => {
  const p = v.clone().project(camera);
  return { x: W.ox + (p.x * 0.5 + 0.5) * iw * px, y: W.oy + (-p.y * 0.5 + 0.5) * ih * px, z: p.z, vis: p.z < 1 };
};
W.headPos = (who) => {
  if (who === 'doorman') return W.project(C.dm.localToWorld(V3(0, 2.02, 0)));   // top of his head
  if (who === 'rickard') return W.project(C.rk.localToWorld(V3(0.0, 1.9, 0)));
  if (who === 'hand') return W.project(C.rk.localToWorld(V3(0.33, 1.15, 0)));
};

// ============================================================
//  PUBLIC API
// ============================================================
W.init = (cnv) => {
  canvas = cnv;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  makeTextures(); makeScreens(); drawScreens(0);
  hall = buildHall(); buildCharacters(hall); buildVisitor(hall); street = buildStreet(); cur = hall;
  camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.05, 60);
  makePost(); W.resize();
  // a soft reflection probe so glossy floors and metal pick up the neon
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const sc = screenCam(); camera.position.copy(sc.pos); camera.lookAt(sc.look);
    const env = pm.fromScene(hall, 0.02, 0.1, 40).texture; hall.environment = env; hall.environmentIntensity = 0.45;
    street.environment = env; street.environmentIntensity = 0.2; pm.dispose();
  } catch (e) { }
  const sc = screenCam(); CAM.pos.copy(sc.pos); CAM.look.copy(sc.look);
};
W.resize = () => {
  const w = innerWidth, h = innerHeight;
  px = Math.max(2, Math.round(h / 340));
  iw = Math.ceil(w / px); ih = Math.ceil(h / px);
  renderer.setSize(iw, ih, false);
  canvas.style.width = iw * px + 'px'; canvas.style.height = ih * px + 'px';
  W.ox = Math.floor((w - iw * px) / 2); W.oy = Math.floor((h - ih * px) / 2);
  canvas.style.left = W.ox + 'px'; canvas.style.top = W.oy + 'px';
  const asp = iw / ih, hf = 64 * Math.PI / 180;
  camera.aspect = asp; camera.fov = Math.max(34, 2 * Math.atan(Math.tan(hf / 2) / asp) * 180 / Math.PI); camera.updateProjectionMatrix();
  if (rtScene) resizeTargets();
  W.px = px; W.iw = iw; W.ih = ih;
};
W.setFocus = (m) => { CAM.mode = m; };
// ---- director mode (trailer): scripted camera moves, absolute or around a (moving) character
W.cine = (spec) => { CAM.cine = spec ? Object.assign({ t0: clock.t }, spec) : null; };
function cineTarget(name) {
  if (name === 'doorman') return C.dm.position.clone().add(V3(0, 1.95, 0));
  if (name === 'rickard') return C.rk.localToWorld(V3(0.05, 1.55, 0));
  if (name === 'visitor') return VIS.m.position.clone().add(V3(0, 1.75, 0));
  if (name === 'screen') return L.cab.userData.mid.clone();
  if (name === 'crowd') { const g = C.npcs.filter(n => n.gathered && (!n.custom || n.active)); if (!g.length) return V3(1.5, 1.3, -2.5); const v = V3(); g.forEach(n => v.add(V3(n.x, 1.3, n.z))); return v.multiplyScalar(1 / g.length); }
  return V3();
}
// how far the view is turned away from the game screen (0 = straight at it)
W.lookAway = () => cur !== hall || CAM.cine ? 1 : Math.max(Math.abs(CAM.sx), Math.abs(CAM.sy), CAM.k, A_charge());
const A_charge = () => (GS().charge >= 0 ? 1 : 0);
// a canvas copy of the DOM screen, shown on the 3D glass when the DOM screen is hidden
W.setMirror = (c) => {
  const m = L.cab.userData.scr.material, t = tex(c, { clamp: true }); t.minFilter = THREE.LinearMipmapLinearFilter;
  m.map = t; m.emissiveMap = t; m.color.set(0xffffff); m.emissive.set(0xffffff); m.emissiveIntensity = 0.95; m.needsUpdate = true; W.mirrorTex = t;
};
W.mirrorDirty = () => { if (W.mirrorTex) W.mirrorTex.needsUpdate = true; };
// demo/test helper: send the named crowd members (e.g. the cameos) to watch the player
W.forceGather = (names) => {
  const front = SPOTS.gather.filter(p => p.x < 0).sort((a, b) => Math.hypot(a.x + 1.7, a.z + 2.0) - Math.hypot(b.x + 1.7, b.z + 2.0));
  let k = 0;
  for (const n of C.npcs) if (n.custom && names.includes(n.custom) && n.active) { const sp = front.find(p => !p.busy); if (sp) { n.gathered = true; goTo(n, sp, 'gather'); k++; } }
};
const AF = { rc: new THREE.Raycaster(), list: null };
function autoFocus(def) {
  if (CAM.mode === 'rickard') return def;
  if (!AF.list) { AF.list = []; hall.traverse(o => { if (o.isMesh && !(o.material.isShaderMaterial) && !(o.material.transparent && !o.material.alphaTest)) AF.list.push(o); }); }
  AF.rc.setFromCamera(new THREE.Vector2(CAM.px || 0, -(CAM.py || 0)), camera); AF.rc.far = 40;
  const hits = AF.rc.intersectObjects(AF.list, false);
  for (const h of hits) {
    if (!h.object.visible) continue;
    const sc = h.object.userData.sc;
    if (sc && h.uv) { const u = Math.floor(h.uv.x * sc.w), v = Math.floor((1 - h.uv.y) * sc.h); if (sc.x.getImageData(clamp(u, 0, sc.w - 1), clamp(v, 0, sc.h - 1), 1, 1).data[3] < 40) continue; }
    return clamp(h.distance, 0.6, 14);
  }
  return 8;
}
// how blurry the (DOM) game screen should look, in CSS pixels
W.screenBlur = () => { const d = 1.3, r = M.dof.uniforms.uRange.value; const coc = clamp(Math.abs(d - CAM.focus) / (r * d) - 0.12, 0, 1); return coc * M.dof.uniforms.uMaxR.value * px * 0.8; };
W.shake = (a) => { CAM.shake = Math.max(CAM.shake, a); };
W.mouse = (x, y) => { CAM.mx = x; CAM.my = y; };
W.pointer = (x, y) => { CAM.px = x; CAM.py = y; };
W.flash = (col, k) => { M.final.uniforms.uFlashC.value.set(col); M.final.uniforms.uFlash.value = k; };
W.outside = (on) => { cur = on ? street : hall; };
W.isOutside = () => cur === street;
W.pick = (cx, cy) => {
  if (cur !== hall) return null;
  const x = ((cx - W.ox) / (iw * px)) * 2 - 1, y = -((cy - W.oy) / (ih * px)) * 2 + 1;
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(x, y), camera);
  const hit = rc.intersectObject(C.rk, false)[0];
  if (!hit || !hit.uv) return null;
  const s = C.rkS, u = Math.floor(hit.uv.x * s.w), v = Math.floor((1 - hit.uv.y) * s.h);
  const a = s.x.getImageData(clamp(u, 0, s.w - 1), clamp(v, 0, s.h - 1), 1, 1).data[3];
  return a > 40 ? 'rickard' : null;
};

let lastSpriteF = -1;
W.frame = (t, dt) => {
  clock.t = t;
  const A = GS();
  for (const f of ANIM) f(t, dt);
  if (cur === hall) frameHall(t, dt, A); else frameStreet(t, dt, A);
  // ---- render pipeline
  M.dof.uniforms.uNear.value = camera.near; M.dof.uniforms.uFar.value = camera.far;
  renderer.setRenderTarget(rtScene); renderer.render(cur, camera);
  M.dof.uniforms.tC.value = rtScene.texture; M.dof.uniforms.tD.value = rtScene.depthTexture; pass(M.dof, rtDof);
  M.bright.uniforms.tC.value = rtDof.texture; pass(M.bright, rtB[0]);
  for (let i = 0; i < 3; i++) {
    if (i > 0) { M.copy.uniforms.tC.value = rtB[i - 1].texture; pass(M.copy, rtB[i]); }
    const w = rtB[i].width, h = rtB[i].height;
    M.blur.uniforms.tC.value = rtB[i].texture; M.blur.uniforms.uDir.value.set(1 / w, 0); pass(M.blur, rtT[i]);
    M.blur.uniforms.tC.value = rtT[i].texture; M.blur.uniforms.uDir.value.set(0, 1 / h); pass(M.blur, rtB[i]);
  }
  const F = M.final.uniforms;
  F.tC.value = rtDof.texture; F.tB0.value = rtB[0].texture; F.tB1.value = rtB[1].texture; F.tB2.value = rtB[2].texture; F.uT.value = t;
  F.uFlash.value = Math.max(0, F.uFlash.value - dt * 1.8);
  pass(M.final, null);
};

function frameHall(t, dt, A) {
  // ---- camera
  const want = CAM.mode === 'rickard' ? rickCam() : screenCam();
  CAM.k = clamp(CAM.k + (CAM.mode === 'rickard' ? dt : -dt) / 0.8, 0, 1);
  const sc = screenCam(), rk = rickCam(), k = smooth(CAM.k);
  const pos = sc.pos.clone().lerp(rk.pos, k), look = sc.look.clone().lerp(rk.look, k);
  const par = (1 - k) * (A.camOn ? 1 : 0) * (A.camFreeze ? 0 : 1);
  // first-person look: a calm dead zone in the middle (reading), turn the head towards the edges
  const dz = v => Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), 1.25);   // the game passes 0 while the pointer is over the screen
  CAM.sx += ((dz(CAM.mx) * par) - CAM.sx) * Math.min(1, dt * 3.2); CAM.sy += ((dz(CAM.my) * par) - CAM.sy) * Math.min(1, dt * 3.2);
  const dir = look.clone().sub(pos), right = V3().crossVectors(dir, V3(0, 1, 0)).normalize();
  const away = Math.min(1, Math.max(Math.abs(CAM.sx), Math.abs(CAM.sy)) * 8);
  dir.applyAxisAngle(V3(0, 1, 0), -CAM.sx * 0.62 + Math.sin(t * 0.23) * 0.006 * par * away);
  dir.applyAxisAngle(right, -CAM.sy * 0.3 + Math.sin(t * 0.37) * 0.004 * par * away);
  look.copy(pos).add(dir);
  if (CAM.shake > 0) { pos.x += (Math.random() - 0.5) * CAM.shake * 0.04; pos.y += (Math.random() - 0.5) * CAM.shake * 0.03; CAM.shake = Math.max(0, CAM.shake - dt * 3); }
  if (CAM.cine) {
    const c = CAM.cine, u = smooth(clamp((t - c.t0) / c.dur, 0, 1)), base = c.around ? cineTarget(c.around) : V3();
    pos.copy(base).add(V3(...c.from).lerp(V3(...c.to), u));
    look.copy(base).add(V3(...c.look).lerp(V3(...(c.lookTo || c.look)), u));
  }
  // the doorman charging the camera
  let chargeU = -1;
  if (A.charge >= 0) {
    chargeU = clamp((t - A.charge) / 1.5, 0, 1);
    pos.x += (Math.random() - 0.5) * 0.02 * chargeU; pos.y += (Math.random() - 0.5) * 0.02 * chargeU;
  }
  camera.position.copy(pos); camera.lookAt(look);
  if (t - (CAM.afT || 0) > 0.08) { CAM.afT = t; CAM.afTarget = autoFocus(sc.focus); }
  const wantF = CAM.cine ? (CAM.cine.focus || pos.distanceTo(look)) : lerp(CAM.afTarget || sc.focus, rk.focus, k);
  CAM.focus += (wantF - CAM.focus) * Math.min(1, dt * (CAM.cine ? 12 : 4.5));
  M.dof.uniforms.uFocus.value = CAM.focus;
  M.dof.uniforms.uRange.value = 2.2; M.dof.uniforms.uMaxR.value = 2.2;
  M.final.uniforms.uFade.value = 1;
  // ---- lights + neon flicker
  const fl = (Math.sin(t * 31) > 0.985 || Math.sin(t * 7.3) > 0.995) ? 0.35 : 1;
  L.neonL.intensity = 9 * (0.85 + 0.15 * Math.sin(t * 2.3)) * fl; L.tubeM.material.color.setRGB(4 * fl, 0.94 * fl, 2.67 * fl);
  L.neonR.intensity = 9 * (0.9 + 0.1 * Math.sin(t * 1.7 + 2));
  L.signArcade.material.color.setScalar(Math.sin(t * 40) > 0.97 && Math.floor(t * 0.7) % 5 === 0 ? 0.8 : 3.2);
  // screen glow follows the quiz feedback
  const gk = A.glow && t - A.glowT < 0.9 ? 1 - (t - A.glowT) / 0.9 : 0;
  const base = new THREE.Color(0x6fa8ff), gc = new THREE.Color(A.glow || '#ffffff');
  L.scrLight.color.copy(base).lerp(gc, gk); L.scrLight.intensity = A.screenOff ? 0.15 : 1.4 + gk * 3;
  const sm = L.cab.userData.scr.material; if (sm.emissiveMap) { sm.emissive.set(0xffffff).lerp(gc, gk * 0.5); sm.emissiveIntensity = A.screenOff ? 0.02 : 0.95; } else sm.emissive.copy(new THREE.Color(0x0a1630)).lerp(gc, gk * 0.6);
  // music-reactive speakers
  const lv = A.musicLevel || 0;
  for (const s of L.speakers) { s.cone.scale.setScalar(1 + lv * 0.25); s.tw.scale.setScalar(1 + lv * 0.12); }
  // ---- player cabinet: buttons, joystick, marquee
  const ud = L.cab.userData;
  ud.buttons.forEach((b, i) => { const pt = t - A.btnT[i], dn = pt >= 0 && pt < 0.3; b.mesh.position.copy(b.base).addScaledVector(b.n, dn ? -0.009 : 0); b.mesh.material.emissiveIntensity = dn ? 2.2 : 0.25; });
  const jt = t - A.joyT, jd = jt >= 0 && jt < 0.25 ? A.joyDir : 0;
  ud.joy.rotation.z = -jd * 0.35 + Math.sin(t * 0.9) * 0.02;
  if (Math.floor(t * 12) !== lastSpriteF) drawMarquee(t, A);
  if (Math.floor(t * 10) !== Math.floor((t - dt) * 10)) drawScreens(t);
  // ---- characters (sprites redrawn at 12 fps for pixel-art cadence)
  const f = Math.floor(t * 12), redraw = f !== lastSpriteF; lastSpriteF = f;
  if (redraw) {
    SPR().doorman(C.dmS, t, { lvl: chargeU >= 0 ? 5 : A.lvl, reactT: A.reactT, nodT: A.nodT }); C.dm.userData.tex.needsUpdate = true;
    SPR().rickard(C.rkS, t, { mode: A.rick, grinT: A.rickGrinT, hover: A.rickHover }); C.rk.userData.tex.needsUpdate = true;
  }
  if (chargeU >= 0) {
    const e = chargeU * chargeU, tgt = camera.position.clone().add(V3(0, -1.75, -0.55));
    C.dm.position.copy(C.dmBase).lerp(tgt, e); C.dm.position.y = Math.abs(Math.sin(chargeU * 22)) * 0.08 * (1 - chargeU) + C.dm.position.y;
    M.final.uniforms.uFlash.value = Math.max(M.final.uniforms.uFlash.value, chargeU > 0.85 ? (chargeU - 0.85) / 0.15 : 0);
    M.final.uniforms.uFlashC.value.set(0xffffff);
  } else C.dm.position.copy(C.dmBase);
  C.dm.visible = !A.hideDoorman;
  C.dm.rotation.y = Math.atan2(camera.position.x - C.dm.position.x, camera.position.z - C.dm.position.z);
  C.rkPivot.rotation.y = Math.atan2(camera.position.x - C.rkPivot.position.x, camera.position.z - C.rkPivot.position.z) * 0.6;
  for (const n of C.npcs) if (!n.custom || n.active) updateNPC(n, t, dt, camera.position);
  updateVisitor(t, dt);
  // floating labels
  for (const lb of C.labels) {
    if (!lb.m.visible) continue;
    const a = t - lb.t0; if (a > 1.6 || !lb.npc) { lb.m.visible = false; continue; }
    lb.m.position.set(lb.npc.x, 1.95 * lb.npc.P.height + a * 0.35, lb.npc.z);
    lb.m.quaternion.copy(camera.quaternion); lb.m.material.opacity = a < 1.2 ? 1 : 1 - (a - 1.2) / 0.4;
  }
}
function drawMarquee(t, A) {
  const c = L.marqC, x = c.x, P = SPR(), fast = t - A.marqT < 1.6, W2 = c.w, H2 = c.h;
  x.fillStyle = '#12061a'; x.fillRect(0, 0, W2, H2);
  const g = x.createLinearGradient(0, 6, 0, H2 - 6); g.addColorStop(0, '#4a1240'); g.addColorStop(0.5, '#a0246e'); g.addColorStop(1, '#4a1a10');
  x.fillStyle = g; x.fillRect(4, 7, W2 - 8, H2 - 14);
  for (let i = 0; i < 14; i++) { x.fillStyle = 'rgba(255,200,240,.06)'; x.fillRect(8 + i * 18, 7, 6, H2 - 14); }
  const title = 'NÄTVERKSSÄKERHET', s3 = 3, w = P.pxW(title, s3), x0 = (W2 - w) >> 1, y0 = (H2 >> 1) - 7;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 3], [3, 3]]) P.pxText(x, title, x0 + dx, y0 + dy, '#2a0618', s3);
  P.pxText(x, title, x0, y0, '#ffe6f4', s3);
  x.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < w; i += 3) x.fillRect(x0 + i, y0 - 1, 1, 1);
  const stp = Math.floor(t * (fast ? 16 : 5));
  for (let i = 0; i < 42; i++) { x.fillStyle = (i + stp) % 3 === 0 ? '#fff7a8' : '#4a3010'; x.fillRect(4 + i * 6, 2, 3, 3); x.fillStyle = (i + stp + 1) % 3 === 0 ? '#fff7a8' : '#4a3010'; x.fillRect(4 + i * 6, H2 - 5, 3, 3); }
  L.marqT.needsUpdate = true;
  L.cab.userData.marq.emissiveIntensity = fast ? 1.4 : (Math.sin(t * 23) > 0.97 ? 0.65 : 0.95);
}
function frameStreet(t, dt, A) {
  const S = L.street, tt = t - A.outsideT0;
  camera.position.set(0.7 + Math.sin(t * 0.3) * 0.05, 1.5, 7.0); camera.lookAt(0.6, 1.55, 0.5);
  if (CAM.shake > 0) { camera.position.x += (Math.random() - 0.5) * CAM.shake * 0.06; CAM.shake = Math.max(0, CAM.shake - dt * 3); }
  M.dof.uniforms.uFocus.value = 6.6; M.dof.uniforms.uRange.value = 2.6; M.dof.uniforms.uMaxR.value = 2.2;
  M.final.uniforms.uFade.value = clamp(tt * 2.5, 0, 1);
  const fl = Math.sin(t * 29) > 0.93 ? 0.4 : 1; S.sign.material.color.setScalar(3.4 * fl); S.signLight.intensity = 6 * fl;
  const f = Math.floor(t * 12);
  if (f !== lastSpriteF) {
    lastSpriteF = f;
    SPR().doorman(S.dmS, t, { lvl: tt > 2.2 ? 1 : 5, reactT: -9, nodT: -9 }); S.dm.userData.tex.needsUpdate = true;
    SPR().thrown(S.plS, t); S.pl.userData.tex.needsUpdate = true;
  }
  S.dm.rotation.y = Math.atan2(camera.position.x, camera.position.z - 0.35);
  // flight into the trash can
  const land = 1.55, can = S.cans[0];
  if (tt < 0.35) { S.pl.visible = true; S.pl.position.set(0, 1.2, 0.6); S.pl.rotation.set(0, 0, 0); }
  else if (tt < land) {
    const u = (tt - 0.35) / (land - 0.35);
    S.pl.visible = true; S.pl.position.set(lerp(0, 2.4, u), 1.2 + Math.sin(u * Math.PI) * 1.6 - u * 0.1, lerp(0.6, 1.2, u)); S.pl.rotation.set(0, 0, -u * Math.PI * 4);
  } else {
    S.pl.visible = true; S.pl.position.set(2.4, 1.05, 1.2); S.pl.rotation.set(0, 0, Math.PI);   // legs sticking up out of the can
    if (tt < land + 0.05) W.shake(1.2);
  }
  const lu = clamp((tt - land) / 0.9, 0, 1);
  can.lid.position.set(lu * 1.4, 0.88 + Math.sin(lu * Math.PI) * 1.2 - lu * 0.86, lu * 0.6); can.lid.rotation.set(lu * 6, 0, lu * 4);
  const sh = tt > land && tt < land + 0.5 ? Math.sin(tt * 60) * 0.06 : 0; can.g.rotation.z = sh;
  // dizzy stars
  S.stars.visible = tt > land;
  if (S.stars.visible) {
    const c = S.starS.x; c.clearRect(0, 0, 48, 16);
    for (let i = 0; i < 4; i++) { const a = t * 4 + i * Math.PI / 2, x = 24 + Math.cos(a) * 18, y = 8 + Math.sin(a) * 4; c.fillStyle = '#ffd23f'; c.fillRect(x - 1, y - 3, 3, 7); c.fillRect(x - 3, y - 1, 7, 3); }
    S.stars.userData.t.needsUpdate = true; S.stars.position.set(2.4, 1.5, 1.25); S.stars.quaternion.copy(camera.quaternion);
  }
}
export default W;
