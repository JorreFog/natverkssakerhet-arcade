# Nätverkssäkerhet Arcade

Ett pluggspel inför tentan i Nätverkssäkerhet: ett 3D-arkadspel i pixelgrafik där du svarar på frågor vid en arkadmaskin.

**Spela:** https://jorrefog.github.io/natverkssakerhet-arcade/

## Så funkar det

- Varje runda är 50 slumpade flervalsfrågor av 300, och du har 60 minuter.
- Efter varje svar får du direkt rätt svar, en förklaring och vilken kursbild det kommer från.
- Du väljer nivå när rundan startar:

  | Nivå | Mynt till ledtrådar | Utkastad efter |
  |---|---|---|
  | Easy | obegränsat | 30 fel |
  | Medium | 10 | 20 fel |
  | Hard | 5 | 10 fel |
  | Extreme | 1 | 3 fel |

- Mariams dörrvakt blir argare för varje fel och kastar ut dig vid gränsen.
- Rickard säljer ledtrådar för ett mynt. Klicka på honom eller tryck **H**.
- Publiken i hallen hejar när det går bra och skrattar när det går dåligt.
- Efter rundan får du resultat per område och en genomgång av alla fel, och kan spara i highscore och dela på Discord.
- Frågor du missat kommer tillbaka i senare rundor tills du kan dem.

**Styrning:** mus, eller piltangenter + Enter. **1–4** / **A–D** svarar, **H** Rickard, **M** ljudeffekter, **N** musik.

Highscore sparas både i din webbläsare och på en gemensam online-lista med alla spelares resultat. Frågestatistiken sparas bara i din webbläsare. Hur online-listan fungerar och sätts upp står i [`worker/README.md`](worker/README.md).

## Bygga

Spelet är en enda fristående fil, `index.html`. Källorna ligger i `src/`:

| Fil | Innehåll |
|---|---|
| `q1.js`–`q4.js` | Frågebanken |
| `scene3d.js` | 3D-hallen (three.js) |
| `sprites.js` | Pixelfigurerna |
| `game.js` | Spellogiken |
| `audio.js` | Musiken genom hallens högtalare |
| `template.html` | Sidan |

Online-highscore: `highscore/` (kontroll av resultat, används av både worker och GitHub Action), `worker/` (Cloudflare Worker) och `.github/workflows/`.

```sh
cd src
npm install
python3 build.py
```

Fonter: Press Start 2P och VT323 (SIL Open Font License).
