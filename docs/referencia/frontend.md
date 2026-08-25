# Frontend

> **Status:** válido · **Atualizado em:** 2026-08-25 19:25
> **Contexto:** as páginas em `src/app/`, o fluxo do quiz, o card de
> resultado recomposto e a fronteira de contrato com a Edge Function.
> Substitui `docs/match-v2-quiz-ui.md` (apagado ao publicar este) — não é
> tradução dele: cada afirmação foi conferida contra o componente hoje.
> `match-v2-quiz-ui.md` tinha ficado incorreto no ponto mais lido — descrevia
> um slider 1–5 onde o `QuizCard.tsx` atual usa três botões — o que confirma
> por que ler o componente, não o documento anterior, era a regra.

---

## Páginas (`src/app/`)

| Rota | Arquivo | Função |
|---|---|---|
| `/` | `page.tsx` | Redireciona para `/inicio` (`redirect()` do Next). |
| `/inicio` | `inicio/page.tsx` | Tela de boas-vindas. É o destino da raiz, do logo e do item "Início" do menu. |
| `/quiz` | `quiz/page.tsx` | Página única do questionário. No menu chama-se **Bússola**. |
| `/resultados` | `resultados/page.tsx` | Dispara o match e renderiza os cards. Sem item próprio no menu: pertence ao fluxo da Bússola. |
| `/wiki` | `wiki/page.tsx` | **Casca vazia.** Política brasileira explicada. |
| `/raio-x` | `raio-x/page.tsx` | **Casca vazia.** Consulta de um candidato só — dados, fontes e links da base. |
| `/contato` | `contato/page.tsx` | **Casca vazia.** Correções, dúvidas e contestação de dados. Rótulo no menu: "Fale conosco". |
| `/sobre` | `sobre/page.tsx` | Porta da seção Sobre. Ainda é a lista plana antiga, hoje renderizada dentro do layout com índice lateral. |
| `/sobre/[secao]` | `sobre/[secao]/page.tsx` | Uma rota por seção do Sobre, 22 delas, pré-renderizadas a partir do registro. Detalhes em `docs/referencia/pagina-sobre.md`. |

As três cascas vazias renderizam `PaginaEmConstrucao` (`titulo`, `descricao`)
e nada mais: H1 com o mesmo rótulo do menu, a frase do que a página vai
fazer, o aviso de construção e um link de volta para `/quiz`. Nenhum destino
do menu termina em beco sem saída. Cada uma exporta `metadata` própria, então
o título da aba é o nome da página — são server components, sem `'use client'`.

## Navegação global (`Header`)

O `Header` (`src/components/Header.tsx`) fica no `layout.tsx`, é `fixed` com
`h-16` — o `mt-16` do `<main>` existe por causa disso — e é `'use client'`
porque lê `usePathname()`.

Os seis destinos vivem numa constante única, `ITENS`, consumida pelo menu
desktop e pelo painel mobile: **rótulo do menu e rota são coisas
separadas.** "Bússola" aponta para `/quiz` e "Fale conosco" para `/contato`;
renomear um rótulo não mexe em URL nenhuma.

O item da rota atual recebe `aria-current="page"`. A comparação não é só
igualdade: `ITENS` tem `rotasIrmas`, e é por isso que **Bússola continua
marcada em `/resultados`** — sem isso, a página de resultados não destacaria
item nenhum, embora seja o segundo passo daquele fluxo.

Abaixo de `md` o menu vira um botão ☰ e um painel; acima, uma linha de links.
Os dois `<nav>` se distinguem pelo `aria-label` ("Navegação principal" e
"Navegação mobile") — é assim que os testes alcançam um sem pegar o outro,
já que o jsdom não aplica os breakpoints do Tailwind e renderiza ambos.

O painel fecha no Esc e **ao trocar de rota, ajustando o estado durante a
renderização** (comparando `pathname` com a rota já renderizada), não num
`useEffect`. Não é estilo: o lint do projeto barra `setState` dentro de
efeito (`react-hooks/set-state-in-effect`), e um efeito aqui pintaria o
painel aberto obsoleto por um quadro antes de fechá-lo.

## O fluxo do quiz e o `QuizContext`

`QuizContext` (`src/context/QuizContext.tsx`) guarda só `estado` e
`respostas: RespostaUsuario[]` — versões anteriores tinham `perfil` e
navegação por índice de pergunta; não sobraram. `setResposta` faz upsert por
`temaSlug`.

