# Modelo de dados

> **Status:** válido · **Atualizado em:** 2026-08-24 20:45
> **Contexto:** as tabelas que existem hoje no Postgres do Supabase e as
> colunas que importam para quem lê ou grava nelas. Colunas apuradas
> diretamente no banco em 2026-08-24, não copiadas de documentação anterior —
> os dois documentos que existiam antes (`docs/legado/01_schema_politicians.md`,
> `docs/legado/02_schema_themes.md`) documentavam 8 das 18 colunas de
> `politician_positions` e 11 das 27 de `candidacies`. Este documento cobre as
> que faltavam.

---

## `politicians` — uma pessoa candidata

Dados pessoais estáveis, independentes de ano de eleição ou candidatura
específica.

`id`, `tse_id`, `nome_completo`, `nome_urna`, `nome_search`, `cpf_hash`,
`data_nascimento`, `genero`, `escolaridade`, `ocupacao`, `naturalidade`,
`partido_atual`, `partido_desde`, `foto_url`, `foto_fonte`, `redes_sociais`,
`fonte_dados`, `ativo`, `criado_em`, `dados_atualizados_em`.

`cpf_hash` guarda o CPF já hasheado, nunca em texto claro.

## `candidacies` — uma candidatura em um ano/cargo/estado

Uma pessoa (`politician_id`) pode ter mais de uma linha aqui ao longo dos
anos. É a tabela central do pipeline de pesquisa: carrega tanto os dados
brutos do TSE quanto o estado do processamento.

**Do TSE:** `id`, `politician_id`, `ano_eleicao`, `cargo`, `estado`,
`municipio_ibge`, `numero_urna`, `numero_partido`, `partido_eleicao`,
`federacao`, `coligacao`, `composicao_coligacao`, `turno`, `situacao_final`,
`votos_obtidos`, `percentual_votos`, `data_registro`, `fonte_dados`,
`criado_em`, `atualizado_em`.

**Do pipeline de pesquisa e triagem (não estavam documentadas antes):**

| Coluna | O que guarda |
|---|---|
| `status` | Estado da candidatura no funil de processamento. |
| `tier_processamento` | Faixa de prioridade de pesquisa — nem toda candidatura recebe o mesmo esforço. |
| `viabilidade_score` | Estimativa de relevância eleitoral, usada para decidir quem entra no `tier` mais alto. |
| `tse_sequencial` | Identificador sequencial do TSE, usado para casar registros entre fontes oficiais. |
| `plano_governo_url` | URL do plano de governo registrado no TSE. |
| `plano_governo_texto` | Texto extraído do plano de governo. |
| `plano_governo_resumo` | Resumo do plano, gerado na ingestão. |

## `themes_catalog` — os 14 temas do questionário

14 linhas, uma por tema. Ver `docs/referencia/questionario.md` para o
conteúdo de cada um.

`id`, `slug`, `nome`, `categoria`, `descricao`, `afirmacao_questionario`,
`contexto_questionario`, `nota_educativa`, `sinonimos`, `exibir_no_quiz`,
`ordem_exibicao`, `ativo`, `criado_em`, `atualizado_em`, e seis colunas
`relevancia_<cargo>` (`presidente`, `governador`, `senador`,
`deputado_federal`, `deputado_estadual`, `deputado_distrital`) — reservadas
para pesar tema por cargo; **nenhum código de runtime as lê hoje** (verificado
por `grep` em `supabase/functions/match-candidatos/` e `src/`).

## `politician_positions` — a posição de um candidato em um tema

1.386 linhas hoje; cresce conforme a pesquisa avança. É a tabela que o match
lê para pontuar.

| Coluna | O que guarda |
|---|---|
| `id`, `politician_id`, `theme_id` | Chaves. |
| `posicao` | `favoravel` \| `contrario` \| `neutro` \| `variavel`. |
| `intensidade` | Quão central o tema é na plataforma do candidato (não é confiança). |
| `neutro_motivo` | Só tem sentido quando `posicao = 'neutro'`: `nao_encontrado` (nada achado), `nao_responde` (tem posição, mas não sobre esta afirmação) ou `ambivalente` (contraditório/condicional). **NULL é lido como `nao_encontrado`** — todo registro anterior a 2026-08-24 está NULL, e não houve backfill retroativo; o dado se autocorrige conforme candidatos são pesquisados de novo. |
| `justificativa` | O relato do analista sobre por que a posição ficou onde ficou — texto exibido por tema no card, nunca usado no cálculo. |
| `source_ids` | IDs das fontes (`candidate_sources`) que sustentam esta linha. 100% das linhas hoje carregam `source_ids` — só `modules/ingest-candidates/src/comandos/ingest-research.ts` escreve este campo. |
| `confianca_ia` | 0–1, confiança do agente na classificação. Abaixo de 0,75 (`LOW_CONFIDENCE_THRESHOLD` em `scoring.ts`) o tema é marcado como baixa confiança para o eleitor. |
| `coerencia_tema` | `coerente` \| `incoerente` \| `sem_historico` — se a conduta registrada bate com a plataforma declarada neste tema especificamente. |
| `gerado_por_ia`, `validado`, `notas_curador` | Rastro de curadoria. |
| `ano_referencia`, `valido_ate`, `fontes`, `atualizado_em`, `criado_em` | Metadados de vigência e legado (`fontes` é texto livre anterior a `source_ids`). |

## `party_positions` — posição de um partido em um tema

**0 linhas.** A coluna e a lógica de fallback existem no código
(`docs/referencia/calculo-do-match.md`), mas nenhum partido tem posição
registrada ainda — o caminho está implementado e testado, porém inerte.

## `politician_alerts` / `v_candidate_alerts` — achados sobre o candidato

165 linhas na tabela base; a view filtra para o que é seguro mostrar. Ver
`docs/referencia/alertas.md` para o schema completo e a distinção entre
alerta e observação.

## `candidate_dossiers` — perfil gerado do candidato

**109 linhas** — cobre 0,5% das 20.004 candidaturas (ver
`docs/referencia/visao-geral.md`). `id`, `candidacy_id`, `versao`,
`resumo_perfil`, `espectro_declarado`, `espectro_inferido`, `coerencia_base`,
`coerencia_indice` (NULL = sem histórico para medir, nunca zero — zero
significaria "medido e totalmente incoerente"), `gerado_em`.

## `candidate_sources` — catálogo de fontes citadas

989 linhas. `id`, `politician_id`, `candidacy_id`, `tipo`, `titulo`,
`veiculo`, `url`, `camada` (1 = oficial, 2 = imprensa, 3 = checagem de fatos),
`data_publicacao`, `acessado_em`, `hash_conteudo`, `destino_exibicao`,
`criado_em`.

## `enrichment_ledger` — controle do pipeline

100.020 linhas — uma por etapa de processamento por candidatura, não por
candidatura. `id`, `candidacy_id`, `etapa`, `status`, `tentativas`, `erro`,
`metricas`, `criado_em`, `atualizado_em`, `concluido_em`. Controla o que já
foi processado e o que falhou, para o pipeline retomar sem reprocessar tudo.

## Tabelas que não existem

`theme_embeddings` — nunca foi criada; a busca de fontes é feita pelo agente
de pesquisa, não por similaridade vetorial. Qualquer documento que a mencione
como existente está no legado (`docs/legado/`).
