# Cálculo do match

> **Status:** válido · **Atualizado em:** 2026-08-24 18:10
> **Contexto:** a fórmula que a Edge Function usa para comparar respostas do
> eleitor às posições de um candidato, os dois níveis de cobertura, e como o
> fallback de partido funciona. Verificado linha a linha contra
> `supabase/functions/match-candidatos/scoring.ts` e `index.ts` em
> 2026-08-24 — não é uma tradução de memória do documento anterior
> (`docs/match-v3-scoring.md`, apagado ao publicar este). A ordem de deploy
> das três peças (migração, Edge Function, app) foi movida para
> `docs/procedimentos/ordem-de-deploy.md`.

---

## O defeito que este modelo corrige

Uma execução real do match antigo devolveu "90% de afinidade, cobertura 36%"
para um candidato com 9 de 14 temas sem nenhuma posição documentada — a
média era calculada só sobre os temas conhecidos, então silêncio era de
graça. Três causas: temas desconhecidos eram excluídos do numerador **e** do
denominador; `neutro` misturava "nada encontrado" com "tem posição, mas não
sobre isto" e com "genuinamente ambivalente"; e o fallback de partido nunca
rodava de fato, porque `party_positions` estava (e está) vazia.

## Níveis de evidência

Para cada tema em que o eleitor tomou partido, `classifyEvidence` (em
`scoring.ts`) decide um nível e uma credibilidade:

| Nível | Origem | Credibilidade | Conta na cobertura |
|---|---|---|---|
| `direta` | posição própria do candidato (`favoravel`/`contrario`, ou `neutro` auditado) | 1,0 | sim |
| `partido` | posição do programa do partido, usada só quando o candidato não tem posição própria no tema | 0,6 | parcialmente |
| `ausente` | `neutro` com `neutro_motivo = nao_encontrado` (ou NULL), `variavel`, ou sem linha nenhuma | 0 | não |

`partido` está implementado e testado, mas **inerte**: nenhum partido tem
posição registrada (`party_positions`: 0 linhas).

## A aritmética

Com `w = importancia / 3` sobre as respostas não-neutras do eleitor:

```
massaTotal    = Σ wᵢ
massaApurada  = Σ wᵢ · credibilidadeᵢ
confianca     = massaApurada / massaTotal
apurado       = Σ (wᵢ · credibilidadeᵢ · alinhamentoᵢ) / massaApurada
alinhamento   = confiança · apurado + (1 − confiança) · P_NAO_INFORMADO
```

`P_NAO_INFORMADO = 0.10`, constante nomeada em `scoring.ts`. É uma escolha
editorial declarada ao eleitor em `/sobre`, não uma estimativa: silêncio
custa menos que discordância aberta, mas custa.

**`alinhamento` é calculado a partir de `confiança` e `apurado` já
arredondados, de propósito** — o card mostra essa mesma conta ao eleitor como
linha de auditoria, e uma manchete que não reproduz a partir dos números ao
lado dela é pior que uma com um décimo de ponto a menos de precisão. Um teste
de propriedade em `scoring.test.ts` garante essa identidade com tolerância
zero.

### A escada, do pior ao melhor por tema

| | Situação | Valor |
|---|---|---|
| 4 | auditado, discorda do eleitor | 0,0 |
| 3 | **não auditado** | **0,10** |
| 2 | auditado, sem lado (`nao_responde`, `ambivalente`) | 0,5 |
| 1 | auditado, concorda | 0,75–1,0 conforme `intensidade` |

Um `neutro` auditado não precisa de caso especial: `posicaoToScale` devolve
3, e `1 − |escala_eleitor − 3| / 4` já dá exatamente 0,5 seja o eleitor
favorável ou contrário.

### Duas métricas de cobertura

- **`cobertura`** — média das credibilidades (1,0 direta · 0,6 partido · 0
  ausente) sobre os temas em que o eleitor tomou partido. Hoje, com o
  fallback de partido inerte, equivale na prática à fração de temas
  auditados diretamente.
