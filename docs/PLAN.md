# MetaLens Tracker — Plano das próximas etapas

Estado em 22/09/2026. Pendente externo: a lista de jogadores marcados como **Reg** no H2N (Export Notes, depende de acesso ao servidor).
Objetivo: deixar a estrutura inteira pronta agora, para que a lista de regs e as próximas definições do H2N entrem só como dados.

## O que já existe (reaproveitar, não refazer)

| Peça | Arquivo | Uso no plano |
|---|---|---|
| Parser PokerKing | `src/parser.ts` | roda **no Worker** (mesmo código do CLI) |
| Stats H2N (preflop) | `src/stats.ts` | `handStats(h, isReg)` roda no Worker; `aggregate`/`combine` reaproveitados |
| Comparação com H2N | `src/report.ts` | passa a ler o gabarito do catálogo |
| Definições dos popups | `gabarito_dLzinN/definicoes_h2n.md` | fonte de verdade das regras |
| Leitura de popups via Guacamole | `.playwright-mcp/stat.sh` | ferramenta de apoio, fora do produto |

## Arquitetura

```
 NAVEGADOR                                     CLOUDFLARE (Workers Paid, US$ 5/mês)
 ┌──────────────────────────────┐             ┌──────────────────────────────────────────┐
 │ index.html (visual do H2N)    │             │ Worker (worker.ts) — confere JWT do Access│
 │  ├─ escolhe .txt              │  POST texto │  ├─ POST /api/upload  pedaço ~5 MB        │
 │  ├─ corta em pedaços ~5 MB    │────────────►│  │    R2.put(gz) ─► parseHand ─► handStats│
 │  │  (limite de mãos inteiras) │  gzip       │  │    ─► INSERT OR IGNORE hands RETURNING │
 │  └─ barra de progresso        │◄────────────│  │    ─► soma só as mãos novas (SQL)      │
 │                               │  {novas,dup}│  ├─ GET /api/player?q=  (prefixo)         │
 │ busca ► HUD igual ao H2N      │◄────────────│  ├─ GET /api/stats?p=&stake=              │
 │ (total de stakes por padrão)  │  JSON       │  ├─ GET /api/regs                         │
 └──────────────────────────────┘             │  └─ POST /api/admin/rebuild (admin)       │
       Cloudflare Access (login do time)       │ D1 (SQLite)                               │
                                               │  players(site, nick COLLATE NOCASE)       │
                                               │  stats(site, nick, stake, c JSON, hands,  │
                                               │        net_bb)                            │
                                               │  hands(site, id) PRIMARY KEY              │
                                               │  uploads(id, user, sha, novas, dup, data) │
                                               │  regs(site, nick, versao)                 │
                                               │ R2 privado: uploads/<sha>.txt.gz (180 dias)│
                                               └──────────────────────────────────────────┘
```

Fluxo de um pedaço do upload (um único pedido, sem estado entre pedidos):
```
POST /api/upload (gzip, ≤ 5 MB de texto, só mãos inteiras)
  JWT inválido ───────────────────────────────► 401
  R2.put(uploads/<sha>-<n>.txt.gz)              ← primeiro: nada fica fora do rebuild
  splitHands ► parseHand (erros contados, não derrubam o pedaço)
  D1 batch (transação):
    INSERT OR IGNORE INTO hands SELECT … FROM json_each(?) RETURNING id   ← mãos novas
  handStats(h, isReg) só das novas, com minPlayers 5 marcado por mão
  D1 batch (transação), 1 comando por tabela via json_each:
    UPSERT stats: c = soma chave a chave (json_each + json_group_object) ← atômico
    UPSERT players
  INSERT uploads(...) ─► 200 {novas, duplicadas, rejeitadas}
```

## Decisões (revisão de engenharia + voz externa, 22/09/2026)

