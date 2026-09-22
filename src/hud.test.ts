import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tone, fmtValue, fmtSample, keyFor, tooltip, describe as ruleOf } from './hud.ts';
import { cells } from './catalog.ts';

const cell = { key: 'X', range: [20, 28] as [number, number] };

test('tone follows the reference range (blue / green / yellow / red)', () => {
  assert.equal(tone(cell, { X: [100, 15] }), 'below');   // 15%
  assert.equal(tone(cell, { X: [100, 24] }), 'inside');  // 24%
  assert.equal(tone(cell, { X: [100, 30] }), 'above');   // 30% <= 28 + 2
  assert.equal(tone(cell, { X: [100, 45] }), 'far');
  assert.equal(tone(cell, { X: [100, 20] }), 'inside');  // exactly on the low bound
  assert.equal(tone(cell, { X: [100, 28] }), 'inside');  // exactly on the high bound
});

test('small samples are dimmed and empty cells have no tone', () => {
  assert.equal(tone(cell, { X: [9, 5] }), 'dim');
  assert.equal(tone(cell, {}), 'none');
  assert.equal(tone({ key: 'X' }, { X: [50, 5] }), 'plain', 'no range = no color');
});

test('value and sample formatting matches the H2N look', () => {
  assert.equal(fmtValue(cell, { X: [200, 27] }), '13.5');
  assert.equal(fmtValue(cell, {}), '-');
  assert.equal(fmtValue({ key: 'X', ratio: true }, { X: [100, 250] }), '2.5');
  assert.equal(fmtSample(43130), '43.1k');
  assert.equal(fmtSample(606), '606');
});

test('"vs reg" reads the .reg twin only for cells that need it', () => {
  assert.equal(keyFor({ key: '3B.CO.vsHJ', reg: true }, true), '3B.CO.vsHJ.reg');
  assert.equal(keyFor({ key: '3B.CO.vsHJ', reg: true }, false), '3B.CO.vsHJ');
  assert.equal(keyFor({ key: 'VPIP' }, true), 'VPIP');
});

test('tooltip shows counts, range and the rule', () => {
  const t = tooltip({ key: 'FLAT.CO', range: [6, 10] }, 'FLAT vs RFI CO', { 'FLAT.CO': [596, 60] }, false);
  assert.match(t, /FLAT vs RFI CO/);
  assert.match(t, /60 de 596 \(10\.1%\)/);
  assert.match(t, /faixa 6-10 · acima da faixa/); // 10.1% passa de 10
  assert.match(t, /Alguém abriu/);
  assert.match(tooltip({ key: 'VPIP' }, 'VPIP', {}, false), /sem mãos ainda/);
});

test('every catalog cell has a rule description', () => {
  const missing = [...new Set(cells().map(c => c.cell.key).filter(k => !ruleOf(k)))];
  assert.deepEqual(missing, []);
});
