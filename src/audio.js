// ============================================================
//  AUDIO: one shared AudioContext; the music is played "through the
//  hall's speakers": band-limited, slightly driven, two speakers with
//  different distances, and a synthetic room reverb.
// ============================================================
let _AC = null;
function audioCtx() {
  if (!_AC) { try { _AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { _AC = null; } }
  if (_AC && _AC.state === 'suspended') _AC.resume().catch(() => { });
  return _AC;
}
// ---- 3D sound in the hall: the listener follows the camera, every source sits where it is in the room
const SPACE = (() => {
  let last = null;
  const set3 = (node, pre, x, y, z, t) => {
    if (node[pre + 'X']) { node[pre + 'X'].setTargetAtTime(x, t, 0.04); node[pre + 'Y'].setTargetAtTime(y, t, 0.04); node[pre + 'Z'].setTargetAtTime(z, t, 0.04); return true; }
    return false;
  };
  return {
    panner(ac, o) {
      const p = ac.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = o.ref || 1; p.rolloffFactor = o.roll || 1; p.maxDistance = 40;
      if (o.dir) { p.coneInnerAngle = o.inner || 150; p.coneOuterAngle = o.outer || 300; p.coneOuterGain = o.outerGain == null ? 0.45 : o.outerGain; this.orient(ac, p, o.dir[0], o.dir[1], o.dir[2]); }
      this.place(ac, p, o.x, o.y, o.z);
      return p;
    },
    place(ac, p, x, y, z) { if (!set3(p, 'position', x, y, z, ac.currentTime)) p.setPosition(x, y, z); },
    orient(ac, p, x, y, z) { if (!set3(p, 'orientation', x, y, z, ac.currentTime)) p.setOrientation(x, y, z); },
    // c = { x, y, z, fx, fy, fz, ux, uy, uz } (camera); outside: keep the last hall position (the street is another scene)
    listen(ac, c, outside) {
      if (outside || !c) return;
      const L = ac.listener, t = ac.currentTime;
      if (L.positionX) {
        L.positionX.setTargetAtTime(c.x, t, 0.04); L.positionY.setTargetAtTime(c.y, t, 0.04); L.positionZ.setTargetAtTime(c.z, t, 0.04);
        L.forwardX.setTargetAtTime(c.fx, t, 0.04); L.forwardY.setTargetAtTime(c.fy, t, 0.04); L.forwardZ.setTargetAtTime(c.fz, t, 0.04);
        L.upX.setTargetAtTime(c.ux, t, 0.04); L.upY.setTargetAtTime(c.uy, t, 0.04); L.upZ.setTargetAtTime(c.uz, t, 0.04);
      } else { L.setPosition(c.x, c.y, c.z); L.setOrientation(c.fx, c.fy, c.fz, c.ux, c.uy, c.uz); }
      last = c;
    },
    roomIR(ac, secs) {
      const sr = ac.sampleRate, n = Math.floor(sr * secs), b = ac.createBuffer(2, n, sr);
      const early = [[0.011, 0.55], [0.019, 0.42], [0.027, 0.35], [0.041, 0.3], [0.053, 0.22], [0.067, 0.18], [0.083, 0.14]];
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch); let lp = 0;
        for (let i = 0; i < n; i++) { const t = i / sr, w = (Math.random() * 2 - 1) * Math.exp(-t * 3.1); lp += (w - lp) * (0.35 - Math.min(0.25, t * 0.12)); d[i] = lp * 0.55; }
        for (const [t, a] of early) { const i = Math.floor((t + ch * 0.004) * sr); if (i < n) d[i] += a * (ch ? 0.9 : 1); }
      }
      return b;
    }
  };
})();
const MUSIC = (() => {
  let el = null, built = false, master, muffle, an, data, lvl = 0, vol = 0.55, enabled = true, duck = 1, outside = false, wanted = false;
  // playlist: one <script class="music-b64"> per song (src/music/*.mp3), decoded only when it is about to play
  let tracks = [], order = [], pos = 0;
  function trackURL(i) {
    const t = tracks[i];
    if (!t.url) {
      const bin = atob(t.node.textContent.trim()), u8 = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
      t.node.textContent = '';
      t.url = URL.createObjectURL(new Blob([u8], { type: 'audio/mpeg' }));
    }
    return t.url;
  }
  function shuffled(n, avoidFirst) {
    // one round through the playlist: every song, except that rare ones (data-chance < 1) are only in some rounds
    let a = [...Array(n).keys()].filter(i => Math.random() < tracks[i].chance);
    if (!a.length) a = [...Array(n).keys()].filter(i => tracks[i].chance >= 1);
    n = a.length;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (n > 1 && a[0] === avoidFirst) [a[0], a[1]] = [a[1], a[0]];   // never the same song twice in a row
    return a;
  }
  function nextTrack() {
    const last = order[pos];
    if (++pos >= order.length) { order = shuffled(tracks.length, last); pos = 0; }
    el.src = trackURL(order[pos]);
    if (wanted && enabled) { const p = el.play(); if (p && p.catch) p.catch(() => { }); }
  }
  function build() {
    const ac = audioCtx(); if (!ac || built) return !!built;
    tracks = [...document.querySelectorAll('script.music-b64')].filter(n => n.textContent.length > 100).map(node => ({ node, url: null, chance: +(node.dataset.chance || 1) }));
    if (!tracks.length) return false;
    order = shuffled(tracks.length, -1); pos = 0;
    el = new Audio(); el.loop = tracks.length === 1; el.preload = 'auto';
    el.addEventListener('ended', nextTrack);
    el.src = trackURL(order[0]);
    const src = ac.createMediaElementSource(el);
    // speaker voicing
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150; hp.Q.value = 0.9;
    const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2100; pk.gain.value = 5.5; pk.Q.value = 1.0;
    const box = ac.createBiquadFilter(); box.type = 'peaking'; box.frequency.value = 480; box.gain.value = 3.5; box.Q.value = 1.1;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.7;
    const sh = ac.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.0) / Math.tanh(2.0); }
    sh.curve = curve; sh.oversample = '2x';
    src.connect(hp); hp.connect(box); box.connect(pk); pk.connect(lp); lp.connect(sh);
    // the hall's wall speakers: each one is a positioned source, so the music comes from where they hang
    const bus = ac.createGain();
    const mono = ac.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
    sh.connect(mono);
    const spk = (window.World && World.audioScene && World.audioScene().speakers) || [{ x: -3.2, y: 2.9, z: -9.6, dx: 0, dy: -0.15, dz: 1 }, { x: 5.6, y: 2.9, z: -6, dx: -1, dy: -0.15, dz: 0 }];
    // set up like a real installation: every speaker equally loud at the player's spot (the nearest one, on the left
    // wall, would otherwise win), and the right-hand speakers a few ms first so that's where the sound is heard from
    const P = { x: 0, y: 1.76, z: 1.45 }, REF = 2.2, ROLL = 0.9;
    const att = d => REF / (REF + ROLL * Math.max(0, d - REF)), dist = o => Math.hypot(o.x - P.x, o.y - P.y, o.z - P.z);
    const mean = spk.reduce((a, o) => a + dist(o), 0) / spk.length, byX = spk.slice().sort((a, b) => b.x - a.x);
    spk.forEach(o => {
      const g = ac.createGain(); g.gain.value = 1.6 * att(mean) / att(dist(o));
      const d = ac.createDelay(0.05); d.delayTime.value = byX.indexOf(o) * 0.0025;
      const p = SPACE.panner(ac, { x: o.x, y: o.y, z: o.z, dir: [o.dx, o.dy, o.dz], ref: REF, roll: ROLL, inner: 120, outer: 280, outerGain: 0.5 });
      mono.connect(d); d.connect(g); g.connect(p); p.connect(bus);
    });
    // the room
    const conv = ac.createConvolver(); conv.buffer = SPACE.roomIR(ac, 2.5);
    const wet = ac.createGain(); wet.gain.value = 0.26; sh.connect(conv); conv.connect(wet); wet.connect(bus);
    // slap-back echoes off the far walls (left and right a little apart), each repeat darker than the last
    [[0.093, -0.6], [0.131, 0.6]].forEach(([dt, pan]) => {
      const d = ac.createDelay(1), fb = ac.createGain(), tone = ac.createBiquadFilter(), out = ac.createGain(), pn = ac.createStereoPanner();
      d.delayTime.value = dt; fb.gain.value = 0.18; tone.type = 'lowpass'; tone.frequency.value = 2400; out.gain.value = 0.07; pn.pan.value = pan;
      mono.connect(d); d.connect(tone); tone.connect(fb); fb.connect(d); tone.connect(out); out.connect(pn); pn.connect(bus); out.connect(conv);
    });
    muffle = ac.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 18000; muffle.Q.value = 0.7;
    master = ac.createGain(); master.gain.value = 0;
    an = ac.createAnalyser(); an.fftSize = 256; data = new Uint8Array(an.frequencyBinCount);
    bus.connect(muffle); muffle.connect(master); master.connect(an); an.connect(ac.destination);
    built = true; return true;
  }
  function apply(fast) {
    if (!built) return; const ac = audioCtx(), t = ac.currentTime;
    master.gain.setTargetAtTime(enabled ? 0.63 * vol * duck * (outside ? 0.75 : 1) : 0, t, fast ? 0.05 : 0.25);
    muffle.frequency.setTargetAtTime(outside ? 520 : 18000, t, 0.25);
  }
  return {
    start() { wanted = true; if (!enabled) return; if (!build()) return; const p = el.play(); if (p && p.catch) p.catch(() => { }); apply(); },
    setEnabled(on) { enabled = on; if (on && wanted) this.start(); apply(true); },
    setVolume(v) { vol = v; apply(true); },
    // the rare song (data-chance < 1) is playing right now
    rarePlaying() { return !!(built && enabled && el && !el.paused && tracks[order[pos]] && tracks[order[pos]].chance < 1); },
    _test: {   // test hooks: jump to the rare song / to near the end of the current song
      playRare() { if (!build()) return; const i = tracks.findIndex(t => t.chance < 1); if (i < 0) return; order.splice(pos + 1, 0, i); nextTrack(); },
      seekEnd(s) { if (el && el.duration) el.currentTime = Math.max(0, el.duration - s); },
      src(u) { if (el) { el.src = u; el.loop = true; el.play(); } }
    },
    duck(on) { duck = on ? 0.55 : 1; apply(); },
    outside(on) { outside = on; apply(); },
    level() {
      if (!built || !enabled) return 0;
      an.getByteFrequencyData(data); let s = 0; for (let i = 1; i < 6; i++) s += data[i];
      const v = Math.max(0, s / (5 * 255) - 0.35) / 0.65; lvl = Math.max(v, lvl * 0.86); return lvl;
    }
  };
})();

