// ============================================================
//  GAME
// ============================================================
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('nsq_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('nsq_' + k, JSON.stringify(v)); } catch (e) { } }
};
const CATS = { N: 'Nätverksgrunder', H: 'Hotbild', A: 'Säkerhetsarkitektur', F: 'Firewalls', Z: 'Zoner, regler & NAT', P: 'Säkerhetspolicy', B: 'Hostbrandväggar', L: 'Loggning & hardening', D: 'IDS', I: 'IPS', T: 'Integration & trender' };
const DIFFS = {
  easy: { n: 'EASY', coins: Infinity, maxWrong: 30, d: 'obegränsat med mynt, 30 fel' },
  medium: { n: 'MEDIUM', coins: 10, maxWrong: 20, d: '10 mynt, 20 fel' },
  hard: { n: 'HARD', coins: 5, maxWrong: 10, d: '5 mynt, 10 fel' },
  extreme: { n: 'EXTREME', coins: 1, maxWrong: 3, d: '1 mynt, 3 fel' }
};
const TOTAL = 50, TIME_MS = 60 * 60 * 1000, VISITOR_ODDS = 1 / 50, CAMEO_ODDS = 1 / 20;
const QUESTIONS = [];
function hashQ(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
function Q(c, q, a, w1, w2, w3, h, e, s) { QUESTIONS.push({ id: hashQ(q), c, q, opts: [a, w1, w2, w3], h, e, s }); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }
const pick = a => a[Math.random() * a.length | 0];
const pad = (n, l) => String(n).padStart(l || 2, '0');
const fmtT = s => pad(Math.floor(s / 60)) + ':' + pad(Math.floor(s % 60));

let SET = Object.assign({ diff: 'hard', sound: true, music: true, mvol: 0.55, ambi: true, avol: 0.5, crt: true, cam: true, name: '' }, LS.get('set', {}));
if (!DIFFS[SET.diff]) SET.diff = 'hard';
const saveSet = () => LS.set('set', SET);

// state shared with the 3D world
const A = window.GS = {
  lvl: 0, reactT: -9, nodT: -9, rick: 'idle', rickGrinT: -9, rickHover: false,
  btnT: [-9, -9, -9, -9], joyT: -9, joyDir: 0, glow: null, glowT: -9, marqT: -9,
  hideDoorman: false, charge: -1, outsideT0: 0, camOn: true, musicLevel: 0, screenOff: false, coinFly: null
};

// ---------- sound effects ----------
function tone(f, d, type, v, when, slide) {
  if (!SET.sound) return;
  const ac = audioCtx(); if (!ac) return;
  try {
    const t = ac.currentTime + (when || 0), o = ac.createOscillator(), ga = ac.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    ga.gain.setValueAtTime(v || 0.06, t); ga.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(ga).connect(ac.destination); o.start(t); o.stop(t + d + 0.03);
  } catch (e) { }
}
function noise(d, v, f0, f1, when) {
  if (!SET.sound) return;
  const ac = audioCtx(); if (!ac) return;
  try {
    const n = Math.floor(ac.sampleRate * d), b = ac.createBuffer(1, n, ac.sampleRate), x = b.getChannelData(0);
    for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
    const s = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime + (when || 0);
    s.buffer = b; bp.type = 'bandpass'; bp.Q.value = 0.8; bp.frequency.setValueAtTime(f0, t); bp.frequency.linearRampToValueAtTime(f1, t + d);
    g.gain.value = v; s.connect(bp).connect(g).connect(ac.destination); s.start(t);
  } catch (e) { }
}
const SFX = window.SFX = {
  ok() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.13, 'square', 0.06, i * 0.07)); },
  combo() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.12, 'square', 0.06, i * 0.06)); },
  bad() { tone(196, 0.25, 'sawtooth', 0.08, 0, -90); tone(98, 0.4, 'square', 0.07, 0.12, -40); },
  click() { tone(880, 0.04, 'square', 0.035); },
  coin() { tone(988, 0.07, 'square', 0.06); tone(1319, 0.32, 'square', 0.06, 0.07); },
  type() { tone(480 + Math.random() * 90, 0.02, 'square', 0.018); },
  tick() { tone(1250, 0.03, 'square', 0.04); },
  start() { [262, 330, 392, 523, 392, 523, 659].forEach((f, i) => tone(f, 0.11, 'square', 0.06, i * 0.09)); },
  stomp() { tone(70, 0.16, 'square', 0.12, 0, -30); },
  out() { tone(600, 0.9, 'sawtooth', 0.08, 0, -520); tone(60, 0.5, 'square', 0.12, 0.95, -20); tone(90, 0.3, 'sawtooth', 0.1, 1.0); noise(0.4, 0.5, 3000, 600, 1.0); },
  fan() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 6 ? 0.5 : 0.13, 'square', 0.06, i * 0.12)); },
  sad() { [392, 370, 349, 330].forEach((f, i) => tone(f, 0.28, 'triangle', 0.09, i * 0.26)); },
  laugh(k) { const n = 3 + Math.round(k * 3); for (let i = 0; i < n; i++) { tone(330 - i * 14 + Math.random() * 30, 0.09, 'square', 0.035 * (0.6 + k * 0.4), i * 0.13, -60); noise(0.08, 0.06 * k, 1400, 900, i * 0.13); } },
  cheer(k) { noise(0.9, 0.12 + 0.12 * k, 900, 2600); tone(1600, 0.35, 'sine', 0.03 * k, 0.15, 900); tone(1900, 0.3, 'sine', 0.025 * k, 0.35, 700); },
  visitor() { tone(660, 0.08, 'triangle', 0.05); tone(880, 0.12, 'triangle', 0.05, 0.09); },
  zap() { tone(1800, 0.08, 'sawtooth', 0.02, 0, -1200); },
  bump() { tone(990, 0.05, 'square', 0.025); tone(1320, 0.2, 'square', 0.025, 0.05); }
};

// ---------- game state ----------
const G = { mode: 'title', qs: [], i: 0, right: 0, wrong: 0, score: 0, streak: 0, best: 0, coins: 5, used: 0, diff: 'hard', maxWrong: 10, deadline: 0, t0: 0, answered: false, hint: false, order: [], log: [], last: null, wrongRun: 0, visitorAt: -1 };
let NOW = 0, dlgOpen = false, timerId = 0, lastTick = -1;
const mouse = { x: 0, y: 0, cx: -1, cy: -1 };

function view(v) { document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v)); }
function coinStr(n) { return n === Infinity ? '×∞' : '×' + n; }
const inGame = () => G.mode === 'play' || G.mode === 'cut';
const curMax = () => inGame() ? G.maxWrong : DIFFS[SET.diff].maxWrong;
function hud() {
  const max = curMax(), el = $('#anger');
  if (el.children.length !== max) el.innerHTML = '<i></i>'.repeat(max);
  el.style.setProperty('--cells', max);
  const w = inGame() ? G.wrong : 0;
  $('#h-wrong').textContent = w; $('#h-max').textContent = max;
  for (let i = 0; i < el.children.length; i++) { const k = i / max; el.children[i].className = i < w ? ('on' + (k >= 0.66 ? ' c' : k >= 0.33 ? ' b' : '')) : ''; }
  $('#mood').textContent = ['LUGN', 'IRRITERAD', 'SUR', 'ARG', 'RASANDE', 'EXPLOSIV'][A.lvl];
  $('#mood').style.color = ['#3dff8b', '#ffd23f', '#ffb347', '#ff9f1c', '#ff6b4a', '#ff4d5e'][A.lvl];
  $('#h-coins').textContent = coinStr(inGame() ? G.coins : DIFFS[SET.diff].coins);
  $('#h-diff').textContent = DIFFS[inGame() ? G.diff : SET.diff].n;
  $('#b-sound').textContent = SET.sound ? 'LJUD PÅ' : 'LJUD AV';
  $('#b-music').textContent = SET.music ? '♪ PÅ' : '♪ AV';
  $('#b-quit').style.display = G.mode === 'play' ? '' : 'none';
  document.body.classList.toggle('nocrt', !SET.crt);
  A.camOn = SET.cam;
  A.camFreeze = TS.on;
}

// ---------- question selection: random, unseen first, a few earlier misses ----------
function pickQuestions() {
  const st = LS.get('stat', {}), sh = shuffle(QUESTIONS.slice());
  const missed = sh.filter(q => st[q.id] && st[q.id].m).slice(0, 10);
  const rest = sh.filter(q => !missed.includes(q)).sort((a, b) => ((st[a.id] || {}).s || 0) - ((st[b.id] || {}).s || 0)).slice(0, TOTAL - missed.length);
  return shuffle(missed.concat(rest));
}

function startGame(force) {
  const D = DIFFS[SET.diff];
  Object.assign(G, { mode: 'play', qs: pickQuestions(), i: 0, right: 0, wrong: 0, score: 0, streak: 0, best: 0, diff: SET.diff, coins: D.coins, maxWrong: D.maxWrong, used: 0, log: [], wrongRun: 0, t0: Date.now(), deadline: Date.now() + TIME_MS });
  G.visitorAt = Math.random() < VISITOR_ODDS ? 3 + (Math.random() * 30 | 0) : -1;
  World.setCameos({ volt: Math.random() < CAMEO_ODDS || (force && force.volt), pelle: Math.random() < CAMEO_ODDS || (force && force.pelle) });
  A.lvl = 0; A.hideDoorman = false; A.marqT = NOW; A.charge = -1; A.screenOff = false; $('#screen').classList.remove('off');
  $('#q-prog').innerHTML = '<i></i>'.repeat(TOTAL);
  $('#confirm').classList.remove('on');
  clearInterval(timerId); timerId = setInterval(tick, 250); lastTick = -1;
  World.crowdEvent('reset', {});
  MUSIC.start();
  SFX.start(); view('quiz'); showQ(); tick();
  say('Välkommen. Sköt dig.', false);
}
function tick() {
  if (G.mode !== 'play') return;
  const rem = Math.max(0, G.deadline - Date.now()), s = Math.ceil(rem / 1000), el = $('#q-time');
  el.textContent = fmtT(s); el.classList.toggle('low', s <= 300);
  if (s <= 10 && s !== lastTick && s > 0) { SFX.tick(); lastTick = s; }
  if (rem <= 0) finish('time');
}
function showQ() {
  const q = G.qs[G.i]; G.answered = false; G.hint = false; G.order = shuffle([0, 1, 2, 3]);
  $('#q-no').textContent = 'FRÅGA ' + pad(G.i + 1) + '/' + TOTAL;
  $('#q-score').textContent = 'POÄNG ' + pad(G.score, 4);
  $('#q-cat').textContent = CATS[q.c].toUpperCase();
  const qt = $('#q-text'); qt.textContent = q.q; qt.className = q.q.length > 210 ? 'xl' : q.q.length > 115 ? 'long' : '';
  $('#q-ans').innerHTML = G.order.map((o, k) => `<button class="ans" data-k="${k}"><b>${'ABCD'[k]}</b><span>${esc(q.opts[o])}</span></button>`).join('');
  $('#q-hint').classList.remove('on'); $('#q-fb').classList.remove('on');
  const cells = $('#q-prog').children;
  for (let i = 0; i < TOTAL; i++) cells[i].className = i < G.log.length ? (G.log[i].ok ? 'ok' : 'no') : i === G.i ? 'cur' : '';
  $('#v-quiz').scrollTop = 0; hud();
  if (G.i === G.visitorAt) { G.visitorAt = -1; setTimeout(() => { if (G.mode === 'play' && World.startVisitor()) SFX.visitor(); }, 1500); }
}

