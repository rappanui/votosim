# Adições de schema do SP-0

> **Status:** válido · **Atualizado em:** 2026-08-24
> **Contexto:** as tabelas, colunas e enums que `docs/migracoes/11_sp0_foundation.sql`
> adicionou para dar suporte ao enriquecimento por candidato, mais as
> decisões de modelagem por trás delas. Leia antes de escrever qualquer coisa
> que leia ou grave em `enrichment_ledger`, `candidate_sources`,
> `candidate_dossiers`, ou nas novas colunas de `candidacies`,
> `politician_positions` e `politician_alerts`. O raciocínio de design está
> em `docs/superpowers/specs/2026-08-20-candidate-data-pipeline-design.md`.

---

## Novas tabelas

### `enrichment_ledger`

Uma linha por candidatura × estágio. Responde "quem já foi processado e quem
falta", e carrega as métricas de custo que tornam o piloto instrumentado
possível.

| Coluna | Notas |
|---|---|
| `etapa` | `documentos_oficiais \| ficha_limpa \| noticias \| dossie \| posicoes` |
| `status` | `pendente \| em_progresso \| concluido \| falhou \| nao_aplicavel` |
| `metricas` | JSONB: `tokens`, `duracao_ms`, `fontes_encontradas`, `confianca_media` |

`nao_aplicavel` é estrutural. Um candidato a senador não protocola plano de
governo no TSE, e um candidato de primeira viagem não tem coerência para
medir. Sem esse estado, o ledger reportaria falha onde não há nada a fazer.

RLS está habilitado **sem política de leitura pública** — este é estado
interno do pipeline, acessado apenas pela chave de service role.

### `candidate_sources`

Catálogo de toda URL que o pipeline tocou. Posições e alertas referenciam
esta tabela em vez de repetir URLs, então um fato exibido cuja fonte não está
listada é impossível por construção.

| Coluna | Notas |
|---|---|
| `politician_id` | `NOT NULL`, `ON DELETE CASCADE` — o dono durável |
| `candidacy_id` | **anulável**, `ON DELETE SET NULL` — qual execução coletou |
| `camada` | 1 oficial · 2 imprensa de referência · 3 checagem de fatos |
| `destino_exibicao` | `card_candidato \| pagina_sobre \| interno` |
| `acessado_em`, `hash_conteudo` | Sobrevivem a link rot: o card pode declarar "acessado em…" |

Único em `(politician_id, url)`.

### `candidate_dossiers`

Perfil de candidato gerado, versionado para poder ser regenerado sem perder
a versão anterior. `coerencia_indice` é `NUMERIC(5,2)`, `NULL` quando o
candidato não tem histórico — **nunca zero para esse caso**, já que zero
significa medido e incoerente. `coerencia_base` registra o que foi comparado
contra o quê, para que a UI declare sua base em vez de mostrar um número
seco.

`espectro_declarado` e `espectro_inferido` são restritos ao mesmo
vocabulário de `parties.espectro`.

## Colunas acrescentadas

| Tabela | Coluna | Propósito |
|---|---|---|
| `candidacies` | `tier_processamento` | `total` (presidente/governador/senador) · `por_score` (deputados) · `fora_escopo` (distrital) |
| `candidacies` | `viabilidade_score` | Só para `por_score`; cálculo adiado para um plano futuro, permanece NULL |
| `candidacies` | `federacao` | De `SG_FEDERACAO`; distinta de coligação |
| `candidacies` | `composicao_coligacao` | De `DS_COMPOSICAO_COLIGACAO` |
| `politician_positions` | `justificativa` | Por que esta posição, em linguagem voltada ao eleitor |
| `politician_positions` | `coerencia_tema` | `coerente \| incoerente \| sem_historico` |
| `politician_positions` | `source_ids` | `UUID[]` para o catálogo; substitui `fontes` para novas gravações |
| `politician_alerts` | `source_id` | Alertas remontam ao catálogo como as posições |

`alert_type` ganha `incoerencia` e `divergencia_espectro`
(base/11_sp0_foundation.sql).

### Adições de enum em 2026-08-23 (aplicadas ao banco em produção via ALTER, agora também em base/11_sp0_foundation.sql)

`source_tipo` ganha `plataforma_partidaria` e `biografia` — documentos de
plataforma partidária e de biografia, a base de evidências comum para
candidatos legislativos que não protocolam `plano_governo`. `alert_type`
ganha `ressalva_evidencias` — uma ressalva metodológica sobre a própria base
de evidências (extração degradada, posições inferidas de uma plataforma
partidária em vez das declarações próprias do candidato); um sinal de
transparência, nunca uma acusação.

```sql
ALTER TYPE source_tipo ADD VALUE IF NOT EXISTS 'plataforma_partidaria';
ALTER TYPE source_tipo ADD VALUE IF NOT EXISTS 'biografia';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'ressalva_evidencias';
```

