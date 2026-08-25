# Alertas e observações

> **Status:** válido · **Atualizado em:** 2026-08-25 18:33
> **Contexto:** o schema de `politician_alerts`, e como a Edge Function
> separa esses registros em dois grupos (`alertas` e `observações`) antes
> de chegar ao card do candidato. Schema verificado contra a definição
> original do schema de alertas e a divisão alertas/observações verificada
> linha a linha contra `ALERT_TIPOS_ACUSATORIOS`, `ALERT_TIPOS_OBSERVACAO` e
> `deriveObservacoes` na Edge Function, ambas mantidas só no repositório
> principal (`docs/legado/base/04_schema_alerts.md` e
> `supabase/functions/match-candidatos/index.ts`), não incluídas neste
> pacote. Esta é a cópia deste documento que viaja no pacote de colaboração
> externa (`modules/ingest-candidates/`).
>
> **Origem:** cópia de `docs/referencia/alertas.md` e
> `docs/referencia/severidade-de-alertas.md` do repositório principal.

---

## Por que a separação existe

Hoje, dos 97 alertas visíveis para o eleitor (`v_candidate_alerts`), **88 são
`ressalva_evidencias`**, uma ressalva metodológica sobre a base de evidência,
nunca uma acusação, e só **9 são acusatórios** (6 `investigacao`, 3
`ficha_suja`). Se todo `tipo` fosse exibido no mesmo lugar, 91% do que o
eleitor veria como "alerta sobre o candidato" seria, na verdade, uma nota
sobre a qualidade dos dados que o VotoSim tem sobre ele, misturada, no
mesmo registro visual, com uma condenação por improbidade. A divisão abaixo
não é estética: é o que impede essa mistura.

## Os seis `alert_type`

```sql
alert_type: 'ficha_suja' | 'investigacao' | 'polemica' | 'incoerencia'
          | 'divergencia_espectro' | 'ressalva_evidencias'
```

`incoerencia` e `divergencia_espectro` vieram do SP-0
(`docs/migracoes/11_sp0_foundation.sql` no repositório principal, não
incluído neste pacote). `ressalva_evidencias` foi
adicionado em 2026-08-23: sinaliza extração degradada ou posição inferida do
programa do partido em vez de declaração do próprio candidato. É uma
bandeira de transparência, nunca uma acusação.

## A divisão que a Edge Function faz

`index.ts` define dois conjuntos:

```typescript
// Uma acusação sobre conduta. Estes alimentam o contador "alertas".
export const ALERT_TIPOS_ACUSATORIOS = new Set(['ficha_suja', 'investigacao', 'polemica'])
// Uma ressalva sobre a própria leitura. Estes alimentam o contador
// "observações" e nunca podem aparecer no mesmo registro visual de uma acusação.
export const ALERT_TIPOS_OBSERVACAO = new Set(['incoerencia', 'divergencia_espectro', 'ressalva_evidencias'])
```

- **`alertas`**: só os três tipos acusatórios. É o que o badge vermelho/
  laranja/cinza do card mostra.
- **`observacoes`**: os outros três tipos, mais achados derivados no
  próprio cálculo (abaixo), divididos em duas categorias: `contradicao` e
  `ressalva`.

## `deriveObservacoes`: de onde vêm as observações

Além dos alertas de tipo `incoerencia`/`divergencia_espectro`/
`ressalva_evidencias`, `deriveObservacoes` monta observações a partir de três
outras fontes:

1. **Divergência de espectro do dossiê**: quando `espectro_declarado` e
   `espectro_inferido` do candidato não batem, vira uma `contradicao` própria
   (independente de haver ou não um alerta `divergencia_espectro`).
2. **Tema incoerente** (`coerencia_tema = 'incoerente'` em
   `politician_positions`), vira uma `contradicao` presa ao tema.
3. **Posição via partido ou baixa confiança**: um tema com evidência
   `partido` (ver `docs/referencia/calculo-do-match.md` no repositório
   principal, não incluído neste pacote), ou com
   `confianca_ia` abaixo do limiar de revisão numa posição direta, vira uma
   `ressalva` presa ao tema.

Contradições vêm antes das ressalvas na lista: o eleitor encontra a alegação
mais forte primeiro.

### Por que um tema não auditado não vira observação

Um tema marcado `○ não encontrado` já aparece assim na própria linha do tema
no card, e já é cobrado no cálculo via `P_NAO_INFORMADO`. Ver
`docs/referencia/calculo-do-match.md` no repositório principal (não incluído
neste pacote). Repeti-lo como observação diria o
mesmo fato duas vezes e infla o contador a ponto de enterrar os achados que
são de fato sobre o candidato, em vez de sobre a cobertura da pesquisa. A
exclusão é deliberada e travada por teste.

### Deduplicação: contradições sim, ressalvas não

O mesmo pipeline que grava `coerencia_tema = 'incoerente'` em um tema é o
que emite o alerta `incoerencia` correspondente, porque os dois descrevem o
mesmo achado. Por isso, entre as `contradicao`, uma chave `categoria|titulo`
repetida é descartada. Do lado das `ressalva` essa garantia não existe: um
alerta `ressalva_evidencias` de texto livre pode compartilhar o nome de um
tema com uma ressalva estruturada de partido/baixa-confiança e ainda assim
descrever uma coisa diferente, então nenhuma deduplicação é aplicada ali,
para não descartar por engano a entrada estruturada (a mais útil, por
carregar o slug do tema).