// positions on the pixel fx canvas
function fxPos(el) { const r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2 - World.ox) / World.px, y: (r.top + r.height / 2 - World.oy) / World.px }; }
function fxAt(p) { return { x: (p.x - World.ox) / World.px, y: (p.y - World.oy) / World.px }; }

const LINES_LVL = [null, 'Hrm. Skärp dig.', 'Jag har ögonen på dig.', 'Du går mig på nerverna!', 'EN GÅNG TILL OCH...', 'SISTA VARNINGEN!!'];
const LINES_BAD = [['Mm.', 'Fel.', 'Nja...', 'Läs på.'], ['Igen?', 'Fel. Igen.', 'Tss.'], ['Skärpning!', 'Allvarligt?', 'Suck.'], ['FEL!', 'Vad håller du på med?!', 'Nej nej NEJ!'], ['GRRR!', 'JAG VARNAR DIG!', 'FEL IGEN?!'], ['RAAAH!', 'DU ÄR SÅ NÄRA NU!', 'EN TILL. BARA EN TILL!']];
let bubT = 0;
function say(txt, mad) {
  const b = $('#bubble'); b.firstElementChild.textContent = txt; b.classList.toggle('mad', !!mad); b.classList.add('on');
  clearTimeout(bubT); bubT = setTimeout(() => b.classList.remove('on'), 2600);
}
function fxClass(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function stamp(cls, big, small) { const s = $('#stamp'); s.className = ''; s.innerHTML = esc(big) + (small ? '<small>' + esc(small) + '</small>' : ''); void s.offsetWidth; s.className = cls; }
// doorman anger 0..5 scaled to the difficulty's limit
// slow start: the first mistakes barely register, then it escalates towards the limit
const angerLvl = (w, max) => w <= 0 ? 0 : Math.min(5, Math.floor(6 * Math.pow(w / max, 1.35)));

function answer(k) {
  if (G.mode !== 'play' || G.answered || dlgOpen) return;
  const q = G.qs[G.i], ok = G.order[k] === 0, btns = [...$('#q-ans').children];
  G.answered = true; A.btnT[k] = NOW; A.joyT = NOW; A.joyDir = k < 2 ? -1 : 1;
  const kc = G.order.indexOf(0);
  btns.forEach((b, i) => {
    b.disabled = true;
    if (i === kc) { b.classList.add('right'); b.insertAdjacentHTML('beforeend', '<i class="tag" style="font-style:normal;color:#3dff8b">RÄTT SVAR</i>'); }
    else if (i === k) { b.classList.add('wrong'); b.insertAdjacentHTML('beforeend', '<i class="tag" style="font-style:normal;color:#ff9aa2">DITT SVAR</i>'); }
    else b.classList.add('gone');
  });
  const tint = $('#tint'), scr = $('#screen'), pos = fxPos(btns[k]);
  let pts = 0;
  const prevStreak = G.streak;
  if (ok) {
    G.right++; G.streak++; G.wrongRun = 0; G.best = Math.max(G.best, G.streak);
    const bonus = Math.min(50, (G.streak - 1) * 10); pts = (G.hint ? 50 : 100) + bonus; G.score += pts;
    A.glow = '#3dff8b'; A.glowT = NOW; A.marqT = NOW; A.rickGrinT = NOW; if (A.lvl < 2) A.nodT = NOW;
    tint.style.background = '#3dff8b'; fxClass(tint, 'go'); fxClass(scr, 'pop');
    const big = G.streak >= 3 && G.streak % 5 === 0;
    if (big) { SFX.combo(); rain(34); burst(pos.x, pos.y, 30, 'good'); stamp('ok', G.streak + ' I RAD!', '+' + pts + ' POÄNG'); say(A.lvl >= 3 ? 'Hmpf. Tur för dig.' : 'Inte illa.', false); }
    else { SFX.ok(); burst(pos.x, pos.y, 26, 'good'); stamp('ok', pick(['RÄTT!', 'SNYGGT!', 'JAPP!', 'KLOCKRENT!', 'MITT I PRICK!']), '+' + pts + (bonus ? ' (SVIT ×' + G.streak + ')' : '')); }
    World.crowdEvent('right', { streak: G.streak });
  } else {
    G.wrong++; G.streak = 0; G.wrongRun++;
    const lv = angerLvl(G.wrong, G.maxWrong), up = lv > A.lvl; A.lvl = lv;
    A.glow = '#ff4d5e'; A.glowT = NOW; A.reactT = NOW;
    tint.style.background = '#ff4d5e'; fxClass(tint, 'go'); fxClass(scr, 'glitch'); World.shake(up || lv >= 3 ? 1 : 0.4);
    SFX.bad(); SFX.stomp(); burst(pos.x, pos.y, 16, 'bad'); stamp('no', pick(['FEL!', 'NIX!', 'AJ DÅ!', 'MISS!']), '');
    if (G.wrong >= G.maxWrong) say('NU RÄCKER DET!!!', true);
    else if (up) say(LINES_LVL[lv], lv >= 3);
    else if (Math.random() < 0.55) say(pick(LINES_BAD[lv]), lv >= 3);
    const recent = G.log.slice(-5).filter(l => !l.ok).length + 1;
    World.crowdEvent('wrong', { wrongRun: G.wrongRun, prevStreak, lvl: lv, recentWrong: recent });
  }
  G.log.push({ q, ok, chosen: q.opts[G.order[k]], hint: G.hint, pts });
  const st = LS.get('stat', {}), e = st[q.id] || { s: 0 }; e.s++; if (ok) delete e.m; else e.m = 1; st[q.id] = e; LS.set('stat', st);
  const v = $('#fb-verdict'); v.className = ok ? 'ok' : 'no'; v.textContent = ok ? '✔ RÄTT  +' + pts : '✘ FEL';
  $('#fb-expl').textContent = q.e; $('#fb-src').textContent = 'KÄLLA: ' + q.s + (G.hint ? ' · LEDTRÅD ANVÄND' : '');
  const last = G.i === TOTAL - 1, outNow = G.wrong >= G.maxWrong;
  $('#b-next').textContent = last ? 'SE RESULTAT ▶' : 'NÄSTA ▶'; $('#b-next').style.visibility = outNow ? 'hidden' : '';
  $('#q-fb').classList.add('on'); $('#q-score').textContent = 'POÄNG ' + pad(G.score, 4);
  const cells = $('#q-prog').children; cells[G.i].className = ok ? 'ok' : 'no';
  if (outNow) { G.mode = 'cut'; clearInterval(timerId); setTimeout(throwOut, 1900); }
  hud();
  setTimeout(() => { const vq = $('#v-quiz'); vq.scrollTop = vq.scrollHeight; }, 350);
}
function next() {
  if (G.mode !== 'play' || !G.answered) return;
  SFX.click();
  if (G.i >= TOTAL - 1) return finish('done');
  G.i++; showQ();
}

// ---------- thrown out ----------
function throwOut() {
  if (G.mode !== 'cut') return;
  closeDlg(true); hud();
  $('#screen').classList.add('off'); A.screenOff = true;
  World.crowdEvent('out', {});
  setTimeout(() => {
    if (G.mode !== 'cut') return;
    A.charge = NOW;
    for (let i = 0; i < 7; i++) setTimeout(() => { SFX.stomp(); World.shake(0.6 + i * 0.15); }, i * 200);
  }, 700);
  setTimeout(() => {
    if (G.mode !== 'cut') return;
    A.charge = -1; PARTS.length = 0; A.outsideT0 = NOW; World.outside(true); MUSIC.outside(true); AMBI.outside(true);
    document.body.classList.add('outside'); $('#out-ui').classList.remove('on');
    SFX.out();
    setTimeout(() => { if (World.isOutside()) { $('#out-ui').classList.add('on'); SFX.sad(); } }, 2300);
  }, 2250);
}
function backInside() {
  World.outside(false); MUSIC.outside(false); AMBI.outside(false); document.body.classList.remove('outside'); $('#out-ui').classList.remove('on');
  A.hideDoorman = false; A.lvl = 0; A.screenOff = false; $('#screen').classList.remove('off');
  World.flash('#ffffff', 0.8); World.crowdEvent('reset', {});
  finish('out'); say('En chans till. Men plugga först.', false);
}

// ---------- results ----------
function finish(reason) {
  clearInterval(timerId);
  const used = Math.min(TIME_MS, Date.now() - G.t0) / 1000;
  G.mode = 'over'; closeDlg(true);
  G.last = { score: G.score, right: G.right, wrong: G.wrong, n: G.log.length, diff: G.diff, maxWrong: G.maxWrong, coins: G.used, time: Math.round(used), reason, best: G.best, date: new Date().toISOString().slice(0, 10), saved: false };
  if (reason !== 'out') A.lvl = Math.min(A.lvl, 1);
  if (reason === 'done') { SFX.fan(); rain(50); A.marqT = NOW; } else if (reason === 'time') SFX.sad();
  renderResult(); view('result'); hud();
}
function shareText(L) {
  const pct = Math.round(L.right / TOTAL * 100), D = DIFFS[L.diff] || { n: '?' };
  const head = L.reason === 'out' ? `🚪 Utkastad av Mariams dörrvakt efter ${L.wrong} fel!` : L.reason === 'time' ? '⏰ Tiden tog slut!' : (pct >= 90 ? '🏆 Klarade hela testet!' : '✅ Klarade hela testet!');
  return [
    '🕹️ **Nätverkssäkerhet Arcade**',
    head,
    `> **${L.score} poäng** · ${L.right}/${TOTAL} rätt (${pct} %)`,
    `> Nivå: **${D.n}** · Tid: **${fmtT(L.time)}**`,
    `> Längsta svit: ${L.best}${L.best >= 10 ? ' 🔥' : ''} · Mynt till Rickard: ${L.coins}`,
    'Slå mig om du kan 😎'
  ].join('\n');
}
async function copyText(t) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) { }
  try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
