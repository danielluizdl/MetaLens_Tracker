// Dev-only preview: serves public/ with the API answered from test/fixtures/sample.txt.
// No Worker, no D1, no Access. Usage: node scripts/preview.mjs [port]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { aggregate, combine, MIN_PLAYERS } from '../src/stats.ts';

const port = Number(process.argv[2] ?? 8790);
const { stats } = aggregate(readFileSync('test/fixtures/sample.txt', 'utf8'), MIN_PLAYERS);
const byPlayer = new Map();
for (const s of stats.values()) (byPlayer.get(s.player) ?? byPlayer.set(s.player, []).get(s.player)).push(s);

const files = { '/': ['public/index.html', 'text/html'], '/app.js': ['public/app.js', 'text/javascript'] };
const json = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = files[url.pathname];
  if (file) { res.writeHead(200, { 'content-type': file[1] }); return res.end(readFileSync(file[0])); }
  if (url.pathname === '/api/regs') return json(res, { regs: 0 });
  if (url.pathname === '/api/player') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const rows = [...byPlayer].filter(([n]) => n.toLowerCase().startsWith(q))
      .map(([nick, list]) => ({ site: 'PokerKing', nick, hands: list.reduce((a, s) => a + s.hands, 0) }))
      .sort((a, b) => b.hands - a.hands).slice(0, 20);
    return json(res, rows);
  }
  if (url.pathname === '/api/stats') {
    const list = byPlayer.get(url.searchParams.get('nick') ?? '');
    if (!list) return json(res, { error: 'player not found' }, 404);
    return json(res, { site: 'PokerKing', nick: list[0].player, team: false,
      stakes: list.map(s => ({ stake: s.stake, hands: s.hands, net_bb: s.netBB, c: s.c })) });
  }
  json(res, { error: 'not found' }, 404);
}).listen(port, () => console.log(`preview: http://localhost:${port} (${byPlayer.size} players, combine=${typeof combine})`));
