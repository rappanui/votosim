# VotoSim — Schema: Candidate Alerts

**Context:** Alerts surface negative or sensitive information about a candidate alongside their match card. They never exclude a candidate from results. Read before writing any results UI, ingestion pipeline, or curation tooling.

---

## Enums

```sql
alert_type:     'ficha_suja' | 'investigacao' | 'polemica'
alert_severity: 'critica' | 'alta' | 'media' | 'baixa'
```

---

## Table: `politician_alerts`

| Column | Type | Notes |
|---|---|---|
| `politician_id` | UUID FK | |
| `tipo` | alert_type | |
| `severidade` | alert_severity | |
| `titulo` | TEXT | Short factual label e.g. "Condenado por improbidade em 2021" |
| `descricao` | TEXT | Neutral, factual — NO adjectives, NO value judgments |
| `fonte_url` | TEXT NOT NULL | Primary source URL — **required, no exceptions** |
| `fonte_nome` | TEXT | e.g. "TSE — Ficha Limpa / LC 135/2010" |
| `data_ocorrencia` | DATE | |
| `ativo` | BOOLEAN | false = resolved (acquitted, decision reversed) |
| `resolucao` | TEXT | Populated when `ativo = false`: "Absolvido pelo STJ em mar/2025" |
| `validado` | BOOLEAN | false = pending curation review |
| `validado_por` | TEXT | Curator identifier |
| `gerado_por_ia` | BOOLEAN | true = AI-suggested |

**RLS rule:** anon key sees ONLY `ativo = true AND validado = true`. Never show unvalidated alerts in the UI.

---

## View: `v_candidate_alerts`

Filters to `ativo = true AND validado = true`. Returns everything `politician_alerts` has plus:

| Column | Values |
|---|---|
| `badge_cor` | `'vermelho'` (ficha_suja) · `'laranja'` (investigacao) · `'cinza'` (polemica) |
| `ordem_exibicao` | 1 (critica) · 2 (alta) · 3 (media) · 4 (baixa) |

Ordered by `(politician_id, ordem_exibicao)` — most severe first.

**Use this view** in the Edge Function and frontend. Do not query `politician_alerts` directly from client code.

---

## Editorial Rules

| Rule | What it means |
|---|---|
| **Source required** | `fonte_url` must be filled. No reliable primary source → no alert. |
| **Auto-validate `ficha_suja` + `investigacao`** | Pipeline can set `validado = true` when source is TSE or STF. |
| **Human curation for `polemica`** | `validado` must be set by a human before appearing in UI. |
| **Neutral language** | `descricao` must state facts only. Test: "Is this a fact or an opinion?" |
| **Keep resolved alerts** | When a case is closed, set `ativo = false` + fill `resolucao`. Never delete rows. |
| **Votes ≠ alert** | A vote against a policy is a position (→ `politician_positions`). An alert = documented misconduct, discriminatory statement, or proven conflict of interest. |

---

## Alert Sources by Type

| tipo | Acceptable primary sources |
|---|---|
| `ficha_suja` | TSE CSV certidões criminais, Lei Ficha Limpa (LC 135/2010) |
| `investigacao` | STF, PGR, TCU, congressional CPIs, Federal Police press releases |
| `polemica` | Agência Brasil, G1, Folha de S.Paulo — human curation required before publishing |

---

## Loading Alerts in the Edge Function

```typescript
// Fetch validated alerts for a list of politician IDs
const { data: alertas } = await supabase
  .from('v_candidate_alerts')
  .select('politician_id, tipo, severidade, titulo, descricao, fonte_url, badge_cor')
  .in('politician_id', politicianIds)
```

Alerts load asynchronously in the UI — candidate cards render first, badge updates after.