function renderResult() {
  const L = G.last, pct = Math.round(L.right / TOTAL * 100);
  const head = { done: 'TESTET KLART!', time: 'TIDEN ÄR UTE!', out: 'UTKASTAD EFTER ' + L.wrong + ' FEL' }[L.reason];
  const per = {};
  G.log.forEach(l => { const p = per[l.q.c] || (per[l.q.c] = { r: 0, n: 0 }); p.n++; if (l.ok) p.r++; });
  const areas = Object.keys(CATS).filter(c => per[c]).map(c => { const p = per[c], k = p.r / p.n; return `<div class="area"><span>${CATS[c]}</span><div class="bar"><i class="${k < 0.5 ? 'low' : k < 0.75 ? 'mid' : ''}" style="width:${Math.round(k * 100)}%"></i></div><span>${p.r}/${p.n}</span></div>`; }).join('');
  const weak = Object.keys(per).filter(c => per[c].r / per[c].n < 0.6).sort((a, b) => per[a].r / per[a].n - per[b].r / per[b].n).slice(0, 3).map(c => CATS[c]);
  const miss = G.log.filter(l => !l.ok).map(l => `<div class="miss"><div class="q">${esc(l.q.q)}</div><div class="y">✘ Ditt svar: ${esc(l.chosen)}</div><div class="r">✔ Rätt svar: ${esc(l.q.opts[0])}</div><div class="e">${esc(l.q.e)}</div><div class="s">${esc(CATS[l.q.c].toUpperCase())} · KÄLLA ${esc(l.q.s)}</div></div>`).join('');
  $('#v-result').innerHTML = `
    <h2>${head}</h2>
    <div class="stats">
      <div><span>POÄNG</span>${L.score}</div><div><span>RÄTT AV 50</span>${L.right} (${pct}%)</div><div><span>FEL</span>${L.wrong}/${L.maxWrong}</div><div><span>TID</span>${fmtT(L.time)}</div>
      <div><span>NIVÅ</span>${DIFFS[L.diff].n}</div><div><span>MYNT ANVÄNDA</span>${L.coins}</div><div><span>LÄNGSTA SVIT</span>${L.best}</div><div><span>BESVARADE</span>${L.n}/50</div>
    </div>
    <div class="namerow" id="savebox">${saveBox(L)}</div>
    <div class="row"><button class="btn dc" id="b-share">DELA PÅ DISCORD</button><button class="btn yl" id="b-again">SPELA IGEN</button><button class="btn" id="b-scores2">HIGHSCORE</button><button class="btn mg" id="b-menu">MENY</button></div>
    <div id="sharebox"><pre id="share-pre">${esc(shareText(L))}</pre><div class="note" id="share-msg">Tryck DELA PÅ DISCORD och klistra in i klassens kanal med Ctrl+V.</div></div>
    <h3>RESULTAT PER OMRÅDE</h3>${areas || '<div class="note">Inga besvarade frågor.</div>'}
    ${weak.length ? `<div class="note" style="margin-top:8px;color:#ffd23f">Plugga extra på: ${weak.map(esc).join(', ')}.</div>` : ''}
    <h3>GÅ IGENOM DINA FEL (${L.wrong})</h3>${miss || '<div class="note">Inga fel. Dörrvakten är nästan imponerad.</div>'}
    <div class="note" style="margin:12px 0 4px">Frågor du missat kommer tillbaka i kommande rundor tills du svarar rätt.</div>`;
  $('#v-result').scrollTop = 0;
}
async function share() {
  const ok = await copyText(shareText(G.last));
  const m = $('#share-msg');
  if (ok) { m.textContent = 'KOPIERAT! Klistra in i Discord med Ctrl+V.'; m.style.color = '#3dff8b'; SFX.coin(); }
  else { m.textContent = 'Kunde inte kopiera automatiskt. Markera texten ovan och kopiera den.'; m.style.color = '#ffd23f'; const r = document.createRange(); r.selectNodeContents($('#share-pre')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
}
const byRank = (a, b) => b.score - a.score || b.right - a.right || a.time - b.time;
// De n bästa per nivå, så att ett nivåfilter aldrig blir tomt för att en annan nivå fyllt listan.
const topPerDiff = (list, n) => { const c = {}; return list.slice().sort(byRank).filter(s => (c[s.diff] = (c[s.diff] || 0) + 1) <= n); };
function saveBox(L) {
  if (!L.saved) return `<input id="name" maxlength="10" placeholder="DITT NAMN" value="${esc(SET.name)}"><button class="btn yl" id="b-save">SPARA I HIGHSCORE</button>`;
  const st = { sending: ['#2de2e6', 'SKICKAR TILL ONLINE-LISTAN…'], ok: ['#3dff8b', 'SKICKAT! SYNS FÖR ALLA OM EN MINUT'], fail: ['#ff4d5e', 'KOM INTE FRAM TILL ONLINE-LISTAN' + (L.onlineErr ? ': ' + L.onlineErr.toUpperCase() : '')] }[L.online];
  return '<span class="ps" style="font-size:13px;color:#3dff8b">SPARAT I HIGHSCORE SOM ' + esc(L.name) + '</span>' +
    (st ? `<span class="ps hs-st" style="color:${st[0]}">${esc(st[1])}</span>` + (L.online === 'fail' ? '<button class="btn sm" id="b-resend">FÖRSÖK IGEN</button>' : '') : '');
}
function saveScore() {
  const L = G.last; if (!L || L.saved) return;
  const name = cleanName($('#name').value) || 'ANONYM';
  SET.name = name; saveSet(); L.saved = true; L.name = name; L.ts = Date.now(); L.id = hsId();
  const sc = LS.get('scores', []); sc.push(L);
  LS.set('scores', topPerDiff(sc, 10)); SFX.coin();
  hsSend(L);
  renderResult(); openScores(L.ts);
}
function openScores(hl) {
  renderScores(hl); view('scores');
  if (HS_API) hsLoad().then(() => { if ($('#v-scores').classList.contains('on')) renderScores(hl); });
}
function renderScores(hl) {
  const me = G.last && G.last.saved && G.last.ts === hl ? G.last : null;
  const online = !!HS_API && HS.tab === 'online';
  const byDiff = s => HS.diff === 'all' || s.diff === HS.diff, dn = HS.diff === 'all' ? '' : DIFFS[HS.diff].n;
  let sc, msg = '';
  if (online) {
    const ids = new Set((HS.list || []).map(s => s.id));
    sc = (HS.list || []).concat(LS.get('pending', []).filter(p => !ids.has(p.id))).filter(byDiff).sort(byRank).slice(0, 50);
    if (HS.state === 'error') msg = HS.list ? 'Kunde inte uppdatera listan just nu.' : 'Kunde inte hämta online-listan. Försök igen om en stund.';
    else if (!HS.list) msg = 'LADDAR…';
  } else sc = LS.get('scores', []).filter(byDiff).sort(byRank).slice(0, 10);
  const isMe = s => me && (online ? s.id === me.id : s.ts === me.ts);
  const rows = sc.map((s, i) => `<tr class="${isMe(s) ? 'me' : ''}"><td>${i + 1}</td><td class="n">${esc(s.name)}${s.reason === 'out' ? ' <span style="color:#ff4d5e" title="Utkastad">✘</span>' : ''}${s.pending ? ' <span style="color:#2de2e6" title="Skickat, syns snart för alla">…</span>' : ''}</td><td>${s.score}</td><td>${s.right}/50</td><td>${DIFFS[s.diff] ? DIFFS[s.diff].n : '?'}</td><td>${s.coins}</td><td>${fmtT(s.time)}</td><td>${esc(s.date)}</td></tr>`).join('');
  const tabs = HS_API ? `<div class="row hs-tabs"><button class="btn sm${online ? ' yl on' : ''}" data-hs="online">ONLINE</button><button class="btn sm${online ? '' : ' yl on'}" data-hs="local">DEN HÄR DATORN</button></div>` : '';
  const filt = `<div class="row hs-tabs">` + ['all', ...Object.keys(DIFFS)].map(d => `<button class="btn sm${HS.diff === d ? ' yl on' : ''}" data-hsd="${d}">${d === 'all' ? 'ALLA NIVÅER' : DIFFS[d].n}</button>`).join('') + `</div>`;
  const empty = (online && msg) || (dn ? `Inga resultat på ${dn} än. Bli först!` : online ? 'Inga resultat online än. Bli först på listan!' : 'Inga resultat än. Bli först på listan!');
  const note = 'MYNT = antal mynt som gick till Rickard. ✘ = utkastad av dörrvakten.' + (online ? ' … = skickat, syns snart för alla. Listan visar topp 50 från alla spelare.' : ' Bara resultat från den här webbläsaren.');
  $('#v-scores').innerHTML = `<h2>HIGHSCORE</h2>` + tabs + filt + (sc.length ? `<table><tr><th>#</th><th>NAMN</th><th>POÄNG</th><th>RÄTT</th><th>NIVÅ</th><th>MYNT</th><th>TID</th><th>DATUM</th></tr>${rows}</table>${msg && msg !== 'LADDAR…' ? `<div class="note" style="margin-top:8px;color:#ffd23f">${msg}</div>` : ''}<div class="note" style="margin-top:8px">${note}</div>` : `<div class="empty">${empty}</div>`) +
    `<div class="row"><button class="btn yl" id="b-again">${G.mode === 'over' ? 'SPELA IGEN' : 'STARTA SPELET'}</button>${G.mode === 'over' ? '<button class="btn" id="b-res">MITT RESULTAT</button>' : ''}<button class="btn mg" id="b-menu">MENY</button></div>`;
}

// ---------- online highscore ----------
// Resultat skickas till en Cloudflare-worker (worker/ i repot), som låter en GitHub Action
// lägga till dem i scores.json på grenen "highscores". Listan hämtas från samma worker.
// Tom adress = bara lokal highscore, som förut.
const HS_API = 'https://natverkssakerhet-arcade-highscore.joarfogler.workers.dev';
const HS = { list: null, state: 'idle', tab: 'online', diff: 'all' };
const hsId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
function hsLoad() {
  if (!HS_API) return Promise.resolve(null);
  if (HS.busy) return HS.busy;
  HS.state = 'loading';
  return HS.busy = fetch(HS_API + '/scores', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(list => { HS.list = Array.isArray(list) ? list : []; HS.state = 'ok'; hsPrune(); hsResend(); })
    .catch(() => { HS.state = 'error'; })
    .then(() => { HS.busy = null; return HS.list; });
}
// Egna skickade resultat visas direkt (med …) tills GitHub Action har lagt in dem i listan.
function hsPrune() {
  const ids = new Set((HS.list || []).map(s => s.id));
  LS.set('pending', LS.get('pending', []).filter(p => !ids.has(p.id) && Date.now() - p.sent < 15 * 60e3));
}
// Samma regel som highscore/validate.mjs: inga osynliga tecken, högst 10 tecken (inte UTF-16-enheter).
const cleanName = s => Array.from(String(s).replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]/gu, '').trim().toUpperCase()).slice(0, 10).join('').trim();
// Resultat som sparats lokalt men aldrig kom fram (t.ex. stoppade av en äldre namnregel eller
// för många försök från samma nätverk) skickas om en gång när online-listan har hämtats.
function hsResend() {
  if (!HS_API || /#t=/.test(location.hash) || !HS.list) return;
  const have = new Set(HS.list.map(s => s.id).concat(LS.get('pending', []).map(p => p.id)));
  const done = new Set(LS.get('resent', []));
  const todo = LS.get('scores', []).filter(s => s.id && !have.has(s.id) && !done.has(s.id) && Date.now() - (s.ts || 0) < 14 * 864e5 && !(G.last && G.last.id === s.id));
  todo.slice(0, 5).forEach((s, i) => setTimeout(() => {
    LS.set('resent', LS.get('resent', []).concat(s.id).slice(-200));
    const body = hsBody(Object.assign({}, s, { name: cleanName(s.name) || 'ANONYM' }));
    hsPost(body)
      .then(() => { const p = LS.get('pending', []); p.push(Object.assign({}, body, { date: s.date, sent: Date.now(), pending: true })); LS.set('pending', p); })
      .catch(() => { });
  }, 2000 + i * 3000));
}
const hsBody = L => ({ id: L.id, name: L.name, score: L.score, right: L.right, wrong: L.wrong, diff: L.diff, coins: L.coins, time: L.time, reason: L.reason, best: L.best });
// POST med nya försök när workern svarar 429 (många på samma nätverk sparar samtidigt).
function hsPost(body, tries = 4) {
  return fetch(HS_API + '/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json().catch(() => ({})).then(j => {
      if (r.status === 429 && tries > 1) return new Promise(res => setTimeout(res, 15000 + Math.random() * 20000)).then(() => hsPost(body, tries - 1));
      if (!r.ok) throw new Error(j.error || 'fel ' + r.status);
    }));
}
function hsSend(L) {
  if (!HS_API || /#t=/.test(location.hash)) return;   // testlägen skickar aldrig
  const body = hsBody(L);
  const show = () => { const b = $('#savebox'); if (b && G.last === L) b.innerHTML = saveBox(L); };
  L.online = 'sending'; L.onlineErr = ''; show();
  hsPost(body)
    .then(() => {
      L.online = 'ok';
      const p = LS.get('pending', []); p.push(Object.assign({}, body, { date: L.date, sent: Date.now(), pending: true })); LS.set('pending', p);
      if ($('#v-scores').classList.contains('on')) renderScores(L.ts);
    })
    .catch(e => { L.online = 'fail'; L.onlineErr = e instanceof TypeError ? 'ingen anslutning' : String(e.message || e); })
    .then(show);
}
// ---------- title screen: animated pixel logo, arcade menu, score ticker ----------
const LG = { c: null, x: null, mask: null, sel: 0 };
function logoText(str, s, top, bot, mid) {
  const P = SPR, w = P.pxW(str, s), h = 5 * s, pad = 2 * s + 2, m = P.mk(w + 8, h + pad + 4);
  P.pxText(m.x, str, 0, pad, '#fff', s);
  const g = m.x.createLinearGradient(0, pad, 0, pad + h);
  g.addColorStop(0, top); g.addColorStop(0.48, mid || top); g.addColorStop(0.52, bot); g.addColorStop(1, bot);
  m.x.globalCompositeOperation = 'source-in'; m.x.fillStyle = g; m.x.fillRect(0, 0, m.w, m.h); m.x.globalCompositeOperation = 'source-over';
  const sh = P.mk(m.w, m.h); P.pxText(sh.x, str, 0, pad, '#fff', s);
  return { m, sh, w, pad };
}
function drawLogo(t) {
  if (!LG.c) {
    LG.c = $('#logo'); LG.x = LG.c.getContext('2d'); LG.x.imageSmoothingEnabled = false;
    LG.t1 = logoText('NÄTVERKS', 5, '#ffffff', '#1a7fd6', '#9ff0ff'); LG.t2 = logoText('SÄKERHET', 5, '#ffe7a0', '#d0206a', '#ffb347');
    LG.stars = Array.from({ length: 50 }, () => [Math.random() * 290, Math.random() * 90, Math.random() * 6]);
  }
  const x = LG.x, W = 290, H = 168, hz = 104;
  // sky + stars
  const sky = x.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#06030f'); sky.addColorStop(0.55, '#1d0b3a'); sky.addColorStop(1, '#5a1450');
  x.fillStyle = sky; x.fillRect(0, 0, W, hz);
  for (const s0 of LG.stars) if (Math.sin(t * 2 + s0[2]) > -0.5) { x.fillStyle = s0[2] > 5 ? '#fff' : '#8a7ac0'; x.fillRect(s0[0] | 0, s0[1] | 0, 1, 1); }
  // striped synthwave sun
  const sx = 145, sy = hz + 2, R = 50;
  for (let y = -R; y < 6; y++) {
    const yy = sy + y; if (yy >= hz) break;
    const w = Math.round(Math.sqrt(Math.max(0, R * R - y * y)));
    const gap = y > -26 && ((y + Math.floor(t * 6)) % 8 + 8) % 8 < Math.max(1, Math.round((y + 26) / 7));
    if (gap) continue;
    const k = (y + R) / (R + 6); x.fillStyle = `rgb(${255},${Math.round(220 - k * 170)},${Math.round(90 + k * 60)})`; x.fillRect(sx - w, yy, w * 2, 1);
  }
  // perspective grid floor
  x.fillStyle = '#0a0418'; x.fillRect(0, hz, W, H - hz);
  x.fillStyle = '#ff3caa'; x.fillRect(0, hz, W, 1);
  const off = (t * 0.9) % 1;
  for (let i = 0; i < 9; i++) { const z = (i + off) / 9, y = hz + Math.round(Math.pow(z, 2.2) * (H - hz)); x.fillStyle = `rgba(45,226,230,${0.25 + z * 0.6})`; x.fillRect(0, y, W, 1); }
  for (let i = -14; i <= 14; i++) { for (let y = hz; y < H; y += 1) { const k = (y - hz) / (H - hz), xx = Math.round(sx + i * (6 + k * 34)); if (xx >= 0 && xx < W && (y & 1)) { x.fillStyle = `rgba(45,226,230,${0.2 + k * 0.6})`; x.fillRect(xx, y, 1, 1); } } }
  // logo words: extruded shadow, chrome fill, moving shine
  const word = (T, y0) => {
    const x0 = (W - T.w) >> 1;
    for (let d = 5; d >= 1; d--) { x.drawImage(tintC(T.sh, d > 3 ? '#1a0630' : '#4a0f5a'), x0 + d, y0 + d); }
    x.drawImage(T.m.c, x0, y0);
    const sw = ((t * 70) % (W + 120)) - 60;
    const sh = SPR.mk(T.m.w, T.m.h); sh.x.drawImage(T.m.c, 0, 0); sh.x.globalCompositeOperation = 'source-atop'; sh.x.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 6; i++) sh.x.fillRect(sw - x0 + i - (i * 2), 0, 2, T.m.h);
    x.drawImage(sh.c, x0, y0);
  };
  const bob = Math.round(Math.sin(t * 1.6) * 1.5);
  word(LG.t1, 1 + bob); word(LG.t2, 38 + bob);
  // shield emblem with keyhole on both sides
  for (const ex of [26, 264]) {
    const ey = 26 + bob, S = ['0111111110', '1222222221', '1222332221', '1223333221', '1222332221', '1222332221', '0122222210', '0012222100', '0001221000', '0000110000'];
    for (let r = 0; r < 10; r++) for (let c2 = 0; c2 < 10; c2++) { const v = S[r][c2]; if (v === '0') continue; x.fillStyle = v === '1' ? '#ffd23f' : v === '2' ? (r < 4 ? '#2de2e6' : '#1a7fd6') : '#0a0418'; x.fillRect(ex - 15 + c2 * 3, ey + r * 3, 3, 3); }
  }
  // subtitle
  const sub = 'TENTA ARCADE', sw2 = SPR.pxW(sub, 2), sx2 = (W - sw2) >> 1;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 2]]) SPR.pxText(x, sub, sx2 + dx, 86 + bob + dy, '#2a0618', 2);
  SPR.pxText(x, sub, sx2, 86 + bob, (Math.floor(t * 2) & 1) ? '#ffd23f' : '#ffe680', 2);
}
const TINT = new Map();
function tintC(sp, col) { const k = col + sp.w + 'x' + sp.h + (sp._id || (sp._id = Math.random())); if (TINT.has(k)) return TINT.get(k); const o = SPR.mk(sp.w, sp.h); o.x.drawImage(sp.c, 0, 0); o.x.globalCompositeOperation = 'source-in'; o.x.fillStyle = col; o.x.fillRect(0, 0, o.w, o.h); TINT.set(k, o.c); return o.c; }
function titleSel(i) { const it = [...document.querySelectorAll('.titem')]; LG.sel = (i + it.length) % it.length; it.forEach((e, j) => e.classList.toggle('sel', j === LG.sel)); }
function fillTicker() {
  const on = HS.list && HS.list.length, sc = on ? HS.list : LS.get('scores', []);
  const parts = sc.length ? sc.slice(0, 10).map((s, i) => `${i + 1}. ${s.name} ${s.score} (${DIFFS[s.diff] ? DIFFS[s.diff].n : '?'})`) : ['INGA REKORD ÄN', 'BLI FÖRST PÅ LISTAN'];
  $('#ticker-in').textContent = (on ? '★ HIGHSCORE ONLINE ★   ' : '★ HIGHSCORE ★   ') + parts.join('   ·   ') + '   ★ PLUGGA SMART ★   FIREWALL · IDS · IPS · NAT · ZERO TRUST · SIEM · SOAR';
}

