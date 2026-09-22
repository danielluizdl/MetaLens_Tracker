# Design do MetaLens Tracker

O alvo visual é o Hand2Note: o time usa o H2N todo dia e precisa reconhecer a tela de imediato.
Tokens tirados dos prints em `gabarito_dLzinN/` (PREFLOP HUD, POSTFLOP HUD, LIMP, MAIN).

## Cores (variáveis CSS)

| Token | Valor | Onde |
|---|---|---|
| `--bg` | `#1e1e1e` | fundo da página |
| `--panel` | `#2b2b2b` | fundo das caixas |
| `--panel-head` | `#333333` | faixa do título da caixa |
| `--border` | `#5a5a5a` | borda das caixas e linhas da grade |
| `--title` | `#d8d8d8` | título da caixa (LIMP, 3BET…) |
| `--label` | `#e8e8e8` | rótulo de linha e coluna (BTN, vs CO…) |
| `--muted` | `#8a8a8a` | amostra ao lado do valor |
| `--range` | `#7d7d7d` | faixa de referência embaixo do valor |
| `--dim` | `#5f5f5f` | valor com amostra < 10 mãos |
| `--below` | `#3aa0f0` | valor abaixo da faixa (azul) |
| `--inside` | `#5cc25c` | valor dentro da faixa (verde) |
| `--above` | `#e3c42a` | valor acima da faixa (amarelo) |
| `--far` | `#e05555` | valor bem acima da faixa (vermelho) |
| `--accent` | `#e8a33d` | foco, seleção, barra de progresso |

Regra de cor do valor: abaixo da faixa = azul; dentro = verde; acima em até 25% da largura da faixa = amarelo; acima disso = vermelho.
Sem faixa definida = `--label`. Amostra menor que 10 mãos = `--dim`, como o H2N esmaece amostras pequenas.
A cor nunca é o único sinal: o detalhe (hover/toque) diz "abaixo/dentro/acima da faixa" por escrito.

## Tipografia
- Fonte: `"Segoe UI", system-ui, sans-serif` (a mesma cara do H2N no Windows).
- Números com largura fixa (`font-variant-numeric: tabular-nums`), para as colunas alinharem.
- Valor 15px bold; amostra 9px; faixa 9px; rótulo 12px; título da caixa 15px com `letter-spacing: .5px`.
- Nada de texto menor que 9px, e o texto corrido da interface tem no mínimo 13px.

## Layout
- Caixas lado a lado (`flex-wrap`), largura mínima de 150px, bordas de 1px, cantos retos (o H2N não arredonda).
- Grade dentro da caixa: coluna de rótulos à esquerda, uma coluna por "vs …".
- Espaço: 6px dentro da célula, 10px entre caixas.
- Tela menor que 900px: caixas em coluna única; cada grade rola de lado com a coluna de rótulos fixa.

## Superfícies do navegador (o que denuncia página "montada")
- `::selection` com `--accent`; `caret-color: var(--accent)`.
- Scrollbar escura (`scrollbar-color: #4a4a4a var(--panel)`).
- Foco visível em tudo que é navegável: `outline: 2px solid var(--accent)`.
- Área de toque mínima de 44px nos botões, abas e itens de busca.

## Movimento
- Um único momento: o painel de upload desliza da direita (150ms, ease-out). Sem animação em valores ou caixas.
