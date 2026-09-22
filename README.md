# MetaLens Tracker

Tracker de poker no estilo do Hand2Note para um time de cash game. Recebe históricos de mãos
minerados, calcula as stats com as **mesmas definições do H2N** e mostra tudo num HUD web que o
time acessa com login.

Estado hoje: parser, stats e API prontos e testados; a tela funciona; falta publicar.

## Por que existe

O time já usa o H2N no computador de cada um. Quem tem as mãos vê as stats; quem não tem, não vê.
Este projeto junta as mãos de todo mundo num lugar só, para qualquer um consultar um vilão pelo navegador.

## Paridade com o H2N

As definições de cada stat foram lidas uma a uma nos popups do próprio H2N e estão em
[`gabarito_dLzinN/definicoes_h2n.md`](gabarito_dLzinN/definicoes_h2n.md). Com elas, o preflop bate:

| | Nosso | H2N |
|---|---|---|
| Mãos (mesas com 5+ jogadores) | 43.130 | 43k |
| VPIP / PFR | 24,1 / 14,4 | 24 / 14 |
| FLAT vs RFI (7 posições) | 4,8 / 5,6 / 10,1 / 13,5 / 5,2 / 14,8 / 28,5 | 4,8 / 5,6 / 10 / 13 / 5,2 / 15 / 28 |
| Fold to 3bet (10 células) | idênticas | idênticas |
| 4BET (13 de 15 células) | idênticas | idênticas |

Regras do H2N que só apareceram comparando amostra por amostra:
- O H2N ignora mesas com 4 jogadores ou menos.
- Entre as ações listadas no popup de uma stat, ninguém mais pode agir além de foldar.
- As stats de aposta e de enfrentar aposta só contam com a street heads-up e sem all-in.
- O "Is Reg" não é conta nenhuma: é um marcador de cor que alguém coloca à mão no H2N.

Pendências em [`TODOS.md`](TODOS.md): lista de regs, paridade do postflop e suporte a outros sites.

## Como rodar

```bash
npm install
npm test                 # sem o arquivo de mãos, os testes que precisam dele são pulados
npm run fixture          # cria o recorte de teste a partir do seu próprio histórico
npm run build:ui         # gera public/app.js
node src/report.ts       # compara nossas stats com o gabarito do H2N, stat por stat
node scripts/preview.mjs # abre a tela em http://localhost:8790 com dados do recorte
```

**As mãos nunca entram no repositório.** `hands_*.txt` e `test/fixtures/sample.txt` estão no
`.gitignore`: são dados de outros jogadores e ficam só na máquina de quem tem o arquivo.

## Estrutura

| Arquivo | O que é |
|---|---|
| `src/parser.ts` | lê o texto do histórico (PokerKing) e devolve a mão com todas as ações |
| `src/stats.ts` | calcula as stats no formato `[oportunidade, fez]`, com as regras do H2N |
| `src/catalog.ts` | as caixas do HUD (título, linhas, colunas, chave, faixa de cor, gabarito) |
| `src/hud.ts` | cor, formatação e descrição de cada stat (funções puras, testadas) |
| `src/ui.ts` | a tela: busca, HUD, filtro de stake, "vs reg", upload |
| `src/report.ts` | comparação com o H2N no terminal |
| `worker.ts` | API na Cloudflare: upload, busca, stats, regs, recálculo |
| `schema.sql` | tabelas do D1 |
| `public/` | HTML e o bundle da tela |
| `docs/PLAN.md` | plano, decisões de arquitetura e de design |
| `DESIGN.md` | cores, fonte e tamanhos tirados do H2N |

## Arquitetura

O navegador manda o arquivo em pedaços de ~4 MB; o Worker guarda o bruto, calcula as stats com o
mesmo código do terminal, ignora mãos repetidas e soma os contadores dentro do SQL (sem perder
incremento quando dois uploads acontecem juntos). Detalhes e o porquê de cada escolha em
[`docs/PLAN.md`](docs/PLAN.md).

## Licença

O parser foi adaptado do [CoinPokerTracker](https://github.com/mleclerc182/CoinPokerTracker)
(Apache-2.0 + Commons Clause). Veja [`NOTICE`](NOTICE): o código **não pode ser vendido** nem
usado como base de um serviço pago.
