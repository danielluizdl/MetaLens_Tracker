// Rebuilds the local test fixture from your own hand history (not committed: see .gitignore).
// Usage: node scripts/make-fixture.mjs [hands_file] [keep-every-Nth]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { splitHands } from '../src/parser.ts';
import { aggregate, combine, MIN_PLAYERS } from '../src/stats.ts';

const [file = 'hands_dLzinN.txt', step = '20'] = process.argv.slice(2);
const blocks = [...splitHands(readFileSync(file, 'utf8'))].filter((_, i) => i % Number(step) === 0);
mkdirSync('test/fixtures', { recursive: true });
writeFileSync('test/fixtures/sample.txt', blocks.join(''));

const { stats, hands, errors } = aggregate(blocks.join(''), MIN_PLAYERS);
const hero = combine([...stats.values()].filter(s => s.player === 'dLzinN'));
const totals = {};
for (const s of stats.values()) for (const [k, [o, d]] of Object.entries(s.c)) { const v = (totals[k] ??= [0, 0]); v[0] += o; v[1] += d; }
const sort = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
writeFileSync('test/fixtures/sample-snapshot.json', JSON.stringify({ hands, errors: errors.length, heroHands: hero.hands, hero: sort(hero.c), totals: sort(totals) }));
console.log(`fixture: ${blocks.length} hands, snapshot with ${Object.keys(totals).length} keys`);
