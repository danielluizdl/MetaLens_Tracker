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
  DEV_USER?: string;       // local only: skips Access and acts as this user.
                           // Passed on the command line (npm run dev), never in wrangler.jsonc,
                           // so a deployed Worker always requires a real Access token.
  SESSION_SECRET?: string; // signs the session cookie (set a random value in production)
}

type Role = 'admin' | 'player';
type User = { email: string; role: Role };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// ---------- Cloudflare Access JWT (RS256) ----------
let jwks: { keys: (JsonWebKey & { kid: string })[] } | null = null;
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
async function accessUser(req: Request, env: Env): Promise<string | null> {
  if (env.DEV_USER) return env.DEV_USER;
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

// ---------- accounts: pbkdf2 passwords + signed session cookie ----------
const enc = new TextEncoder();
const b64e = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const ITER = 100_000;

async function hashPassword(pass: string, saltB64?: string) {
  const salt = saltB64 ? b64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, key, 256);
  return ['pbkdf2', ITER, b64e(salt.buffer as ArrayBuffer), b64e(bits)].join('$');
}
const checkPassword = async (pass: string, stored: string) =>
  (await hashPassword(pass, stored.split('$')[2])) === stored;

const sessionKey = (env: Env) =>
  crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET ?? 'dev-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signSession(env: Env, u: User) {
  const body = btoa(JSON.stringify({ ...u, exp: Date.now() + 30 * 864e5 })).replace(/=+$/, '');
  const mac = b64e(await crypto.subtle.sign('HMAC', await sessionKey(env), enc.encode(body))).replace(/=+$/, '');
  return body + '.' + mac;
}
async function readSession(env: Env, cookie: string | null): Promise<User | null> {
  const raw = cookie?.match(/(?:^|;\s*)ml=([^;]+)/)?.[1];
  const [body, mac] = raw?.split('.') ?? [];
  if (!body || !mac) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await sessionKey(env), b64(mac), enc.encode(body));
    const data = JSON.parse(atob(body));
    return ok && data.exp > Date.now() ? { email: data.email, role: data.role } : null;
  } catch { return null; }
}
const cookieHeader = (value: string, maxAge = 30 * 86400) =>
  `ml=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const withCookie = (body: unknown, cookie: string) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'set-cookie': cookie } });

/** Signed-in user: session cookie, or local DEV_USER (npm run dev), or a valid Access token. */
async function currentUser(req: Request, env: Env): Promise<User | null> {
  const session = await readSession(env, req.headers.get('cookie'));
  if (session) return session;
  if (env.DEV_USER) return { email: env.DEV_USER, role: 'admin' };
  const email = await accessUser(req, env);
  if (!email) return null;
  const { results } = await env.DB.prepare('SELECT role FROM users WHERE email = ?1').bind(email).all();
  return { email, role: ((results[0]?.role as Role) ?? 'player') };
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
    try {
      // public: login, register (invite code), logout
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const { email, pass } = await req.json() as { email: string; pass: string };
        const { results } = await env.DB.prepare('SELECT email, pass, role FROM users WHERE email = ?1').bind(email ?? '').all();
        const row = results[0] as { email: string; pass: string; role: Role } | undefined;
        if (!row || !(await checkPassword(pass ?? '', row.pass))) return json({ error: 'e-mail ou senha inválidos' }, 401);
        const u: User = { email: row.email, role: row.role };
        return withCookie(u, cookieHeader(await signSession(env, u)));
      }
      if (url.pathname === '/api/register' && req.method === 'POST') {
        const { email, pass, code } = await req.json() as { email: string; pass: string; code: string };
        if (!email?.includes('@') || (pass ?? '').length < 8) return json({ error: 'informe um e-mail válido e uma senha de 8 caracteres ou mais' }, 400);
        const { results: n } = await env.DB.prepare('SELECT count(*) AS n FROM users').all();
        const first = Number(n[0].n) === 0;
        let role: Role = 'player';
        if (first) role = 'admin';  // the first account bootstraps the admin
        else {
          const { results } = await env.DB.prepare('SELECT role FROM invites WHERE code = ?1 AND used_by IS NULL').bind(code ?? '').all();
          if (!results.length) return json({ error: 'código de convite inválido ou já usado' }, 403);
          role = results[0].role as Role;
        }
        try {
          await env.DB.batch([
            env.DB.prepare('INSERT INTO users (email, pass, role) VALUES (?1, ?2, ?3)').bind(email, await hashPassword(pass), role),
            env.DB.prepare("UPDATE invites SET used_by = ?1, used = datetime('now') WHERE code = ?2").bind(email, code ?? ''),
          ]);
        } catch (e) {
          return json({ error: /UNIQUE/i.test(String(e)) ? 'já existe conta com esse e-mail' : String(e) }, 409);
        }
        const u: User = { email, role };
        return withCookie(u, cookieHeader(await signSession(env, u)));
      }
      if (url.pathname === '/api/logout') return withCookie({ ok: true }, cookieHeader('', 0));

      const user = await currentUser(req, env);
      if (url.pathname === '/api/me') return user ? json(user) : json({ error: 'login required' }, 401);
      if (!user) return json({ error: 'login required' }, 401);
      const admin = user.role === 'admin';
      const userEmail = user.email;

      // ---- admin only: invites and users ----
      if (url.pathname === '/api/invites') {
        if (!admin) return json({ error: 'só admin' }, 403);
        if (req.method === 'POST') {
          const { role = 'player' } = await req.json().catch(() => ({})) as { role?: Role };
          const code = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(36)).join('').slice(0, 10).toUpperCase();
          await env.DB.prepare('INSERT INTO invites (code, role, created_by) VALUES (?1, ?2, ?3)')
            .bind(code, role === 'admin' ? 'admin' : 'player', userEmail).run();
          return json({ code, role });
        }
        const { results } = await env.DB.prepare('SELECT code, role, created_by, created, used_by FROM invites ORDER BY created DESC LIMIT 50').all();
        return json(results);
      }
      if (url.pathname === '/api/users') {
        if (!admin) return json({ error: 'só admin' }, 403);
        if (req.method === 'POST') {
          const { email, role } = await req.json() as { email: string; role: Role };
          await env.DB.prepare('UPDATE users SET role = ?2 WHERE email = ?1').bind(email, role === 'admin' ? 'admin' : 'player').run();
          return json({ ok: true });
        }
        const { results } = await env.DB.prepare('SELECT email, role, created FROM users ORDER BY created').all();
        return json(results);
      }

      // ---- left column: who is in the base, with sample size ----
      if (req.method === 'GET' && url.pathname === '/api/players') {
        const q = (url.searchParams.get('q') ?? '').trim();
        const like = q.replace(/[\\%_]/g, m => '\\' + m) + '%';
        const { results } = await env.DB.prepare(
          "SELECT site, nick, sum(hands) AS hands FROM stats WHERE (?1 = '' OR nick LIKE ?2 ESCAPE '\\') GROUP BY site, nick ORDER BY hands DESC LIMIT 300")
          .bind(q, like).all();
        return json(results);
      }
      if (req.method === 'POST' && url.pathname === '/api/upload') {
        if (!admin) return json({ error: 'só admin sobe mãos' }, 403);
        const sha = url.searchParams.get('sha') ?? '';
        const part = Number(url.searchParams.get('part'));
        if (!/^[0-9a-f]{64}$/.test(sha) || !Number.isInteger(part) || part < 0 || part > 100_000) return json({ error: 'bad sha/part' }, 400);
        const gz = await req.arrayBuffer();
        if (!gz.byteLength || gz.byteLength > MAX_BODY) return json({ error: 'empty or too large' }, 413);
        let text: string;
        try { text = await gunzip(gz); } catch { return json({ error: 'body must be gzip' }, 400); }
        await env.RAW.put(`uploads/${sha}/${String(part).padStart(5, '0')}.txt.gz`, gz); // raw first
        return json(await ingest(env, text, userEmail, sha, part));
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
        if (!admin) return json({ error: 'só admin' }, 403);
        const cursor = url.searchParams.get('cursor') || undefined;
        if (!cursor) await env.DB.batch([env.DB.prepare('DELETE FROM stats'), env.DB.prepare('DELETE FROM hands')]);
        const page = await env.RAW.list({ prefix: 'uploads/', cursor, limit: 1 });
        const done: IngestResult[] = [];
        for (const { key } of page.objects) {
          const obj = await env.RAW.get(key);
          const [, sha, part] = key.match(/^uploads\/([0-9a-f]{64})\/(\d+)\.txt\.gz$/) ?? [];
          if (obj && sha) done.push(await ingest(env, await gunzip(await obj.arrayBuffer()), `rebuild:${userEmail}`, sha, Number(part)));
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
