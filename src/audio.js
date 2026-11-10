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
const MUSIC = (() => {
  let el = null, built = false, master, muffle, an, data, lvl = 0, vol = 0.55, enabled = true, duck = 1, outside = false, wanted = false;
  function roomIR(ac, secs) {
    const sr = ac.sampleRate, n = Math.floor(sr * secs), b = ac.createBuffer(2, n, sr);
    const early = [[0.011, 0.55], [0.019, 0.42], [0.027, 0.35], [0.041, 0.3], [0.053, 0.22], [0.067, 0.18], [0.083, 0.14]];
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, w = (Math.random() * 2 - 1) * Math.exp(-t * 3.1); lp += (w - lp) * (0.35 - Math.min(0.25, t * 0.12)); d[i] = lp * 0.55; }
      for (const [t, a] of early) { const i = Math.floor((t + ch * 0.004) * sr); if (i < n) d[i] += a * (ch ? 0.9 : 1); }
    }
    return b;
  }
  function build() {
    const ac = audioCtx(); if (!ac || built) return !!built;
    const b64 = document.getElementById('music-b64');
    if (!b64 || b64.textContent.length < 100) return false;
    const bin = atob(b64.textContent.trim()), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    b64.textContent = '';
    el = new Audio(); el.loop = true; el.preload = 'auto';
    el.src = URL.createObjectURL(new Blob([u8], { type: 'audio/mpeg' }));
    const src = ac.createMediaElementSource(el);
    // speaker voicing
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 115; hp.Q.value = 0.8;
    const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2300; pk.gain.value = 4; pk.Q.value = 0.9;
    const box = ac.createBiquadFilter(); box.type = 'peaking'; box.frequency.value = 420; box.gain.value = 2.5; box.Q.value = 1.2;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6200; lp.Q.value = 0.6;
    const sh = ac.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    sh.curve = curve; sh.oversample = '2x';
    src.connect(hp); hp.connect(box); box.connect(pk); pk.connect(lp); lp.connect(sh);
    // two speakers at different distances (left one closer)
    const bus = ac.createGain();
    const mono = ac.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
    sh.connect(mono);
    const dL = ac.createDelay(0.1), dR = ac.createDelay(0.1); dL.delayTime.value = 0.004; dR.delayTime.value = 0.021;
    const pL = ac.createStereoPanner(), pR = ac.createStereoPanner(); pL.pan.value = -0.75; pR.pan.value = 0.75;
    const gL = ac.createGain(), gR = ac.createGain(); gL.gain.value = 0.62; gR.gain.value = 0.48;
    mono.connect(dL); dL.connect(gL); gL.connect(pL); pL.connect(bus);
    mono.connect(dR); dR.connect(gR); gR.connect(pR); pR.connect(bus);
    // keep a bit of the original stereo image too
    const st = ac.createGain(); st.gain.value = 0.25; sh.connect(st); st.connect(bus);
    // the room
    const conv = ac.createConvolver(); conv.buffer = roomIR(ac, 2.4);
    const wet = ac.createGain(); wet.gain.value = 0.42; sh.connect(conv); conv.connect(wet); wet.connect(bus);
    muffle = ac.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 18000; muffle.Q.value = 0.7;
    master = ac.createGain(); master.gain.value = 0;
    an = ac.createAnalyser(); an.fftSize = 256; data = new Uint8Array(an.frequencyBinCount);
    bus.connect(muffle); muffle.connect(master); master.connect(an); an.connect(ac.destination);
    built = true; return true;
  }
  function apply(fast) {
    if (!built) return; const ac = audioCtx(), t = ac.currentTime;
    master.gain.setTargetAtTime(enabled ? vol * duck * (outside ? 0.75 : 1) : 0, t, fast ? 0.05 : 0.25);
    muffle.frequency.setTargetAtTime(outside ? 520 : 18000, t, 0.25);
  }
  return {
    start() { wanted = true; if (!enabled) return; if (!build()) return; const p = el.play(); if (p && p.catch) p.catch(() => { }); apply(); },
    setEnabled(on) { enabled = on; if (on && wanted) this.start(); apply(true); },
    setVolume(v) { vol = v; apply(true); },
    duck(on) { duck = on ? 0.55 : 1; apply(); },
    outside(on) { outside = on; apply(); },
    level() {
      if (!built || !enabled) return 0;
      an.getByteFrequencyData(data); let s = 0; for (let i = 1; i < 6; i++) s += data[i];
      const v = Math.max(0, s / (5 * 255) - 0.35) / 0.65; lvl = Math.max(v, lvl * 0.86); return lvl;
    }
  };
})();
