# SP-0 Schema Additions

**Context:** The tables, columns and enums added by `docs/migracoes/11_sp0_foundation.sql` to support per-candidate enrichment, plus the modelling decisions behind them. Read before writing anything that reads or writes `enrichment_ledger`, `candidate_sources`, `candidate_dossiers`, or the new columns on `candidacies`, `politician_positions` and `politician_alerts`. Design rationale lives in `docs/superpowers/specs/2026-08-20-candidate-data-pipeline-design.md`.

---

## New tables

### `enrichment_ledger`

One row per candidacy × stage. Answers "who is processed and who is left", and carries the cost metrics that make the instrumented pilot possible.

| Column | Notes |
|---|---|
| `etapa` | `documentos_oficiais \| ficha_limpa \| noticias \| dossie \| posicoes` |
| `status` | `pendente \| em_progresso \| concluido \| falhou \| nao_aplicavel` |
| `metricas` | JSONB: `tokens`, `duracao_ms`, `fontes_encontradas`, `confianca_media` |

`nao_aplicavel` is load-bearing. A senate candidate files no government plan with the TSE, and a first-time candidate has no coherence to measure. Without that state the ledger reports failure where there is nothing to do.

RLS is enabled with **no public read policy** — this is internal pipeline state, reached only by the service role key.

### `candidate_sources`

Catalogue of every URL the pipeline touched. Positions and alerts reference it instead of repeating URLs, so a displayed fact whose source is not listed is impossible by construction.

| Column | Notes |
|---|---|
| `politician_id` | `NOT NULL`, `ON DELETE CASCADE` — the durable owner |
| `candidacy_id` | **nullable**, `ON DELETE SET NULL` — which run gathered it |
| `camada` | 1 official · 2 reference press · 3 fact-checking |
| `destino_exibicao` | `card_candidato \| pagina_sobre \| interno` |
| `acessado_em`, `hash_conteudo` | Survive link rot: the card can state "accessed on…" |

Unique on `(politician_id, url)`.

### `candidate_dossiers`

Generated candidate profile, versioned so it can be regenerated without losing the previous take. `coerencia_indice` is `NUMERIC(5,2)`, `NULL` when the candidate has no track record — **never zero for that case**, since zero means measured and incoherent. `coerencia_base` records what was compared against what, so the UI states its basis instead of showing a bare number.

`espectro_declarado` and `espectro_inferido` are constrained to the same vocabulary as `parties.espectro`.

## Column additions

| Table | Column | Purpose |
|---|---|---|
| `candidacies` | `tier_processamento` | `total` (presidente/governador/senador) · `por_score` (deputados) · `fora_escopo` (distrital) |
| `candidacies` | `viabilidade_score` | Only for `por_score`; computation deferred to a later plan, stays NULL |
| `candidacies` | `federacao` | From `SG_FEDERACAO`; distinct from coalition |
| `candidacies` | `composicao_coligacao` | From `DS_COMPOSICAO_COLIGACAO` |
| `politician_positions` | `justificativa` | Why this position, in voter-facing language |
| `politician_positions` | `coerencia_tema` | `coerente \| incoerente \| sem_historico` |
| `politician_positions` | `source_ids` | `UUID[]` into the catalogue; supersedes `fontes` for new writes |
| `politician_alerts` | `source_id` | Alerts trace to the catalogue like positions do |

`alert_type` gains `incoerencia` and `divergencia_espectro` (base/11_sp0_foundation.sql).

### Enum additions on 2026-08-23 (applied to the live database via ALTER, now also in base/11_sp0_foundation.sql)

