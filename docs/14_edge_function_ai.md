# VotoSim — Edge Function Match Scoring

**Context:** Documents how `match-candidatos` computes alignment scores between voter answers and candidates/parties. Read before modifying `ai-providers.ts` or `index.ts`. For pipeline script AI extraction (PDF → positions), see `docs/12_ai_extraction.md`.

---

## Why Deterministic Math, Not AI

The Edge Function previously used a Groq → Cerebras → Mistral → math fallback chain. All three LLM providers were removed. The math fallback is now the only scoring path.

**Reasons:**
- LLM-computed scores are non-reproducible: the same voter + candidate data can return different scores across calls
- Models carry training-data bias (e.g., boosting a party whose ideology the model "knows")
- A national civic tool must produce auditable, explainable results

The math is simpler, faster, and verifiable — every score can be traced back to its formula.

---

## Score Formula

### Step 1: Map to 1–5 scale

Both voter and politician positions are mapped to a symmetric 1–5 scale before comparison.

**Voter (concordância + intensidade → voterScale):**

```
concordo  + intensidade=5 → 5.0   (strongly agrees)
concordo  + intensidade=1 → 3.4
neutro    + any           → 3.0   (no opinion)
discordo  + intensidade=1 → 2.6
discordo  + intensidade=5 → 1.0   (strongly disagrees)
```

Formula: `voterScale = 3 ± (intensidade / 5) × 2`

**Politician (posicao + intensidade → politicianScale):**

```
favoravel + intensidade=5 → 5.0
favoravel + intensidade=1 → 3.4
neutro    + any           → 3.0
contrario + intensidade=1 → 2.6
contrario + intensidade=5 → 1.0
```

Formula: `politicianScale = 3 ± (intensidade / 5) × 2`

The scales are intentionally symmetric so `concordo+favoravel+5` yields `|5-5|/4 = 0` (perfect alignment) and `discordo+favoravel+5` yields `|1-5|/4 = 1` (complete divergence).

### Step 2: Per-theme alignment

```
alignment = 1 - |voterScale - politicianScale| / 4
```

Range: `0.0` (polar opposite) → `1.0` (perfect match).

**Missing or neutro politician position:** treated as `alignment = 0.5` (no data, neutral assumption). This penalises candidates with sparse coverage vs fully-covered ones.

**Neutro voter answer:** skipped entirely (voter has no opinion → no weight).

### Step 3: Weighted score

Voter `intensidade` acts as a weight — topics the voter cares more about count more.

```
weight        = r.intensidade / 5
weightedSum  += alignment × weight
totalWeight  += weight
```

### Step 4: Final score

```
score = round((weightedSum / totalWeight) × 100)
```

Returns `0` if:
- No voter answers have `concordancia !== 'neutro'`
- No politician position covers any non-neutro voter answer (`hasAnyCoverage = false`)

### Classification thresholds

| Range | Label |
|-------|-------|
| `alignment ≥ 0.75` | `temasAlinhados` |
| `alignment ≤ 0.25` | `temasDivergentes` |
| `0.25 < alignment < 0.75` | not listed |

---

## Result Filtering and Ordering

After scoring all candidates:

```
sortAndLimitCargos():
  1. Filter: score >= MIN_SCORE_THRESHOLD (35)
  2. Sort: descending by score
  3. Limit per cargo:
       presidente, governador → MAX_EXEC_CANDIDATES (3)
       all other cargos       → MAX_CANDIDATES_PER_CARGO (5)
  4. Order cargos: presidente → governador → senador → deputado_federal → deputado_estadual → deputado_distrital
  5. Drop cargo groups with zero candidates above threshold
```

---

## Party Match (Voto de Legenda)

For legislative cargos (senador, deputado_*), parties can appear in results above individual candidates — voters may choose the party ticket rather than a specific name.

**How it works:**

1. `fetchPartyPositions(supabase, partySiglas, themeMap)` — queries `party_positions` table for all parties that have candidates in the state's legislative cargos. Returns `Map<sigla, PositionWithSlug[]>`.

2. `buildPartyResults(candidates, partyPositionsByParty, respostas)` — for each (party, cargo) pair where the party has data, runs `scoreCandidato` and returns `{ cargo, candidato: { isParty: true, politicianId: 'party:PT', ... } }`.

3. `injectPartyResults(rawResult, partyEntries)` — merges party candidatos into existing cargo groups in the MatchResult. Creates new cargo groups if needed (e.g., when no individual candidate in a cargo scored above threshold but the party did).

4. `sortAndLimitCargos` then sorts and limits normally — parties compete directly with individual candidates by score.

**Fallback:** if the `party_positions` table doesn't exist (migration not yet applied), `fetchPartyPositions` logs a warning and returns an empty Map. The match continues without party results — no error is thrown.

**Prerequisite:** Run `docs/base/10_party_positions.sql` in Supabase SQL Editor, then run `npm run ingest-party-programs` from `scripts/`.

---

## Pre-filter (Before Scoring)

For performance, candidates are pre-filtered before full scoring via `prefilterCandidates`:

```
per cargo group:
  - count "simple matches" (concordo+favoravel, discordo+contrario) per candidate
  - sort descending by simple match count
  - keep top N:
      deputado_*  → PREFILTER_LIMIT_DEPUTADO (20)
      others      → PREFILTER_LIMIT_DEFAULT (10)
```

This runs before `scoreCandidato` and keeps the scoring loop tight even when a state has 573+ state deputies.

---

## Request / Response Contract

**Request body (`MatchRequest`):**
```typescript
{
  estado: string           // required — UF code ('SP', 'RJ', ...)
  municipio: string
  faixaEtaria: string
  respostas: RespostaUsuario[]   // required — array (may be empty)
  sessionToken: string
  timestamp: string
}
```

**Per answer (`RespostaUsuario`):**
```typescript
{
  temaSlug:     string                          // must match themes_catalog.slug
  resposta:     1 | 2 | 3 | 4 | 5
  concordancia: 'concordo' | 'neutro' | 'discordo'
  intensidade:  1 | 2 | 3 | 4 | 5
}
```

**Response (`MatchResult`):**
```typescript
{
  cargos: Array<{
    cargo: string
    candidatos: Array<{
      politicianId: string    // 'party:PT' for party entries, UUID for individuals
      nomeUrna: string        // party sigla for party entries
      partido: string
      score: number           // 0–100
      temasAlinhados: string[]
      temasDivergentes: string[]
      temAlertas: boolean
      alertas: Alerta[]
      isParty?: boolean       // true only for party-level entries
    }>
  }>
  totalCandidatosAnalisados: number
  estado: string
}
```

---

## Required Supabase Secrets

| Secret | Source | Notes |
|--------|--------|-------|
| `SERVICE_ROLE_KEY` | Dashboard → Settings → API | Required for DB access |
| `ELECTION_YEAR` | Manual | `'2022'` or `'2026'` — controls which view is queried |

AI provider keys (`GROQ_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `GEMINI_API_KEY`) are **not used by the Edge Function**. They are used only by `scripts/` pipeline tools.