| # | Decisão |
|---|---|
| D3 | Escopo: núcleo agora. Importador do Export Notes fica para quando o arquivo existir. |
| 1 | Cada upload grava o .txt.gz no R2 privado, **antes** de somar. |
| 2 | Dedupe: `hands(site, id) PRIMARY KEY` + **Workers Paid (US$ 5/mês)**. |
| T1 | **Parse e cálculo no servidor.** O navegador só corta o arquivo em pedaços de ~5 MB (limite de 128 MB de memória do Worker) e envia gzip. Substitui as decisões 3, 4 (validação de contadores) e 8 (Web Worker). |
| 4 | Worker confere o JWT do Access em toda rota `/api` e registra `uploads`. |
| T2 | Soma dos contadores feita **dentro do SQL** (json_each), atômica, sem perder incremento em uploads simultâneos. |
| T3 | **Recálculo na E1**: `/api/admin/rebuild` zera `stats`/`hands` e reprocessa o R2 com o mesmo código do upload. |
| T4 | Células com "Is Reg" gravadas em duas versões, `…` (vs todos) e `….reg` (vs reg). A tela mostra "vs reg", como o H2N. Mudar a lista = recálculo. |
| T5 | Privacidade: Access obrigatório, R2 privado com retenção de 180 dias, bb/100 escondido para jogadores marcados "do time". |
| 5 | `src/catalog.ts`: caixas do HUD (visual do H2N), chaves, faixas de cor e gabarito; HUD, relatório e testes leem dele. |
| 6 | `src/parity.test.ts`: trava toda stat que hoje bate com o H2N, usando um recorte versionado (T7-5). |
| 7 | Testes do Worker: node:test + Miniflare (D1 e R2 em memória). |
| 9 | Busca por início do nome, índice NOCASE, 20 resultados, espera de 250 ms. |
| T7 | Ajustes: 1 comando por tabela (limite de 1.000 por pedido); chaves com `site`; R2 primeiro; tela abre no total de stakes, filtro de 5+ jogadores, `net_bb` no banco; recorte de teste versionado; limites do plano pago. |
| T6 | Visual do H2N **mantido** (pedido do usuário); a voz externa sugeriu tabela simples, rejeitado. |

## Etapas

**E1. Estrutura base (agora, sem depender do H2N)**
1. `git init` + `.gitignore` (mãos `.txt` e `.playwright-mcp/` fora do repo).
2. `wrangler.jsonc` (Workers Paid, D1, R2, Static Assets) e `schema.sql`.
3. `src/stats.ts`: `handStats(h, isReg)` gera `….reg`; marca `minPlayers`.
4. `worker.ts`: rotas upload, player, stats, regs, admin/rebuild; JWT do Access.
5. `src/catalog.ts` + `public/index.html` + `public/app.js`: busca e HUD com o visual do H2N desenhado a partir do catálogo; upload com corte em pedaços e barra de progresso.
6. Testes: `src/parity.test.ts` (recorte versionado), `src/catalog.test.ts`, `worker.test.ts` (Miniflare).
7. Deploy + Cloudflare Access + retenção de 180 dias no R2.

**E2. Lista de regs (quando o Export Notes chegar)**
- `src/import-notes.ts` lê o arquivo do H2N e preenche `regs`; roda o recálculo; o teste de paridade passa a travar as 27 células de 3BET.

**E3. Paridade postflop (quando houver acesso ao H2N)**
- Ler popups de POSTFLOP HUD, RIVER HUD, LIMP, PROBE/DELAY, CONT. AGGR, SRP IP/OOP PFR MW; transcrever para `definicoes_h2n.md`; implementar; validar; recálculo.

## Números que guiam o desenho (medidos no arquivo do dLzinN)
- 46.768 mãos → 6.158 linhas (jogador × stake), ~48 contadores por linha.
- Upload desse tamanho: ~46,8 mil escritas em `hands` + ~6,2 mil em `stats` ≈ 53 mil escritas. Workers Paid: 50 milhões de escritas/mês incluídas; 1.000 comandos por pedido; 30 s de CPU; 128 MB de memória.
- 78 MB de texto ≈ 156 MB em memória no Worker: por isso pedaços de ~5 MB.

## NOT in scope
- **Suporte a PokerStars/outros sites no parser**: o parser só reconhece `PokerKing Hand #`; as chaves já têm `site`, o parser entra quando houver arquivo de outro site.
- **Importador do Export Notes**: sem arquivo real para testar (E2).
- **Paridade postflop**: depende de ler os popups no H2N (E3).
- **Cobrança/uso comercial**: a Commons Clause do código adaptado proíbe (ver NOTICE).
- **App mobile, notas por jogador, replayer**: não pedidos.

## Falhas previstas
| Caminho | Falha realista | Teste | Tratamento | O usuário vê |
|---|---|---|---|---|
| upload | pedaço corta uma mão no meio | worker.test | navegador só corta em `PokerKing Hand #` | contagem de mãos certa |
| upload | 2 uploads simultâneos com mãos em comum | worker.test | INSERT OR IGNORE + soma em SQL | "N novas, M duplicadas" |
| upload | linha de mão desconhecida | parser.test | mão rejeitada e contada | "X mãos rejeitadas" |
| upload | queda de rede no meio | worker.test | cada pedaço é independente; reenviar completa | barra para; reenviar funciona |
| stats | cota do D1 estourada | worker.test | 503 com mensagem | "limite atingido, tente mais tarde" |
| rebuild | pedido passa de 30 s | worker.test | rebuild processa um arquivo do R2 por pedido e continua | progresso na tela admin |
| busca | nick chinês/parcial | worker.test | prefixo NOCASE | lista ou "nenhum jogador" |

