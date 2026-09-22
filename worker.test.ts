// Worker integration tests: real workerd via Miniflare, in-memory D1 + R2, real RS256 Access JWTs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash, webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { splitHands } from './src/parser.ts';
import { aggregate, MIN_PLAYERS } from './src/stats.ts';

const AUD = 'test-aud';
// Real hands stay out of the repo: npm run fixture rebuilds test/fixtures/sample.txt locally.
const FIXTURE = new URL('./test/fixtures/sample.txt', import.meta.url);
const skip = !existsSync(FIXTURE) && 'run `npm run fixture` with your own hand history first';
const blocks = skip ? [] : [...splitHands(readFileSync(FIXTURE, 'utf8'))];
let mf: Miniflare;
let signer: CryptoKey;

async function jwt(email: string, { aud = AUD, exp = Date.now() / 1000 + 600, kid = 'k1' } = {}) {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${enc({ alg: 'RS256', kid })}.${enc({ aud: [aud], email, exp })}`;
  const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', signer, new TextEncoder().encode(data));
  return `${data}.${Buffer.from(sig).toString('base64url')}`;
}
async function api(path: string, init: RequestInit & { user?: string | null } = {}) {
  const headers = new Headers(init.headers);
  if (init.user !== null) headers.set('cf-access-jwt-assertion', await jwt(init.user ?? 'a@team.com'));
  const res = await mf.dispatchFetch(`http://localhost${path}`, { ...init, headers } as never);
  return { status: res.status, body: await res.json() as any };
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const upload = (text: string, part = 0, user?: string) =>
  api(`/api/upload?sha=${sha(text)}&part=${part}`, { method: 'POST', body: gzipSync(text), user });

before(async () => {
  if (skip) return;
  const keys = await webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  signer = keys.privateKey;
  const pub = { ...(await webcrypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
  const { outputFiles } = await build({ entryPoints: ['worker.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
  mf = new Miniflare({
    modules: true, script: outputFiles[0].text, compatibilityDate: '2025-09-01',
    d1Databases: ['DB'], r2Buckets: ['RAW'],
    bindings: { ACCESS_AUD: AUD, ACCESS_JWKS: JSON.stringify({ keys: [pub] }), ADMINS: 'admin@team.com' },
  });
  const db = await mf.getD1Database('DB');
  for (const stmt of readFileSync('schema.sql', 'utf8').replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean))
    await db.prepare(stmt).run();
  // Access-authenticated users take their role from the users table (uploads are admin-only).
  for (const [email, role] of [['a@team.com', 'admin'], ['b@team.com', 'admin'], ['c@team.com', 'admin'],
    ['admin@team.com', 'admin'], ['player@team.com', 'player']])
    await db.prepare("INSERT INTO users (email, pass, role) VALUES (?1, 'x', ?2)").bind(email, role).run();
});
after(() => mf?.dispose());

test('DEV_USER (local mode) skips Access, and only when it is set', { skip }, async () => {
  const local = new Miniflare({
    modules: true, script: (await build({ entryPoints: ['worker.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' })).outputFiles[0].text,
    compatibilityDate: '2025-09-01', d1Databases: ['DB'], r2Buckets: ['RAW'],
    bindings: { ACCESS_AUD: AUD, DEV_USER: 'eu@local' },
  });
  const db = await local.getD1Database('DB');
  for (const stmt of readFileSync('schema.sql', 'utf8').replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
  const res = await local.dispatchFetch('http://localhost/api/regs'); // no token at all
  assert.equal(res.status, 200);
  await local.dispose();
});

test('requests without a valid Access token are rejected', { skip }, async () => {
  assert.equal((await api('/api/regs', { user: null })).status, 401);
  const res = await mf.dispatchFetch('http://localhost/api/regs', { headers: { 'cf-access-jwt-assertion': await jwt('a@team.com', { aud: 'other' }) } });
  assert.equal(res.status, 401, 'wrong audience');
  const expired = await mf.dispatchFetch('http://localhost/api/regs', { headers: { 'cf-access-jwt-assertion': await jwt('a@team.com', { exp: 1 }) } });
  assert.equal(expired.status, 401, 'expired');
});

test('upload validates sha, part and gzip body', { skip }, async () => {
  assert.equal((await api('/api/upload?sha=zz&part=0', { method: 'POST', body: gzipSync('x') })).status, 400);
  assert.equal((await api(`/api/upload?sha=${sha('x')}&part=0`, { method: 'POST', body: 'not gzip' })).status, 400);
});

const firstHalf = blocks.slice(0, 1000).join('');
const overlap = blocks.slice(500, 1500).join('');

test('upload counts hands and stores counters equal to the local aggregate', { skip }, async () => {
  const r = await upload(firstHalf);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { new: 1000, dup: 0, rejected: 0 });
  const local = aggregate(firstHalf, MIN_PLAYERS);
  const hero = [...local.stats.values()].filter(s => s.player === 'dLzinN');
  const s = await api('/api/stats?nick=dLzinN');
  assert.equal(s.status, 200);
  for (const want of hero) {
    const got = s.body.stakes.find((x: any) => x.stake === want.stake);
    assert.equal(got.hands, want.hands, want.stake);
    assert.deepEqual(got.c, want.c, `counters for ${want.stake}`);
  }
});

test('re-uploading the same hands adds nothing', { skip }, async () => {
  const before = (await api('/api/stats?nick=dLzinN')).body;
  const r = await upload(firstHalf, 1);
  assert.deepEqual(r.body, { new: 0, dup: 1000, rejected: 0 });
  assert.deepEqual((await api('/api/stats?nick=dLzinN')).body, before);
});

test('two concurrent uploads with overlapping hands never double count', { skip }, async () => {
  const [a, b] = await Promise.all([upload(overlap, 0, 'b@team.com'), upload(blocks.slice(1200, 1800).join(''), 0, 'c@team.com')]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const all = aggregate(blocks.slice(0, 1800).join(''), MIN_PLAYERS);
  const want = [...all.stats.values()].filter(s => s.player === 'dLzinN');
  const got = (await api('/api/stats?nick=dLzinN')).body.stakes;
  for (const w of want) assert.deepEqual(got.find((x: any) => x.stake === w.stake).c, w.c, w.stake);
});

test('unknown hand lines are rejected and counted, the rest is kept', { skip }, async () => {
  const broken = blocks[1900].replace('*** HOLE CARDS ***', '*** HOLE CARDS ***\nsomeone: does a weird thing');
  const r = await upload(broken + blocks[1901]);
  assert.deepEqual(r.body, { new: 1, dup: 0, rejected: 1 });
});

test('player search is a case-insensitive prefix search and escapes wildcards', { skip }, async () => {
  const r = await api('/api/player?q=dlz');
  assert.equal(r.body[0].nick, 'dLzinN');
  assert.deepEqual((await api('/api/player?q=%25')).body, [], '% is literal');
  const chinese = blocks.join('').match(/Seat \d+: ([一-鿿][^\s(]*) \(/)?.[1];
  if (chinese) assert.ok((await api(`/api/player?q=${encodeURIComponent(chinese.slice(0, 1))}`)).body.length > 0, 'chinese prefix');
  assert.equal((await api('/api/stats?nick=nobody_here')).status, 404);
});

test('team members have bb/100 hidden', { skip }, async () => {
  const db = await mf.getD1Database('DB');
  await db.prepare("INSERT INTO team (site, nick) VALUES ('PokerKing', 'dLzinN')").run();
  const s = await api('/api/stats?nick=dLzinN');
  assert.equal(s.body.team, true);
  assert.ok(s.body.stakes.every((x: any) => x.net_bb === null));
  await db.prepare('DELETE FROM team').run();
});

test('rebuild (admin only) recomputes the same counters from R2, with regs applied', { skip }, async () => {
  assert.equal((await api('/api/admin/rebuild', { method: 'POST', user: 'player@team.com' })).status, 403);
  const before = (await api('/api/stats?nick=dLzinN')).body;
  const db = await mf.getD1Database('DB');
  await db.prepare("INSERT INTO regs (site, nick) SELECT 'PokerKing', nick FROM stats GROUP BY nick").run(); // everyone is a reg
  let cursor = '';
  do {
    const r = await api(`/api/admin/rebuild${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { method: 'POST', user: 'admin@team.com' });
    assert.equal(r.status, 200);
    cursor = r.body.cursor;
  } while (cursor);
  const after = (await api('/api/stats?nick=dLzinN')).body;
  for (const s of before.stakes) {
    const a = after.stakes.find((x: any) => x.stake === s.stake);
    assert.equal(a.hands, s.hands, s.stake);
    for (const [k, v] of Object.entries(s.c)) assert.deepEqual(a.c[k], v, k); // vs-all counters unchanged
    const regKeys = Object.keys(a.c).filter(k => k.endsWith('.reg'));
    for (const k of regKeys) assert.deepEqual(a.c[k], a.c[k.slice(0, -4)], `${k} equals vs-all when everyone is a reg`);
  }
  assert.equal((await api('/api/regs')).body.regs > 0, true);
});

// ---------- accounts, invites and roles ----------
async function fresh() {
  const { outputFiles } = await build({ entryPoints: ['worker.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
  const m = new Miniflare({
    modules: true, script: outputFiles[0].text, compatibilityDate: '2025-09-01',
    d1Databases: ['DB'], r2Buckets: ['RAW'], bindings: { ACCESS_AUD: AUD, SESSION_SECRET: 'test-secret' },
  });
  const db = await m.getD1Database('DB');
  for (const stmt of readFileSync('schema.sql', 'utf8').replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
  const call = async (path: string, init: RequestInit & { cookie?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.cookie) headers.set('cookie', init.cookie);
    const res = await m.dispatchFetch(`http://localhost${path}`, { ...init, headers } as never);
    return { status: res.status, body: await res.json() as any, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' };
  };
  return { m, call };
}

test('first account becomes admin, the next ones need a valid invite', async () => {
  const { m, call } = await fresh();
  const first = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'boss@team.com', pass: 'segredo123' }) });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { email: 'boss@team.com', role: 'admin' });

  const noInvite = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'x@team.com', pass: 'segredo123' }) });
  assert.equal(noInvite.status, 403, 'second account without an invite is refused');

  const short = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'x@team.com', pass: 'curta' }) });
  assert.equal(short.status, 400, 'password shorter than 8 characters');

  const invite = await call('/api/invites', { method: 'POST', body: JSON.stringify({ role: 'player' }), cookie: first.cookie });
  assert.equal(invite.status, 200);
  const joined = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'novo@team.com', pass: 'segredo123', code: invite.body.code }) });
  assert.deepEqual(joined.body, { email: 'novo@team.com', role: 'player' });

  const reuse = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'outro@team.com', pass: 'segredo123', code: invite.body.code }) });
  assert.equal(reuse.status, 403, 'an invite works only once');
  await m.dispose();
});