// ---------- tutorial (first visit, and from the menu) ----------
const TUT = [
  { h: 'VÄLKOMMEN TILL ARKADHALLEN', t: 'Det här är ett pluggspel inför tentan i Nätverkssäkerhet. Varje runda är <b>50 slumpade frågor</b> av 300, och du har <b>60 minuter</b>. Allt bygger på kursens faktaunderlag.', at: null },
  { h: 'SVARA PÅ FRÅGORNA', t: 'Klicka på ett svar, tryck <b>1–4</b> eller <b>A–D</b>, eller flytta med <b>piltangenterna</b> och tryck <b>Enter</b>. Svaret går inte att ändra. Du får direkt rätt svar, en förklaring och vilken kursbild det kommer från.', at: 'el:#screen' },
  { h: 'MARIAMS DÖRRVAKT', t: 'Dörrvakten blir argare för varje fel, och mätaren här visar hur nära gränsen du är. Når du gränsen blir du <b>utkastad</b>: Easy 30 fel, Medium 20, Hard 10 och Extreme 3.', at: 'el:#hud-l', at2: 'w:doorman' },
  { h: 'RICKARD SÄLJER LEDTRÅDAR', t: 'Kört fast? Klicka på <b>Rickard</b> eller tryck <b>H</b>. En ledtråd kostar ett mynt. Easy har obegränsat, Medium 10, Hard 5 och Extreme 1. Rätt svar med ledtråd ger 50 poäng i stället för 100.', at: 'w:rickard' },
  { h: 'PUBLIKEN TITTAR', t: 'Folk i hallen märker hur det går. En <b>svit</b> rätta svar ger bonuspoäng och en publik som samlas och hejar. Svarar du fel börjar de peka och skratta. Ibland dyker det upp oväntat besök...', at: null },
  { h: 'TITTA RUNT', t: 'För musen utanför skärmen för att <b>se dig omkring</b>, och skärpan följer det du tittar på. Över skärmen står kameran still så att det är lätt att läsa.', at: null },
  { h: 'EFTER RUNDAN', t: 'Du får resultat per område och en genomgång av <b>alla dina fel</b>. Spara i highscore och <b>dela resultatet på Discord</b>. Frågor du missat kommer tillbaka i senare rundor tills du kan dem. Lycka till!', at: null }
];
const TS = { on: false, i: 0 };
function openTut() { if (G.mode !== 'title' && G.mode !== 'over') return; closeDlg(true); TS.on = true; TS.i = 0; A.camFreeze = true; $('#tut').classList.add('on'); showTut(); SFX.click(); }
function closeTut() { TS.on = false; A.camFreeze = false; $('#tut').classList.remove('on'); LS.set('tut', true); SFX.click(); }
function showTut() {
  const st = TUT[TS.i];
  $('#tut-n').textContent = 'STEG ' + (TS.i + 1) + ' AV ' + TUT.length;
  $('#tut-h').textContent = st.h; $('#tut-t').innerHTML = st.t;
  $('#tut-prev').style.visibility = TS.i ? '' : 'hidden';
  $('#tut-next').textContent = TS.i === TUT.length - 1 ? 'KÖR IGÅNG ▶' : 'NÄSTA ▶';
  placeTut();
}
function tutRect(at) {
  if (!at) return null;
  if (at.startsWith('el:')) { const r = $(at.slice(3)).getBoundingClientRect(); return { l: r.left - 10, t: r.top - 10, w: r.width + 20, h: r.height + 20 }; }
  const p = World.headPos(at.slice(2)); const k = World.px || 3; const w = 70 * k, h = 130 * k;
  return { l: p.x - w / 2, t: p.y - 20 * k, w, h };
}
function placeTut() {
  if (!TS.on) return;
  const st = TUT[TS.i], spot = $('#tut-spot'), box = $('#tut-box');
  let r = tutRect(st.at);
  if (r && st.at2) { const r2 = tutRect(st.at2); const l = Math.min(r.l, r2.l), t = Math.min(r.t, r2.t); r = { l, t, w: Math.max(r.l + r.w, r2.l + r2.w) - l, h: Math.max(r.t + r.h, r2.t + r2.h) - t }; }
  if (!r) { spot.classList.add('none'); box.className = 'bottom'; return; }
  spot.classList.remove('none');
  Object.assign(spot.style, { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px' });
  box.className = (r.t + r.h / 2) > innerHeight * 0.55 ? 'top' : 'bottom';
}

// ---------- difficulty picker (shown at the start of every round) ----------
const DIFF_TXT = { easy: 'Obegränsat med mynt · utkastad vid 30 fel', medium: '10 mynt · utkastad vid 20 fel', hard: '5 mynt · utkastad vid 10 fel', extreme: '1 mynt · utkastad vid 3 fel' };
function showDiff() {
  if (G.mode === 'play') return;
  G.mode = 'pick'; closeDlg(true);
  $('#diffs').innerHTML = Object.keys(DIFFS).map((k, i) => `<button class="dcard ${k}${SET.diff === k ? ' last' : ''}" data-pick="${k}"><span class="dn">${i + 1}. ${DIFFS[k].n}</span><span class="dd">${DIFF_TXT[k]}</span>${SET.diff === k ? '<span class="dk">SENAST VALD</span>' : ''}</button>`).join('');
  SFX.click(); view('diff'); hud();
  kbClear(); const last = document.querySelector('.dcard.last'); if (last) { KB.el = last; last.classList.add('kb'); }
}
function pickDiff(k) { if (!DIFFS[k]) return; SET.diff = k; saveSet(); startGame(); }
function renderSettings() {
  const tg = (k, on, off) => `<button class="btn sm ${SET[k] ? 'sel' : ''}" data-tg="${k}">${SET[k] ? on : off}</button>`;
  const vol = Math.round(SET.mvol * 10), avol = Math.round(SET.avol * 10);
  $('#v-settings').innerHTML = `<h2>INSTÄLLNINGAR</h2>
    <div class="note">Svårighetsgraden väljer du när du startar en runda. Rätt svar med ledtråd ger 50 poäng i stället för 100.</div>
    <div class="setrow"><span>Musik</span><div class="opts">${tg('music', 'PÅ', 'AV')}<button class="btn sm" data-vol="-1">−</button><span class="ps vol">${'■'.repeat(vol)}${'□'.repeat(10 - vol)}</span><button class="btn sm" data-vol="1">+</button></div></div>
    <div class="setrow"><span>Miljöljud (maskiner, prat)</span><div class="opts">${tg('ambi', 'PÅ', 'AV')}<button class="btn sm" data-avol="-1">−</button><span class="ps vol">${'■'.repeat(avol)}${'□'.repeat(10 - avol)}</span><button class="btn sm" data-avol="1">+</button></div></div>
    <div class="setrow"><span>Ljudeffekter</span><div class="opts">${tg('sound', 'PÅ', 'AV')}</div></div>
    <div class="setrow"><span>CRT-effekt (scanlines)</span><div class="opts">${tg('crt', 'PÅ', 'AV')}</div></div>
    <div class="setrow"><span>Kamerarörelse</span><div class="opts">${tg('cam', 'PÅ', 'AV')}</div></div>
    <div class="setrow"><span>Nollställ</span><div class="opts"><button class="btn sm mg" data-reset="scores">HIGHSCORE</button><button class="btn sm mg" data-reset="stat">FRÅGESTATISTIK</button></div></div>
    <div class="note">Piltangenter flyttar markeringen och Enter väljer, överallt. 1–4 eller A–D svarar direkt · H pratar med Rickard · M ljud (effekter, maskiner, prat) · N musik.</div>
    <div class="row"><button class="btn yl" id="b-menu">KLAR</button></div>`;
}
function toTitle() { fillTicker(); titleSel(0); G.mode = 'title'; clearInterval(timerId); A.lvl = 0; A.screenOff = false; $('#screen').classList.remove('off'); World.crowdEvent('reset', {}); view('title'); hud(); }

// ---------- Rickard ----------
const R_ASK = ['Tjena. Kört fast? Jag kan viska något... för ett mynt.', 'Den där var klurig, va? Ett mynt, så får du en ledtråd.', 'Information kostar, kompis. Ett mynt.', 'Jag har stått vid den här maskinen i tjugo år. Ett mynt, så delar jag med mig.', 'Jag ser att du svettas. Ett mynt löser det.'];
const R_PAID = ['Snyggt. Lyssna noga nu:', 'Affär är affär. Så här ligger det till:', 'Tack. Håll i dig:', 'Klokt val. Här kommer det:'];
let typeT = 0, dlgFull = '', dlgChoices = [], dlgTyping = false;
function dlgSay(text, choices) {
  dlgFull = text; dlgChoices = choices; dlgTyping = true;
  const el = $('#dlg-text'), ch = $('#dlg-ch'); el.textContent = ''; ch.innerHTML = '';
  let i = 0; clearInterval(typeT);
  typeT = setInterval(() => { i += 2; el.textContent = dlgFull.slice(0, i); if (i % 4 === 0) SFX.type(); if (i >= dlgFull.length) dlgDone(); }, 28);
}
function dlgDone() {
  clearInterval(typeT); dlgTyping = false; $('#dlg-text').textContent = dlgFull;
  $('#dlg-ch').innerHTML = dlgChoices.map((c, i) => `<button class="btn ${c.cls || ''}" data-c="${i}">${i + 1}. ${esc(c.t)}</button>`).join('');
  kbClear(); kbMove(1);   // first choice highlighted, arrows move, Enter picks
}
function closeDlg(silent) {
  if (!dlgOpen) return; dlgOpen = false; clearInterval(typeT);
  $('#dlg').classList.remove('on'); $('#dim').classList.remove('on'); document.body.classList.remove('talking');
  World.setFocus('screen'); MUSIC.duck(false); A.rick = 'idle'; hud(); if (!silent) SFX.click();
}
function talk() {
  if (dlgOpen || G.mode === 'cut' || World.isOutside()) return;
  dlgOpen = true; $('#dlg').classList.add('on'); $('#dim').classList.add('on'); document.body.classList.add('talking');
  World.setFocus('rickard'); MUSIC.duck(true); SFX.click(); hud();
  const bye = [{ t: 'OKEJ', fn: closeDlg }];
  if (G.mode === 'title' || G.mode === 'pick') { A.rick = 'idle'; return dlgSay('Rickard heter jag. Välj nivå och kör igång, så står jag här om du kör fast. En ledtråd kostar ett mynt.', bye); }
  if (G.mode === 'over') { A.rick = 'idle'; return dlgSay(G.last && G.last.reason === 'out' ? 'Dörrvakten har kort stubin. Läs igenom dina fel och kör en runda till.' : 'Bra kämpat. Kolla igenom felen och ta en runda till, så sitter det på tentan.', bye); }
  if (G.mode !== 'play') { A.rick = 'idle'; return dlgSay('Ledtrådar säljer jag bara under en runda, kompis.', bye); }
  const q = G.qs[G.i];
  if (G.answered) { A.rick = 'idle'; return dlgSay('Den frågan är redan körd, kompis. Ta nästa, så snackar vi.', bye); }
  if (G.hint) { A.rick = 'paid'; return dlgSay('Som jag sa: ' + q.h, [{ t: 'TACK', fn: closeDlg, cls: 'yl' }]); }
  if (G.coins <= 0) { A.rick = 'ask'; return dlgSay('Tomma fickor? Då får du klara dig själv. Inga mynt, ingen ledtråd.', [{ t: 'ATTANS', fn: closeDlg }]); }
  A.rick = 'ask';
  dlgSay(G.coins === 1 ? 'Ditt sista mynt, va? Ge hit det, så får du en ledtråd som är värd det.' : pick(R_ASK), [
    { t: 'GE ETT MYNT (' + (G.coins === Infinity ? '∞' : G.coins) + ' KVAR)', cls: 'yl', fn: payRick },
    { t: 'NEJ TACK', fn: () => { A.rick = 'idle'; dlgSay(pick(['Lugnt. Jag står kvar här.', 'Som du vill. Lycka till.', 'Modigt. Vi får se hur det går.']), [{ t: 'OKEJ', fn: closeDlg }]); } }
  ]);
}
function payRick() {
  if (G.mode !== 'play' || G.answered || G.hint || G.coins <= 0) return closeDlg();
  const q = G.qs[G.i];
  if (G.coins !== Infinity) G.coins--; G.used++; G.hint = true;
  const from = fxPos($('#coins')), to = fxAt(World.headPos('hand'));
  A.coinFly = { t0: NOW, x0: from.x, y0: from.y, x1: to.x, y1: to.y }; SFX.coin(); fxClass($('#coins'), 'pulse');
  setTimeout(() => { A.rick = 'paid'; A.rickGrinT = NOW; }, 550);
  $('#q-hint-t').textContent = q.h; $('#q-hint').classList.add('on'); hud();
  dlgSay(pick(R_PAID) + ' ' + q.h, [{ t: 'TACK, RICKARD', fn: closeDlg, cls: 'yl' }]);
}

// ---------- fx layer (pixel particles drawn over everything) ----------
const fxC = document.getElementById('fx'), fx = fxC.getContext('2d');
const PARTS = [];
function burst(x, y, n, kind) {
  const cols = kind === 'bad' ? ['#ff4d5e', '#ff9aa2', '#7a1020'] : ['#ffd23f', '#3dff8b', '#2de2e6', '#ff3caa', '#fff'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 150;
    PARTS.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'bad' ? 0 : 70), g: kind === 'bad' ? 260 : 210, life: 0.7 + Math.random() * 0.8, age: 0, col: cols[i % cols.length], s: 2 + (Math.random() * 3 | 0), kind: kind === 'bad' ? 'sq' : (i % 3 ? 'star' : 'sq') });
  }
}
function rain(n) {
  const r = $('#screen').getBoundingClientRect(), c = fxAt({ x: r.left + r.width / 2, y: r.top });
  for (let i = 0; i < n; i++) PARTS.push({ x: c.x + (Math.random() - 0.5) * r.width / World.px, y: c.y - Math.random() * 60, vx: (Math.random() - 0.5) * 20, vy: 60 + Math.random() * 90, g: 120, life: 1.8, age: -Math.random() * 0.5, col: '#ffd23f', s: 4, kind: 'coin' });
}
function drawFx(t, dt) {
  if (fxC.width !== World.iw || fxC.height !== World.ih) { fxC.width = World.iw; fxC.height = World.ih; fx.imageSmoothingEnabled = false; }
  fxC.style.left = World.ox + 'px'; fxC.style.top = World.oy + 'px'; fxC.style.width = World.iw * World.px + 'px'; fxC.style.height = World.ih * World.px + 'px';
  fx.clearRect(0, 0, fxC.width, fxC.height);
  for (let i = PARTS.length - 1; i >= 0; i--) {
    const p = PARTS[i]; p.age += dt; if (p.age < 0) continue;
    if (p.age > p.life) { PARTS.splice(i, 1); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const x = p.x | 0, y = p.y | 0; fx.globalAlpha = Math.min(1, (p.life - p.age) * 3);
    if (p.kind === 'star') { fx.fillStyle = p.col; fx.fillRect(x - p.s, y, p.s * 2 + 1, 1); fx.fillRect(x, y - p.s, 1, p.s * 2 + 1); fx.fillRect(x - 1, y - 1, 3, 3); }
    else if (p.kind === 'coin') { const w = Math.max(1, Math.round(Math.abs(Math.cos(p.age * 9 + p.x)) * 6)); fx.fillStyle = '#b97f00'; fx.fillRect(x - (w >> 1), y, w, 7); fx.fillStyle = '#ffd23f'; fx.fillRect(x - (w >> 1), y + 1, Math.max(1, w - 1), 5); }
    else { fx.fillStyle = p.col; fx.fillRect(x, y, p.s, p.s); }
  }
  fx.globalAlpha = 1;
  if (A.coinFly) {
    const c = A.coinFly, u = Math.min(1, (t - c.t0) / 0.6), x = c.x0 + (c.x1 - c.x0) * u, y = c.y0 + (c.y1 - c.y0) * u - Math.sin(u * Math.PI) * 50;
    const w = Math.max(1, Math.round(Math.abs(Math.cos(u * 14)) * 8));
    fx.fillStyle = '#b97f00'; fx.fillRect((x - w / 2) | 0, y | 0, w, 9); fx.fillStyle = '#ffd23f'; fx.fillRect((x - w / 2) | 0, (y + 1) | 0, Math.max(1, w - 1), 7);
    if (u >= 1) { A.coinFly = null; burst(c.x1, c.y1, 10, 'good'); }
  }
}

// ---------- map the DOM screen onto the 3D cabinet ----------
const SCR_W = 870, SCR_H = 600;
// the DOM screen follows the 3D cabinet; only updated when a corner really moved
let lastCorners = null, SCR_RECT = null;
function placeScreen() {
  const c = World.screenCorners(), el = $('#screen');
  if (!c.every(p => p.vis)) { el.style.visibility = 'hidden'; lastCorners = null; return; }
  el.style.visibility = '';
  const d = [c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y].map(v => Math.round(v * 4) / 4);
  if (lastCorners && d.every((v, i) => Math.abs(v - lastCorners[i]) < 0.3)) return;
  lastCorners = d;
  if (World.lookAway() < 0.005) SCR_RECT = { left: Math.min(d[0], d[4]), right: Math.max(d[2], d[6]), top: Math.min(d[1], d[3]), bottom: Math.max(d[5], d[7]) };
  // head-on the screen is (almost) a rectangle: a flat 2D transform avoids Firefox's text-culling bugs with perspective
  const a2 = ((d[2] - d[0]) + (d[6] - d[4])) / 2 / SCR_W, b2 = ((d[3] - d[1]) + (d[7] - d[5])) / 2 / SCR_W;
  const c2 = ((d[4] - d[0]) + (d[6] - d[2])) / 2 / SCR_H, d2 = ((d[5] - d[1]) + (d[7] - d[3])) / 2 / SCR_H;
  const cx = (d[0] + d[2] + d[4] + d[6]) / 4, cy = (d[1] + d[3] + d[5] + d[7]) / 4;
  const ex = cx - (a2 * SCR_W + c2 * SCR_H) / 2, ey = cy - (b2 * SCR_W + d2 * SCR_H) / 2;
  el.style.transform = `matrix(${a2.toFixed(5)},${b2.toFixed(5)},${c2.toFixed(5)},${d2.toFixed(5)},${ex.toFixed(2)},${ey.toFixed(2)})`;
}
function placeAt(el, p, dy) {
  // keep labels inside the window and below the HUD boxes
  const w = el.offsetWidth || 200, h = el.offsetHeight || 40, hb = document.querySelector('#hud-l').getBoundingClientRect().bottom + 8;
  const top = document.body.classList.contains('cine') ? 8 : hb;
  const x = Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, p.x)), y = Math.max(top + h, Math.min(innerHeight - 8, p.y + (dy || 0)));
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
}