## Tabela `politician_alerts`

| Coluna | Tipo | Notas |
|---|---|---|
| `politician_id` | UUID FK | |
| `tipo` | `alert_type` | |
| `severidade` | `critica` \| `alta` \| `media` \| `baixa` | Fato histórico: quão grave foi o que aconteceu. Nunca muda. |
| `severidade_atual` | `critica` \| `alta` \| `media` \| `baixa`, nullable | Quanto isso deveria pesar hoje. `NULL` = não reavaliado (lido como igual a `severidade`). Só um alerta resolvido pode divergir; nunca mais grave que `severidade`. Ver seção abaixo. |
| `severidade_atual_motivo` | texto, nullable | Obrigatório junto com `severidade_atual`: por que a reavaliação chegou nesse valor. |
| `titulo` | texto | Rótulo curto e factual, ex.: "Condenado por improbidade em 2021". |
| `descricao` | texto | Neutra e factual, sem adjetivo, sem juízo de valor. |
| `fonte_url` | texto, obrigatório | Sem fonte primária confiável, não existe alerta. |
| `fonte_nome`, `data_ocorrencia` | | |
| `ativo` | booleano | `false` = caso resolvido (absolvição, decisão revertida). |
| `resolucao` | texto | Preenchido quando `ativo = false`. |
| `validado` | booleano | `false` = pendente de curadoria; a chave anônima nunca vê alerta não validado. |
| `validado_por`, `gerado_por_ia` | | |

**Regra de RLS:** a chave anônima só enxerga `validado = true`; `ativo` não
entra no filtro. Um alerta resolvido (`ativo = false`) é exibido, com o
badge `cinza` e o texto da `resolucao` ao lado, precisamente para que a
resolução apareça em vez de o caso sumir. A view `v_candidate_alerts` já
aplica esse filtro e acrescenta
`badge_cor` (`vermelho` ficha_suja · `laranja` investigacao · `cinza`
polemica · `roxo` incoerencia · `azul` divergencia_espectro · `amarelo`
ressalva_evidencias) e `ordem_exibicao` (1 crítica → 4 baixa). O frontend e a
Edge Function devem ler sempre a view, nunca a tabela base.

## `severidade_atual`: quanto um alerta resolvido ainda deveria pesar

`severidade` é permanente; `severidade_atual` responde uma pergunta
diferente e só existe num alerta resolvido: quanto isso ainda deveria pesar
no julgamento do eleitor hoje, nunca mais grave que `severidade`. A view
coalesce `severidade_atual` para `severidade` quando é `NULL`, então nada
muda para um alerta nunca reavaliado. Exibição: o enum vira leve/moderado/
grave/crítico no texto do card (não os nomes baixa/media/alta/critica),
progressão emprestada da triagem clínica (ANVISA, OMS) porque ela já foi
desenhada para descrever um caso sem nomeá-lo. Detalhes de exibição em
`docs/referencia/severidade-de-alertas.md` no repositório principal, não
incluído neste pacote.

Quem decide o valor é o agente de pesquisa, na ingestão, sob a mesma
disciplina de confiança de 95% usada em toda decisão automática deste
projeto, e **não** passa por curadoria humana adicional: um curador
revisando "o quanto devo me preocupar com este político" carrega o próprio
viés de quem revisa, e a ferramenta precisa estar livre disso. A taxonomia
de resolução (absolvição de mérito, anulação processual, prescrição,
condenação mantida) está em `docs/pesquisa-de-candidato.md`, seção E2, o
único lugar deste pacote onde ela precisa existir: quem decide o valor é
sempre o agente rodando a partir daqui.

## Regras editoriais de curadoria

| Regra | O que significa |
|---|---|
| Fonte obrigatória | Sem `fonte_url` confiável, o alerta não é criado. |
| `ficha_suja` e `investigacao` auto-validam | Quando a fonte é TSE ou STF, o pipeline pode marcar `validado = true` sem revisão humana. |
| `polemica` exige curadoria humana | `validado` só é setado por uma pessoa. |
| `ressalva_evidencias` auto-valida | Ressalva metodológica autoral do pipeline: factual, não acusatória, validada no próprio ingest. |
| Linguagem neutra | Teste aplicado à `descricao`: "isto é um fato ou uma opinião?" |
| Alertas resolvidos não se apagam | Fecha-se com `ativo = false` + `resolucao`; a linha permanece. |
| Voto ≠ alerta | Um voto contrário a uma política é posição (`politician_positions`); alerta é conduta documentada, discurso discriminatório ou conflito de interesse comprovado. |

## Fontes aceitas por tipo

| `tipo` | Fontes primárias aceitas |
|---|---|
| `ficha_suja` | CSV de certidões criminais do TSE, Lei Ficha Limpa (LC 135/2010) |
| `investigacao` | STF, PGR, TCU, CPIs, notas da Polícia Federal |
| `polemica` | Agência Brasil, G1, Folha; exige curadoria humana antes de publicar |
| `incoerencia` | fonte da posição/plataforma (o tema contradito) + fonte da conduta |
| `divergencia_espectro` | fonte da plataforma (espectro declarado) + base da inferência |
| `ressalva_evidencias` | a própria fonte de evidência a que a ressalva se refere |