### Adição de enum para E4b (desempenho de mandato) — 2026-08-23

`source_tipo` ganha `desempenho_mandato`: o tipo de evidência por trás do
estágio E4b de `docs/procedimentos/pesquisa-de-candidato.md` — presença,
votos dados, projetos apresentados e gastos de CEAP para um candidato que
ocupa ou ocupou um mandato legislativo. Nenhum valor pré-existente serve
(`bens_declarados` é patrimônio pessoal declarado; `votacao` é um único voto
nominal), então sem essa adição a regra da E4b não consegue citar o endpoint
de onde leu os números, e a ingestão falha com
`invalid input value for enum source_tipo`.

```sql
ALTER TYPE source_tipo ADD VALUE IF NOT EXISTS 'desempenho_mandato';
```

Um alerta `ressalva_evidencias` é auto-validado na ingestão (ver
`isAutoValidated()` em export/scripts/ingest-research.ts) e renderiza
`badge_cor = 'amarelo'`.

## Por que `candidate_sources` carrega duas chaves

`politician_positions` tem `politician_id` como chave e é deliberadamente
inter-eleições, e alcança o catálogo por meio de um `UUID[]` simples que o
PostgreSQL não aplica.

Uma primeira tentativa deu ao catálogo apenas `candidacy_id` como chave,
depois tentou corrigir o problema de órfãos resultante *acrescentando* uma
FK `politician_id` com seu próprio cascade. **Isso não funciona**, e as duas
metades do problema foram reproduzidas no PostgreSQL 15:

- Acrescentar uma segunda chave estrangeira não remove o cascade da
  primeira. Deletar uma candidatura ainda apagava as fontes e ainda deixava
  `politician_positions.source_ids` apontando para UUIDs inexistentes.
- O cascade acrescentado era redundante de qualquer forma, já que
  `candidacies.politician_id` já é `ON DELETE CASCADE`, então deletar um
  político já alcançava as fontes transitivamente.

O formato que funciona é `politician_id NOT NULL` em cascata (dono durável)
e `candidacy_id` anulável com `ON DELETE SET NULL`. Deletar uma candidatura
desanexa a fonte daquela execução sem destruí-la. Teste de regressão depois
de deletar uma candidatura: `sources_left=1`, `candidacy_now=NULL`,
`positions_with_dangling=0`.

## A view da fila de trabalho

`v_enrichment_queue` lista candidaturas com trabalho pendente, presidentes
primeiro, depois agrupado por estado, depois por tier e viabilidade. Três
predicados importam e cada um fechou um bug real:

- **`tier_processamento IS DISTINCT FROM 'fora_escopo'`**, não `<>`. A
  coluna é NULL até ser preenchida retroativamente, e `NULL <> 'x'` é NULL,
  o que esvaziava silenciosamente a fila inteira no primeiro uso.
- **`LEFT JOIN` com o ledger** mais um ramo `count(l.id) = 0`, para que uma
  candidatura nunca semeada no ledger continue visível. Um inner join só
  conseguiria responder "quem começou e não terminou".
- **`em_progresso` conta como pendente.** Uma execução de agente que travou
  deixa linhas nesse estado permanentemente; excluí-las tornava o candidato
  invisível sem caminho de recuperação.

A ordenação por tamanho de eleitorado entre estados que a decisão de spec
D11 descreve **não** está expressa aqui — não existe dado de eleitorado por
UF no schema. É uma decisão do operador sobre qual UF processar em seguida.

## Aplicando o arquivo

O arquivo é idempotente: todo `CREATE` é `IF NOT EXISTS`, `OR REPLACE`, ou
está envolto em um bloco `DO` que trata `duplicate_object`; políticas são
descartadas antes da criação. Rodar de novo produz zero erros.

Pode ser colado no SQL Editor do Supabase **como um único lote**. Duas notas
sobre o motivo:

- `ALTER TYPE … ADD VALUE` é seguro em transação desde o PostgreSQL 12,
  desde que o novo valor não seja *usado* na mesma transação. Comentários
  antigos neste repositório afirmando o contrário estavam errados.
- Este arquivo *usa* os novos valores de `alert_type`, no `CASE` do selo de
  `v_candidate_alerts`. Esse `CASE`, portanto, decide sobre `pa.tipo::text`,
  que nunca toca os valores de enum pendentes. Sem o cast, o arquivo falha
  com `unsafe use of new value "incoerencia" of enum type alert_type`.

`v_candidate_alerts` é substituída aqui em vez de em `04_schema_alerts.md`
porque o `CASE` original não tem `ELSE`, então os novos tipos de alerta
renderizariam `badge_cor = NULL`. O `CASE` do selo agora cobre `incoerencia`
(roxo), `divergencia_espectro` (azul) e `ressalva_evidencias` (amarelo).