Nenhuma falha silenciosa sem teste.

## Paralelização
| Passo | Módulos | Depende de |
|---|---|---|
| stats/catálogo/paridade | `src/` | — |
| Worker + schema + testes | raiz (`worker.ts`, `schema.sql`) | stats (`handStats(h, isReg)`) |
| UI (HUD + upload) | `public/` | catálogo |

Lane A: stats → catálogo → paridade. Lane B: schema → Worker (começa com a assinatura do handStats combinada). Lane C: UI (depois do catálogo). A e B em paralelo; C após A.

## Implementation Tasks
Derivadas das decisões acima. Marque conforme entregar.

- [x] **T1 (P1, humano: ~1h / CC: ~5min)** — repo — `git init`, `.gitignore` (mãos `.txt`, `.playwright-mcp/`), recorte versionado de mãos para testes
  - Origem: decisão T7-5 (teste roda em qualquer clone)
  - Verificar: `git status` limpo; `npm test` roda sem o arquivo de 78 MB
- [x] **T2 (P1, humano: ~4h / CC: ~20min)** — stats — `handStats(h, isReg)` com células `….reg` e marca de minPlayers
  - Origem: T4, T7-4
  - Arquivos: `src/stats.ts`, `src/parser.test.ts`
  - Verificar: `npm test`; `node src/report.ts` sem regressão
- [x] **T3 (P1, humano: ~3h / CC: ~15min)** — catálogo — `src/catalog.ts` (caixas do HUD, chaves, faixas de cor, gabarito) + `src/catalog.test.ts`; `report.ts` passa a ler dele
  - Origem: decisão 5
- [x] **T4 (P1, humano: ~2h / CC: ~10min)** — paridade — `src/parity.test.ts` sobre o recorte versionado, travando toda stat que hoje bate
  - Origem: decisão 6
- [x] **T5 (P1, humano: ~2 dias / CC: ~40min)** — worker — `wrangler.jsonc`, `schema.sql`, `worker.ts`: upload (R2 primeiro, INSERT OR IGNORE RETURNING, soma em SQL via json_each), player (prefixo NOCASE), stats, regs, JWT do Access
  - Origem: 1, 2, 4, T1, T2, T7-1/2/3, 9
  - Verificar: `worker.test.ts` (Miniflare): duplicata, 2 uploads simultâneos, JWT, mão rejeitada, busca chinesa
- [x] **T6 (P1, humano: ~1 dia / CC: ~20min)** — rebuild — `/api/admin/rebuild` reprocessa o R2 um arquivo por pedido
  - Origem: T3
  - Verificar: teste Miniflare: rebuild dá os mesmos contadores que o upload
- [x] **T7 (P1, humano: ~2 dias / CC: ~1h)** — UI — `public/index.html` + `public/app.js`: busca, HUD com visual do H2N a partir do catálogo (total de stakes por padrão, "vs reg"), upload em pedaços de ~5 MB com barra de progresso, bb/100 escondido para o time
  - Origem: pedido do usuário, T5, T6, T7-4
  - Verificar: `/qa` com o plano de testes em `~/.gstack/projects/MetaLens_Tracker/`
- [ ] **T8 (P2, humano: ~2h / CC: ~15min)** — deploy — Workers Paid, D1, R2 privado com retenção de 180 dias, Cloudflare Access
  - Origem: 2, T5

## Andamento (22/09/2026)
- T1–T7 e T9 prontos: `npm test` = 28 passando, 2 pendências marcadas (postflop e regs).
- Diferença do plano: a tabela `players` saiu; a busca usa o índice de `stats` (nick COLLATE NOCASE).
- Testes do Worker usam Miniflare 4 (o Miniflare 5 que vem com o wrangler está em alpha).
- T7 pronto: revisão de design (3/10 → 9/10, 7 decisões), `DESIGN.md`, `public/index.html`, `src/ui.ts` (bundle em `public/app.js`), `src/hud.ts` + testes. Conferido no navegador com `node scripts/preview.mjs`.
- T9 pronto: login, papéis, convites, coluna esquerda e detalhe da stat (seção abaixo).
- Falta: T8 (deploy: conta Cloudflare, Workers Paid, D1, R2, Access) — opcional enquanto rodar só no PC.

## T9 — Contas, papéis e coluna de jogadores (22/09/2026)

Pedido do usuário: estética do `metalens-br.vercel.app`, login com tipos de conta,
coluna à **esquerda** com os nicks da base; clicar no nick abre as stats e cada stat
abre um detalhe mais profundo.

