// Highscore-worker för Nätverkssäkerhet Arcade.
//
//   GET  /scores   listan (scores.json på grenen "highscores"), cachad ~15 s
//   POST /scores   ett nytt resultat; kontrolleras och skickas vidare till GitHub
//                  som repository_dispatch, där .github/workflows/highscore.yml committar det
//
// GitHub-token finns bara här som hemlighet (env.GH_TOKEN), aldrig i spelet.
import { validate } from '../../highscore/validate.mjs';

const MAX_BODY = 2048;
const CACHE_S = 15;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== '/scores') return json({ error: 'finns inte' }, 404);
    if (!env.GH_TOKEN) return json({ error: 'workern saknar GH_TOKEN' }, 500);

    if (req.method === 'GET') return getScores(env, ctx, cors, json);
    if (req.method !== 'POST') return json({ error: 'fel metod' }, 405);

    // Andra webbplatser ska inte kunna skicka in via besökarnas webbläsare.
    // (Stoppar inte curl, men det gör inget annat heller: allt annat kontrolleras nedan.)
    if (origin && !allowed.includes(origin)) return json({ error: 'fel ursprung' }, 403);

    if (env.LIMITER) {
      const ip = req.headers.get('CF-Connecting-IP') || 'okänd';
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return json({ error: 'för många försök, vänta en minut' }, 429, { 'Retry-After': '60' });
    }

    const body = await req.text();
    if (body.length > MAX_BODY) return json({ error: 'för stort' }, 413);
    let raw;
    try { raw = JSON.parse(body); } catch { return json({ error: 'inte JSON' }, 400); }
    const v = validate(raw);
    if (!v.ok) return json({ error: v.error }, 400);

    const r = await github(env, `/repos/${env.REPO}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ event_type: 'highscore', client_payload: { entry: v.entry } })
    });
    if (r.status !== 204) {
      console.log('dispatch misslyckades', r.status, await r.text());
      return json({ error: 'GitHub svarade ' + r.status }, 502);
    }
    return json({ ok: true, id: v.entry.id }, 202);
  }
};

async function getScores(env, ctx, cors, json) {
  const cache = caches.default;
  const key = new Request(`https://highscore.cache/${env.REPO}/${env.BRANCH}/scores.json`);
  let body = null;
  const hit = await cache.match(key);
  if (hit) body = await hit.text();
  else {
    const r = await github(env, `/repos/${env.REPO}/contents/scores.json?ref=${encodeURIComponent(env.BRANCH)}`, {
      headers: { Accept: 'application/vnd.github.raw+json' }
    });
    if (r.status === 404) body = '[]';
    else if (!r.ok) return json({ error: 'GitHub svarade ' + r.status }, 502);
    else body = await r.text();
    ctx.waitUntil(cache.put(key, new Response(body, { headers: { 'Cache-Control': `max-age=${CACHE_S}` } })));
  }
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_S}`, ...cors }
  });
}

function github(env, path, init = {}) {
  return fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'natverkssakerhet-arcade-highscore',
      ...(init.headers || {})
    }
  });
}
