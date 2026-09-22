# MetaLens Tracker — Prompt Mestre

> Cole este arquivo como primeira mensagem de cada sessão nova (ou referencie com `@PROMPT.md`).

## 0. Modo de operação (sempre ativo)

- **/ponytail full**: YAGNI, stdlib primeiro, menor diff que funciona. Nada de abstração "pra depois".
- **/graphify**: depois de cada fase que gera código, rode `/graphify .` e consulte `graphify-out/` antes de perguntar ou reler arquivos. Não reexplique o que o grafo já mostra.
- **agent-skills** (addyosmani/agent-skills): siga o ciclo `spec → plan → build incremental → test → review → ship`. Liste suas suposições antes de codar. Nada está pronto sem verificação que rodou.
- Idioma: responda em português; código, tabelas e commits em inglês.

> **Plano atual e decisões de arquitetura: `docs/PLAN.md`** (revisão de engenharia de 22/09/2026). Pendências: `TODOS.md`.

## 1. Objetivo

Um tracker web no estilo **H2N (Hand2Note)** que recebe mãos de cash game mineradas (formato texto PokerStars) de **milhares de jogadores / milhões de mãos** e mostra online as stats dos regs vilões pra todo o time.

**Critério de sucesso do MVP:** carregar `hands_dLzinN.txt` (~46,7k mãos) e as stats do dLzinN e de 5 vilões com bastante amostra batem com o H2N (mesmo filtro), com tolerância de ±0,5 pp.

## 2. Fatos do dataset (já verificados, não re-derivar)

| Fato | Valor |
|---|---|
| Arquivo | `hands_dLzinN.txt`, 78 MB, UTF-8, mistura CRLF/LF |
| Site | `PokerKing Hand #<id>` (sintaxe PokerStars, não é header de PokerStars) |
| Mãos | 46.768, todas NLHE, todas `8-max` |
| Stakes | $0.10/$0.20 (21.968), ¥1/¥2 (21.524), $0.20/$0.50 (2.157), ¥2/¥4 (986), ¥5/¥10 (133). Moedas USD e CNY |
| Antes | todo jogador paga `posts the ante` |
| Straddle | `posts straddle` em ~44,3k mãos (~95%). **Afeta posição, VPIP, PFR e 3bet** |
| Hole cards do hero | **Não existe `Dealt to`**. Cartas só aparecem em `shows` (~23k linhas) |
| Rake | `Rake $0`, exceto a ficha ímpar de pote dividido (ex.: `Rake $0.01`, `Rake ¥1`) |
| Nicks | Unicode (chinês). Tratar sempre como UTF-8 |
| Potes | `collected X from pot`, `main pot`, `side pot`, `side pot-N` |
| Streets | `*** HOLE CARDS / FLOP / TURN / RIVER / SHOW DOWN / SUMMARY ***` |

## 3. Equipe (gstack): quem entra em cada fase

| Fase | Skill | Entrega |
|---|---|---|
| 1. Enquadrar | `/office-hours` → `interview-me` | Pra quem é, o que o time abre todo dia, o que NÃO entra |
| 2. Spec | `spec-driven-development` + `constraint-driven-development` | `SPEC.md` (stats do MVP com definição exata) + `CONSTRAINTS.md` (tempo de import, p95 de query) |
| 3. Revisão do plano | `/plan-ceo-review` → `/plan-eng-review` → `/plan-design-review` (ou `/autoplan`) | Arquitetura aprovada, escopo cortado |
| 4. Tarefas | `planning-and-task-breakdown` | Fatias verticais pequenas e verificáveis |
| 5. Parser + DB | `incremental-implementation` + `test-driven-development` + `doubt-driven-development` | Parser, schema, import em lote |
| 6. Paridade de stats | `test-driven-development` | Teste comparando com o export do H2N |
| 7. API + UI | `api-and-interface-design` + `frontend-ui-engineering` / `/design-consultation` | Busca de jogador e HUD/painel de stats |
| 8. Segurança | `/cso` + `security-and-hardening` | Upload não confiável, auth, acesso só do time |
| 9. Performance | `/benchmark` + `performance-optimization` | Import de 1M mãos e query por jogador medidos |
| 10. QA e entrega | `/qa` → `/review` → `/ship` → `shipping-and-launch` | Deploy com rollback |

