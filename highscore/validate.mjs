// Gemensam kontroll av ett highscore-resultat. Används av både Cloudflare-workern
// (worker/src/index.mjs) och GitHub Action (highscore/add-score.mjs), så reglerna
// bara finns på ett ställe.
//
// Spelet körs helt i webbläsaren, så det går aldrig att bevisa att ett resultat är
// äkta. Det här stoppar bara omöjliga värden (fler än 50 rätt, för hög poäng för
// antalet rätt, fel nivå osv.). Fusk som håller sig inom reglerna får tas bort för
// hand ur scores.json på grenen "highscores".

export const TOTAL = 50, TIME_S = 3600, KEEP = 200;
export const DIFFS = {
  easy: { coins: Infinity, maxWrong: 30 },
  medium: { coins: 10, maxWrong: 20 },
  hard: { coins: 5, maxWrong: 10 },
  extreme: { coins: 1, maxWrong: 3 }
};
const REASONS = ['done', 'time', 'out'];
const NAME_RE = /^[A-Z0-9ÅÄÖÆØÜÉ _.\-!?]{1,10}$/;
const ID_RE = /^[a-z0-9]{8,24}$/;

// Högsta möjliga poäng med n rätt: alla i en enda svit utan ledtråd.
// Spelet ger 100 per rätt (50 med ledtråd) + 10 per steg i sviten, max 50 i bonus.
export function maxScore(n) {
  let s = 0;
  for (let i = 1; i <= n; i++) s += 100 + Math.min(50, (i - 1) * 10);
  return s;
}

const int = v => Number.isInteger(v) ? v : NaN;

// Returnerar { ok: true, entry } med bara de fält som sparas, eller { ok: false, error }.
export function validate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'inget resultat' };
  const name = typeof raw.name === 'string' ? raw.name.trim().toUpperCase() : '';
  const e = {
    id: raw.id, name, diff: raw.diff, reason: raw.reason,
    score: int(raw.score), right: int(raw.right), wrong: int(raw.wrong),
    coins: int(raw.coins), time: int(raw.time), best: int(raw.best)
  };
  const D = DIFFS[e.diff];
  const answered = e.right + e.wrong;
  const checks = [
    [typeof e.id === 'string' && ID_RE.test(e.id), 'ogiltigt id'],
    [NAME_RE.test(name), 'ogiltigt namn'],
    [!!D && Object.hasOwn(DIFFS, e.diff), 'okänd nivå'],
    [REASONS.includes(e.reason), 'okänt slut'],
    [[e.score, e.right, e.wrong, e.coins, e.time, e.best].every(v => v >= 0), 'saknade eller negativa värden'],
    [answered <= TOTAL, 'fler svar än frågor'],
    [!D || e.wrong <= D.maxWrong, 'fler fel än nivån tillåter'],
    [e.reason !== 'out' || (D && e.wrong === D.maxWrong), 'utkastad utan att nå felgränsen'],
    [e.reason !== 'done' || answered === TOTAL, 'klar utan att ha svarat på alla frågor'],
    [e.score % 10 === 0 && e.score >= e.right * 50 && e.score <= maxScore(e.right), 'poängen stämmer inte med antalet rätt'],
    [e.best <= e.right, 'för lång svit'],
    // +1: en ledtråd kan köpas på frågan man står på när tiden tar slut
    [e.coins <= answered + 1 && (!D || e.coins <= D.coins), 'för många mynt'],
    [e.time <= TIME_S && e.time >= answered && (e.reason !== 'time' || e.time === TIME_S), 'orimlig tid']
  ];
  for (const [ok, error] of checks) if (!ok) return { ok: false, error };
  return { ok: true, entry: e };
}

// Samma ordning som i spelet: poäng, sedan flest rätt, sedan snabbast.
export const byRank = (a, b) => b.score - a.score || b.right - a.right || a.time - b.time || a.ts - b.ts;
