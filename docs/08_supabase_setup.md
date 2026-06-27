# VotoSim — Supabase Setup

**Context:** How to create and configure the VotoSim Supabase project from zero. Follow in order on a fresh project before running the pipeline or the frontend. If the database already exists, jump to the verification queries at the end to confirm state.

---

## Project Config

```
Name:     votosim
Region:   South America (São Paulo)   ← required for latency
Plan:     Free tier
Password: [generate strong — save it — Supabase does not show it again]
```

---

## Step 1 — Enable Extensions

Dashboard → Database → Extensions. Enable all four:

| Extension | Why |
|---|---|
| `uuid-ossp` | `uuid_generate_v4()` for all PKs |
| `unaccent` | Remove accents for `immutable_unaccent` wrapper |
| `pg_trgm` | Fuzzy name search (GIN trigram index) |
| `vector` | pgvector — v2 embeddings; enable now to avoid migration later |

---

## Step 2 — Apply DDL (SQL Editor, exact order)

### 2.1 — `immutable_unaccent` wrapper (must come before `politicians`)

```sql
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT unaccent($1); $$;
```

### 2.2 — All enums

```sql
CREATE TYPE office_type AS ENUM (
  'presidente','vice_presidente','senador','governador','vice_governador',
  'deputado_federal','deputado_estadual','deputado_distrital');
CREATE TYPE candidacy_status AS ENUM (
  'pre_candidato','registrado','deferido','indeferido',
  'cassado','eleito','nao_eleito','segundo_turno');
CREATE TYPE brazilian_state AS ENUM (
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO');
CREATE TYPE theme_category AS ENUM (
  'economia','saude','educacao','seguranca','meio_ambiente','direitos_sociais',
  'politica_externa','infraestrutura','ciencia_tecnologia','cultura',
  'religiao_costumes','reforma_politica','outro');
CREATE TYPE position_stance AS ENUM ('favoravel','contrario','neutro','variavel');
CREATE TYPE alert_type AS ENUM ('ficha_suja','investigacao','polemica');
CREATE TYPE alert_severity AS ENUM ('critica','alta','media','baixa');
```

### 2.3 — Schema files (paste full SQL blocks from each)

Apply in this order — each depends on the previous:

1. **`base/01_schema_politicians.md`**
   - Creates: `parties`, `politicians`, `candidacies`
   - Creates: indexes, `v_candidates_2026`, RLS policies
   - Runs: party seed (20 parties)

2. **`base/02_schema_themes.v2.md`**
   - Creates: `themes_catalog`, `politician_positions`, `position_history`
   - Creates: indexes, `v_candidates_2026_matchable`, `v_politician_theme_coverage`, RLS policies
   - Runs: 14-theme seed (with `afirmacao_questionario` and `contexto_questionario`)

3. **`base/04_schema_alerts.md`**
   - Creates: `politician_alerts`
   - Creates: indexes, `v_candidate_alerts`, RLS policy

**Skip** `base/03_schema_embeddings.md` and the SQL function in `base/05_schema_match_algorithm.md` for MVP. Apply in v2.

---

## Step 3 — Collect API Keys

Dashboard → Project Settings → API:

| Variable | Source | Where it goes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL" | `.env.local` in Next.js project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "anon public" key | `.env.local` in Next.js project |
| `SERVICE_ROLE_KEY` | "service_role" key | Supabase Edge Function secrets only — NEVER in `.env.local` |

---

## Step 4 — Edge Function Secrets

Dashboard → Edge Functions → Secrets → New Secret:

```
Name:  SERVICE_ROLE_KEY      Value: [service_role key from step 3]
Name:  GEMINI_API_KEY        Value: [from aistudio.google.com → Get API key → Create API key in new project]
```

**Critical constraints:**
- Do NOT use the prefix `SUPABASE_` on custom secrets — Supabase blocks it
- `SERVICE_ROLE_KEY` bypasses RLS — never expose in frontend or logs
- Keep billing OFF in the Google Cloud project for Gemini — enabling it eliminates the free tier

---

## Verification Queries

Run after setup. All must pass before starting development.

```sql
-- 1. All 7 tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- Expected: candidacies, parties, politician_alerts, politician_positions,
--           politicians, position_history, themes_catalog

-- 2. All 4 views exist
SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname;
-- Expected: v_candidate_alerts, v_candidates_2026,
--           v_candidates_2026_matchable, v_politician_theme_coverage

-- 3. All 14 themes seeded with statements
SELECT slug, LEFT(afirmacao_questionario, 50) AS preview
FROM themes_catalog ORDER BY ordem_exibicao;
-- Expected: 14 rows, all with non-null preview

-- 4. Party seed
SELECT COUNT(*) FROM parties;  -- Expected: 20

-- 5. RLS active
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('politicians','candidacies','themes_catalog','politician_alerts');
-- Expected: rowsecurity = true on all 4

-- 6. Extensions active
SELECT extname FROM pg_extension
WHERE extname IN ('uuid-ossp','vector','unaccent','pg_trgm');
-- Expected: 4 rows

-- 7. immutable_unaccent exists
SELECT proname FROM pg_proc WHERE proname = 'immutable_unaccent';
-- Expected: 1 row
```

All 7 queries must return expected results before proceeding to frontend development.