`/quiz` busca os temas de `themes_catalog` (`exibir_no_quiz = true`, ordenado
por `ordem_exibicao`) e renderiza um `QuizCard` por tema em grade responsiva.
Cada `QuizCard` tem três botões — Discordo/Neutro/Concordo — e, só depois de
um deles ser clicado (incluindo Neutro), revela o seletor de importância
(Baixa/Média/Alta, padrão Média). O rodapé fixo mostra `{respostas.length}/{total}`
e libera "Ver candidatos →" com `estado` preenchido e pelo menos 3 respostas.
Os 14 temas, o modelo de resposta e o peso na fórmula estão em
`docs/referencia/questionario.md` — não repetido aqui.

Em `/resultados`, o efeito de montagem lê `estado`/`respostas` do contexto
(voltando para `/quiz` se `estado` estiver vazio), monta o payload
(`estado`, `respostas`, `sessionToken` via `crypto.randomUUID()`,
`timestamp`) e faz POST em
`${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/match-candidatos`. Uma resposta
única traz tudo — dossiê, fontes, alertas e observações de cada finalista —
então o card expandido não faz requisição própria.

## `CandidatoCard` — composição, não monólito

`CandidatoCard.tsx` possui o cabeçalho, a barra de score, a linha de
auditoria e o toggle de expansão; o resto é componente filho.

**Colapsado:** nome de urna, `partido · nº numeroUrna · cargo`, dois
contadores por severidade — `⚠` alertas e `ⓘ` observações, cor e texto vindos
de `corPorSeveridade`/`rotuloPorSeveridade` (`src/lib/severidade.ts`, ver
`docs/referencia/alertas.md`): a cor segue o item mais grave presente (verde
sem nada, cinza baixa, âmbar média, laranja alta, vermelho crítica) e o texto
agrupa por severidade, ex. `"1 crítico e 2 baixos detectados"`. O contador de
alertas **sempre renderiza** — `"Nenhum alerta"` em verde quando vazio é ele
próprio uma informação; o de observações continua **omitido inteiramente em
zero** — nada a ressalvar é o estado padrão, não um achado — o `alinhamento%`
já penalizado, e as duas métricas de cobertura (`cobertura X% · confiança
Y%`). A cor da barra usa os limiares do v3, recalibrados para baixo porque
scores penalizados concentram-se em 20–60%: verde ≥55, âmbar 35–54, laranja
20–34, vermelho <20.

**Expandido:** a linha de auditoria ocupa a largura toda — ela explica a
manchete e existe independente de sobrar algum tema no painel, então fica
acima da divisão em colunas, não dentro de uma delas. Abaixo, um painel
`md:grid-cols-[1.35fr_1fr]` (uma coluna só abaixo de `md`):

| Lado | Componente | Aparece quando |
|---|---|---|
| esquerda | `TemasPanel` | `visibleTemas.length > 0` |
| direita | `CandidatoResumo` | `dossie !== null` |
| direita | `AlertasBloco` | `alertas.length > 0` |
| direita | `ObservacoesBloco` | `observacoes.length > 0` |
| direita | `FontesBloco` | `fontes.length > 0` |

Se `TemasPanel` não renderiza (nenhum tema visível), a coluna some e o painel
volta a uma única coluna — não fica um vazio com borda.

## Os seis componentes

- **`Acordeao`** (`Acordeao.tsx`) — primitivo genérico usado pelos quatro
  blocos da direita. Fechado por padrão (exceto quando o consumidor passa
  `defaultOpen`). **`contador` omitido não é `contador={0}`**: a prop é
  opcional e, ausente, não renderiza contador nenhum — os dois estados
  existem porque "não tenho contagem" e "contei e deu zero" são fatos
  diferentes.
- **`CandidatoResumo`** — o bloco "Quem é": `resumoPerfil`, espectro
  declarado/inferido (quando algum existe) e `coerenciaIndice`. Sempre
  aberto, sem moldura própria — o card é quem desenha a borda, para ficar no
  mesmo nível visual dos acordeões abaixo. `coerenciaIndice = null` (sem
  histórico para medir) nunca é lido como zero, que significaria "medido e
  totalmente incoerente".
