// MetaLens Tracker API (Cloudflare Worker). Static files in public/ are served by Workers Static Assets.
//
//   POST /api/upload?sha=&part=   body: gzip of ≤ ~4 MB of whole hands (browser splits the file)
//     Access JWT ─► R2.put (raw first: every hand stays rebuildable)
//       ─► parse ─► [ids already in `hands`?] ─► stats of the new hands only
//       ─► D1 batch (one transaction): INSERT hands (plain: a racing duplicate rolls it all back)
//                                       + UPSERT stats (sum done inside SQL) + INSERT uploads
//       ─► UNIQUE conflict? re-read existing ids and retry (≤ 3)
//   GET  /api/player?q=           prefix search (index), 20 results
//   GET  /api/stats?nick=         counters per stake (+ bb/100 unless the player is on the team)
//   GET  /api/regs                how many regs are loaded
//   POST /api/admin/rebuild       admins only: wipe counters, re-ingest R2 one object per call
import { parseHand, splitHands, type Hand } from './src/parser.ts';
import { aggregateHands, MIN_PLAYERS, type IsReg } from './src/stats.ts';

type D1Result = { results: Record<string, unknown>[] };
type D1Stmt = { bind(...v: unknown[]): D1Stmt; all(): Promise<D1Result>; run(): Promise<unknown> };
type D1 = { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<unknown[]> };
type R2Obj = { key: string; arrayBuffer(): Promise<ArrayBuffer> };
type R2 = {
  put(key: string, v: ArrayBuffer): Promise<unknown>;
  get(key: string): Promise<R2Obj | null>;
  list(o: { cursor?: string; limit?: number; prefix?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
};
export interface Env {
  DB: D1; RAW: R2;
  ACCESS_AUD: string;      // Cloudflare Access application AUD tag
  ACCESS_TEAM?: string;    // <team>.cloudflareaccess.com (certs are fetched from there)
  ACCESS_JWKS?: string;    // tests: JWKS JSON instead of fetching
  ADMINS?: string;         // comma-separated emails allowed to rebuild
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// ---------- Cloudflare Access JWT (RS256) ----------
let jwks: { keys: (JsonWebKey & { kid: string })[] } | null = null;
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
async function accessUser(req: Request, env: Env): Promise<string | null> {
  const token = req.headers.get('cf-access-jwt-assertion');
  const [h, p, sig] = token?.split('.') ?? [];
  if (!sig) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64(p)));
    const load = async () => (jwks = env.ACCESS_JWKS ? JSON.parse(env.ACCESS_JWKS)
      : await (await fetch(`https://${env.ACCESS_TEAM}/cdn-cgi/access/certs`)).json());
    let jwk = (jwks ?? (await load()))!.keys.find(k => k.kid === header.kid);
    if (!jwk) jwk = (await load())!.keys.find(k => k.kid === header.kid); // key rotation
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(sig), new TextEncoder().encode(`${h}.${p}`));
    const aud = [payload.aud].flat();
    if (!ok || !aud.includes(env.ACCESS_AUD) || payload.exp * 1000 < Date.now()) return null;
    return payload.email ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

// ---------- regs cache (per isolate, 5 min) ----------
let regs: { at: number; set: Set<string> } | null = null;
async function isRegFor(env: Env, site: string): Promise<IsReg> {
  if (!regs || Date.now() - regs.at > 300_000) {
    const { results } = await env.DB.prepare('SELECT site, nick FROM regs').all();
    regs = { at: Date.now(), set: new Set(results.map(r => `${r.site}\t${String(r.nick).toLowerCase()}`)) };
  }
  const set = regs.set;
  return nick => set.has(`${site}\t${nick.toLowerCase()}`);
}

// Sum incoming counters into the stored JSON inside one SQL statement (no lost updates between uploads).
const UPSERT_STATS = `
INSERT INTO stats (site, nick, stake, hands, net_bb, c)
SELECT j.value->>'site', j.value->>'nick', j.value->>'stake', j.value->>'hands', j.value->>'net', j.value->>'c'
FROM json_each(?1) AS j WHERE true
ON CONFLICT (site, nick, stake) DO UPDATE SET
  hands  = stats.hands + excluded.hands,
  net_bb = stats.net_bb + excluded.net_bb,
  c = (SELECT json_group_object(k, json_array(o, d)) FROM (
         SELECT k, sum(o) AS o, sum(d) AS d FROM (
           SELECT key AS k, value->>0 AS o, value->>1 AS d FROM json_each(stats.c)
           UNION ALL
           SELECT key, value->>0, value->>1 FROM json_each(excluded.c))
         GROUP BY k))`;

export type IngestResult = { new: number; dup: number; rejected: number };

export async function ingest(env: Env, text: string, user: string, sha: string, part: number): Promise<IngestResult> {
  const parsed: Hand[] = [];
  let rejected = 0;
  for (const block of splitHands(text)) {
    try { parsed.push(parseHand(block)); } catch { rejected++; }
  }
  if (!parsed.length) {
    await env.DB.prepare('INSERT INTO uploads (user, sha, part, new, dup, rejected) VALUES (?1, ?2, ?3, 0, 0, ?4)').bind(user, sha, part, rejected).run();
    return { new: 0, dup: 0, rejected };
  }
  const bySite = Map.groupBy(parsed, h => h.site);
  for (let attempt = 0; attempt < 3; attempt++) {
    const stmts: D1Stmt[] = [];
    let fresh = 0;
    for (const [site, hands] of bySite) {
      const { results } = await env.DB.prepare('SELECT id FROM hands WHERE site = ?1 AND id IN (SELECT value FROM json_each(?2))')
        .bind(site, JSON.stringify(hands.map(h => h.id))).all();
      const seen = new Set(results.map(r => String(r.id)));
      const news = hands.filter(h => !seen.has(h.id));
      fresh += news.length;
      if (!news.length) continue;
      const rows = [...aggregateHands(news.filter(h => h.order.length >= MIN_PLAYERS), await isRegFor(env, site)).values()]
        .map(s => ({ site, nick: s.player, stake: s.stake, hands: s.hands, net: s.netBB, c: JSON.stringify(s.c) }));
      stmts.push(env.DB.prepare('INSERT INTO hands (site, id) SELECT ?1, value FROM json_each(?2)').bind(site, JSON.stringify(news.map(h => h.id))));
      if (rows.length) stmts.push(env.DB.prepare(UPSERT_STATS).bind(JSON.stringify(rows)));
    }
    const result = { new: fresh, dup: parsed.length - fresh, rejected };
    stmts.push(env.DB.prepare('INSERT INTO uploads (user, sha, part, new, dup, rejected) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(user, sha, part, result.new, result.dup, rejected));
    try {
      await env.DB.batch(stmts);
      return result;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e))) throw e; // another upload inserted some of these hands first: recount
    }
  }
  throw new Error('upload conflict: try again');
}

