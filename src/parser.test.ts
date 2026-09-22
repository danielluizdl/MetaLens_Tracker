import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseHand, splitHands } from './parser.ts';
import { handStats } from './stats.ts';

// Real hand from hands_dLzinN.txt: straddle, open, call, bet + uncalled bet returned.
const HAND = `PokerKing Hand #1314494403095719936:  Hold'em No Limit ($0.10/$0.20 - Ante $0.10 USD) - 2026/08/31 18:59:35 UTC
Table 'PKNG_USD_1314365842679472128' 8-max Seat #6 is the button
Seat 1: GuillermoQQ ($234.04 in chips)
Seat 2: 菌子山大王 ($445.66 in chips)
Seat 3: prevara ($99.50 in chips)
Seat 4: comosiempre ($19.30 in chips)
Seat 5: Mario52 ($26.44 in chips)
Seat 6: woolyyy ($109.85 in chips)
Seat 7: 黄继光在此 ($106.86 in chips)
Seat 8: dLzinN ($60.22 in chips)
黄继光在此: posts small blind $0.10
dLzinN: posts big blind $0.20
GuillermoQQ: posts straddle $0.40
GuillermoQQ: posts the ante $0.10
菌子山大王: posts the ante $0.10
prevara: posts the ante $0.10
comosiempre: posts the ante $0.10
Mario52: posts the ante $0.10
woolyyy: posts the ante $0.10
黄继光在此: posts the ante $0.10
dLzinN: posts the ante $0.10
*** HOLE CARDS ***
菌子山大王: folds
prevara: folds
comosiempre: folds
Mario52: raises $1.90 to $2.30
woolyyy: calls $2.30
黄继光在此: folds
dLzinN: folds
GuillermoQQ: folds
*** FLOP *** [Jd 6d 4c]
Mario52: checks
woolyyy: checks
*** TURN *** [Jd 6d 4c] [3d]
Mario52: bets $4.58
woolyyy: folds
Uncalled bet ($4.58) returned to Mario52
Mario52 collected $6.10 from pot
*** SUMMARY ***
Total pot $6.10 | Rake $0
Board [Jd 6d 4c 3d]
Seat 5: Mario52 collected ($6.10)
`;

test('single hand: money, positions and preflop stats', () => {
  const h = parseHand(HAND);
  assert.deepEqual(
    { Mario52: h.net.Mario52, woolyyy: h.net.woolyyy, GuillermoQQ: h.net.GuillermoQQ, dLzinN: h.net.dLzinN },
    { Mario52: 370, woolyyy: -240, GuillermoQQ: -50, dLzinN: -30 });
  assert.deepEqual([h.pos.woolyyy, h.pos.黄继光在此, h.pos.dLzinN, h.pos.GuillermoQQ, h.pos.菌子山大王, h.pos.Mario52],
    ['BTN', 'SB', 'BB', 'STR', 'UTG1', 'CO']);
  const s = handStats(h);
  assert.deepEqual(s.Mario52['RFI.CO'], [1, 1]);
  assert.deepEqual(s.菌子山大王['RFI.UTG1'], [1, 0]);
  assert.equal(s.woolyyy['FLAT.BTN'], undefined, 'open to 11.5bb is outside the 6-7bb Flat definition');
  assert.deepEqual(s.GuillermoQQ.VPIP, [1, 0], 'straddle is not VPIP');
  assert.equal(s.GuillermoQQ['3B.STR.vsCO'], undefined, 'BTN already called the open: not a pure spot');
  assert.deepEqual(s.GuillermoQQ['3BET'], [1, 0], 'overall 3bet still counts it');
  assert.equal(s.prevara['3BET'], undefined, 'folded before the open');
  assert.deepEqual(s.woolyyy['FBTurn.IP'], [1, 1], 'IP caller folds to turn bet');
  assert.deepEqual(s.Mario52.BetFlop, [1, 0]);
});

const FILE = new URL('../hands_dLzinN.txt', import.meta.url);
test('full file: every hand parses and money balances (sum of nets = -rake)', { skip: !existsSync(FILE) }, () => {
  let n = 0;
  const bad: string[] = [];
  for (const b of splitHands(readFileSync(FILE, 'utf8'))) {
    const h = parseHand(b);
    n++;
    if (Object.values(h.net).reduce((x, y) => x + y, 0) !== -h.rake) bad.push(h.id);
  }
  assert.equal(n, 46768);
  assert.deepEqual(bad.slice(0, 5), []);
});