`source_tipo` gains `plataforma_partidaria` and `biografia` — party platform and
biography documents, the common evidence base for legislative candidates who file
no `plano_governo`. `alert_type` gains `ressalva_evidencias` — a methodological
caveat about the evidence base itself (degraded extraction, positions inferred
from a party platform rather than the candidate's own statements); a transparency
flag, never an accusation.

```sql
ALTER TYPE source_tipo ADD VALUE IF NOT EXISTS 'plataforma_partidaria';
ALTER TYPE source_tipo ADD VALUE IF NOT EXISTS 'biografia';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'ressalva_evidencias';
```

### Enum addition for E4b (mandate performance) — 2026-08-23

`source_tipo` gains `desempenho_mandato`: the evidence type behind stage E4b of
`docs/procedimentos/pesquisa-de-candidato.md` — attendance, votes cast, authored bills
and CEAP spending for a candidate who holds or held a legislative mandate. No
pre-existing value fits (`bens_declarados` is declared personal assets;
`votacao` is a single roll-call), so without it the E4b rule cannot cite the
endpoint it read the figures from, and ingestion fails with
`invalid input value for enum source_tipo`.

```sql
ALTER TYPE source_tipo ADD VALUE IF NOT EXISTS 'desempenho_mandato';
```

A `ressalva_evidencias` alert is auto-validated on ingest (see `isAutoValidated()`
in export/scripts/ingest-research.ts) and renders `badge_cor = 'amarelo'`.

## Why `candidate_sources` carries two keys

`politician_positions` is keyed by `politician_id` and is deliberately cross-election, and it reaches the catalogue through a plain `UUID[]` that PostgreSQL does not enforce.

A first attempt keyed the catalogue only by `candidacy_id`, then tried to fix the resulting orphan problem by *adding* a `politician_id` FK with its own cascade. **That does not work**, and both halves were reproduced on PostgreSQL 15:

- Adding a second foreign key does not remove the first one's cascade. Deleting a candidacy still wiped the sources and still left `politician_positions.source_ids` holding UUIDs pointing at nothing.
- The added cascade was redundant anyway, since `candidacies.politician_id` is already `ON DELETE CASCADE`, so a politician delete already reached the sources transitively.

The working shape is `politician_id NOT NULL` cascading (durable owner) and `candidacy_id` nullable with `ON DELETE SET NULL`. Deleting a candidacy detaches the source from that run without destroying it. Regression test after a candidacy delete: `sources_left=1`, `candidacy_now=NULL`, `positions_with_dangling=0`.

## The work queue view

`v_enrichment_queue` lists candidacies with outstanding work, presidents first, then grouped by state, then by tier and viability. Three predicates matter and each closed a real bug:

- **`tier_processamento IS DISTINCT FROM 'fora_escopo'`**, not `<>`. The column is NULL until backfilled, and `NULL <> 'x'` is NULL, which silently emptied the entire queue on first use.
- **`LEFT JOIN` on the ledger** plus a `count(l.id) = 0` branch, so a candidacy never seeded into the ledger is still visible. An inner join could only answer "who started and isn't finished".
- **`em_progresso` counts as outstanding.** A crashed agent run leaves rows in that state permanently; excluding them made the candidate invisible with no recovery path.

The electorate-size ordering across states that spec decision D11 describes is **not** expressed here — no per-UF electorate data exists in the schema. It is an operator decision about which UF to process next.

## Applying the file

The file is idempotent: every `CREATE` is `IF NOT EXISTS`, `OR REPLACE`, or wrapped in a `DO` block trapping `duplicate_object`; policies are dropped before creation. Re-running produces zero errors.

It can be pasted into the Supabase SQL Editor **as a single batch**. Two notes on why:

- `ALTER TYPE … ADD VALUE` has been transaction-safe since PostgreSQL 12, provided the new value is not *used* in the same transaction. Older comments in this repo claiming otherwise were wrong.
- This file *does* use the new `alert_type` values, in the `v_candidate_alerts` badge `CASE`. That `CASE` therefore switches on `pa.tipo::text`, which never touches the pending enum values. Without the cast the file fails with `unsafe use of new value "incoerencia" of enum type alert_type`.

`v_candidate_alerts` is replaced here rather than in `04_schema_alerts.md` because the original `CASE` has no `ELSE`, so the new alert types would have rendered `badge_cor = NULL`. The badge CASE now covers `incoerencia` (roxo), `divergencia_espectro` (azul) and `ressalva_evidencias` (amarelo).
