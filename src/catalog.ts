// HUD catalog: every box of the H2N "VILLAIN ANALYSIS 3.0 WPT" screens, laid out as H2N draws it.
// One source of truth for the web HUD, report.ts and the parity test.
//
//   Box ─┬─ title, column headers
//        └─ rows ─ label + cells (null = empty cell, drawn as "-")
//   Cell ─ key      stat key produced by stats.ts ([opportunities, done])
//          h2n      [value %, sample] from the dLzinN screenshots (null = not transcribed)
//          range    H2N color range shown under the value ("20-28"); in range = green, else red
//          reg      H2N counts only villains marked "Is Reg": the HUD shows `${key}.reg`
//          ratio    value is did/opp (AF), not a percentage

export type Cell = { key: string; h2n?: [number, number] | null; range?: [number, number]; reg?: boolean; ratio?: boolean };
export type Box = { id: string; title: string; screen: string; cols?: string[]; rows: { label: string; cells: (Cell | null)[] }[] };

const c = (key: string, v?: number, n?: number, range?: [number, number], extra: Partial<Cell> = {}): Cell =>
  ({ key, h2n: v === undefined ? null : [v, n ?? NaN], range, ...extra });
const reg = (key: string, v: number, n: number, range?: [number, number]) => c(key, v, n, range, { reg: true });

