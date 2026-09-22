import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseHand, splitHands } from './parser.ts';
import { handStats } from './stats.ts';
import { CATALOG, cells } from './catalog.ts';

// The fixture holds real hands, so it stays out of the repo (npm run fixture rebuilds it locally).
const FIXTURE = new URL('../test/fixtures/sample.txt', import.meta.url);
const noFixture = !existsSync(FIXTURE) && 'run `npm run fixture` with your own hand history first';
const sample = noFixture ? [] : [...splitHands(readFileSync(FIXTURE, 'utf8'))].map(parseHand);
const produced = new Set<string>();
for (const h of sample) for (const c of Object.values(handStats(h, () => true))) for (const k of Object.keys(c)) produced.add(k);

// Keys too rare to appear in 2k sample hands; checked against the full file by parity.test.ts.
const RARE = new Set(['4BET.shove', '4BSZ.BB.OOP', '4BS.BB.OOP', 'F4B.HJ.IP', 'F4B.CO.IP', 'F4B.BTN.IP', 'F4B.BB.IP', 'F4B.BB.OOP',
  'F4B.STR.IP', 'F4B.STR.OOP', 'F4B.SB.OOP', 'F3B.HJ.vsBTN', 'F3B.HJ.vsSB', 'F3B.HJ.vsBB', 'F3B.HJ.vsSTR', 'SRP.OOP.BsBB', '3BP.OOP.BsBB', 'RL.Bs']);

test('every catalog key is produced by stats.ts (typo guard)', { skip: noFixture }, () => {
  const missing = cells().map(c => c.cell.key).filter(k => !produced.has(k) && !RARE.has(k));
  assert.deepEqual(missing, []);
});

test('every "Is Reg" cell has its .reg twin when the villain is a reg', { skip: noFixture }, () => {
  const missing = cells().filter(c => c.cell.reg && produced.has(c.cell.key) && !produced.has(`${c.cell.key}.reg`)).map(c => c.cell.key);
  assert.deepEqual(missing, []);
});

test('no .reg counters when nobody is a reg', { skip: noFixture }, () => {
  const regKeys = sample.flatMap(h => Object.values(handStats(h)).flatMap(c => Object.keys(c))).filter(k => k.endsWith('.reg'));
  assert.deepEqual(regKeys, []);
});

test('grid boxes: every row has one cell per column', () => {
  for (const box of CATALOG) for (const r of box.rows)
    assert.equal(r.cells.length, box.cols?.length ?? 1, `${box.title} / ${r.label}`);
});