- **`confiancaResultado`** — a mesma ideia, mas ponderada pela importância
  que o eleitor deu a cada tema; é o termo que entra na fórmula acima.

A divergência entre as duas carrega informação que nenhum número sozinho
carrega: cobertura alta com confiança baixa quer dizer "sabemos bastante
sobre este candidato, só não sobre o que você mais valoriza". Não confundir
`confiancaResultado` (por candidato) com `confianca_ia` (por tema, a
confiança do agente de pesquisa naquela classificação específica).

## `neutro_motivo`

| Valor | Significado | Alinhamento |
|---|---|---|
| `nao_encontrado` | pesquisado, nada encontrado | `P_NAO_INFORMADO` |
| `nao_responde` | tem posição sobre o tema, mas não responde a esta afirmação | 0,5 |
| `ambivalente` | contraditório ou explicitamente condicional | 0,5 |

**NULL é lido como `nao_encontrado`.** Todo registro anterior a 2026-08-24
está NULL; não houve reclassificação retroativa. `scripts/ingest-research.ts`
grava o campo desde então, então o dado se corrige à frente, conforme
candidatos são pesquisados de novo.

## O que o eleitor vê

O card mostra `alinhamento` (já penalizado) como manchete, `cobertura` e
`confiancaResultado` abaixo, e, ao expandir, uma linha de auditoria mais uma
linha por tema:

| Ícone | Situação |
|---|---|
| `✓` `─` `✗` | auditado: concorda, parcial, discorda |
| `◐` | auditado, sem lado (`nao_responde`/`ambivalente`) |
| `○` | **não encontrado** — o que custa pontos |

Cada linha também mostra a `justificativa` gravada para aquele tema, para que
um tema vazio explique o que foi buscado em vez de mostrar só um traço.
`justificativa` é só exibição — nada no cálculo lê esse campo — e é buscada
apenas para os finalistas (após o corte e ordenação descritos abaixo), não
para todo o universo de candidatos do estado.

`/sobre` documenta a fórmula, as duas métricas, e o fato de que penalizar
silêncio é uma escolha editorial que favorece candidatos com plataforma
explícita sobre os deliberadamente vagos.

## Pré-filtro, corte e ordenação

Antes de pontuar com a fórmula completa, cada cargo é reduzido a um
top-10 (top-20 para os três cargos de deputado — federal, estadual e
distrital) por número de concordâncias simples
(`countSimpleMatches`) — proteção de custo, não parte da fórmula de match.
Depois de pontuado, `sortAndLimitCargos` filtra candidatos com
`alinhamento < 35` (`MIN_SCORE_THRESHOLD`), ordena por alinhamento, depois
por `cobertura`, depois por nome, e corta em 3 para presidente/governador
(`MAX_EXEC_CANDIDATES`) ou 5 para os demais cargos
(`MAX_CANDIDATES_PER_CARGO`).

## O fallback de partido

Cada resposta do eleitor primeiro procura a posição própria do candidato; só
na ausência dela é que a posição do partido (`party_positions`, filtrada por
`partido_atual`) entra como evidência de nível `partido`. Além desse fallback
por tema, para cargos legislativos (`senador`, `deputado_federal`,
`deputado_estadual`, `deputado_distrital`) o partido também aparece como uma
entrada própria nos resultados — o voto de legenda — pontuada com a mesma
fórmula sobre as posições do partido.

**Dois pontos em aberto, verificados no código, sem efeito hoje porque
`party_positions` está vazia:**

- A entrada de voto de legenda (`buildPartyResults` em `index.ts`) chama
  `scoreCandidato` sem o mapa de nomes de tema — quando a tabela tiver
  dados, essas linhas vão mostrar o slug técnico do tema em vez do nome
  legível, até alguém passar o mapa nessa chamada.
- A consulta a `party_positions` (`fetchPartyPositions`) não busca
  `neutro_motivo` nem `justificativa` — essas colunas nem existem na tabela,
  só em `politician_positions`. Um `neutro` vindo de partido nunca poderá ser
  auditado, e uma linha de partido nunca mostra justificativa, até a tabela
  ganhar essas colunas e a consulta ser ajustada.
