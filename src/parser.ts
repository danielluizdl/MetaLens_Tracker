// PokerKing (PokerStars-syntax) hand-history parser → structured hand with every action.
// Adapted from CoinPokerTracker by mleclerc182 (cointracker/parser.py), Apache-2.0 +
// Commons Clause — see NOTICE. Changes: PokerKing syntax ($/¥, "and is all-in",
// "Uncalled bet", side pots), every player instead of hero only, STR position, no equity.

export type Street = 0 | 1 | 2 | 3; // preflop, flop, turn, river
export type Act = {
  p: string; st: Street;
  k: 'post' | 'fold' | 'check' | 'call' | 'bet' | 'raise';
  add: number;  // chips put in by this action (cents)
  to: number;   // player's street total after the action
  pot: number;  // pot before the action
  allin: boolean;
};
export type Hand = {
  site: string; id: string; stake: string; bb: number;
  order: string[];              // postflop acting order (SB … BTN)
  pos: Record<string, string>;  // BTN SB BB STR UTG UTG1 LJ HJ CO
  acts: Act[];
  stack: Record<string, number>; // cents at hand start
  net: Record<string, number>;  // cents, after rake
  won: Set<string>;             // collected something
  showdown: Set<string>;        // showed cards at showdown
  streets: Street;              // last street dealt
  rake: number;
};

const HEADER = /^(PokerKing) Hand #(\d+):\s+Hold'em No Limit \(([$¥])([\d.]+)\/[$¥]([\d.]+)/;
const TABLE = /^Table '[^']+' \d+-max Seat #(\d+) is the button$/;
const SEAT = /^Seat (\d+): (.+) \([$¥]([\d.]+) in chips\)$/;
const ACTION = /^(.+?): (posts the ante|posts small blind|posts big blind|posts straddle|folds|checks|calls|bets|raises)(?: [$¥]([\d.]+))?(?: to [$¥]([\d.]+))?( and is all-in)?$/;
const SHOWS = /^(.+?): shows \[/;
const UNCALLED = /^Uncalled bet \([$¥]([\d.]+)\) returned to (.+)$/;
const COLLECT = /^(.+) collected [$¥]([\d.]+) from (?:main |side )?pot(?:-\d+)?$/;
const STREET = /^\*\*\* (HOLE CARDS|FLOP|TURN|RIVER|SHOW DOWN|SUMMARY) \*\*\*/;
const RAKE = /\| Rake [$¥]([\d.]+)/;

const cents = (s: string) => Math.round(Number(s) * 100);
const KIND: Record<string, Act['k']> = { folds: 'fold', checks: 'check', calls: 'call', bets: 'bet', raises: 'raise' };

function positions(order: string[], straddler: string): Record<string, string> {
  if (order.length === 2) return { [order[0]]: 'BB', [order[1]]: 'BTN' };
  const pos: Record<string, string> = { [order[0]]: 'SB', [order[1]]: 'BB', [order.at(-1)!]: 'BTN' };
  let mid = order.slice(2, -1);
  if (mid[0] && mid[0] === straddler) { pos[mid[0]] = 'STR'; mid = mid.slice(1); }
  // Named from the button backwards, like H2N: with a straddle the first seat after STR is UTG1 ("U1").
  const labels = ['UTG', 'UTG1', 'LJ', 'HJ', 'CO'].slice(-mid.length);
  mid.forEach((p, i) => (pos[p] = labels[i]));
  return pos;
}

export function parseHand(text: string): Hand {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const h = HEADER.exec(lines[0]);
  if (!h) throw new Error(`bad header: ${lines[0]}`);
  const [, site, id, cur, sb, bbStr] = h;

  let button = 0;
  const seats: [number, string][] = [];
  const acts: Act[] = [];
  const put: Record<string, number> = {};
  const stack: Record<string, number> = {};
  const got: Record<string, number> = {};
  const showdown = new Set<string>();
  let street: Street = 0, sd = false, pot = 0, straddler = '';
  let streetPut: Record<string, number> = {};

  for (const line of lines.slice(1)) {
    let m: RegExpExecArray | null;
    if ((m = STREET.exec(line))) {
      if (m[1] === 'SUMMARY') break;
      if (m[1] === 'SHOW DOWN') sd = true;
      else if (m[1] !== 'HOLE CARDS') { street = (street + 1) as Street; streetPut = {}; }
    } else if ((m = TABLE.exec(line))) button = +m[1];
    else if ((m = SEAT.exec(line))) { seats.push([+m[1], m[2]]); put[m[2]] = 0; stack[m[2]] = cents(m[3]); }
    else if ((m = ACTION.exec(line))) {
      const [, p, verb, amt, to, allin] = m;
      const a = amt ? cents(amt) : 0;
      if (verb === 'posts the ante') { put[p] = (put[p] ?? 0) + a; pot += a; continue; }
      if (verb === 'posts straddle') straddler = p;
      const k = KIND[verb] ?? 'post';
      const before = streetPut[p] ?? 0;
      const total = k === 'raise' ? cents(to) : before + a;
      const add = total - before;
      acts.push({ p, st: street, k, add, to: total, pot, allin: !!allin });
      streetPut[p] = total; put[p] = (put[p] ?? 0) + add; pot += add;
    } else if ((m = UNCALLED.exec(line))) put[m[2]] -= cents(m[1]);
    else if ((m = COLLECT.exec(line))) got[m[1]] = (got[m[1]] ?? 0) + cents(m[2]);
    else if ((m = SHOWS.exec(line))) { if (sd) showdown.add(m[1]); }
    else throw new Error(`hand ${id}: unknown line: ${line}`);
  }

  const occ = seats.sort((a, b) => a[0] - b[0]);
  const bi = occ.findIndex(([s]) => s === button);
  const order = [...occ.slice(bi + 1), ...occ.slice(0, bi + 1)].map(([, p]) => p);
  const net: Record<string, number> = {};
  for (const p of Object.keys(put)) net[p] = (got[p] ?? 0) - put[p];
  return {
    site, id, stake: `${cur}${sb}/${cur}${bbStr}`, bb: cents(bbStr), order,
    pos: positions(order, straddler), acts, stack, net,
    won: new Set(Object.keys(got)), showdown, streets: street,
    rake: cents(RAKE.exec(text)?.[1] ?? '0'),
  };
}

export function* splitHands(text: string): Generator<string> {
  for (const block of text.split(/^(?=PokerKing Hand #)/m)) {
    if (block.includes('*** SUMMARY ***')) yield block; // skip truncated trailing hand
  }
}
