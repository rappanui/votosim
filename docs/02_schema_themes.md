# VotoSim — Schema: Themes and Positions

**Context:** The 14 political themes that power the questionnaire and match algorithm. Theme slugs are the shared key across DB, frontend, pipeline, and the Gemini prompt. The `politician_positions` table is what makes matching possible — candidates without positions are unranked. Read before writing any questionnaire UI, match logic, or ingestion pipeline.

---

## Table: `themes_catalog`

14 rows — fixed, curated set. Do not add or rename slugs without updating the pipeline and frontend.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Referenced by `politician_positions.theme_id` |
| `slug` | TEXT UNIQUE | Stable key — used in all code; never rename |
| `nome` | TEXT | Display name |
| `categoria` | theme_category | Grouping for future filtering |
| `relevancia_presidente` | NUMERIC(3,2) | Weight 0.0–1.0 in match score for this office |
| `relevancia_senador` | NUMERIC(3,2) | |
| `relevancia_governador` | NUMERIC(3,2) | |
| `relevancia_deputado_federal` | NUMERIC(3,2) | |
| `relevancia_deputado_estadual` | NUMERIC(3,2) | |
| `afirmacao_questionario` | TEXT | Statement shown to user in the quiz |
| `contexto_questionario` | TEXT | Educational context (collapsible "Saiba mais") |
| `nota_educativa` | TEXT | Which office is responsible for this theme (tooltip) |
| `exibir_no_quiz` | BOOLEAN | false = in catalog but hidden from questionnaire |
| `ordem_exibicao` | SMALLINT | Quiz display order |

**Query to load the questionnaire:**
```sql
SELECT id, slug, nome, afirmacao_questionario, contexto_questionario, nota_educativa
FROM themes_catalog
WHERE exibir_no_quiz = true
ORDER BY ordem_exibicao;
```

---

## The 14 Slugs (in quiz order)

| ordem | slug | nome |
|---|---|---|
| 10 | `reforma_tributaria` | Reforma tributária |
| 20 | `sus_saude_publica` | Saúde pública (SUS) |
| 30 | `privatizacao_estatais` | Privatização × estatização |
| 40 | `seguranca_publica_estadual` | Segurança pública |
| 50 | `educacao_basica` | Educação básica e ensino público |
| 60 | `meio_ambiente_desmatamento` | Meio ambiente e desmatamento |
| 70 | `reforma_previdencia` | Previdência social e aposentadoria |
| 80 | `direitos_lgbtqia` | Direitos LGBTQIA+ |
| 90 | `porte_armas` | Porte e posse de armas |
| 100 | `bolsa_familia_transferencia` | Transferência de renda e assistência social |
| 110 | `corrupcao_transparencia` | Combate à corrupção |
| 120 | `politica_economica` | Política econômica e papel do Estado |
| 130 | `politica_externa` | Política externa e relações internacionais |
| 140 | `pauta_moral_costumes` | Valores morais e costumes na legislação |

---

## Table: `politician_positions`

One row per (politician × theme). The central table for match computation.

| Column | Type | Notes |
|---|---|---|
| `politician_id` | UUID FK | |
| `theme_id` | UUID FK | References `themes_catalog.id` |
| `posicao` | position_stance | `'favoravel'` \| `'contrario'` \| `'neutro'` \| `'variavel'` |
| `intensidade` | SMALLINT 1–5 | 1=weak/mentioned once · 3=clear · 5=signature campaign issue |
| `fontes` | JSONB | `[{tipo, descricao, url, data, confiabilidade}]` |
| `gerado_por_ia` | BOOLEAN | true = Gemini extraction |
| `validado` | BOOLEAN | false = pending human review |
| `confianca_ia` | NUMERIC(3,2) | 0.0–1.0 — Gemini confidence |

**UNIQUE:** `(politician_id, theme_id)` — one position per politician per theme.

**RLS:** anon key sees only `validado = true` positions. Pipeline uses service_role (sees all).

**Auto-validation:** pipeline sets `validado = true` when `confianca_ia >= 0.85`.

**Candidates without positions** are included in results but labeled "Dados insuficientes" — they receive score 0 and appear at the bottom.

---

## View: `v_candidates_2026_matchable`

Extends `v_candidates_2026` with theme coverage:

| Column | Values | Meaning |
|---|---|---|
| `temas_com_posicao` | integer | Count of themes with a position recorded |
| `cobertura_dados` | `'suficiente'` \| `'parcial'` \| `'insuficiente'` | ≥5 = sufficient · 2–4 = partial · <2 = insufficient |

Used by the Edge Function as the primary source for candidate fetch.

---

## View: `v_politician_theme_coverage`

Aggregates per politician: `temas_com_posicao`, `temas_validados`, `posicoes_favoraveis`, `posicoes_contrarias`, `intensidade_media`. Used by the pipeline to prioritize who still needs processing.

---

## RLS: `politician_positions`

- anon: `SELECT WHERE validado = true`
- service_role: full access (used by pipeline and curation panel)
