// H2N-style stats. Every stat is a pair [opportunities, times done], summed per
// (player, stake); percentages are computed at read time. Key names follow the
// four H2N screens in gabarito_dLzinN/ (see report.ts for labels).
import { parseHand, splitHands, type Act, type Hand, type Street } from './parser.ts';

export type Counters = Record<string, [number, number]>;
export type Stats = { player: string; stake: string; hands: number; netBB: number; c: Counters };

const S = ['Pre', 'Flop', 'Turn', 'River'];
const BET_SIZES: [number, string][] = [[40, 'B30'], [62.5, 'B50'], [92.5, 'B75'], [130, 'B110'], [Infinity, 'B130']];
const FOLD_SIZES: [number, string][] = [[40, 'F30'], [62.5, 'F50'], [87.5, 'F75'], [110, 'F100'], [135, 'F120'], [Infinity, 'F150']];
const bucket = (pct: number, t: [number, string][]) => t.find(([max]) => pct < max)![1];
const pctOf = (a: Act) => (100 * a.add) / a.pot;
// ponytail: "small bet" / block = under 40% pot; tune against H2N sample sizes if they drift.
const SMALL = 40;
const norm = (line: string) => line.replace(/s/g, 'B');
// H2N "Flat do <pos>" popups: open size range in bb, and whether blind openers are excluded.
// All: 6-8 players; STR also needs initial pot 6-8bb. Matches all 7 rows exactly (sample + calls).
const FLAT: Record<string, [number, number, boolean]> = {
  LJ: [6, 7, false], HJ: [6, 7, false], CO: [6, 7, false], BTN: [6, 7, false],
  SB: [6, 8, true], BB: [6, 8, true], STR: [5, 8, true],
};

// SB/BB RFI popups: initial pot range (bb) and 6-8 players.
const RFI_POT: Record<string, [number, number]> = { SB: [6, 9], BB: [6, 8] };
// STR-DEFENSE popups: [key, opener positions, open size lo-hi (bb), initial pot lo-hi, min players]
const STR_DEF: [string, string[], number, number, number, number, number][] = [
  ['STR.CC.6bb.vsMP', ['LJ', 'HJ'], 5, 6.5, 6, 8, 5], ['STR.CC.6bb.vsCO', ['CO'], 5, 6.5, 6, 8, 5],
  ['STR.CC.6bb.vsBTN', ['BTN'], 5, 6.5, 6, 8, 5], ['STR.CC.6bb.vsSB', ['SB'], 8, 9, 5, 9, 6],
  ['STR.CC.6bb.vsBB', ['BB'], 8, 9, 6, 9, 6],
  ['STR.CC.7-8bb.vsMP', ['LJ', 'HJ'], 7, 8.5, 6, 8, 5], ['STR.CC.7-8bb.vsCO', ['CO'], 7, 8.5, 6, 8, 5],
  ['STR.CC.7-8bb.vsBTN', ['BTN'], 7, 8.5, 6, 8, 5],
  // "3b do Str" cells also require "Is Reg" (not applied)
  ['STR.3B.6bb.vsMP', ['HJ'], 5, 8, 0, 99, 6], ['STR.3B.6bb.vsCO', ['CO'], 5, 8, 0, 99, 5],
  ['STR.3B.6bb.vsBTN', ['BTN'], 5, 6.5, 0, 99, 6], ['STR.3B.6bb.vsSB', ['SB'], 7, 8, 0, 99, 6],
  ['STR.3B.6bb.vsBB', ['BB'], 7, 8.5, 0, 99, 6],
];
// FOLD 3BET <pos> popups: [open lo, open hi, 3bet lo, 3bet hi, min players]
const F3B: Record<string, [number, number, number, number, number]> = {
  def: [5, 8, 20, 36, 5], SB: [6, 9, 18, 34, 6], BB: [5, 9, 18, 34, 6],
};
// FOLD 4BET <pos> popups: minimum 4bet size (bb)
const F4B_MIN: Record<string, number> = { SB: 50, BB: 50, STR: 50 };