## 4. Arquitetura (decidida; a `/plan-eng-review` pode vetar)

Modelo igual HM/PT/H2N: **parse uma vez, agrega sempre.** Tudo no plano gratuito da Cloudflare.

1. **Parser + stats:** `src/parser.ts` e `src/stats.ts` (prontos, TypeScript sem dependência). Roda **no navegador** de quem faz o upload: a CPU do Worker gratuito (10 ms por request) não aguenta parsear 40k mãos. `aggregate()` reduz tudo a contadores [oportunidade, fez] por (jogador, stake).
2. **Upload:** o navegador envia só os **contadores + os IDs das mãos**. O Worker ignora IDs já vistos (dedupe) e soma o resto.
3. **Banco:** Cloudflare D1 (SQLite, 5 GB no plano grátis). Tabelas `hands_seen(hand_id PK)` e `player_stats(player, stake, contadores…)`. Porcentagem calculada na leitura. Milhões de mãos cabem porque não guardamos linha por mão e por jogador no servidor.
4. **Web:** Cloudflare Pages (busca de jogador + tabela de stats) + 1 Worker (upload e leitura) + Cloudflare Access (login só do time, grátis até 50 usuários).
5. **Mãos brutas** (opcional, fase 2): arquivo `.txt` compactado no R2 (10 GB grátis), pra recalcular tudo se a definição de uma stat mudar.

Por que não as outras: Supabase grátis tem 500 MB e pausa o projeto depois de 1 semana sem uso. Render/Railway grátis dormem ou expiram. Pular por enquanto: filas, ClickHouse, cache externo.

## 5. Regras de stats (onde o H2N costuma divergir)

- **Straddle:** o straddle é o último a agir no pré-flop. Posição, "open raise" e "3bet" são relativos ao straddle. Postar blind, straddle ou ante **não** conta como VPIP.
- Walk (todo mundo folda pro BB/straddle) fica fora do denominador de VPIP/PFR, igual o H2N.
- `bb/100` usa o big blind da mesa (não o straddle). Converter CNY/USD só se o time pedir. Por padrão, stats por moeda + stake.
- Cada stat precisa ter definição escrita de numerador e denominador no `SPEC.md` antes do código.

## 6. Regras do H2N descobertas (verificadas contra o gabarito, não re-derivar)

Rodar `node src/report.ts` mostra nosso número × H2N, stat por stat, com o tamanho de amostra.

