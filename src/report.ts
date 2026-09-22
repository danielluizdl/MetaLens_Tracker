// Prints a player's stats next to the H2N screenshots (gabarito from src/catalog.ts).
// Usage: node src/report.ts [file] [player] [minPlayers] [regs.txt]
// H2N's numbers match only tables with 5+ players (43,130 of 46,768 hands), hence the default.
// "Is Reg" cells print the vs-all value; with a regs file they also print the vs-reg value.
import { existsSync, readFileSync } from 'node:fs';
import { aggregate, combine, type Stats } from './stats.ts';
import { cells, value } from './catalog.ts';

const [file = 'hands_dLzinN.txt', player = 'dLzinN', minPlayers = '5', regsFile] = process.argv.slice(2);
const regs = new Set(regsFile && existsSync(regsFile) ? readFileSync(regsFile, 'utf8').split(/\r?\n/).filter(Boolean) : []);
const t = performance.now();
const { stats, hands, errors } = aggregate(readFileSync(file, 'utf8'), +minPlayers, n => regs.has(n));
const me: Stats = combine([...stats.values()].filter(s => s.player === player));
console.log(`${hands} hands parsed in ${((performance.now() - t) / 1000).toFixed(1)} s, ${errors.length} errors; ${player}: ${me.hands} hands, ${(100 * me.netBB / me.hands).toFixed(1)} bb/100 (H2N 24)${regs.size ? `; ${regs.size} regs` : ''}\n`);

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
const show = (key: string, ratio?: boolean) => {
  const v = value({ key, ratio }, me.c[key]);
  return `${isNaN(v) ? '-' : v.toFixed(1)} (${fmt(me.c[key]?.[0] ?? 0)})`;
};
let box = '';
for (const { box: b, row, col, cell } of cells()) {
  if (b.title !== box) { box = b.title; console.log(`\n${b.screen} — ${b.title}`); console.log(`  ${'stat'.padEnd(34)} ${'nosso'.padStart(12)} ${'H2N'.padStart(12)}   diff`); }
  const label = `${row}${col ? ` ${col}` : ''}${cell.reg ? ' *reg' : ''}`;
  const v = value(cell, me.c[cell.key]);
  const [hv, hn] = cell.h2n ?? [NaN, NaN];
  const theirs = isNaN(hv) ? '-' : `${hv} (${isNaN(hn) ? '?' : fmt(hn)})`;
  const diff = isNaN(hv) || isNaN(v) ? '' : (v - hv > 0 ? '+' : '') + (v - hv).toFixed(1);
  const regCol = cell.reg && regs.size ? `   vs reg: ${show(`${cell.key}.reg`)}` : '';
  console.log(`  ${label.padEnd(34)} ${show(cell.key, cell.ratio).padStart(12)} ${theirs.padStart(12)}   ${diff}${regCol}`);
}