// isReg: H2N "Is Reg" (player color marker). Cells that require it are emitted twice:
// `<key>` (vs everyone) and `<key>.reg` (only when the villain is a marked reg).
export type IsReg = (nick: string) => boolean;
const noRegs: IsReg = () => false;

export function handStats(h: Hand, isReg: IsReg = noRegs): Record<string, Counters> {
  const out: Record<string, Counters> = {};
  const add = (p: string, key: string, opp: number, did: number) => {
    const v = ((out[p] ??= {})[key] ??= [0, 0]);
    v[0] += opp; v[1] += did;
  };
  const hit = (p: string, key: string, did: boolean) => add(p, key, 1, did ? 1 : 0);
  const hitReg = (p: string, key: string, villain: string, did: boolean) => {
    hit(p, key, did);
    if (isReg(villain)) hit(p, `${key}.reg`, did);
  };
  const pos = (p: string) => h.pos[p] ?? '?';
  const side = (a: string, b: string) => (h.order.indexOf(a) > h.order.indexOf(b) ? 'IP' : 'OOP');

  // ---------- Image 1: preflop ----------
  // Every rule below is transcribed from the H2N stat popups (gabarito_dLzinN/definicoes_h2n.md).
  let level = 0, limpers = 0, callers = 0, openTo = 0, threeTo = 0, fourTo = 0;
  let opener = '', threeBettor = '', fourBettor = '', pfa = '', squeeze = false, threeFirst = false;
  let threeAllin = false, fourAllin = false, callsAt4 = false, coldAt3 = false;
  const n = h.order.length, bbs = (c: number) => c / h.bb, stk = (p: string) => bbs(h.stack[p] ?? 0);
  const pot0 = bbs(h.acts.find(a => a.k !== 'post')?.pot ?? 0); // blinds + straddle + antes
  const blind = (x: string) => x === 'SB' || x === 'BB';
  const acted = new Set<string>(), vpip = new Set<string>(), pfr = new Set<string>(), foldedPre = new Set<string>();
  for (const a of h.acts) {
    if (a.st !== 0) break;
    if (a.k === 'post') continue;
    const { p } = a, P = pos(p);
    const fold = a.k === 'fold', call = a.k === 'call', raise = a.k === 'raise';
    const first = !acted.has(p), o = pos(opener), openBB = bbs(openTo);
    if (level === 0 && limpers === 0 && first) {
      const [lo, hi] = RFI_POT[P] ?? [0, 99];
      if (!RFI_POT[P] || (n >= 6 && pot0 >= lo && pot0 <= hi)) hit(p, `RFI.${P}`, raise);
      hit(p, `LIMP.${P}`, call);
    }
    // 3bet [Total]: facing the first raise (limpers allowed)
    if (level === 1 && p !== opener) hit(p, '3BET', raise);
    // Facing an open raise nobody else entered: flat / STR-defense by position
    if (level === 1 && p !== opener && first && limpers === 0 && callers === 0) {
      const f = FLAT[P];
      if (f && n >= 6 && openBB >= f[0] && openBB <= f[1] && !(f[2] && blind(o))
        && (P !== 'STR' || (pot0 >= 6 && pot0 <= 8))) hit(p, `FLAT.${P}`, call);
      if (P === 'STR') for (const [key, vs, lo, hi, pl, ph, minN] of STR_DEF)
        if (vs.includes(o) && openBB >= lo && openBB <= hi && pot0 >= pl && pot0 <= ph && n >= minN)
          if (key.includes('.CC.')) hit(p, key, call);
          else hitReg(p, key, opener, raise); // "3b do Str" cells require Is Reg
    }
    // 3BET <pos> vs <pos>: villain's first raise 5-8bb, nobody called it before us. H2N also requires
    // "Is Reg" (villain classified as regular) — not applied: depends on H2N's player classification.
    // Opens from SB/BB use 6-10bb in these popups.
    const [o3lo, o3hi] = blind(o) ? [6, 10] : [5, 8];
    if (level === 1 && p !== opener && callers === 0 && openBB >= o3lo && openBB <= o3hi) hitReg(p, `3B.${P}.vs${o}`, opener, raise);
    if (level === 2 && p === opener && limpers === 0 && callers === 0 && !squeeze) {
      // Fold to 3bet / 4bet [Total]: our RFI, a non-squeeze 3bet nobody called
      hit(p, 'F3BET', fold);
      if (!threeAllin) hit(p, '4BET', raise);
      // "4bet shove" popup: vs a min-3bet (5-14bb), both stacks >= 90bb, we 4bet all-in
      if (stk(p) >= 90 && stk(threeBettor) >= 90 && bbs(threeTo) >= 5 && bbs(threeTo) <= 14) hit(p, '4BET.shove', raise && a.allin);
      const f = F3B[P] ?? F3B.def, tb = bbs(threeTo);
      if (n >= f[4] && openBB >= f[0] && openBB <= f[1] && tb >= f[2] && tb <= f[3]) hit(p, `F3B.${P}.vs${pos(threeBettor)}`, fold);
    }
    // 4BET <pos> vs IP/OOP: our first raise, villain 3bets, we 4bet; effective stack >= 80bb.
    // SIZE / SHOVE variants: effective 175-250bb, 4bet not all-in / all-in.
    if (level === 2 && p === opener && !threeAllin && callers === 0 && !coldAt3) {
      const eff = Math.min(stk(p), stk(threeBettor)), sd = side(p, threeBettor), tp = pos(threeBettor);
      // Popup villain groups: SB vs BB/STR ("BB-STD8"), BB vs STR; others: "vs OOP" = 3bet from the
      // Blinds (SB/BB/STR), "vs IP" = 3bet from a non-blind seat behind us (CO/BTN).
      const vBlind = blind(tp) || tp === 'STR';
      const grpOk = P === 'SB' ? tp === 'BB' || tp === 'STR' : P === 'BB' ? tp === 'STR' : sd === 'IP' ? vBlind : !vBlind;
      if (grpOk && eff >= 80) hit(p, `4B.${P}.${sd}`, raise);
      if (grpOk && eff >= 175 && eff <= 250) { hit(p, `4BSZ.${P}.${sd}`, raise && !a.allin); hit(p, `4BS.${P}.${sd}`, raise && a.allin); }
    }
    // Fold to 4bet / 5bet shove [Total]: villain RFI, our 3bet was our first action, same villain 4bets.
    // H2N action sequences are strict: nobody else may call between the listed actions.
    if (level === 3 && p === threeBettor && threeFirst && fourBettor === opener && limpers === 0
      && !squeeze && !callsAt4 && callers === 0) {
      hit(p, 'F4BET', fold);
      if (!fourAllin) hit(p, '5BET.shove', raise && a.allin);
      // FOLD 4BET <pos>: both stacks >= 200bb, villain (non-blind) 4bets at least 40/50bb
      if (!blind(o) && o !== 'STR' && o !== 'UTG' && stk(p) >= 200 && stk(opener) >= 200 && bbs(fourTo) >= (F4B_MIN[P] ?? 40))
        hit(p, `F4B.${P}.${side(p, fourBettor)}`, fold);
    }
    acted.add(p);
    if (fold) foldedPre.add(p);
    if (call) { vpip.add(p); if (level === 0) limpers++; else callers++; }
    if (raise) {
      vpip.add(p); pfr.add(p); pfa = p; level++;
      if (level === 1) { opener = p; openTo = a.to; }
      else if (level === 2) { threeBettor = p; threeTo = a.to; threeAllin = a.allin; threeFirst = first; squeeze = callers > 0 || limpers > 0; coldAt3 = callers > 0; }
      else if (level === 3) { fourBettor = p; fourTo = a.to; fourAllin = a.allin; callsAt4 = callers > 0; }
      callers = 0;
    }
  }
  for (const p of h.order) { hit(p, 'VPIP', vpip.has(p)); hit(p, 'PFR', pfr.has(p)); }

  // ---------- Image 2: general + facing bets ----------
  if (h.streets === 0) return out;
  const flop = h.order.filter(p => !foldedPre.has(p));
  const potType = level === 1 ? 'SRP' : level === 2 ? '3BP' : level > 2 ? '4BP' : 'LP';
  const potSize = level >= 2 ? 'large' : 'small'; // ponytail: small/large pot = SRP-or-limped vs 3bet+; confirm with H2N
  for (const p of flop) {
    hit(p, 'WWSF', h.won.has(p));
    hit(p, 'WTSD', h.showdown.has(p));
    if (h.showdown.has(p)) hit(p, 'WSD', h.won.has(p));
  }
  const hu = flop.length === 2;
  const folded = new Set<string>();
  const line: Record<string, string> = {};   // per player: one letter per street (B/s/C/X/F)
  let flopSmall = false;

  for (const st of [1, 2, 3] as Street[]) {
    if (st > h.streets) break;
    const N = S[st];
    let bet = 0, bets = 0, bettor = '', firstBettor = '', firstPct = 0, block = false, betAllin = false;
    const huSt = flop.filter(x => !folded.has(x)).length === 2;
    const put: Record<string, number> = {};
    const checked = new Set<string>(), aggr = new Set<string>(), letter: Record<string, string> = {};
    for (const a of h.acts) {
      if (a.st !== st) continue;
      const { p } = a;
      const fold = a.k === 'fold', call = a.k === 'call', raise = a.k === 'raise', b = a.k === 'bet', check = a.k === 'check';
      const facing = bet > (put[p] ?? 0);
      const prior = line[p] ?? '';

      // H2N counts bet / facing-bet spots only when the street is heads-up
      if (!facing && huSt) {
        hit(p, `Bet${N}`, b);
        if (st === 1 && pfa && p !== pfa && checked.has(pfa)) hit(p, 'BvMis', b);
        if (st === 3) {
          const size = b ? bucket(pctOf(a), BET_SIZES) : '';
          for (const [, n] of BET_SIZES) hit(p, `R${n}`, size === n);
          hit(p, `RL.${norm(prior)}`, b);
          if (prior !== norm(prior)) hit(p, `RL.${prior}`, b);
          if (a.pot / h.bb >= 100) hit(p, 'BBP', b);
        }
        // Image 3: PFR barrels in heads-up single-raised / 3bet pots
        if (hu && p === pfa && (potType === 'SRP' || potType === '3BP') && st >= 2) {
          const k = `${potType}.${side(p, flop.find(x => x !== p)!)}`;
          const want = st === 2 ? 'B' : 'BB';
          if (norm(prior) === want) {
            const n = st === 2 ? 'BB' : 'BBB';
            hit(p, `${k}.${n}`, b);
            hit(p, `${k}.${n}.${pos(p)}vs${pos(flop.find(x => x !== p)!)}`, b);
            if (flopSmall) hit(p, `${k}.Bs${n.slice(1)}`, b);
          }
        }
      }
      // Matched to H2N sample sizes: "Call river" = any river bet faced; "Fold river" and its
      // size buckets = heads-up incl. all-ins; every other facing stat excludes all-ins.
      if (facing && !check && st === 3 && bets === 1 && !aggr.has(p)) {
        hit(p, 'CallRiver', call);
        if (huSt) {
          hit(p, 'FoldRiver', fold);
          hit(p, `R${bucket(firstPct, FOLD_SIZES)}`, fold);
        }
      }
      if (facing && !check && huSt && !betAllin) {
        const sd = side(p, bettor);
        if (aggr.has(p)) {
          hit(p, `F${N}R.${sd}`, fold);
          if (checked.has(bettor)) hit(p, 'FXR', fold);
          if (st === 3 && p === firstBettor && block) { hit(p, 'BlockF', fold); hit(p, 'Block3B', raise); }
        } else if (bets === 1) {
          hit(p, `FB${N}.${sd}`, fold);
          hit(p, `R${N}.${potSize}.${sd}`, raise);
          if (st === 3) {
            hit(p, `FR.${potSize}.${sd}`, fold);
            hit(p, `CR.${potSize}.${sd}`, call);
            hit(p, `RF.${norm(prior)}`, fold);
            if (block && sd === 'IP') { hit(p, 'FvBlock', fold); hit(p, 'RBlock', raise); }
          }
        }
      }

      if (call) add(p, 'AF', 1, 0);
      if (b || raise) add(p, 'AF', 0, 1);
      if (check) checked.add(p);
      if (fold) folded.add(p);
      if (b || raise) {
        bets++; bet = a.to; bettor = p; aggr.add(p); betAllin = a.allin;
        if (bets === 1) {
          firstBettor = p; firstPct = pctOf(a);
          if (st === 1 && p === pfa) flopSmall = firstPct < SMALL;
          block = st === 3 && firstPct < SMALL && p !== pfa;
        }
      }
      if (!fold && !check) put[p] = a.to;
      letter[p] = b || raise ? (b && pctOf(a) < SMALL ? 's' : 'B') : call ? 'C' : fold ? 'F' : 'X';
    }
    for (const p of Object.keys(letter)) {
      line[p] = (line[p] ?? '') + letter[p];
      hit(p, `AFq${N}`, aggr.has(p));
    }
  }
  for (const p of flop) if (line[p]?.length === 3 && line[p][2] === 'C' && h.showdown.has(p)) hit(p, 'WSDrc', h.won.has(p));
  return out;
}

