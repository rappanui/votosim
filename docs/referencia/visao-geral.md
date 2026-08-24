# O que o VotoSim é

> **Status:** válido · **Atualizado em:** 2026-08-24 18:10
> **Contexto:** ponto de entrada para quem chega ao projeto pela primeira vez —
> o produto, o princípio de arquitetura e as três superfícies de código. Para
> os detalhes de cada peça, siga os links ao final.

---

## O produto

O VotoSim é um quiz eleitoral. O eleitor responde a 14 afirmações sobre temas
de política pública — concorda, discorda ou é neutro, e diz o quanto aquele
tema importa para ele — e o app mostra, para cada cargo em disputa no seu
estado, quais candidatos têm posições documentadas mais próximas das dele.

O resultado não é uma recomendação de voto. É uma comparação determinística
entre respostas e posições **já registradas e sourced** no banco — o mesmo
cálculo, para os mesmos dados, sempre produz o mesmo percentual.

## O princípio central: IA na ingestão, aritmética em runtime

Duas fases, dois papéis diferentes para IA:

- **Ingestão** (`scripts/`, `docs/procedimentos/pesquisa-de-candidato.md`) —
  um agente Claude Code pesquisa um candidato, lê fontes primárias e grava
  posições, alertas e um dossiê no banco. É aqui que interpretação de texto
  em linguagem natural acontece, com curadoria e fontes citadas
  (`source_ids`).
- **Runtime** (`supabase/functions/match-candidatos/`) — a Edge Function que
  responde a cada submissão do quiz **não chama nenhum provedor de IA**. Ela
  lê as posições já gravadas e aplica uma fórmula fixa
  (`docs/referencia/calculo-do-match.md`). Isso é verificável: o arquivo que
  fazia essas chamadas existiu, chamava-se `ai-providers.ts`, e foi removido —
  hoje o arquivo equivalente se chama `scoring.ts` e não importa nenhum SDK de
  IA.

Essa separação é o que torna o resultado auditável: o eleitor pode conferir a
conta à mão a partir dos números que o card mostra, sem precisar confiar em
uma chamada de modelo que não deixa rastro.

## O estado real da cobertura de pesquisa

**109 dossiês de candidato para 20.004 candidaturas cadastradas — cerca de
0,5% de cobertura de pesquisa aprofundada** (`candidate_dossiers`:
109 linhas; `candidacies`: 20.004 linhas). A imensa maioria dos candidatos no
banco tem apenas os dados públicos do TSE (nome, partido, número, situação);
nenhuma posição temática foi pesquisada e nenhum alerta foi checado para eles.
O quiz só mostra, por cargo, os candidatos com posições suficientes para
pontuar acima do piso de corte — ver
`docs/referencia/calculo-do-match.md` — então um eleitor não vê "candidato sem
dado nenhum" na tela, mas a maior parte do universo de 20 mil candidaturas
está, hoje, fora do alcance de qualquer comparação. Isto é o fato mais
relevante sobre o estado atual do produto: cobertura é o gargalo, não o
algoritmo.

## As três superfícies

| Superfície | Onde | O que faz |
|---|---|---|
| App | `src/` — Next.js 16.2.9 + React 19, App Router | Quiz, card de resultado, página `/sobre`. Só lê o banco (via `@supabase/supabase-js` com a chave anônima) e a Edge Function; não escreve posição nem alerta. |
| Edge Function | `supabase/functions/match-candidatos/` — Deno | Recebe as respostas do eleitor, busca candidatos e posições do estado, aplica a fórmula de match, filtra e ordena, devolve o resultado. Sem estado entre requisições. |
| Scripts de pesquisa | `scripts/` — Node + `tsx` | Pipeline de ingestão: baixa dados do TSE, monta o brief de pesquisa para o agente, valida e grava o que o agente produziu. Roda fora do caminho de requisição do eleitor. |

Banco de dados: PostgreSQL via Supabase, sem `pgvector` e sem tabela de
embeddings — a busca de fontes é feita pelo agente de pesquisa, não por
similaridade vetorial em runtime.

## O fluxo do eleitor

1. Escolhe o estado (`/quiz`).
2. Responde a quantas das 14 afirmações quiser — mínimo de 3 para liberar o
   resultado — e ajusta a importância de cada uma.
3. Envia; a Edge Function calcula e devolve o resultado por cargo.
4. Em `/resultados`, vê os candidatos ordenados por afinidade, com um card
   expansível por candidato: percentual, cobertura, alertas, observações e a
   linha de auditoria que reproduz a conta.
5. `/sobre` explica a fórmula e o que cada número significa.

## Para ir mais fundo

- `docs/referencia/modelo-de-dados.md` — as tabelas e o que cada coluna guarda.
- `docs/referencia/calculo-do-match.md` — a fórmula completa, os níveis de
  evidência e as duas métricas de cobertura.
- `docs/referencia/questionario.md` — os 14 temas e o modelo de resposta.
- `docs/referencia/alertas.md` — como alertas e observações são derivados e
  por que são exibidos separadamente.
- `docs/procedimentos/pesquisa-de-candidato.md` — como um candidato é
  pesquisado e entra no banco.