| # | Decisão |
|---|---|
| 1 | Duas formas de entrar: sessão própria (e-mail + senha) e, em produção, o Cloudflare Access. O papel vem sempre da tabela `users`. |
| 2 | Senha com PBKDF2 (WebCrypto, sem dependência nova); sessão em cookie `ml` assinado com HMAC (`SESSION_SECRET`), HttpOnly + SameSite=Lax. |
| 3 | Papéis: `admin` (sobe mãos, recalcula, cria convites, muda papel) e `player` (**só consulta**). |
| 4 | Cadastro por convite: a primeira conta vira admin; as demais exigem um código de uso único gerado por um admin (`invites`). Sem cadastro aberto porque o repositório é público. |
| 5 | Coluna esquerda: `/api/players` devolve nick + mãos (300 linhas, filtro por início do nick) com barra de disponibilidade da amostra (500 / 1.000 / 2.000 mãos). |
| 6 | Detalhe da stat: clicar numa célula abre um painel com amostra, faixa do time, valor do H2N, a regra, a quebra por stake e as demais células da mesma caixa. Sem gráfico e sem lista de mãos — o banco local não guarda o texto da mão por jogador. |
| 7 | Estética Meta Lens (fundo `#0b0c10`, painel `#14161b`, destaque `#e8564d`, Outfit + IBM Plex Mono) aplicada por cima do **layout do H2N**, que continua sendo o do HUD. |

Testes que travam isso (`worker.test.ts`): primeira conta vira admin, convite obrigatório e de uso único,
senha curta recusada, login errado dá 401, cookie adulterado não autentica, `player` recebe 403 em
upload/convites/usuários/recálculo e 200 na leitura, e a coluna vem ordenada por mãos.

## Design da tela (revisão de design, 22/09/2026)

Referência: prints do H2N em `gabarito_dLzinN/`. Tokens em `DESIGN.md`.

```
┌ METALENS [ buscar jogador…            ] [Stake: Todas ▾] [☐ vs reg]        [Subir mãos] ┐
├ dLzinN · PokerKing · 43,1k mãos · 23,6 bb/100                                          ┤
│ PREFLOP   POSTFLOP   SRP/3BP   RIVER                                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌STATS┐┌RFI┐┌LIMP┐┌FLAT vs RFI┐┌──STR-DEFENSE──┐┌────3BET────┐┌FOLD TO 3BET┐┌4BET┐┌F4B┐ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Decisão de design |
|---|---|
| 1 | Upload: botão no topo à direita abre painel lateral (o HUD continua visível). |
| 2 | Primeira tela: busca em foco + últimos 12 jogadores vistos (guardados no navegador, sem custo no banco). |
| 3 | Detalhe da stat (hover/toque): nome, "fez X de Y (Z%)", faixa e uma linha com a regra (campo `desc` no catálogo). |
| 4 | Cor do valor: azul abaixo da faixa, verde dentro, amarelo até +25% da largura, vermelho acima; amostra < 10 esmaecida. |
| 5 | `DESIGN.md` com os tokens do H2N (cores, fonte, tamanhos, foco, scrollbar). |
| 6 | Tela menor que 900px: caixas em coluna única, grades com rolagem lateral e coluna de rótulos fixa; teclado, 44px de toque, contraste mínimo. |
| 7 | "vs reg" liga por padrão quando existir lista de regs; sem lista, fica desabilitada com a dica. |

Estados (o que o usuário vê):

| Parte | Carregando | Vazio | Erro | Sucesso | Parcial |
|---|---|---|---|---|---|
| Busca | "buscando…" | "Nenhum jogador começa com X" | "Sem conexão, tente de novo" | lista nick + mãos | — |
| HUD | "…" no lugar dos números | célula sem amostra: "-" | faixa vermelha + "tentar de novo" | valores coloridos | amostra < 10: valor esmaecido |
| Upload | "pedaço 3 de 16 · 12.400 mãos" | — | pedaço com falha + "reenviar" | "44.102 novas, 2.666 repetidas, 0 rejeitadas" | mostra pedaços enviados e continua |
| vs reg | — | sem lista: chave desabilitada + dica | — | células marcadas mostram "vs reg" | — |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES FOUND (claude subagent) | 13 pontos; 7 tensões decididas (6 aceitas, 1 rejeitada) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 9 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | nota 3/10 → 9/10, 7 decisões |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** a voz externa (subagente Claude, não Codex) derrubou a premissa do parse no navegador (T1) e achou a perda de atualização na soma de JSON (T2). O visual do H2N foi mantido por pedido do usuário.
- **VERDICT:** ENG + DESIGN CLEARED — E1 implementada menos o deploy. Revisão de design recomendada antes da T7 (HUD).

NO UNRESOLVED DECISIONS