export function aggregateHands(hands: Iterable<Hand>, isReg: IsReg = noRegs): Map<string, Stats> {
  const stats = new Map<string, Stats>();
  for (const h of hands) {
    const per = handStats(h, isReg);
    for (const p of h.order) {
      const k = `${p}	${h.stake}`;
      let s = stats.get(k);
      if (!s) stats.set(k, (s = { player: p, stake: h.stake, hands: 0, netBB: 0, c: {} }));
      s.hands++;
      s.netBB += (h.net[p] ?? 0) / h.bb;
      for (const [key, [o, d]] of Object.entries(per[p] ?? {})) {
        const v = (s.c[key] ??= [0, 0]);
        v[0] += o; v[1] += d;
      }
    }
  }
  return stats;
}

// H2N's numbers only count tables with 5+ players (see report.ts); the site applies the same filter.
export const MIN_PLAYERS = 5;

export function aggregate(text: string, minPlayers = 2, isReg: IsReg = noRegs): { stats: Map<string, Stats>; hands: number; errors: string[] } {
  const errors: string[] = [];
  const hands: Hand[] = [];
  for (const block of splitHands(text)) {
    let h: Hand;
    try { h = parseHand(block); } catch (e) { errors.push((e as Error).message); continue; }
    if (h.order.length >= minPlayers) hands.push(h);
  }
  return { stats: aggregateHands(hands, isReg), hands: hands.length, errors };
}

// Merge one player's stakes into a single total (H2N "all stakes" view).
export function combine(list: Stats[]): Stats {
  const t: Stats = { player: list[0]?.player ?? '', stake: 'all', hands: 0, netBB: 0, c: {} };
  for (const s of list) {
    t.hands += s.hands; t.netBB += s.netBB;
    for (const [k, [o, d]] of Object.entries(s.c)) { const v = (t.c[k] ??= [0, 0]); v[0] += o; v[1] += d; }
  }
  return t;
}
