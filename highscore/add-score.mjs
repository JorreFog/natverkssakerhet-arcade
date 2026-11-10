// Körs av .github/workflows/highscore.yml. Lägger till resultatet i $ENTRY (JSON)
// i scores-filen som ges som argument, sorterar och behåller de KEEP bästa.
// Skriver en commit-rad till stdout. Avslutar med kod 1 om resultatet är ogiltigt.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { validate, byRank, KEEP } from './validate.mjs';

const file = process.argv[2];
if (!file) { console.error('användning: node add-score.mjs scores.json'); process.exit(2); }

let raw;
try { raw = JSON.parse(process.env.ENTRY || ''); } catch { console.error('ENTRY är inte JSON'); process.exit(1); }
const v = validate(raw);
if (!v.ok) { console.error('Ogiltigt resultat: ' + v.error); process.exit(1); }

const list = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
if (list.some(s => s.id === v.entry.id)) { console.log('finns redan: ' + v.entry.id); process.exit(0); }

const now = new Date();
const entry = { ...v.entry, date: now.toISOString().slice(0, 10), ts: now.getTime() };
list.push(entry);
list.sort(byRank);
writeFileSync(file, JSON.stringify(list.slice(0, KEEP), null, 1) + '\n');
console.log(`Highscore: ${entry.name} ${entry.score} (${entry.diff})`);