- **`TemasPanel`** (extraído do card em Task 7) — lista por tema, **sem
  preview e sem toggle**: todos os temas visíveis renderizam de uma vez,
  ordenados com os que o eleitor tomou partido primeiro. "Visível" é
  `voterPosicao !== 'neutro' || voterImportancia >= 2` (exportado como
  `selectVisibleTemas`, para o card checar se o painel renderiza algo sem
  duplicar a regra). Cada linha mostra o ícone (seis estados — ver legenda
  abaixo), `temaNome`, os rótulos de eleitor e candidato, as tags `partido` e
  `classificação não revisada` quando aplicável, e a `justificativa`.
- **`AlertasBloco`**, **`ObservacoesBloco`**, **`FontesBloco`** — **os três
  retornam `null` em lista vazia: o bloco se protege, não o pai.**
  `CandidatoCard` não checa `alertas.length` antes de renderizar
  `<AlertasBloco alertas={...}/>`; cada bloco decide sozinho se tem algo a
  mostrar. Dentro de `AlertasBloco`, cada `AlertaBadge` mostra
  `Severidade: {Alta|Média|...}` ao lado do próprio selo, na mesma escala de
  cor do contador colapsado. `ObservacoesBloco` divide em duas listas
  internas — Contradições e Ressalvas — e cada uma delas também some se
  vazia. `FontesBloco` ordena por
  `camada` (1 oficial · 2 imprensa · 3 checagem) e mostra a data da fonte mais
  recente; uma data ISO malformada faz `formatarData` devolver `''` e a linha
  de data some, em vez de mostrar "NaN/NaN/NaN".

Semântica de alertas vs. observações (o que cada uma carrega e por que um
tema não auditado nunca vira observação) está em
`docs/referencia/alertas.md` — não repetida aqui.

## Legenda de ícones e `CARGO_LABELS`

`LegendaIcones.tsx` renderiza, uma vez por página de resultados, os seis
glifos que `TemasPanel` pode mostrar por tema — os mesmos definidos em
`getTemaIcon` dentro de `TemasPanel.tsx`, mantidos em sincronia à mão (os
comentários de ambos os arquivos apontam um para o outro):

| Ícone | Significado |
|---|---|
| `✓` | Favorável — posição documentada, alinhada com o eleitor |
| `─` | Parcial — posição documentada, parcialmente alinhada |
| `✗` | Divergente — posição documentada, contrária ao eleitor |
| `◐` | Sem lado — posição documentada, mas `nao_responde`/`ambivalente` |
| `○` | Não auditado — nada encontrado; conta só `P_NAO_INFORMADO_PCT` (10%) no score |
| `●` | Eleitor marcou "Neutro" mas com importância ≥ 2 — aparece no painel mesmo sem entrar na conta |

`CARGO_LABELS`, antes duplicado entre a página de resultados e o card (e em
desacordo sobre `deputado_distrital`), foi consolidado em `src/lib/types.ts`
como um único `Record<string, string>` que os dois importam.

## A fronteira de contrato

`src/lib/contract.ts` expõe `assertMatchResult()` — a parte que um leitor não
adivinha só olhando os componentes. O app e a Edge Function são dois
runtimes sem módulo compartilhado; `src/lib/types.ts` espelha `scoring.ts` à
mão. `assertMatchResult` checa, no primeiro candidato do primeiro cargo não
vazio da resposta, a presença de nove campos —
`alinhamento`, `alinhamentoApurado`, `cobertura`, `confiancaResultado`,
`cargo`, `alertas`, `observacoes`, `fontes`, `coerenciaPorTema` — e lança
`ContractMismatchError`, nomeando o **primeiro** campo ausente, se algum
faltar. Checa presença, não o tipo de cada valor: um campo ausente já basta
para provar que a função implantada não é a que este build espera.

Existe porque em 2026-08-24 o app rodou contra uma Edge Function anterior ao
v3 e mostrou 90% de afinidade para um candidato documentado em 5 de 14 temas
— exatamente o defeito que o v3 existe para eliminar — sem nada detectar.

`/resultados` trata isso como um estado próprio, distinto de falha de rede:

| Estado | Gatilho | O que o eleitor vê |
|---|---|---|
| Contrato desatualizado | `ContractMismatchError` | Mensagem específica avisando que o servidor devolveu um formato antigo — **nenhum percentual é renderizado**, porque nenhum seria confiável |
| Falha de rede/genérica | qualquer outro erro (`fetch` falhou, HTTP não-2xx) | "Erro ao carregar os resultados. Verifique sua conexão e tente novamente." |

Recusar é o comportamento correto quando a aritmética não pode ser
confiada — não uma degradação a evitar.
