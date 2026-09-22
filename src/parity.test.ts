// Parity with H2N.
// 1) Always: the versioned sample (test/fixtures/sample.txt, every 20th hand of dLzinN) must reproduce the
//    committed snapshot exactly — any change to parser/stats that moves a counter fails here.
//    Intentional definition changes: regenerate with `node src/parity.test.ts --update`.
// 2) When hands_dLzinN.txt is present: every PREFLOP catalog cell must match the H2N screenshots
//    (±1.5 points, sample within 5% / 10% for "k" values), except KNOWN_GAPS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { aggregate, combine, type Counters } from './stats.ts';
import { cells, value } from './catalog.ts';

const SAMPLE = new URL('../test/fixtures/sample.txt', import.meta.url);
const SNAPSHOT = new URL('../test/fixtures/sample-snapshot.json', import.meta.url);
const FULL = new URL('../hands_dLzinN.txt', import.meta.url);
const HERO = 'dLzinN';

function run(text: string) {
  const { stats, hands, errors } = aggregate(text, 5);
  const hero = combine([...stats.values()].filter(s => s.player === HERO));
  const totals: Counters = {};
  for (const s of stats.values()) for (const [k, [o, d]] of Object.entries(s.c)) { const v = (totals[k] ??= [0, 0]); v[0] += o; v[1] += d; }
  const sort = (o: Counters) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { hands, errors: errors.length, heroHands: hero.hands, hero: sort(hero.c), totals: sort(totals) };
}

if (process.argv.includes('--update')) {
  writeFileSync(SNAPSHOT, JSON.stringify(run(readFileSync(SAMPLE, 'utf8'))));
  console.log('snapshot updated');
}

test('sample fixture reproduces the committed counters snapshot',
  { skip: !existsSync(SAMPLE) && 'run `npm run fixture` with your own hand history first' }, () => {
  const got = run(readFileSync(SAMPLE, 'utf8'));
  const want = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  assert.deepEqual(got, want);
});

// Cells that do not match H2N yet, with the reason. Remove an entry when it starts matching.
const KNOWN_GAPS: Record<string, string> = {
  '4BET.shove': 'H2N 0 hands vs 6: stack measure in a very rare spot (value matches, 0%)',
  'RFI.BTN': 'H2N shows "1.2k" (rounded); we have 1,328',
  '4BS.BTN.IP': '47 vs 49 hands, 1 shove of difference',
  '4BSZ.BB.OOP': '9 vs 5 hands',
  '4BS.BB.OOP': '9 vs 5 hands',
  'F4B.BTN.IP': 'popup not read yet; 9 vs 5 hands',
};

test('preflop cells match the H2N screenshots', { skip: !existsSync(FULL) && 'hands_dLzinN.txt not present' }, () => {
  const { stats } = aggregate(readFileSync(FULL, 'utf8'), 5);
  const me = combine([...stats.values()].filter(s => s.player === HERO));
  const failures: string[] = [];
  let checked = 0;
  for (const { box, row, col, cell } of cells()) {
    // "Is Reg" cells wait for the reg list (TODOS.md); postflop screens wait for their popups (E3).
    if (box.screen !== 'PREFLOP' || cell.reg || !cell.h2n || KNOWN_GAPS[cell.key]) continue;
    const [hv, hn] = cell.h2n;
    const [opp] = me.c[cell.key] ?? [0, 0];
    const v = value(cell, me.c[cell.key]);
    const valueOk = isNaN(v) ? hv === 0 : Math.abs(v - hv) <= 1.5;
    const sampleOk = isNaN(hn) || (hn >= 1000 ? Math.abs(opp - hn) / hn <= 0.1 : Math.abs(opp - hn) <= Math.max(2, hn * 0.05));
    checked++;
    if (!valueOk || !sampleOk) failures.push(`${box.title} ${row}${col ? ' ' + col : ''} [${cell.key}]: ${v.toFixed(1)} (${opp}) vs H2N ${hv} (${hn})`);
  }
  assert.ok(checked >= 50, `only ${checked} cells checked`);
  assert.deepEqual(failures, []);
});

test.todo('postflop cells match H2N (needs the popup definitions — TODOS.md)');
test.todo('"Is Reg" cells match H2N (needs the H2N reg list — TODOS.md)');