export const CATALOG: Box[] = [
  // ───────────── Screen 1: PREFLOP / MAIN ─────────────
  { id: 'stats', title: 'STATS', screen: 'PREFLOP', rows: [
    { label: 'VPIP', cells: [c('VPIP', 24, 43000, [20, 28])] },
    { label: 'PFR', cells: [c('PFR', 14, 43000, [18, 24])] },
    { label: '3BET', cells: [c('3BET', 11, NaN, [9, 12])] },
    { label: 'F3BET', cells: [c('F3BET', 54, 322, [50, 55])] },
    { label: '4BET', cells: [c('4BET', 14, 312, [12, 16])] },
    { label: 'F 4BET', cells: [c('F4BET', 62, 84)] },
    { label: '4B shove', cells: [c('4BET.shove', 0, 0)] },
    { label: '5BET SHOVE', cells: [c('5BET.shove', 4.1, 73)] },
  ] },
  { id: 'rfi', title: 'RFI', screen: 'PREFLOP', rows: [
    { label: 'U1', cells: [c('RFI.UTG1', 0, 3800, [18, 20])] },
    { label: 'LJ', cells: [c('RFI.LJ', 0, 4000, [20, 22])] },
    { label: 'HJ', cells: [c('RFI.HJ', 3.9, 3300, [24, 26])] },
    { label: 'CO', cells: [c('RFI.CO', 36, 2100, [28, 32])] },
    { label: 'BTN', cells: [c('RFI.BTN', 49, 1200, [42, 46])] },
    { label: 'SB', cells: [c('RFI.SB', 42, 606, [32, 36])] },
    { label: 'BB', cells: [c('RFI.BB', 68, 295, [56, 60])] },
  ] },
  { id: 'limp', title: 'LIMP', screen: 'PREFLOP', rows: [
    { label: 'U1', cells: [c('LIMP.UTG1', 21, 3600, [20, 24])] },
    { label: 'LJ', cells: [c('LIMP.LJ', 21, 4000, [20, 24])] },
    { label: 'HJ', cells: [c('LIMP.HJ', 18, 3300)] },
    { label: 'CO', cells: [c('LIMP.CO', 1.2, 2300)] },
    { label: 'BTN', cells: [c('LIMP.BTN', 0, 1300)] },
    { label: 'SB', cells: [c('LIMP.SB', 0.3, 672, [40, 44])] },
    { label: 'BB', cells: [c('LIMP.BB', 0, 335)] },
  ] },
  { id: 'flat', title: 'FLAT vs RFI', screen: 'PREFLOP', rows: [
    { label: 'LJ', cells: [c('FLAT.LJ', 4.8, 207, [3, 6])] },
    { label: 'HJ', cells: [c('FLAT.HJ', 5.6, 408, [3, 6])] },
    { label: 'CO', cells: [c('FLAT.CO', 10, 596, [6, 10])] },
    { label: 'BTN', cells: [c('FLAT.BTN', 13, 616, [10, 14])] },
    { label: 'SB', cells: [c('FLAT.SB', 5.2, 786, [0, 4])] },
    { label: 'BB', cells: [c('FLAT.BB', 15, 576, [10, 14])] },
    { label: 'STR', cells: [c('FLAT.STR', 28, 446, [30, 36])] },
  ] },
  { id: 'strdef', title: 'STR - DEFENSE', screen: 'PREFLOP', cols: ['vs MP', 'vs CO', 'vs BTN', 'vs SB', 'vs BB'], rows: [
    { label: 'CC vs 6bb', cells: [
      c('STR.CC.6bb.vsMP', 41, 90, [30, 35]), c('STR.CC.6bb.vsCO', 23, 70, [34, 42]), c('STR.CC.6bb.vsBTN', 27, 75, [43, 50]),
      c('STR.CC.6bb.vsSB', 31, 52, [48, 53]), c('STR.CC.6bb.vsBB', 35, 26, [50, 56])] },
    { label: 'CC vs 7-8bb', cells: [
      c('STR.CC.7-8bb.vsMP', 29, 89), c('STR.CC.7-8bb.vsCO', 30, 61), c('STR.CC.7-8bb.vsBTN', 24, 59), null, null] },
    { label: '3Bet vs 6bb', cells: [
      reg('STR.3B.6bb.vsMP', 8.7, 46, [7, 10]), reg('STR.3B.6bb.vsCO', 10, 68, [10, 13]), reg('STR.3B.6bb.vsBTN', 13, 47, [13, 18]),
      reg('STR.3B.6bb.vsSB', 38, 13, [11, 17]), reg('STR.3B.6bb.vsBB', 23, 22, [19, 24])] },
  ] },
  { id: '3bet', title: '3BET', screen: 'PREFLOP', cols: ['vs UTG', 'vs LJ', 'vs HJ', 'vs CO', 'vs BTN', 'vs SB', 'vs BB'], rows: [
    { label: 'STR', cells: [
      reg('3B.STR.vsUTG1', 0, 19, [6, 8]), reg('3B.STR.vsLJ', 3.1, 32, [6, 8]), reg('3B.STR.vsHJ', 8.2, 49, [8, 10]),
      reg('3B.STR.vsCO', 11, 73, [10, 12]), reg('3B.STR.vsBTN', 9.6, 83, [14, 18]), reg('3B.STR.vsSB', 28, 47, [12, 16]),
      reg('3B.STR.vsBB', 16, 50, [16, 20])] },
    { label: 'BB', cells: [
      reg('3B.BB.vsUTG1', 0, 19, [7, 9]), reg('3B.BB.vsLJ', 15, 55, [7, 9]), reg('3B.BB.vsHJ', 9.3, 140, [10, 12]),
      reg('3B.BB.vsCO', 9.6, 94, [12, 14]), reg('3B.BB.vsBTN', 19, 113, [14, 18]), reg('3B.BB.vsSB', 15, 62, [12, 14]), null] },
    { label: 'SB', cells: [
      reg('3B.SB.vsUTG1', 9.3, 54, [8, 10]), reg('3B.SB.vsLJ', 6.2, 65, [8, 10]), reg('3B.SB.vsHJ', 11, 103, [10, 12]),
      reg('3B.SB.vsCO', 6.8, 132, [12, 14]), reg('3B.SB.vsBTN', 17, 157, [14, 17]), null, null] },
    { label: 'BTN', cells: [
      reg('3B.BTN.vsUTG1', 8.6, 70, [6, 8]), reg('3B.BTN.vsLJ', 7.5, 93, [6, 8]), reg('3B.BTN.vsHJ', 8.5, 142, [8, 10]),
      reg('3B.BTN.vsCO', 7.4, 176, [12, 15]), null, null, null] },
    { label: 'CO', cells: [reg('3B.CO.vsUTG1', 4.5, 110, [6, 8]), reg('3B.CO.vsLJ', 6, 134, [6, 8]), reg('3B.CO.vsHJ', 6.7, 195, [8, 10]), null, null, null, null] },
    { label: 'HJ', cells: [reg('3B.HJ.vsUTG1', 8.1, 123, [7, 9]), reg('3B.HJ.vsLJ', 7.2, 153, [7, 9]), null, null, null, null, null] },
  ] },
  { id: 'f3b', title: 'FOLD TO 3BET', screen: 'PREFLOP', cols: ['vs BTN', 'vs SB', 'vs BB', 'vs STR'], rows: [
    { label: 'HJ', cells: [c('F3B.HJ.vsBTN', undefined, undefined, [38, 46]), c('F3B.HJ.vsSB', undefined, undefined, [44, 50]), c('F3B.HJ.vsBB', undefined, undefined, [40, 48]), c('F3B.HJ.vsSTR', undefined, undefined, [40, 48])] },
    { label: 'CO', cells: [c('F3B.CO.vsBTN', 67, 43, [40, 52]), c('F3B.CO.vsSB', 44, 25, [48, 54]), c('F3B.CO.vsBB', 45, 22, [43, 52]), c('F3B.CO.vsSTR', 67, 12, [40, 50])] },
    { label: 'BTN', cells: [null, c('F3B.BTN.vsSB', 66, 35, [51, 60]), c('F3B.BTN.vsBB', 63, 30, [47, 55]), c('F3B.BTN.vsSTR', 60, 20, [40, 50])] },
    { label: 'SB', cells: [null, null, c('F3B.SB.vsBB', 39, 18, [42, 58]), c('F3B.SB.vsSTR', 33, 21, [34, 54])] },
    { label: 'BB', cells: [null, null, null, c('F3B.BB.vsSTR', 47, 15, [44, 60])] },
  ] },
  { id: '4bet', title: '4BET', screen: 'PREFLOP', cols: ['IP', '4B', '4BS', 'OOP'], rows: [
    { label: 'HJ', cells: [c('4B.HJ.IP', 4.8, 21, [10, 14]), null, null, c('4B.HJ.OOP', 0, 17, [18, 22])] },
    { label: 'CO', cells: [c('4B.CO.IP', 9.7, 103, [10, 14]), c('4BSZ.CO.IP', 0, 32), c('4BS.CO.IP', 0, 32), c('4B.CO.OOP', 14, 70, [18, 22])] },
    { label: 'BTN', cells: [c('4B.BTN.IP', 9.4, 159, [10, 14]), c('4BSZ.BTN.IP', 4.1, 49), c('4BS.BTN.IP', 4.1, 49), null] },
    { label: 'SB', cells: [null, c('4BSZ.SB.OOP', 0, 20), c('4BS.SB.OOP', 15, 20), c('4B.SB.OOP', 16, 61, [15, 20])] },
    { label: 'BB', cells: [null, c('4BSZ.BB.OOP', 11, 5), c('4BS.BB.OOP', 0, 5), c('4B.BB.OOP', 5.7, 35, [15, 20])] },
  ] },
  { id: 'f4b', title: 'FOLD 4BET', screen: 'PREFLOP', cols: ['IP', 'OOP'], rows: [
    { label: 'HJ', cells: [c('F4B.HJ.IP', 50, 2, [38, 50]), null] },
    { label: 'CO', cells: [c('F4B.CO.IP', 17, 5, [38, 50]), null] },
    { label: 'BTN', cells: [c('F4B.BTN.IP', 67, 5, [38, 50]), null] },
    { label: 'SB', cells: [null, c('F4B.SB.OOP', 53, 15, [38, 50])] },
    { label: 'BB', cells: [c('F4B.BB.IP'), c('F4B.BB.OOP', 70, 10, [28, 40])] },
    { label: 'STR', cells: [c('F4B.STR.IP'), c('F4B.STR.OOP', 80, 5, [28, 40])] },
  ] },

  // ───────────── Screen 2: POSTFLOP (definitions still inferred, see TODOS.md) ─────────────
  { id: 'general', title: 'GENERAL', screen: 'POSTFLOP', rows: [
    { label: 'AFq - Flop', cells: [c('AFqFlop', 31, 8400, [37, 44])] },
    { label: 'AFq - Turn', cells: [c('AFqTurn', 36, 5400, [31, 38])] },
    { label: 'AFq - River', cells: [c('AFqRiver', 38, 3400, [37, 44])] },
    { label: 'AF', cells: [c('AF', 2.5, 8400, [2, 2.5], { ratio: true })] },
    { label: 'WWSF', cells: [c('WWSF', 47, 8400, [49, 53])] },
    { label: 'WTSD', cells: [c('WTSD', 26, 8400, [29, 34])] },
    { label: 'W@SD', cells: [c('WSD', 49, NaN, [48, 53])] },
    { label: 'W@SD after river call', cells: [c('WSDrc', 42, 1200, [37, 45])] },
    { label: 'Bet Flop', cells: [c('BetFlop', 45, 3400, [38, 46])] },
    { label: 'Bet Turn', cells: [c('BetTurn', 41, 2800, [34, 41])] },
    { label: 'Bet River', cells: [c('BetRiver', 49, 2200, [40, 48])] },
    { label: 'B30', cells: [c('RB30', 8, 2200)] },
    { label: 'B50', cells: [c('RB50', 12, 2200)] },
    { label: 'B75', cells: [c('RB75', 16, 2100)] },
    { label: 'B110', cells: [c('RB110', 13, 1900)] },
    { label: 'B130+', cells: [c('RB130', 4.3, 1700)] },
    { label: 'BvMis vs missed cbet', cells: [c('BvMis', 45, 299, [38, 46])] },
    { label: 'Call river', cells: [c('CallRiver', 43, 1200, [34, 44])] },
  ] },
  { id: 'facing', title: 'FACING BETS', screen: 'POSTFLOP', cols: ['OOP', 'IP'], rows: [
    { label: 'Fold Bet Flop', cells: [c('FBFlop.OOP', 43, 714, [37, 41]), c('FBFlop.IP', 38, 467, [20, 28])] },
    { label: 'Fold Bet Turn', cells: [c('FBTurn.OOP', 40, 427, [44, 52]), c('FBTurn.IP', 35, 463, [30, 38])] },
    { label: 'Fold Bet River', cells: [c('FBRiver.OOP', 44, 240, [51, 61]), c('FBRiver.IP', 40, 443, [39, 49])] },
    { label: 'Fold Flop Raise', cells: [c('FFlopR.OOP', 30, 46, [35, 40]), c('FFlopR.IP', 41, 107, [37, 43])] },
    { label: 'Fold Turn Raise', cells: [c('FTurnR.OOP', 49, 45, [43, 51]), c('FTurnR.IP', 43, 51, [48, 56])] },
    { label: 'Fold River Raise', cells: [c('FRiverR.OOP', 39, 62, [54, 64]), c('FRiverR.IP', 37, 38, [65, 75])] },
    { label: 'Fold River Small Pot', cells: [c('FR.small.OOP', 50, 52, [50, 60]), c('FR.small.IP', 40, 139, [37, 47])] },
    { label: 'Call River Small Pot', cells: [c('CR.small.OOP', 55, 80, [32, 42]), c('CR.small.IP', 49, 214, [37, 47])] },
    { label: 'Fold River Large Pot', cells: [c('FR.large.OOP', 51, 49, [55, 65]), c('FR.large.IP', 45, 75, [40, 51])] },
    { label: 'Call River Large Pot', cells: [c('CR.large.OOP', 41, 134, [30, 42]), c('CR.large.IP', 51, 171, [37, 49])] },
    { label: 'Raise Flop - Small Pot', cells: [c('RFlop.small.OOP', 21, 528, [11, 16]), c('RFlop.small.IP', 22, 306, [11, 16])] },
    { label: 'Raise Turn - Small Pot', cells: [c('RTurn.small.OOP', 11, 230, [6, 11]), c('RTurn.small.IP', 18, 261, [6, 13])] },
    { label: 'Raise River - Small Pot', cells: [c('RRiver.small.OOP', 5.4, 130, [9, 14]), c('RRiver.small.IP', 15, 295, [14, 20])] },
    { label: 'Raise Flop - Large Pot', cells: [c('RFlop.large.OOP', 27, 155, [18, 24]), c('RFlop.large.IP', 20, 139, [5, 10])] },
    { label: 'Raise Turn - Large Pot', cells: [c('RTurn.large.OOP', 6.8, 221, [12, 18]), c('RTurn.large.IP', 13, 216, [10, 15])] },
    { label: 'Raise River - Large Pot', cells: [c('RRiver.large.OOP', 4.3, 161, [10, 15]), c('RRiver.large.IP', 12, 242, [16, 22])] },
  ] },

  // ───────────── Screen 3: SRP / 3BP barrels ─────────────
  { id: 'barrels', title: 'SRP / 3BP', screen: 'SRP', cols: ['B B', 'B B B', 'Bs B B'], rows: [
    { label: 'SRP IP PFR (BTN vs STR)', cells: [c('SRP.IP.BB.BTNvsSTR', 35, 37, [44, 52]), c('SRP.IP.BBB.BTNvsSTR', 80, 5, [45, 55]), null] },
    { label: 'SRP OOP PFR (BB vs STR)', cells: [c('SRP.OOP.BB.BBvsSTR', 35, 20, [40, 47]), null, c('SRP.OOP.BsBB', 25, 4, [55, 65])] },
    { label: '3BP IP PFR', cells: [c('3BP.IP.BB', 53, 55, [53, 63]), c('3BP.IP.BBB', 75, 8, [50, 60]), null] },
    { label: '3BP OOP PFR', cells: [c('3BP.OOP.BB', 26, 47, [42, 52]), null, c('3BP.OOP.BsBB', 100, 2, [50, 60])] },
  ] },

  // ───────────── Screen 4: RIVER TENDENCIES ─────────────
  { id: 'river', title: 'RIVER TENDENCIES', screen: 'RIVER', rows: [
    { label: 'B-B-B', cells: [c('RL.BB', 59, 99, [54, 61])] },
    { label: 'C-X-B', cells: [c('RL.CX', 65, 131, [47, 57])] },
    { label: 'B-X-B', cells: [c('RL.BX', 54, 285, [48, 58])] },
    { label: 'B-Bs-B', cells: [c('RL.Bs', 70, 10)] },
    { label: 'BET BIG POT (Pot >= 100)', cells: [c('BBP', 54, 627, [48, 58])] },
    { label: 'C-C-F', cells: [c('RF.CC', 38, 91, [43, 52])] },
    { label: 'FOLD XR (Overall)', cells: [c('FXR', 36, 39, [63, 71])] },
    { label: 'Fold river', cells: [c('FoldRiver', 44, 675, [44, 54])] },
    { label: 'F30', cells: [c('RF30', 29, 91, [25, 30])] },
    { label: 'F50', cells: [c('RF50', 39, 112, [35, 42])] },
    { label: 'F75', cells: [c('RF75', 50, 110, [45, 53])] },
    { label: 'F100', cells: [c('RF100', 66, 47, [53, 61])] },
    { label: 'F120', cells: [c('RF120', 55, 11, [57, 65])] },
    { label: 'F150', cells: [c('RF150', 75, 4, [62, 70])] },
    { label: 'BLOCK-FOLD', cells: [c('BlockF', 11, 19, [51, 56])] },
    { label: 'BLOCK-3BET', cells: [c('Block3B', 25, 12, [10, 15])] },
    { label: 'FOLD VS BLOCK', cells: [c('FvBlock', 25, 106, [25, 32])] },
    { label: 'RAISE BLOCK', cells: [c('RBlock', 17, 106, [23, 29])] },
  ] },
];

export const cells = (): { box: Box; row: string; col?: string; cell: Cell }[] =>
  CATALOG.flatMap(box => box.rows.flatMap(r => r.cells.flatMap((cell, i) =>
    cell ? [{ box, row: r.label, col: box.cols?.[i], cell }] : [])));

// Value shown in the HUD: percentage (or did/opp for ratios); NaN when there is no sample.
export const value = (cell: Cell, [opp, did]: [number, number] = [0, 0]) =>
  opp ? (cell.ratio ? did / opp : (100 * did) / opp) : NaN;