const gunzip = (buf: ArrayBuffer) => new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
const MAX_BODY = 20 * 1024 * 1024;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return new Response('not found', { status: 404 });
    const user = await accessUser(req, env);
    if (!user) return json({ error: 'login required' }, 401);
    try {
      if (req.method === 'POST' && url.pathname === '/api/upload') {
        const sha = url.searchParams.get('sha') ?? '';
        const part = Number(url.searchParams.get('part'));
        if (!/^[0-9a-f]{64}$/.test(sha) || !Number.isInteger(part) || part < 0 || part > 100_000) return json({ error: 'bad sha/part' }, 400);
        const gz = await req.arrayBuffer();
        if (!gz.byteLength || gz.byteLength > MAX_BODY) return json({ error: 'empty or too large' }, 413);
        let text: string;
        try { text = await gunzip(gz); } catch { return json({ error: 'body must be gzip' }, 400); }
        await env.RAW.put(`uploads/${sha}/${String(part).padStart(5, '0')}.txt.gz`, gz); // raw first
        return json(await ingest(env, text, user, sha, part));
      }
      if (req.method === 'GET' && url.pathname === '/api/player') {
        const q = (url.searchParams.get('q') ?? '').trim();
        if (!q) return json([]);
        const like = q.replace(/[\\%_]/g, m => '\\' + m) + '%';
        const { results } = await env.DB.prepare(
          "SELECT site, nick, sum(hands) AS hands FROM stats WHERE nick LIKE ?1 ESCAPE '\\' GROUP BY site, nick ORDER BY hands DESC LIMIT 20")
          .bind(like).all();
        return json(results);
      }
      if (req.method === 'GET' && url.pathname === '/api/stats') {
        const nick = url.searchParams.get('nick') ?? '';
        const site = url.searchParams.get('site') ?? 'PokerKing';
        const [{ results: rows }, { results: team }] = await env.DB.batch([
          env.DB.prepare('SELECT stake, hands, net_bb, c FROM stats WHERE site = ?1 AND nick = ?2').bind(site, nick),
          env.DB.prepare('SELECT 1 FROM team WHERE site = ?1 AND nick = ?2').bind(site, nick),
        ]) as D1Result[];
        if (!rows.length) return json({ error: 'player not found' }, 404);
        const hideNet = team.length > 0;
        return json({ site, nick, team: hideNet, stakes: rows.map(r => ({
          stake: r.stake, hands: r.hands, net_bb: hideNet ? null : r.net_bb, c: JSON.parse(String(r.c)),
        })) });
      }
      if (req.method === 'GET' && url.pathname === '/api/regs') {
        const { results } = await env.DB.prepare('SELECT count(*) AS n FROM regs').all();
        return json({ regs: results[0].n });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/rebuild') {
        const admins = (env.ADMINS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (!admins.includes(user.toLowerCase())) return json({ error: 'admins only' }, 403);
        const cursor = url.searchParams.get('cursor') || undefined;
        if (!cursor) await env.DB.batch([env.DB.prepare('DELETE FROM stats'), env.DB.prepare('DELETE FROM hands')]);
        const page = await env.RAW.list({ prefix: 'uploads/', cursor, limit: 1 });
        const done: IngestResult[] = [];
        for (const { key } of page.objects) {
          const obj = await env.RAW.get(key);
          const [, sha, part] = key.match(/^uploads\/([0-9a-f]{64})\/(\d+)\.txt\.gz$/) ?? [];
          if (obj && sha) done.push(await ingest(env, await gunzip(await obj.arrayBuffer()), `rebuild:${user}`, sha, Number(part)));
        }
        return json({ processed: page.objects.map(o => o.key), results: done, cursor: page.truncated ? page.cursor : null });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      const msg = String(e);
      // D1 daily/rate limits or overload: tell the user instead of a blank error
      if (/limit|overloaded|too many/i.test(msg)) return json({ error: 'database limit reached, try again later' }, 503);
      return json({ error: msg.slice(0, 300) }, 500);
    }
  },
};