// ---------- mirror of the screen for the 3D glass (used while looking away) ----------
const MIR = { c: null, x: null, last: '', t: 0 };
function wrapText(x, str, maxW) { const out = []; let line = ''; for (const w of String(str).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
function drawMirror(force) {
  if (!MIR.c) { MIR.c = document.createElement('canvas'); MIR.c.width = 870; MIR.c.height = 600; MIR.x = MIR.c.getContext('2d'); World.setMirror(MIR.c); }
  const v = document.querySelector('.view.on'), id = v ? v.id : '', x = MIR.x;
  const sig = id + '|' + (id === 'v-quiz' ? $('#q-time').textContent + $('#q-ans').className + G.i + G.answered + $('#q-fb').className : (v ? v.textContent.length : 0)) + (A.screenOff ? 'off' : '');
  if (!force && sig === MIR.last && id !== 'v-title') return; MIR.last = sig;
  const g = x.createRadialGradient(435, 270, 50, 435, 300, 520); g.addColorStop(0, '#0e1a38'); g.addColorStop(1, '#03050c');
  x.fillStyle = g; x.fillRect(0, 0, 870, 600);
  if (A.screenOff) { x.fillStyle = '#020306'; x.fillRect(0, 0, 870, 600); World.mirrorDirty(); return; }
  x.textBaseline = 'top';
  if (id === 'v-title' && LG.c) {
    x.imageSmoothingEnabled = false; x.drawImage(LG.c, 0, 0, 870, 504);
    x.font = '22px PS2P'; document.querySelectorAll('.titem').forEach((e, i) => { x.fillStyle = i === LG.sel ? '#ffffff' : '#9fb6ff'; x.fillText((i === LG.sel ? '▶ ' : '  ') + e.textContent.replace('▶', ''), 280, 390 + i * 44); });
  } else if (id === 'v-quiz') {
    x.font = '15px PS2P'; x.fillStyle = '#2de2e6'; x.fillText($('#q-no').textContent, 22, 16); x.fillStyle = '#3dff8b'; x.fillText($('#q-time').textContent, 400, 16); x.fillStyle = '#ffd23f'; x.fillText($('#q-score').textContent, 680, 16);
    for (let i = 0; i < TOTAL; i++) { x.fillStyle = i < G.log.length ? (G.log[i].ok ? '#3dff8b' : '#ff4d5e') : i === G.i ? '#ffffff' : '#16244d'; x.fillRect(22 + i * 16.5, 42, 14, 9); }
    x.font = '38px VT'; x.fillStyle = '#ffffff'; let y = 84;
    for (const l of wrapText(x, $('#q-text').textContent, 820)) { x.fillText(l, 22, y); y += 38; }
    y += 6;
    [...$('#q-ans').children].forEach((b, i) => {
      if (b.classList.contains('gone')) return;
      const st = b.classList.contains('right') ? ['#0c3a26', '#3dff8b'] : b.classList.contains('wrong') ? ['#431220', '#ff4d5e'] : ['#0d1838', '#2b3f7d'];
      x.font = '30px VT'; const lines = wrapText(x, b.querySelector('span').textContent, 740), h = Math.max(57, lines.length * 30 + 20);
      x.fillStyle = st[0]; x.fillRect(22, y, 826, h); x.strokeStyle = st[1]; x.lineWidth = 3; x.strokeRect(23.5, y + 1.5, 823, h - 3);
      x.fillStyle = ['#ff4d5e', '#3fa7ff', '#ffd23f', '#3dff8b'][i]; x.fillRect(32, y + (h - 42) / 2, 42, 42);
      x.fillStyle = '#0a0a14'; x.font = '18px PS2P'; x.fillText('ABCD'[i], 44, y + (h - 42) / 2 + 12);
      x.fillStyle = '#e6f0ff'; x.font = '30px VT'; lines.forEach((l, k) => x.fillText(l, 88, y + 10 + k * 30));
      y += h + 8;
    });
    if ($('#q-fb').classList.contains('on')) {
      x.font = '20px PS2P'; const ok = $('#fb-verdict').classList.contains('ok'); x.fillStyle = ok ? '#3dff8b' : '#ff4d5e'; x.fillText($('#fb-verdict').textContent, 22, y + 10);
      x.font = '28px VT'; x.fillStyle = '#dbe8ff'; y += 46; for (const l of wrapText(x, $('#fb-expl').textContent, 820).slice(0, 4)) { x.fillText(l, 22, y); y += 28; }
    }
  } else if (v) {
    const h2 = v.querySelector('h2'); let y = 22;
    if (h2) { x.font = '27px PS2P'; x.fillStyle = '#ffd23f'; const w = x.measureText(h2.textContent).width; x.fillText(h2.textContent, (870 - w) / 2, y); y += 56; }
    x.font = '28px VT'; x.fillStyle = '#c8dcff';
    const txt = v.innerText.replace(h2 ? h2.textContent : '', '').split('\n').map(s => s.trim()).filter(Boolean);
    for (const t of txt) { for (const l of wrapText(x, t, 820)) { if (y > 570) break; x.fillText(l, 22, y); y += 30; } }
  }
  World.mirrorDirty();
}

// ---------- keyboard navigation: arrows move a highlight, Enter activates ----------
const KB = { el: null };
function kbButtons() {
  if (TS.on) return [...document.querySelectorAll('#tut button')].filter(b => b.style.visibility !== 'hidden');
  if (dlgOpen) return [...document.querySelectorAll('#dlg-ch button')];
  if ($('#confirm').classList.contains('on')) return [...document.querySelectorAll('#confirm button')];
  if (World.isOutside()) return $('#out-ui').classList.contains('on') ? [$('#b-out')] : [];
  const v = document.querySelector('.view.on'); if (!v || v.id === 'v-title') return [];
  if (v.id === 'v-quiz') return G.answered ? [] : [...v.querySelectorAll('.ans')];
  return [...v.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null);
}
function kbClear() { document.querySelectorAll('.kb').forEach(e => e.classList.remove('kb')); KB.el = null; }
function kbMove(step) {
  const list = kbButtons(); if (!list.length) return false;
  const cur = list.indexOf(KB.el);
  let i = cur < 0 ? (step > 0 ? 0 : list.length - 1) : cur + step;
  i = (i % list.length + list.length) % list.length;
  kbClear(); KB.el = list[i]; KB.el.classList.add('kb');
  try { KB.el.scrollIntoView({ block: 'nearest' }); } catch (e) { }
  return true;
}

// ---------- layout + loop ----------
function layout() {
  World.resize();
  const k = Math.min(innerHeight / 1080, innerWidth / 1920);
  document.documentElement.style.setProperty('--k', Math.max(0.55, k).toFixed(3));
}
let lastF = 0, hoverCheck = 0, lastBlur = 0;
function frame(ms) {
  const t = ms / 1000, dt = Math.min(0.05, Math.max(0, t - lastF)); lastF = t; NOW = t;
  A.musicLevel = MUSIC.level();
  try { AMBI.update(World.audioScene()); } catch (e) { }
  // the rare song: the Opensuse visitor comes in and dances until it ends
  const rare = MUSIC.rarePlaying(); if (rare || A.dance) { World.visitorDance(rare); A.dance = rare; }
  // look around only when the pointer leaves the game screen; over the screen the view stays still
  let lx = 0, ly = 0; const r = SCR_RECT;
  if (SET.cam && !dlgOpen && !TS.on && r && mouse.cx >= 0) {
    const m = 24;
    if (mouse.cx < r.left - m) lx = -(r.left - m - mouse.cx) / Math.max(40, r.left - m);
    else if (mouse.cx > r.right + m) lx = (mouse.cx - r.right - m) / Math.max(40, innerWidth - r.right - m);
    if (mouse.cy < r.top - m) ly = -(r.top - m - mouse.cy) / Math.max(40, r.top - m);
    else if (mouse.cy > r.bottom + m) ly = (mouse.cy - r.bottom - m) / Math.max(40, innerHeight - r.bottom - m);
  }
  World.mouse(lx, ly); World.pointer(mouse.x, mouse.y);
  World.frame(t, dt);
  // the crisp DOM screen is only shown when looking straight at it; otherwise the 3D mirror takes over
  const away = World.lookAway() > 0.02 || World.isOutside(), scrEl = $('#screen');
  if (away !== scrEl.classList.contains('away')) { scrEl.classList.toggle('away', away); if (away) drawMirror(true); }
  if (away && t - MIR.t > 0.25) { MIR.t = t; drawMirror(); }
  if (!away) placeScreen();
  // out of focus: dim the screen a little (CSS filters inside 3D transforms render badly in Firefox)
  const bl = Math.min(1, Math.round(World.screenBlur() / 6 * 10) / 10);
  if (bl !== lastBlur) { lastBlur = bl; $('#defocus').style.opacity = (bl * 0.55).toFixed(2); }
  if (!World.isOutside()) {
    const dmh = World.headPos('doorman'); placeAt($('#bubble'), dmh, -8);
    // in director mode a bubble only shows when its speaker is in the shot
    $('#bubble').style.visibility = document.body.classList.contains('cine') && (dmh.x < 0 || dmh.x > innerWidth || dmh.y < 0 || dmh.y > innerHeight || !dmh.vis) ? 'hidden' : '';
    placeAt($('#rick-tag'), World.headPos('rickard'), -10);
    $('#rick-tag').classList.toggle('hide', !(G.mode === 'play' && !G.answered && !G.hint) || dlgOpen);
    const vs = World.visitorSay(), vb = $('#vbubble');
    if (vs) { vb.firstElementChild.textContent = vs.text; placeAt(vb, vs.pos, -8); vb.classList.add('on'); } else vb.classList.remove('on');
    if (t - hoverCheck > 0.08 && !dlgOpen && mouse.cx >= 0) {
      hoverCheck = t;
      const h = World.pick(mouse.cx, mouse.cy) === 'rickard';
      if (h !== A.rickHover) { A.rickHover = h; document.body.classList.toggle('hand', h); }
    }
  }
  if (G.mode === 'title' && $('#v-title').classList.contains('on')) drawLogo(t);
  if (TS.on && t - (TS.pt || 0) > 0.2) { TS.pt = t; placeTut(); }
  drawFx(t, dt);
  requestAnimationFrame(frame);
}

function boot() {
  try { World.init(document.getElementById('scene')); }
  catch (e) { document.body.insertAdjacentHTML('beforeend', '<div id="nogl">Spelet behöver WebGL. Prova en annan webbläsare eller slå på hårdvaruacceleration.<br><small>' + esc(e.message) + '</small></div>'); return; }
  layout(); addEventListener('resize', layout);
  MUSIC.setVolume(SET.mvol); MUSIC.setEnabled(SET.music); AMBI.setVolume(SET.avol); AMBI.setEnabled(SET.ambi && SET.sound);
  addEventListener('mousemove', e => { if (KB.el && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) kbClear(); mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; mouse.cx = e.clientX; mouse.cy = e.clientY; });
  const firstGesture = () => { audioCtx(); MUSIC.start(); AMBI.start(); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture); };
  addEventListener('pointerdown', firstGesture); addEventListener('keydown', firstGesture);
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) {
      if (dlgOpen && dlgTyping && e.target.closest('#dlg')) return dlgDone();
      if (!TS.on && !e.target.closest('#screen, .hud, #dlg, #out-ui, #tut') && World.pick(e.clientX, e.clientY) === 'rickard') return talk();
      return;
    }
    if (b.dataset.c != null) { const c = dlgChoices[+b.dataset.c]; if (c) { SFX.click(); c.fn(); } return; }
    if (b.classList.contains('ans')) return answer(+b.dataset.k);
    if (b.dataset.pick) return pickDiff(b.dataset.pick);
    if (b.dataset.tg) { SET[b.dataset.tg] = !SET[b.dataset.tg]; saveSet(); SFX.click(); if (b.dataset.tg === 'music') MUSIC.setEnabled(SET.music); if (b.dataset.tg === 'ambi' || b.dataset.tg === 'sound') AMBI.setEnabled(SET.ambi && SET.sound); renderSettings(); return hud(); }
    if (b.dataset.avol) { SET.avol = Math.max(0, Math.min(1, Math.round((SET.avol + 0.1 * +b.dataset.avol) * 10) / 10)); saveSet(); AMBI.setVolume(SET.avol); SFX.click(); return renderSettings(); }
    if (b.dataset.vol) { SET.mvol = Math.max(0, Math.min(1, Math.round((SET.mvol + 0.1 * +b.dataset.vol) * 10) / 10)); saveSet(); MUSIC.setVolume(SET.mvol); SFX.click(); return renderSettings(); }
    if (b.dataset.hsd) { HS.diff = b.dataset.hsd; SFX.click(); return renderScores(G.last && G.last.ts); }
    if (b.dataset.hs) { HS.tab = b.dataset.hs; SFX.click(); return openScores(G.last && G.last.ts); }
    if (b.dataset.reset) { LS.set(b.dataset.reset, b.dataset.reset === 'scores' ? [] : {}); SFX.bad(); b.textContent = 'NOLLSTÄLLT'; b.disabled = true; return; }
    switch (b.id) {
      case 'b-start': case 'b-again': return showDiff();
      case 'b-scores': case 'b-scores2': SFX.click(); return openScores(G.last && G.last.ts);
      case 'b-settings': SFX.click(); renderSettings(); return view('settings');
      case 'b-menu': SFX.click(); return toTitle();
      case 'b-res': SFX.click(); return view('result');
      case 'b-next': return next();
      case 'b-save': return saveScore();
      case 'b-resend': SFX.click(); return hsSend(G.last);
      case 'b-share': return share();
      case 'b-sound': SET.sound = !SET.sound; saveSet(); AMBI.setEnabled(SET.ambi && SET.sound); SFX.click(); return hud();
      case 'b-music': SET.music = !SET.music; saveSet(); MUSIC.setEnabled(SET.music); return hud();
      case 'b-quit': SFX.click(); return $('#confirm').classList.add('on');
      case 'b-quit-no': SFX.click(); return $('#confirm').classList.remove('on');
      case 'b-quit-yes': $('#confirm').classList.remove('on'); closeDlg(true); SFX.click(); return toTitle();
      case 'b-out': return backInside();
      case 'b-tut': return openTut();
      case 'tut-next': if (TS.i >= TUT.length - 1) return closeTut(); TS.i++; SFX.click(); return showTut();
      case 'tut-prev': if (TS.i > 0) TS.i--; SFX.click(); return showTut();
      case 'tut-skip': return closeTut();
    }
  });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') saveScore(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'enter' || k === ' ') e.preventDefault();   // never let a previously clicked button fire again
    if (TS.on) {
      if (k === 'escape') return closeTut();
      if (k === 'arrowright' || k === 'arrowdown') { e.preventDefault(); return $('#tut-next').click(); }
      if (k === 'arrowleft' || k === 'arrowup') { e.preventDefault(); return $('#tut-prev').click(); }
      if (k === 'enter' || k === ' ') return $('#tut-next').click();
      return;
    }
    const dirs = { arrowup: -1, arrowleft: -1, arrowdown: 1, arrowright: 1 };
    const onTitle = G.mode === 'title' && $('#v-title').classList.contains('on') && !dlgOpen && !$('#confirm').classList.contains('on');
    if (k in dirs && !onTitle && !(dlgOpen && dlgTyping)) {
      let step = dirs[k]; if (G.mode === 'pick' && !dlgOpen && (k === 'arrowup' || k === 'arrowdown')) step *= 2;
      if (kbMove(step)) { e.preventDefault(); SFX.click(); return; }
    }
    if ((k === 'enter' || k === ' ') && KB.el && KB.el.classList.contains('kb') && kbButtons().includes(KB.el)) { const b = KB.el; kbClear(); b.click(); return; }
    if (k === 'm') { SET.sound = !SET.sound; saveSet(); AMBI.setEnabled(SET.ambi && SET.sound); return hud(); }
    if (k === 'n') { SET.music = !SET.music; saveSet(); MUSIC.setEnabled(SET.music); return hud(); }
    if (dlgOpen) {
      if (k === 'escape') return closeDlg();
      if (dlgTyping) { if (k === 'enter' || k === ' ') { e.preventDefault(); dlgDone(); } return; }
      const n = k === 'enter' || k === ' ' ? 0 : '12'.indexOf(k);
      if (n >= 0 && dlgChoices[n]) { e.preventDefault(); SFX.click(); dlgChoices[n].fn(); }
      return;
    }
    if ($('#confirm').classList.contains('on')) { if (k === 'escape') $('#confirm').classList.remove('on'); return; }
    if (G.mode === 'pick') { const n = '1234'.indexOf(k); if (n >= 0) return pickDiff(Object.keys(DIFFS)[n]); if (k === 'enter') return pickDiff(SET.diff); if (k === 'escape') return toTitle(); return; }
    if (G.mode === 'title' && $('#v-title').classList.contains('on')) {
      if (k === 'arrowdown' || k === 's') { e.preventDefault(); SFX.click(); return titleSel(LG.sel + 1); }
      if (k === 'arrowup' || k === 'w') { e.preventDefault(); SFX.click(); return titleSel(LG.sel - 1); }
      if (k === 'enter' || k === ' ') { e.preventDefault(); return document.querySelectorAll('.titem')[LG.sel].click(); }
    }
    if (World.isOutside() && k === 'enter' && $('#out-ui').classList.contains('on')) return backInside();
    if (G.mode !== 'play') return;
    if (k === 'h' || k === 'r') return talk();
    if (!G.answered) { const n = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k); if (n >= 0) answer(n); }
    else if (k === 'enter' || k === ' ' || k === 'arrowright') { e.preventDefault(); next(); }
  });
  document.querySelectorAll('.titem').forEach((e, i) => e.addEventListener('mouseenter', () => titleSel(i)));
  fillTicker(); titleSel(0);
  hsLoad().then(() => { if (G.mode === 'title') fillTicker(); });
  hud();
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
  if (!LS.get('tut', false) && !/#t=/.test(location.hash)) setTimeout(openTut, 1400);
  if (/#t=tut/.test(location.hash)) setTimeout(() => { openTut(); const n = +(/tut(\d+)/.exec(location.hash) || [0, 0])[1]; TS.i = n; showTut(); }, 600);
  testHook();
}

// test hook: file.html#t=play | wrongN | rightN | rick | pay | save | result | outs | scores | settings | visitor | cameo  (&diff=extreme)
const ERRS = [];
window.addEventListener('error', e => ERRS.push(String(e.message || e)));
function testHook() {
  if (/report/.test(location.hash)) setTimeout(() => {
    const a = new Audio();
    const r = { mode: G.mode, view: (document.querySelector('.view.on') || {}).id, i: G.i, right: G.right, wrong: G.wrong, coins: G.coins, hint: $('#q-hint').classList.contains('on'), dlg: dlgOpen, mp3: a.canPlayType('audio/mpeg'), webgl2: !!document.createElement('canvas').getContext('webgl2'), ua: navigator.userAgent.replace(/.*(AppleWebKit\/[\d.]+).*/, '$1'), errors: ERRS };
    document.body.insertAdjacentHTML('beforeend', '<pre id="report" style="position:fixed;left:8px;bottom:8px;z-index:99;background:#fff;color:#000;font:16px monospace;padding:8px;max-width:95vw;white-space:pre-wrap">' + esc(JSON.stringify(r, null, 1)) + '</pre>');
  }, 9000);
  const m = /#t=([a-z]+)(\d*)/.exec(location.hash); if (!m) return;
  const was = SET.sound; SET.sound = false; const n = +m[2] || 0;
  const d = /diff=([a-z]+)/.exec(location.hash); if (d && DIFFS[d[1]]) SET.diff = d[1];
  const run = () => {
    if (!['title', 'scores', 'settings', 'tut'].includes(m[1])) startGame(/cameo|crowd/.test(m[1]) ? { volt: true, pelle: true } : null);
    const wrong = (N) => { for (let i = 0; i < N; i++) { answer((G.order.indexOf(0) + 1) % 4); if (G.mode === 'play' && i < N - 1) next(); } };
    const right = (N) => { for (let i = 0; i < N; i++) { answer(G.order.indexOf(0)); if (i < N - 1) next(); } };
    if (m[1] === 'wrong') wrong(n);
    if (m[1] === 'right') right(n || 1);
    if (m[1] === 'result') { wrong(Math.min(4, G.maxWrong - 1)); next(); right(20); finish('done'); }
    if (m[1] === 'rick') talk();
    if (m[1] === 'pay') { talk(); dlgDone(); payRick(); dlgDone(); }
    if (m[1] === 'kbd') { const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); key('ArrowDown'); key('Enter'); setTimeout(() => { key('Enter'); setTimeout(() => { key('h'); setTimeout(() => { key('Enter'); }, 2500); }, 800); }, 1200); }
    if (m[1] === 'save') { right(6); next(); talk(); payRick(); closeDlg(true); answer(G.order.indexOf(0)); finish('done'); saveScore(); }
    if (m[1] === 'outs') wrong(G.maxWrong);
    if (m[1] === 'visitor') { G.visitorAt = -1; World.startVisitor(); }
    if (m[1] === 'nukem') { MUSIC.start(); MUSIC._test.playRare(); }
    const every = (ms, N, fn) => { let i = 0; const id = setInterval(() => { if (i++ >= N || G.mode !== 'play') return clearInterval(id); fn(); }, ms); };
    const step = (good) => { if (G.answered) next(); setTimeout(() => answer(good ? G.order.indexOf(0) : (G.order.indexOf(0) + 1) % 4), 500); };
    if (m[1] === 'laughdemo') every(2600, Math.min(G.maxWrong - 1, 9), () => step(false));
    if (m[1] === 'cheerdemo') every(2400, 12, () => step(true));
    if (m[1] === 'crowddemo') { World.forceGather(['volt', 'pelle']); every(1900, 16, () => step(true)); }
    if (m[1] === 'cameodemo') { World.forceGather(['volt', 'pelle']); every(2600, 10, () => step(true)); }
    if (m[1] === 'scores') openScores();
    if (m[1] === 'settings') { renderSettings(); view('settings'); }
    SET.sound = was;
  };
  setTimeout(run, 50);
}
