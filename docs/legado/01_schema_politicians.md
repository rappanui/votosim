# VotoSim — Schema: Politicians, Candidacies, Parties

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-27
> **Motivo:** Documenta 11 das 27 colunas de `candidacies` — faltam `tier_processamento`, `viabilidade_score`, `tse_sequencial` e `plano_governo_url`, todas adições do SP-0. Também descreve o match chamando o Gemini.
> **Substituído por:** `docs/referencia/modelo-de-dados.md`


**Context:** Core tables representing people and their electoral candidacies. One `politicians` row per physical person across all elections. One `candidacies` row per election/office/state combination. Read before writing any query that fetches, filters, or joins candidate data.

---

## Enums

```sql
-- Offices covered (2026 federal + state elections — no vereador/prefeito)
office_type: 'presidente' | 'vice_presidente' | 'senador' | 'governador'
           | 'vice_governador' | 'deputado_federal' | 'deputado_estadual' | 'deputado_distrital'

-- TSE candidacy status
candidacy_status: 'pre_candidato' | 'registrado' | 'deferido' | 'indeferido'
                | 'cassado' | 'eleito' | 'nao_eleito' | 'segundo_turno'

-- Brazilian states
brazilian_state: 'AC'|'AL'|'AP'|'AM'|'BA'|'CE'|'DF'|'ES'|'GO'|'MA'|'MT'|'MS'|'MG'
               | 'PA'|'PB'|'PR'|'PE'|'PI'|'RJ'|'RN'|'RS'|'RO'|'RR'|'SC'|'SP'|'SE'|'TO'
```

---

## Table: `politicians`

One row per physical person. Stable identity across elections.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Internal identifier used everywhere |
| `tse_id` | TEXT UNIQUE | TSE sequential candidate ID |
| `cpf_hash` | TEXT UNIQUE | SHA-256 of CPF — never store raw CPF |
| `nome_urna` | TEXT | Ballot name — displayed in UI |
| `nome_search` | TEXT GENERATED | `immutable_unaccent(lower(nome_urna))` — for fuzzy search, do not write manually |
| `partido_atual` | TEXT | Current party sigla e.g. "PT" |
| `foto_url` | TEXT | Public photo URL |
| `ativo` | BOOLEAN | false = deceased/no active candidacy — exclude from all queries |

**Active filter for all queries:** `WHERE p.ativo = true`

**Fuzzy name search index:** GIN trigram on `nome_search`. Query via: `WHERE nome_search % 'sâmia'` (pg_trgm operator).

---

## Table: `candidacies`

One row per (politician × election × turno × office × state).

| Column | Type | Notes |
|---|---|---|
| `politician_id` | UUID FK | |
| `ano_eleicao` | SMALLINT | 2026 for current cycle |
| `turno` | SMALLINT | 1 or 2 |
| `cargo` | office_type | |
| `estado` | brazilian_state | |
| `numero_urna` | TEXT | Ballot number |
| `partido_eleicao` | TEXT | Party at candidacy time — may differ from `politicians.partido_atual` |
| `status` | candidacy_status | |
| `plano_governo_texto` | TEXT | Full text extracted from TSE PDF — Gemini extraction input |
| `plano_governo_resumo` | TEXT | AI-generated summary (max 500 chars) |

**UNIQUE constraint:** `(politician_id, ano_eleicao, turno, cargo, estado)`

**Active candidacy filter:**
```sql
WHERE ano_eleicao = 2026
  AND turno = 1
  AND status IN ('deferido', 'registrado', 'pre_candidato')
```

---

## Table: `parties`

| Column | Type | Notes |
|---|---|---|
| `sigla` | TEXT PK | e.g. "PT", "PL", "PSOL" |
| `nome_completo` | TEXT | |
| `numero` | SMALLINT UNIQUE | Electoral number |
| `espectro` | TEXT | `'esquerda'` \| `'centro_esquerda'` \| `'centro'` \| `'centro_direita'` \| `'direita'` \| `'sem_classificacao'` — informational only, NEVER used as match criterion |

---

## View: `v_candidates_2026`

Joins `politicians` (alias `p`) and `candidacies` (alias `c`). Filters to active 2026 Round 1 candidates.

Key columns: `candidacy_id`, `politician_id`, `nome_urna`, `partido_atual`, `foto_url`, `cargo`, `estado`, `municipio_ibge`, `status`, `plano_governo_resumo`, `dados_atualizados_em`

Use this view as the base for any candidate lookup.

---

## RLS Rules

| Table | anon key | service_role key |
|---|---|---|
| `politicians` | SELECT only | Full access (bypasses RLS) |
| `candidacies` | SELECT only | Full access |
| `parties` | SELECT only | Full access |

No INSERT/UPDATE/DELETE policies exist for `anon` or `authenticated` roles. All writes go through the ingestion pipeline using the service_role key.

---

## Critical: `immutable_unaccent` wrapper

The `nome_search` generated column calls `unaccent()`, which PostgreSQL requires to be `IMMUTABLE`. The native `unaccent` function is not declared `IMMUTABLE`. This wrapper **must be created before the `politicians` table**:

```sql
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT unaccent($1); $$;
```

Missing this step causes `CREATE TABLE politicians` to fail with a generated column error.
