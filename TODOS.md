# TODOS

## Lista de regs do H2N (importador do Export Notes)
- **What:** `src/import-notes.ts` lê o arquivo de notas exportado do H2N e preenche a tabela `regs`; depois roda o recálculo.
- **Why:** fecha as 27 células de 3BET e os 5 "3b do Str" que dependem de "Is Reg" (hoje a amostra é ~2× a do H2N).
- **Pros:** paridade total do 1º print; a tela "vs reg" passa a bater com o H2N.
- **Cons:** a lista é manual no H2N e muda; cada mudança pede recálculo.
- **Context:** "Is Reg" = marcador de cor com "Is Regular" ligado (Configuration → Color Markers: Reg vermelho ligado, Fish verde desligado). A busca Multiple Players com Fish/Reg = Reg mostra ~18 mil jogadores. Exportar em Configuration → Export Notes salvando em `C:\Users\H2N` (o Guacamole baixa arquivos dessa pasta). O clipboard do Guacamole é bloqueado; ler pela tela é inviável.
- **Investigação (22/09/2026):** medi a razão (nossa amostra sem filtro ÷ amostra "Is Reg" do H2N) nas 31 células de 3BET que temos documentadas. Padrão bem consistente: ~2,0–2,2× quando quem abriu está em UTG1/LJ/HJ/CO/BTN (≈48% marcados Reg), mas ~2,7–3,5× quando quem abriu está no SB/BB (≈30–33% marcados Reg) — faz sentido, abrir do blind é barato e atrai muito mais fish. Isso confirma que "Is Reg" é mesmo uma etiqueta fixa por jogador (não calculada por mão). Testei os 38 nicks da amostra de `regs_all_regs_filtro.txt` contra o nosso banco: só 11 jogaram contra o dLzinN, com VPIP/PFR muito espalhado (7–33% / 0–24%, 9–559 mãos) — sinal de que a base que o H2N usou pra marcar Reg é muito maior que as mãos que temos aqui (jogador com poucas mãos vs dLzinN pode ter milhares em outras mesas/heróis na base do H2N). Ou seja: **não dá pra reconstruir a lista calculando VPIP/PFR só com este arquivo** — o Export Notes continua sendo o único caminho exato. As razões acima servem para validar a lista quando ela chegar (o "n" recalculado deve bater com o H2N).
- **Depends on / blocked by:** acesso ao H2N + autorização para criar o arquivo de exportação.

## Paridade postflop com o H2N
- **What:** ler os popups das stats de postflop e implementar as definições exatas.
- **Why:** o preflop já bate; o postflop usa regras deduzidas pelo tamanho da amostra (heads-up na street, sem all-in), sem confirmação dos popups.
- **Pros:** o HUD inteiro fica igual ao H2N que o time usa.
- **Cons:** cada stat pede leitura de popup e ajuste.
- **Context:** prints na pasta `gabarito_dLzinN/` (POSTFLOP HUD, RIVER HUD, LIMP, PROBE-DELAY, Con. Agrr, SRP IP/OOP PFR MW, RIVER BY BETSIZE). Método: `.playwright-mcp/stat.sh X Y nome` (GStack Browser logado no Guacamole, comandos a partir da raiz do projeto) → `definicoes_h2n.md` → `src/stats.ts` → teste de paridade → recálculo.
- **Depends on / blocked by:** acesso ao H2N; E1 pronta (recálculo).

## Suporte a PokerStars e outros sites no parser
- **What:** reconhecer `PokerStars Hand #` (e outros) em `splitHands` e `HEADER` de `src/parser.ts`.
- **Why:** a ideia original incluía mãos tipo PokerStars; hoje só PokerKing é lido.
- **Pros:** o time pode subir mãos de outros sites sem migração (as chaves já têm `site`).
- **Cons:** cada site tem variações de texto (side pots, all-in, rake) que precisam de teste.
- **Context:** critério de pronto = arquivo inteiro com 0 erros e soma dos resultados = −rake em todas as mãos (mesmo teste de `src/parser.test.ts`).
- **Depends on / blocked by:** um arquivo real de mãos do outro site.

## Faixas de cor exatas por stat (do Popup Editor do H2N)
- **What:** copiar as faixas de cor de cada célula (Popup Editor → selecionar célula → Properties → "Stat Range … to …" + cor) e guardar em `src/catalog.ts` (campo `range` por cor, não só uma faixa).
- **Why:** hoje a cor usa uma regra única aproximada (azul/verde/amarelo/vermelho em relação à faixa de referência). Com as faixas reais, a leitura fica idêntica à do H2N.
- **Pros:** o time lê as cores do mesmo jeito que já lê no H2N.
- **Cons:** exige abrir o editor célula a célula; são dezenas de leituras.
- **Context:** o "20-28" embaixo do valor é a faixa de referência, não a regra de cor. As cores vêm de "color ranges" configurados por stat. Método de leitura: `.playwright-mcp/stat.sh` + GStack Browser no Guacamole.
- **Depends on / blocked by:** acesso ao H2N.