test('login checks the password and the session cookie identifies the user', async () => {
  const { m, call } = await fresh();
  const reg = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'boss@team.com', pass: 'segredo123' }) });
  assert.equal((await call('/api/login', { method: 'POST', body: JSON.stringify({ email: 'boss@team.com', pass: 'errada' }) })).status, 401);
  const ok = await call('/api/login', { method: 'POST', body: JSON.stringify({ email: 'boss@team.com', pass: 'segredo123' }) });
  assert.equal(ok.status, 200);
  assert.deepEqual((await call('/api/me', { cookie: ok.cookie })).body, { email: 'boss@team.com', role: 'admin' });
  assert.equal((await call('/api/me')).status, 401, 'no cookie, no session');
  assert.equal((await call('/api/me', { cookie: 'ml=forjado.abc' })).status, 401, 'tampered cookie');
  assert.ok(reg.cookie.startsWith('ml='));
  await m.dispose();
});

test('player role can read but cannot upload, invite or rebuild', async () => {
  const { m, call } = await fresh();
  const boss = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'boss@team.com', pass: 'segredo123' }) });
  const invite = await call('/api/invites', { method: 'POST', body: JSON.stringify({ role: 'player' }), cookie: boss.cookie });
  const p = await call('/api/register', { method: 'POST', body: JSON.stringify({ email: 'peao@team.com', pass: 'segredo123', code: invite.body.code }) });

  assert.equal((await call('/api/players', { cookie: p.cookie })).status, 200, 'player reads the base');
  assert.equal((await call('/api/upload?sha=' + sha('x') + '&part=0', { method: 'POST', body: gzipSync('x'), cookie: p.cookie })).status, 403);
  assert.equal((await call('/api/invites', { method: 'POST', body: '{}', cookie: p.cookie })).status, 403);
  assert.equal((await call('/api/users', { cookie: p.cookie })).status, 403);
  assert.equal((await call('/api/admin/rebuild', { method: 'POST', cookie: p.cookie })).status, 403);
  await m.dispose();
});

test('the players column lists the base with hand counts', { skip }, async () => {
  const rows = (await api('/api/players')).body as { nick: string; hands: number }[];
  assert.ok(rows.length > 0);
  assert.equal(rows[0].nick, 'dLzinN', 'sorted by hands');
  assert.ok(rows.every((r, i) => i === 0 || r.hands <= rows[i - 1].hands));
  const filtered = (await api('/api/players?q=dlz')).body as { nick: string }[];
  assert.deepEqual(filtered.map(r => r.nick), ['dLzinN']);
});