- **Amostra:** o H2N ignora mesas com ≤4 jogadores (43.130 de 46.768 mãos). O `report.ts` usa `minPlayers=5`.
- **Posições:** nomeadas a partir do botão. Com straddle: `SB BB STR UTG1(U1) LJ HJ CO BTN`.
- **FLAT vs RFI e matriz de 3BET:** alguém dá open, ninguém mais entrou (sem limp, sem call), e é a **primeira** ação do jogador: call = flat, raise = 3bet. Linha = posição do jogador. O 3BET geral inclui squeeze.
- **FLAT vs RFI (popups "Flat do <pos>" do H2N):** mesa com 6 a 8 jogadores. Open de 6 a 7bb para LJ, HJ, CO e BTN. Open de 6 a 8bb para SB e BB, sem opener nos blinds. STR: open de 5 a 8bb, sem opener nos blinds, pote inicial entre 6 e 8bb. **As 7 posições batem exato** (amostra e nº de calls). Tabela `FLAT` em `src/stats.ts`.
- **Fold to 3bet por posição (popups "CO - FOLD 3BET vs X"):** nosso open é a primeira ação da mão (sem limp), de 5 a 8bb; 3bet do vilão de 20 a 36bb; **ninguém paga no meio** (isso não aparece no popup, mas é o que fecha). CO e BTN batem exato (7 células). As linhas SB e BB usam outras faixas de tamanho (falta o popup).
- **3bet por posição (popups "3BET CO vs X"):** o open do vilão é o primeiro raise da mão (limp antes permitido), de 5 a 8bb, ninguém pagou antes da nossa ação, e **o vilão é "Is Reg"**. Sem o filtro de reg, a amostra fica cerca de 2 vezes maior e o percentual fica perto.
- **Nomes do H2N nos popups:** EP = nosso LJ, MP = nosso HJ, UTG1 = UTG1, Straddle = STR.
- **Regra geral das sequências do H2N:** entre as ações listadas no popup, ninguém mais pode agir além de foldar. Com isso, Fold to 4bet fica 61,9 (84) = 62 (84).
- **Definições completas do preflop:** `gabarito_dLzinN/definicoes_h2n.md` (lidas direto dos popups). As tabelas `RFI_POT`, `STR_DEF`, `F3B`, `F4B_MIN` e `FLAT` em `src/stats.ts` vêm de lá.
- **Leitura dos popups:** GStack Browser (visível) logado no Guacamole; `.playwright-mcp/stat.sh X Y nome` clica na célula e lê o tooltip do "i". Rodar os comandos do browse sempre a partir da raiz do projeto.
- **Método que funciona:** pedir o popup de definição da stat no H2N e transcrever para a tabela. O "6 < Initial players count < 8" do H2N equivale a 6 a 8 jogadores na nossa contagem.
- **STR-DEFENSE:** mesma regra, com o jogador no STR. Faixas pelo tamanho do open: 6bb = até 6,5bb (até 9bb se o open vier de SB/BB); 7-8bb = de 6,5 a 8,5bb.
- **F3BET / 4BET / F4BET / matriz F3B / 4B:** só quando o 3bet **não é squeeze** e ninguém pagou o 3bet → 54,0 (322) = 54 (322).
- **Bet Flop/Turn/River, Fold Bet, Raise vs bet, lines e sizings:** só com a street **heads-up** e **nunca contra aposta all-in**.
- **AFq:** % das streets em que o jogador agiu e foi agressivo (amostra = flops vistos). **AF** = (bets+raises)/calls.
- **Call river:** qualquer aposta enfrentada no river. **Fold river** e F30…F150: heads-up, incluindo all-in.
- **Sizings do river:** B30 <40%, B50 <62,5%, B75 <92,5%, B110 <130%, B130+ ≥130% do pote.

Ainda sem paridade (precisa da definição exata no editor de stats do H2N):
- Matriz de 3BET (falta a definição de "Is Reg"), F3B das linhas SB/BB, STR-DEFENSE: os **percentuais** batem (FLAT ±1 em 6 das 7 posições), mas nossa amostra é cerca de 2× (FLAT) e 3× (3BET) a do H2N, igual em todas as posições. Testamos e **descartamos** estes filtros: moeda, tamanho do open, stack efetivo, posição do opener, número de jogadores, open all-in. O HUD tem algum filtro por célula que não aparece no print.
- F4BET, 5BET shove, Bet vs missed cbet, WWSF (43 × 47), "Small/Large pot" (usamos SRP × 3bet pot), Bet big pot, 3BP barrels, blocks.
- Painel "Range / Hand Value" (print 4, lado direito): depende das cartas, que só aparecem em showdown.

## 7. Estado atual

- [x] Varredura de segurança do CoinPokerTracker: sem código malicioso. Licença Apache-2.0 + **Commons Clause** (não pode vender). Veja `NOTICE`.
- [x] `src/parser.ts`: mão estruturada (ações, pote, posições com STR). `npm test`: 46.768 mãos, soma dos resultados = −rake em todas.
- [x] `src/stats.ts`: ~150 stats dos 4 prints como pares [oportunidade, fez]. `src/report.ts`: comparação com o H2N.
- [ ] Fechar as stats sem paridade (acima).
- [ ] Worker + D1 + página de busca (arquitetura na seção 4).

## 8. Perguntas em aberto

- "Is Reg" no H2N = jogador com o marcador de cor "Reg" (Configuration → Color Markers, marcado por jogador). Falta: a lista de regs marcados, e decidir como o nosso tracker marca regs (sugestão: lista compartilhada pelo time).
- Popups de definição do H2N: F3B do SB e do BB, STR-DEFENSE e as outras stats sem paridade.
- Quem acessa: só o time via Cloudflare Access (recomendado) ou link aberto?
- O projeto nunca vai ser cobrado? Se for, o parser precisa ser reescrito (Commons Clause).
