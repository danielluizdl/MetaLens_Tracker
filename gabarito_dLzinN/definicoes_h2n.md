# Definições das stats do H2N (HUD "VILLAIN ANALYSIS 3.0 WPT")

Lidas direto do popup (i) de cada stat. Filtro geral da tela: Texas Hold'em NL Cash, 5-8 Players, 8-max.
Nomes de posição do H2N → nossos: UTG1 = UTG1, EP = LJ, MP = HJ, Straddle = STR, "BB-STD8" = BB/STR.
Valor (amostra) como aparece no HUD.

## FLAT vs RFI (todas batem exato — já no código)
| Stat | Vilão raise (1ª ação não-fold) | Tamanho | Nós |
|---|---|---|---|
| Flat LJ | UTG | 6-7bb | call EP |
| Flat MP | UTG-EP | 6-7bb | call MP |
| Flat CO | UTG-MP | 6-7bb | call CO |
| Flat BU | UTG-CO | 6-7bb | call BTN |
| Flat SB | UTG-BTN | 6-8bb | call SB |
| Flat BB | UTG-BTN | 6-8bb | call BB |
| Flat Str | UTG-BTN | 5-8bb | call Straddle; pote inicial 6-8bb |
Todas: 6 < Initial players count < 8.

## 3BET por posição
- 3BET CO vs HJ (6.7, 195): vilão MP, primeiro raise da street, 5-8bb, **Is Reg**; nós raise CO.
- 3BET CO vs LJ (6, 134): vilão EP, idem.
- 3BET CO vs UTG (4.5, 110): vilão UTG1, idem.
- 3BET BB vs BTN (19, 113): vilão BTN, primeiro raise, 5-8bb, Is Reg; nós raise BB.

## FOLD TO 3BET
- CO vs BU/SB/BB/STR (67/43, 44/25, 45/22, 67/12): nós raise CO (1ª ação não-fold) 5-8bb; vilão 3bet 20-36bb; fold. (Ninguém paga no meio.)
- SB vs BB (39, 18): 6 < players < 8; nós SB 1ª ação não-fold 6-9bb; vilão BB 18-34bb; fold.
- SB vs Str (33, 21): idem, vilão Straddle 18-34bb.
- BB vs Str (47, 15): 6 < players < 8; nós BB 5-9bb; vilão Straddle 18-34bb; fold.

## 4BET (colunas: IP = 3bet veio de posição pior que a nossa; OOP = 3bet do BTN/posição melhor)
- 4BET HJ vs OOP (4.8, 21): nós MP primeiro raise; vilão Blinds raise; nós raise; 80 ≤ stack efetivo entre quem entrou.
- 4BET CO vs IP (14, 70): nós CO primeiro raise; vilão BTN raise; nós raise; efetivo ≥ 80.
- 4BET SIZE CO vs OOP (0, 32): nós CO; vilão Blinds; nós raise; 175 ≤ efetivo ≤ 250; efetivo ≥ 80.
- 4BET SHOVE CO vs OOP (0, 32): igual ao SIZE + All-in.
- 4BET SB vs IP (16, 61): nós SB primeiro raise; vilão BB-STD8; nós raise; efetivo ≥ 80.
- 4BET SIZE SB vs IP (0, 20): igual + 175 ≤ efetivo ≤ 250 + Not All-in.

## FOLD 4BET (todas: stack ≥ 200bb de vilão e nosso)
- FOLD 4BET HJ vs OOP (50, 2): vilão UTG1/EP 1ª ação não-fold; nós raise MP; vilão raise UTG1/EP ≥ 40bb; fold.
- FOLD 4BET CO vs OOP (17, 5): vilão UTG1-MP; nós CO; 4bet ≥ 40bb; fold.
- FOLD 4BET SB vs IP (53, 15): vilão UTG1-BTN; nós SB; 4bet ≥ 50bb; fold.
- FOLD 4BET BB vs IP (70, 10): vilão UTG1-BTN; nós BB; 4bet ≥ 50bb; fold.
- FOLD 4BET STR vs IP (80, 5): vilão UTG1-BTN; nós Straddle; 4bet ≥ 50bb; fold.

