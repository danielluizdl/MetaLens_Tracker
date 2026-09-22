// Pure helpers the HUD renders with. Kept out of ui.ts so they can be tested without a browser.
import { value, type Cell } from './catalog.ts';

export type Counters = Record<string, [number, number]>;

/** H2N dims tiny samples; below the reference range is blue, inside green, a bit above yellow, far above red. */
export const SMALL_SAMPLE = 10;
export type Tone = 'none' | 'dim' | 'plain' | 'below' | 'inside' | 'above' | 'far';

export function tone(cell: Cell, c: Counters): Tone {
  const [opp] = c[cell.key] ?? [0, 0];
  if (!opp) return 'none';
  if (opp < SMALL_SAMPLE) return 'dim';
  if (!cell.range) return 'plain';
  const v = value(cell, c[cell.key]);
  const [lo, hi] = cell.range;
  if (v < lo) return 'below';
  if (v <= hi) return 'inside';
  return v <= hi + (hi - lo) * 0.25 ? 'above' : 'far';
}

const TONE_TEXT: Record<Tone, string> = {
  none: 'sem amostra', dim: 'amostra pequena', plain: 'sem faixa de referência',
  below: 'abaixo da faixa', inside: 'dentro da faixa', above: 'acima da faixa', far: 'bem acima da faixa',
};

/** "13.5" / "2.5" for ratios / "-" with no sample. */
export const fmtValue = (cell: Cell, c: Counters) => {
  const v = value(cell, c[cell.key]);
  return isNaN(v) ? '-' : v.toFixed(1);
};
export const fmtSample = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Which key the HUD reads: the "vs reg" twin when the cell needs it and the toggle is on. */
export const keyFor = (cell: Cell, vsReg: boolean) => (cell.reg && vsReg ? `${cell.key}.reg` : cell.key);

/** Short rule per stat family, from the H2N popups (gabarito_dLzinN/definicoes_h2n.md). */
const RULES: [RegExp, string][] = [
  [/^VPIP$/, 'Pagou ou aumentou no pré-flop (blinds, straddle e ante não contam).'],
  [/^PFR$/, 'Aumentou no pré-flop.'],
  [/^3BET$/, 'Enfrentou o primeiro raise da mão e aumentou (inclui squeeze).'],
  [/^F3BET$/, 'Nosso open foi a primeira ação, ninguém pagou, vilão deu 3bet: foldamos.'],
  [/^4BET$/, 'Mesma situação do F3BET, mas nós aumentamos.'],
  [/^F4BET$/, 'Vilão abriu, demos 3bet na nossa primeira ação, o mesmo vilão deu 4bet: foldamos.'],
  [/^5BET\.shove$/, 'Mesma situação do F4BET, mas fomos de all-in.'],
  [/^4BET\.shove$/, '4bet all-in contra um 3bet mínimo (5 a 14bb), com os dois stacks acima de 90bb.'],
  [/^RFI\./, 'Todos foldaram até nós e nós aumentamos (SB e BB: pote inicial entre 6 e 9bb, 6 a 8 jogadores).'],
  [/^LIMP\./, 'Todos foldaram até nós e nós só pagamos.'],
  [/^FLAT\./, 'Alguém abriu (6-7bb; 6-8bb nos blinds; 5-8bb no STR), ninguém entrou, e nós pagamos. 6 a 8 jogadores.'],
  [/^3B\./, 'Vilão deu o primeiro raise da mão (5-8bb; 6-10bb se abriu do SB/BB), ninguém pagou, e nós demos 3bet. O H2N conta só vilões marcados como reg.'],
  [/^F3B\./, 'Nosso open foi a primeira ação (5-8bb), vilão deu 3bet (20-36bb) e ninguém pagou no meio: foldamos.'],
  [/^4BSZ\./, '4bet não all-in com stack efetivo entre 175 e 250bb.'],
  [/^4BS\./, '4bet all-in com stack efetivo entre 175 e 250bb.'],
  [/^4B\./, 'Nosso primeiro raise, vilão deu 3bet, nós demos 4bet. Stack efetivo de 80bb ou mais.'],
  [/^F4B\./, 'Vilão abriu, demos 3bet, ele deu 4bet (40 ou 50bb conforme a posição): foldamos. Os dois stacks acima de 200bb.'],
  [/^STR\.CC\./, 'No straddle, vilão abriu no tamanho indicado e nós pagamos.'],
  [/^STR\.3B\./, 'No straddle, vilão abriu e nós demos 3bet. O H2N conta só vilões marcados como reg.'],
  [/^AFq/, 'Streets em que agiu e foi agressivo (aposta ou aumento).'],
  [/^AF$/, 'Apostas e aumentos divididos por pagamentos, no pós-flop.'],
  [/^WWSF$/, 'Ganhou o pote tendo visto o flop.'],
  [/^WTSD$/, 'Foi ao showdown tendo visto o flop.'],
  [/^WSD/, 'Ganhou quando foi ao showdown.'],
  [/^Bet(Flop|Turn|River)$/, 'Apostou quando ninguém tinha apostado na street, em pote heads-up.'],
  [/^FB(Flop|Turn|River)\./, 'Foldou enfrentando uma aposta (heads-up, sem all-in).'],
  [/^F(Flop|Turn|River)R\./, 'Apostou, levou aumento e foldou.'],
  [/^R(Flop|Turn|River)\./, 'Aumentou enfrentando uma aposta.'],
  [/^(FR|CR)\./, 'Foldou ou pagou no river, separado por tamanho de pote e posição.'],
  [/^RB\d/, 'Tamanho da aposta no river, em relação ao pote.'],
  [/^RF\d/, 'Foldou no river enfrentando aposta desse tamanho.'],
  [/^RF\./, 'Foldou no river enfrentando aposta, depois dessa sequência de ações nas streets.'],
  [/^RL\./, 'Sequência de ações nas streets antes de apostar no river.'],
  [/^(Block|FvBlock|RBlock)/, 'Aposta pequena do jogador fora de posição no river (block) e as respostas a ela.'],
  [/^BBP$/, 'Apostou no river com o pote em 100bb ou mais.'],
  [/^FXR$/, 'Apostou, levou check-raise e foldou.'],
  [/^(SRP|3BP)\./, 'Sequências de apostas do agressor pré-flop em pote heads-up.'],
  [/^BvMis$/, 'Apostou no flop depois de o agressor pré-flop dar check.'],
  [/^(FoldRiver|CallRiver)$/, 'Foldou ou pagou enfrentando aposta no river.'],
];
export const describe = (key: string) => RULES.find(([re]) => re.test(key))?.[1] ?? '';

export function tooltip(cell: Cell, label: string, c: Counters, vsReg: boolean) {
  const key = keyFor(cell, vsReg);
  const [opp, did] = c[key] ?? [0, 0];
  const t = tone({ ...cell, key }, c);
  const head = `${label}${cell.reg && vsReg ? ' (vs reg)' : ''}`;
  const counts = opp ? `${did} de ${opp} (${fmtValue({ ...cell, key }, c)}${cell.ratio ? '' : '%'})` : 'sem mãos ainda';
  const range = cell.range ? `faixa ${cell.range[0]}-${cell.range[1]} · ${TONE_TEXT[t]}` : TONE_TEXT[t];
  return [head, counts, range, describe(cell.key)].filter(Boolean).join('\n');
}