// ============================================================
//  AMBIENCE: the other machines in the hall and people chatting, each from where it is in the room.
//  Everything is synthesized (no extra files) and kept well under the music.
// ============================================================
const AMBI = (() => {
  let built = false, ac, master, muffle, dry, revIn, noiseBuf, machBus, voiceBus, GAIN = 6, vol = 0.5, enabled = true, wanted = false, outside = false;
  const machines = [], voices = new Map();
  const rnd = seed => { let x = (seed * 2654435761 >>> 0) || 7; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
  const SCALES = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 3, 7, 9], [0, 4, 7, 11, 14]];

  function build(scene) {
    if (built) return true;
    ac = audioCtx(); if (!ac || !scene) return false;
    master = ac.createGain(); master.gain.value = 0;
    muffle = ac.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 18000; muffle.Q.value = 0.7;
    dry = ac.createGain(); machBus = ac.createGain(); voiceBus = ac.createGain(); machBus.gain.value = 1; voiceBus.gain.value = 1.3;
    revIn = ac.createGain(); revIn.gain.value = 0.5;
    const conv = ac.createConvolver(); conv.buffer = SPACE.roomIR(ac, 2.2);
    const wet = ac.createGain(); wet.gain.value = 0.38;
    machBus.connect(dry); voiceBus.connect(dry); revIn.connect(conv); conv.connect(wet); wet.connect(muffle); dry.connect(muffle); muffle.connect(master); master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    for (const m of scene.srcs) {
      const r = rnd(m.seed * 13 + 5), out = ac.createGain();
      out.gain.value = m.kind === 'pin' ? 0.9 : 0.75;
      const p = SPACE.panner(ac, { x: m.x, y: m.y, z: m.z, dir: [m.dx, 0, m.dz], ref: 1.3, roll: 1.3, inner: 160, outer: 320, outerGain: 0.5 });
      out.connect(p); p.connect(machBus); out.connect(revIn);
      const sc = SCALES[r() * SCALES.length | 0], root = 196 * Math.pow(2, (r() * 10 | 0) / 12);
      const lead = Array.from({ length: 16 }, () => r() < 0.72 ? sc[r() * sc.length | 0] + 12 * (r() < 0.25 ? 1 : 0) : null);
      const bass = Array.from({ length: 8 }, (_, i) => i % 4 === 0 ? 0 : sc[r() * 3 | 0]);
      machines.push({ src: m, out, r, root, lead, bass, step: 0, wave: r() < 0.5 ? 'square' : 'triangle', spd: 0.105 + r() * 0.06, next: 0, phrase: 0, quietUntil: 0 });
    }
    built = true; return true;
  }
  // ---- tiny instruments
  function note(dest, f, t, d, v, type, slide) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + 0.02);
  }
  function hiss(dest, t, d, v, f, q, type) {
    const s = ac.createBufferSource(), b = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; b.type = type || 'bandpass'; b.frequency.value = f; b.Q.value = q || 1;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(b); b.connect(g); g.connect(dest); s.start(t, Math.random() * 0.8, d + 0.05);
  }
  const hz = (m, semi) => m.root * Math.pow(2, semi / 12);
  // ---- an arcade cabinet: attract-mode jingles when nobody plays, game noises when someone does
  function cabStep(m, t) {
    const busy = m.src.busy, r = m.r, o = m.out;
    if (busy) {
      if (m.step % 2 === 0 && m.lead[m.step % 16] != null && r() < 0.6) note(o, hz(m, m.lead[m.step % 16]), t, m.spd * 1.6, 0.022, m.wave);
      if (m.step % 4 === 0) note(o, hz(m, m.bass[(m.step >> 1) % 8]) / 2, t, m.spd * 2.5, 0.03, 'triangle');
      const x = r();
      if (x < 0.07) note(o, 900 + r() * 500, t, 0.13, 0.03, 'square', 0.25);                                     // pew
      else if (x < 0.1) { hiss(o, t, 0.45, 0.07, 500, 0.6, 'lowpass'); note(o, 90, t, 0.3, 0.04, 'square', 0.5); } // boom
      else if (x < 0.12) { note(o, hz(m, 24), t, 0.06, 0.025); note(o, hz(m, 31), t + 0.06, 0.18, 0.025); }        // pickup
      else if (x < 0.135) note(o, 220, t, 0.22, 0.025, 'square', 3);                                               // jump
      m.step++; return m.spd;
    }
    // idle: play the jingle a couple of times, then rest a while
    if (t < m.quietUntil) { if (r() < 0.02) note(o, hz(m, 24 + m.lead[0] || 0), t, 0.05, 0.012, 'square'); return 0.5; }
    const i = m.step % 16, n = m.lead[i];
    if (n != null) note(o, hz(m, n), t, m.spd * 1.4, 0.02, m.wave);
    if (i % 4 === 0) note(o, hz(m, m.bass[(i >> 1) % 8]) / 2, t, m.spd * 3, 0.026, 'triangle');
    if (++m.step % 32 === 0) { m.quietUntil = t + 6 + r() * 18; }
    return m.spd;
  }
  // ---- a pinball table: flippers, bumper bells and score rattles
  function pinStep(m, t) {
    const r = m.r, o = m.out;
    if (!m.src.busy) {
      if (r() < 0.03) [0, 4, 7, 12].forEach((s, i) => note(o, hz(m, s + 12), t + i * 0.09, 0.3, 0.015, 'sine'));
      return 0.6;
    }
    const x = r();
    if (x < 0.35) { hiss(o, t, 0.05, 0.12, 380, 0.8); note(o, 70, t, 0.06, 0.05, 'square', 0.7); }                    // flipper clack
    else if (x < 0.6) { const f = 1100 + (r() * 4 | 0) * 220; note(o, f, t, 0.35, 0.025, 'sine'); note(o, f * 2.76, t, 0.15, 0.008, 'sine'); } // bumper
    else if (x < 0.66) for (let i = 0; i < 10; i++) hiss(o, t + i * 0.045, 0.02, 0.05, 2600, 3);                     // score reels
    else if (x < 0.69) [0, 7, 12].forEach((s, i) => note(o, hz(m, s + 12), t + i * 0.07, 0.25, 0.02, 'square'));
    return 0.12 + r() * 0.3;
  }
  // ---- voices: babble (vowel formants on a buzzy source), soft and blurred by the room, so it reads as "people talking"
  const VOW = [[730, 1090, 2440], [530, 1840, 2480], [300, 2200, 2900], [570, 840, 2410], [320, 900, 2300], [660, 1700, 2400], [440, 1020, 2240]];
  function voice(n) {
    let v = voices.get(n.id);
    if (!v) {
      const r = rnd(n.id * 31 + 11), high = r() < 0.45;
      const out = ac.createGain(); out.gain.value = 1;
      const p = SPACE.panner(ac, { x: n.x, y: n.y, z: n.z, ref: 1.1, roll: 1.5 });
      out.connect(p); p.connect(voiceBus); out.connect(revIn);
      v = { out, p, f0: (high ? 175 + r() * 60 : 98 + r() * 40) / Math.sqrt(n.h || 1), fk: high ? 1.12 : 1, rate: 4.2 + r() * 1.8, seq: 0 };
      voices.set(n.id, v);
    }
    SPACE.place(ac, v.p, n.x, n.y, n.z);
    return v;
  }
  function phrase(v, t0, dur) {
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    const bands = [0, 1, 2].map(k => { const b = ac.createBiquadFilter(), bg = ac.createGain(); b.type = 'bandpass'; b.Q.value = [5, 9, 9][k]; bg.gain.value = [1, 0.55, 0.18][k]; o.connect(b); b.connect(bg); bg.connect(g); return b; });
    lp.type = 'lowpass'; lp.frequency.value = 2800; g.connect(lp); lp.connect(v.out);
    o.type = 'sawtooth';
    const q = Math.random() < 0.25, f0 = v.f0 * (0.95 + Math.random() * 0.1);
    o.frequency.setValueAtTime(f0 * 1.08, t0);
    g.gain.setValueAtTime(0, t0);
    let t = t0 + 0.02, k = 0;
    while (t < t0 + dur - 0.1) {
      const syl = (0.7 + Math.random() * 0.6) / v.rate, vw = VOW[Math.random() * VOW.length | 0], a = 0.012 * (0.6 + Math.random() * 0.4), u = (t - t0) / dur;
      const fp = f0 * (1.08 - 0.18 * u + (q && u > 0.75 ? (u - 0.75) * 1.4 : 0)) * (0.96 + Math.random() * 0.08);
      o.frequency.linearRampToValueAtTime(fp, t + syl * 0.5);
      bands.forEach((b, i) => b.frequency.setTargetAtTime(vw[i] * v.fk, t, 0.025));
      g.gain.setTargetAtTime(a, t, 0.02); g.gain.setTargetAtTime(0.0008, t + syl * 0.65, 0.025);
      if (Math.random() < 0.35) hiss(v.out, t, 0.05, 0.006, 3500 + Math.random() * 2500, 2);   // s / t / k
      t += syl; if (++k % (2 + (Math.random() * 3 | 0)) === 0) t += 0.06 + Math.random() * 0.12;   // word gaps
    }
    g.gain.setTargetAtTime(0, t, 0.03);
    o.start(t0); o.stop(t + 0.2);
  }
  function apply(fast) {
    if (!built) return; const t = ac.currentTime;
    master.gain.setTargetAtTime(enabled ? vol * GAIN * (outside ? 0.45 : 1) : 0, t, fast ? 0.05 : 0.3);
    muffle.frequency.setTargetAtTime(outside ? 420 : 18000, t, 0.25);
  }
  return {
    start() { wanted = true; },
    _bus: () => ({ machBus, voiceBus, master }),   // for tests
    setEnabled(on) { enabled = on; apply(true); },
    setVolume(v) { vol = v; apply(true); },
    outside(on) { outside = on; apply(); },
    // called every frame with World.audioScene()
    update(scene) {
      if (!wanted || !scene) return;
      if (!built) { if (!build(scene)) return; apply(); }
      if (ac.state !== 'running') return;
      SPACE.listen(ac, scene.cam, scene.outside);
      if (!enabled) return;
      const now = ac.currentTime, ahead = now + 0.2;
      for (const m of machines) {
        if (m.next < now - 0.3) m.next = now + Math.random() * 0.5;   // after a pause (hidden tab etc.)
        while (m.next < ahead) m.next += (m.src.kind === 'pin' ? pinStep : cabStep)(m, m.next);
      }
      for (const n of scene.npcs) {
        const v = voice(n);
        if (n.talk && n.talk.seq !== v.seq) { v.seq = n.talk.seq; phrase(v, now + 0.03, n.talk.dur); }
      }
    }
  };
})();