## STATS (totais)
- 3bet [Total] (11): vilão UTG4-BB primeiro raise da street; nós raise. Posição do jogador: qualquer (UTG3-STD6).
- Fold to 3Bet [Total] (54, 322): nós raise (1ª ação não-fold); vilão raise; nós fold.
- 4bet Total (after raising) (14, 312): nós raise (nossa 1ª ação e 1ª ação não-fold da street); vilão raise; nós raise.
- Fold to 4bet (62, 84): vilão raise (1ª ação não-fold, jogador 1); nós raise (nossa 1ª ação); vilão raise (jogador 1); nós fold.
- 5bet Shove (4.1, 73): igual ao Fold to 4bet, mas nós raise All-in.
- 4bet shove (0, 0) — o "4B shove" embaixo do F 4BET: nós raise (1ª ação não-fold); vilão raise com stack ≥ 90 e 3bet de 5-14bb; nós raise All-in com stack ≥ 90.

## RFI dos blinds
- SB - RFI (42, 606): 6 ≤ pote inicial ≤ 9; 6 < jogadores < 8; nós raise SB (1ª ação não-fold).
- BB - RFI (68, 295): 6 ≤ pote inicial ≤ 8; 6 < jogadores < 8; nós raise BB (1ª ação não-fold).

## STR-DEFENSE (nós no Straddle; vilão = 1ª ação não-fold)
| Célula | Pote inicial | Jogadores | Vilão | Tamanho | Nós |
|---|---|---|---|---|---|
| Flat do Str vs MP (41, 90) | 6-8 | 5 < n < 8 | EP, MP | 5-6.5 | call |
| Flat do Str vs CO (23, 70) | 6-8 | 5 < n < 8 | CO | 5-6.5 | call |
| Flat do Str vs Bu (27, 75) | 6-8 | 5 < n < 8 | BTN | 5-6.5 | call |
| Flat do Str vs SB (31, 52) | 5-9 | 6 < n < 8 | SB | 8-9 | call |
| Flat do Str vs BB (35, 26) | 6-9 | 6 < n < 8 | BB | 8-9 | call |
| Flat do Str vs MP 7-8bb (29, 89) | 6-8 | 5 < n < 8 | EP, MP | 7-8.5 | call |
| Flat do Str vs CO 7-8bb (30, 61) | 6-8 | 5 < n < 8 | CO | 7-8.5 | call |
| Flat do Str vs Bu 7-8bb (24, 59) | 6-8 | 5 < n < 8 | BTN | 7-8.5 | call |
| 3b do STR vs MP (8.7, 46) | - | 6 < n < 8 | MP | 5-8, Is Reg | raise |
| 3b do STR vs CO (10, 68) | - | - | CO | 5-8, Is Reg | raise |
| 3b do Str vs Bu (13, 47) | - | 6 < n < 8 | BTN | 5-6.5, Is Reg | raise |
| 3b do Str vs SB (38, 13) | - | 6 < n < 8 | SB | 7-8, Is Reg | raise |
| 3b do Str vs BB (23, 22) | - | 6 < n < 8 | BB | 7-8.5, Is Reg | raise |

## "Is Reg"
Configuration → Color Markers: existem dois marcadores, **Reg** (vermelho, "Is Regular" ligado) e **Fish** (verde, desligado).
"Is Reg" = o vilão tem um marcador de cor com "Is Regular" ligado. O marcador é dado por jogador, dentro do H2N
(não sai de nenhuma conta sobre as mãos). Para reproduzir, precisamos da lista de jogadores marcados como Reg.

## Releitura dos popups que destoavam (conferência do zero)
- 3BET (todas as células): vilão = primeiro raise da street, 5-8bb, Is Reg; nós raise. **Exceção: opener SB ou BB usa 6-10bb** (STR vs SB, STR vs BB, BB vs SB).
  Nomes: UTG = UTG1, LJ = EP, HJ = MP. Filtro do zero = mesmo resultado do código; o que falta é só o Is Reg.
- 4BET SHOVE SB vs IP (15, 20): nós SB 1º raise; vilão BB-STD8; nós raise; 175 ≤ efetivo ≤ 250; efetivo ≥ 80; All-in.
- 4BET SIZE BB vs IP (11, 5) / SHOVE BB vs IP (0, 5): nós BB 1º raise; vilão Straddle; 175-250; ≥ 80; Not All-in / All-in.
- 4BET SIZE BTN vs OOP (4.1, 49) / SHOVE BTN vs OOP (4.1, 49): nós BTN 1º raise; vilão Blinds; 175-250; ≥ 80; Not All-in / All-in.
- **Erro corrigido:** o código contava 3bets de qualquer jogador (inclusive limp-reraise de quem agiu antes). O popup só aceita
  "Blinds" (SB/BB/STR) na coluna "vs OOP" e jogador atrás de nós (CO/BTN) na "vs IP". Efetivo = menor stack entre nós e o vilão.
