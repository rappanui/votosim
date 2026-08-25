# O questionário

> **Status:** válido · **Atualizado em:** 2026-08-24 18:10
> **Contexto:** os 14 temas que o eleitor responde, o modelo de resposta e
> como cada resposta vira peso na fórmula de match. Temas copiados de uma
> consulta a `themes_catalog` em 2026-08-24; UI verificada em
> `src/components/QuizCard.tsx` e `src/app/quiz/page.tsx`.

---

## Os 14 temas

`themes_catalog` guarda cada tema como um slug e uma afirmação — o eleitor
não vota no tema em abstrato, concorda ou discorda da frase:

| Slug | Nome | Afirmação |
|---|---|---|
| `autonomia_individual` | Autonomia individual e liberdades civis | O governo deve ampliar o direito dos cidadãos de tomarem decisões sobre sua própria vida, incluindo o acesso a armas de fogo para uso pessoal. |
| `bolsa_familia_transferencia` | Transferência de renda e assistência social | O governo deve ampliar programas de transferência direta de renda para famílias de baixa renda como o Bolsa Família. |
| `corrupcao_transparencia` | Combate à corrupção | O governo deve fortalecer os órgãos de controle e fiscalização para ampliar a punição de agentes públicos envolvidos em corrupção. |
| `educacao_basica` | Educação básica e ensino público | O governo deve aumentar o investimento em escolas públicas e na valorização de professores como prioridade da política educacional. |
| `laicidade_valores` | Laicidade do Estado | O governo deve adotar legislação baseada em princípios laicos e científicos ao tratar de temas como reprodução, educação e composição familiar, independentemente de posições religiosas. |
| `meio_ambiente_desmatamento` | Meio ambiente e desmatamento | O governo deve endurecer a fiscalização ambiental e as restrições ao desmatamento, mesmo que isso limite atividades econômicas em áreas rurais. |
| `politica_economica` | Política econômica e papel do Estado | O governo deve adotar uma política econômica com maior participação estatal em investimentos estratégicos, mesmo que isso implique maior gasto público. |
| `politica_externa` | Política externa e relações internacionais | O Brasil deve priorizar acordos e alianças com países ocidentais como Estados Unidos e União Europeia em detrimento de blocos como BRICS e parcerias com China e Rússia. |
| `privatizacao_estatais` | Privatização × estatização | O governo federal deve vender suas participações em empresas estatais como Petrobras, Correios e Eletrobras para a iniciativa privada. |
| `protecao_minorias` | Proteção de minorias | O governo deve criar e ampliar leis de proteção contra discriminação de grupos minoritários em áreas como trabalho, saúde e moradia. |
| `reforma_previdencia` | Previdência social e aposentadoria | O governo deve tornar as regras de aposentadoria mais flexíveis, reduzindo a idade mínima e os requisitos de contribuição exigidos atualmente. |
| `reforma_tributaria` | Reforma tributária | O sistema tributário brasileiro deve ser reformado para simplificar e unificar os impostos cobrados sobre consumo, renda e produção. |
| `seguranca_publica_estadual` | Segurança pública | O combate à criminalidade deve priorizar o endurecimento de penas, a ampliação do efetivo policial e a restrição à progressão de regime para condenados. |
| `sus_saude_publica` | Saúde pública (SUS) | O governo deve aumentar o investimento público no SUS como principal forma de garantir saúde à população. |

A tela do quiz busca só os temas com `exibir_no_quiz = true`, na ordem de
`ordem_exibicao`, e mostra junto o `contexto_questionario` e a
`nota_educativa` de cada um — texto de apoio para o eleitor entender o tema
antes de responder. `themes_catalog` também guarda seis colunas
`relevancia_<cargo>` (uma por cargo eletivo), reservadas para ponderar tema
por cargo no futuro; nenhum código de runtime as lê hoje — ver
`docs/referencia/modelo-de-dados.md`.

## Como o eleitor responde

Cada afirmação tem três botões:

| Botão | Valor (`VoterPosicao`) |
|---|---|
| Discordo | `contrario` |
| Neutro | `neutro` |
| Concordo | `favoravel` |

Não há mais um slider de 1 a 5 — esse modelo (`Resposta = 1 \| 2 \| 3 \| 4 \| 5`)
foi removido; `VoterPosicao` é o tipo canônico hoje.

## A importância

Toda afirmação também tem um seletor de importância, sempre visível — antes
ou depois de escolher um botão, e mesmo em "Neutro":

| Nível | Rótulo na UI |
|---|---|
| 1 | Baixa |
| 2 | Média (padrão) |
| 3 | Alta |

Não esconder a importância até um botão ser clicado é deliberado: um eleitor
que marca "Neutro" sem tocar o seletor ainda deu uma resposta válida, e
precisa poder dizer o quanto esse tema (neutro) importa para ele.

## Como a resposta vira peso na fórmula

Cada tema respondido entra na fórmula de
`docs/referencia/calculo-do-match.md` com peso `w = importancia / 3` — Baixa
pesa um terço, Média dois terços, Alta o peso cheio. Um tema marcado
"Neutro" não entra no numerador nem no denominador da conta: o eleitor não
tomou lado, então não há o que medir de concordância. Um tema **não
respondido** (nenhum botão clicado) simplesmente não aparece em
`respostas[]` e não é considerado em nada.

## Liberando o resultado

A página de resultados só é habilitada com pelo menos 3 temas respondidos
(`respostas.length >= 3`, em `src/app/quiz/page.tsx`). Abaixo disso o botão
de enviar fica desabilitado e a tela informa quantas respostas ainda faltam.
