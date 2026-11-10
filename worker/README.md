# Online-highscore

Spelet ligger på GitHub Pages, som bara kan visa filer. För att spara poäng från alla
spelare behövs något som kan ta emot data, och det får inte vara spelet självt: en
GitHub-token i `index.html` kan vem som helst läsa och använda för att skriva i repot.

```
Spelet ──POST /scores──▶ Cloudflare Worker ──repository_dispatch──▶ GitHub Action
   ▲                     (GitHub-token som                          (.github/workflows/highscore.yml)
   │                      hemlighet, kontroll,                       kontrollerar igen och committar
   │                      max 5 per minut/IP)                        scores.json på grenen "highscores"
   └──────GET /scores────── Worker läser scores.json (cachat 15 s) ◀─────────┘
```

- **Spelarna behöver inget konto.** Spara-knappen sparar lokalt som förut och skickar
  samtidigt till online-listan.
- **Listan ligger på en egen gren, `highscores`**, så att `main` inte fylls med
  poäng-commits och GitHub Pages inte byggs om för varje resultat.
- **Kontrollen finns på ett ställe**, `highscore/validate.mjs`, och körs både i workern
  och i GitHub Action. Den stoppar omöjliga resultat: fler än 50 rätt, högre poäng än
  vad antalet rätt kan ge, fler fel eller mynt än nivån tillåter, konstiga namn.
- **Fusk inom reglerna går inte att stoppa.** Spelet körs i webbläsaren, så den som vill
  kan skicka ett påhittat men möjligt resultat. Ta bort sådana för hand (se nedan).

## Sätta upp (en gång, ca 15 minuter)

### 1. Cloudflare-konto

1. Skapa ett gratis konto på <https://dash.cloudflare.com/sign-up>.
2. Öppna **Workers & Pages** en gång, så att kontot får en `workers.dev`-adress.
3. Kopiera ditt **Account ID**. Det står till höger på översikten under
   Workers & Pages (eller under *Account home* → kontots meny → *Copy account ID*).

### 2. Cloudflare-token (så att GitHub kan deploya workern)

1. Cloudflare: profilikonen → **My Profile** → **API Tokens** → **Create Token**.
2. Välj mallen **Edit Cloudflare Workers** → *Use template*.
3. *Account Resources*: ditt konto. *Zone Resources*: *All zones* (spelar ingen roll, workern
   använder ingen egen domän).
4. **Continue to summary** → **Create Token**, och kopiera token.

### 3. GitHub-token (så att workern kan starta GitHub Action och läsa listan)

1. GitHub: **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. *Repository access*: **Only select repositories** → `natverkssakerhet-arcade`.
3. *Permissions* → *Repository permissions* → **Contents: Read and write**. Inget annat.
4. Välj en giltighetstid (t.ex. ett år) och kopiera token. När den går ut slutar
   online-listan att fungera tills du lägger in en ny (steg 4 och 5 igen).

Tokenen kan bara röra filerna i det här repot, och den finns bara som hemlighet i
Cloudflare. Den syns aldrig för spelarna.

### 4. Lägg in hemligheterna i repot

GitHub-repot → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, tre gånger:

| Namn | Värde |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token från steg 2 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID från steg 1 |
| `HIGHSCORE_GH_TOKEN` | token från steg 3 |

### 5. Deploya workern

Repot → **Actions** → **Deploy highscore worker** → **Run workflow**. I loggen för steget
*wrangler-action* står adressen, t.ex.
`https://natverkssakerhet-arcade-highscore.DITTNAMN.workers.dev`.

Öppna `<adressen>/scores` i webbläsaren. Den ska visa `[]`.

Workern deployas om automatiskt när något i `worker/` eller `highscore/validate.mjs`
ändras på `main`.

> Om deployen klagar på `LIMITER`/`ratelimit`: ta bort `[[ratelimits]]`-blocket
> i `wrangler.toml`. Då försvinner gränsen på 5 resultat per minut, men allt annat fungerar.

### 6. Koppla spelet till workern

Sätt adressen i `src/game.js`:

```js
const HS_API = 'https://natverkssakerhet-arcade-highscore.DITTNAMN.workers.dev';
```

Bygg om (`cd src && python3 build.py`) och pusha. Så länge `HS_API` är tom fungerar
spelet precis som förut, med bara lokal highscore.

## Ta bort ett resultat

Öppna `scores.json` på grenen `highscores` på GitHub, tryck på pennan, ta bort raden
(hela `{ ... }`-blocket) och committa. Workern visar ändringen inom 15 sekunder.

## Felsökning

- **"KOM INTE FRAM TILL ONLINE-LISTAN"** i spelet: felet står efter kolon. *Ingen anslutning*
  = workern nås inte (fel `HS_API`?). *GitHub svarade 401/403* = GitHub-tokenen är fel
  eller har gått ut.
- **Skickat men syns aldrig**: titta under Actions → *Highscore*. En röd körning visar varför.
