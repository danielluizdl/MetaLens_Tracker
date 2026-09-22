# MetaLens Tracker

Tracker de poker no estilo do Hand2Note para um time de cash game. Recebe históricos de mãos
minerados, calcula as stats com as **mesmas definições do H2N** e mostra tudo num HUD web que o
time acessa com login.

Estado hoje: roda inteiro no seu PC (parser, stats, API, banco e tela). Publicar na Cloudflare é opcional e fica para quando o time decidir.

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

## Rodar tudo no seu PC (sem publicar nada)

O mesmo Worker e o mesmo banco rodam offline pelo wrangler. Não precisa de conta na Cloudflare,
nem cartão, e nada sai da sua máquina.

```bash
npm install
npm run db:init                                   # cria o banco local (arquivo em .wrangler/)
npm run dev                                       # servidor em http://localhost:8787
node scripts/import-local.mjs hands_dLzinN.txt    # manda o histórico para o servidor local
```

Abra `http://localhost:8787`, busque o jogador e o HUD aparece. No modo local o Worker roda com
`DEV_USER`, que dispensa o login do Cloudflare Access; essa variável é passada na linha de comando
do `npm run dev` e nunca fica no `wrangler.jsonc`, então um deploy sempre exige login de verdade.

Medido com as 46.768 mãos do dLzinN, tudo local:

| | Tempo / tamanho |
|---|---|
| Importar o arquivo de 78 MB | 14 segundos |
| Banco (D1 local) | 9,8 MB |
| Históricos guardados (gzip) | 8,1 MB |

Projetando pelo mesmo arquivo:

| Mãos | Banco | Históricos gzip |
|---|---|---|
| 1 milhão | ~210 MB | ~170 MB |
| 10 milhões | ~2,1 GB | ~1,7 GB |
| 50 milhões | ~10 GB | ~8,5 GB |

Ou seja, no seu PC cabe tudo. Se um dia for para a nuvem, o plano grátis do D1 tem 5 GB
(o suficiente para cerca de 20 milhões de mãos) e o Workers Paid (US$ 5/mês) é o que libera
o volume de escrita para importar arquivos grandes sem travar.

### Comandos úteis (modo local)

```bash
# marcar jogadores do time (esconde o bb/100 deles no HUD)
npx wrangler d1 execute metalens --local --command "INSERT OR IGNORE INTO team (site, nick) VALUES ('PokerKing','dLzinN')"

# carregar a lista de regs quando ela existir (um nick por linha em regs.txt)
node -e "const fs=require('fs');const n=fs.readFileSync('regs.txt','utf8').split(/?
/).filter(Boolean);fs.writeFileSync('regs.sql',n.map(x=>`INSERT OR IGNORE INTO regs (site,nick) VALUES ('PokerKing','''+x.replace(/'/g,"''")+''');`).join('
'))" && npx wrangler d1 execute metalens --local --file regs.sql

# recalcular tudo a partir dos históricos guardados (depois de mudar uma stat ou a lista de regs)
curl -X POST "http://localhost:8787/api/admin/rebuild"   # repita passando ?cursor=... enquanto vier cursor

# ver o que já foi importado
npx wrangler d1 execute metalens --local --command "SELECT count(*) hands FROM hands; SELECT user, sha, part, new, dup, created FROM uploads ORDER BY id DESC LIMIT 5"
```

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
| `scripts/import-local.mjs` | manda um histórico para o servidor local |
| `scripts/preview.mjs` | abre só a tela, com dados do recorte |
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
