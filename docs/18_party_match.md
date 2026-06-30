# VotoSim — Party Match (Voto de Legenda)

**Context:** Documents how parties appear in match results for legislative cargos. Relevant when modifying `party_positions` data, the ingest script, or the Edge Function's party scoring path. For the full scoring formula, see `docs/14_edge_function_ai.md`.

---

## Why Party Match

Brazilian voters can cast a voto de legenda — voting for the party ticket rather than a specific candidate. For senators and deputies, showing the party's alignment score lets users who prefer this voting style pick the most aligned party even when individual candidates have no public position data.

A party appears in results **above** individual candidates if its score is higher after `sortAndLimitCargos` runs.

---

## Data Flow

```
party_positions (DB table)
  ↓ fetchPartyPositions()        — load positions by party sigla
  ↓ buildPartyResults()          — scoreCandidato per (party, cargo) pair
  ↓ injectPartyResults()         — merge into MatchResult cargo groups
  ↓ sortAndLimitCargos()         — sort/limit alongside individual candidates
```

Parties use the same `scoreCandidato` formula as individual candidates — no special scoring path.

---

## `party_positions` Table

```sql
party_positions (
  party_sigla  TEXT  NOT NULL REFERENCES parties(sigla)
  theme_id     UUID  NOT NULL REFERENCES themes_catalog(id)
  posicao      TEXT  CHECK IN ('favoravel', 'contrario', 'neutro')
  intensidade  SMALLINT  DEFAULT 3
  fontes       JSONB
  gerado_por_ia BOOLEAN
  validado     BOOLEAN
  confianca_ia NUMERIC(3,2)
  UNIQUE (party_sigla, theme_id)
)
```

One row per party per theme. `posicao = 'variavel'` is intentionally excluded on write (the party has no unified stance — not useful for matching).

**Migration:** `docs/base/10_party_positions.sql` — apply in Supabase SQL Editor before running the ingest.

---

## Populating Party Positions

```bash
cd scripts
npm run ingest-party-programs
```

Default PDF directory: `scripts/data/party-programs/`. Each PDF must be named `{SIGLA}.pdf` (e.g., `PT.pdf`, `PL.pdf`).

**What the script does per party:**
1. Extracts text from the PDF via `pdf2json`
2. Calls Groq 70B (`extractPositions` in `scripts/lib/groq.ts`) with `allowFallback: false` and `minConfidence: 0.6`
3. Upserts to `party_positions` (one row per theme — skips `variavel`)
4. For party members without any individual positions, inserts proxy rows to `politician_positions` (marked `confianca_ia = 0.55`, `validado = false`)

**`allowFallback: false` is intentional.** The 8B fallback model hallucinates political positions from legal/administrative documents (e.g., TSE registration forms). The 70B model correctly refuses those documents. If the 70B daily quota is exhausted, the script skips the party — no data is better than fabricated data.

**Rate limits:** Primary model `llama-3.3-70b-versatile` (100K tokens/day). Falls back to `llama-3.1-8b-instant` only in `extract-positions` — not here. Re-running is safe — `party_positions` upserts on `(party_sigla, theme_id)`.

---

## Critical: PDF Source Quality

> **The PDFs must be actual party political programs, not legal/administrative documents.**

The TSE registration system (`tse.jus.br/partidos/`) hosts two distinct types of documents per party:
- **Programa Partidário** — the party's political manifesto (what this script needs)
- **Registro / Estatuto** — legal registration decisions and bylaws (text is jurídico, no policy positions)

Many of the PDFs currently in `scripts/data/party-programs/` are registration/statute documents — the 70B model returns `{ "posicoes": [] }` for these, which is correct. The 8B model was previously hallucinating positions from the same legal text.

**To populate `party_positions` properly**, replace the PDFs with actual program documents from party websites or from the TSE's "Programa" section. Each file must be named `{SIGLA}.pdf`.

---

## Edge Function Integration

The party match runs in the handler after individual candidate scoring:

```typescript
// All parties with candidates in legislative cargos for this state
const partySiglas = [...new Set(
  candidates.filter(c => LEGISLATIVE_CARGOS.has(c.cargo)).map(c => c.partido_atual)
)]
const partyPositionsByParty = await fetchPartyPositions(supabase, partySiglas, themeMap)
const partyEntries = buildPartyResults(candidates, partyPositionsByParty, body.respostas)
const mergedResult = injectPartyResults(rawResult, partyEntries)
```

`LEGISLATIVE_CARGOS = { senador, deputado_federal, deputado_estadual, deputado_distrital }`

Executive cargos (presidente, governador) never get party entries — voters must pick a candidate for those.

---

## Identifying Party Entries in the Response

```typescript
candidato.isParty === true          // only set for party entries
candidato.politicianId === 'party:PT'   // prefix 'party:' + sigla
candidato.nomeUrna === 'PT'          // sigla, not a person's name
```

The frontend should render party entries differently — no profile image, show "Partido" label.

---

## Proxy Positions for Individual Members

When a party's program is ingested, members who have no individual position data in `politician_positions` receive proxy rows copied from the party positions. These are weaker signals:

| Field | Value |
|-------|-------|
| `confianca_ia` | `0.55` (vs 0.7–0.95 for individual plans) |
| `validado` | `false` |
| `fontes[0].tipo` | `'programa_partidario'` |

Proxy rows are only inserted, never updated — members who later get real individual positions retain their own data (the insert uses `ignoreDuplicates: true`).

---

## Coverage Status (as of June 2026)

`party_positions` is currently **empty**. All PDFs in `scripts/data/party-programs/` were identified as TSE legal/registration documents (not political programs). The 70B model correctly returned `{ "posicoes": [] }` for all of them after the data quality investigation.

All proxy rows in `politician_positions` (208,718 rows with `confianca_ia = 0.55`) were also removed as they were based on hallucinated data from the 8B model.

**Impact on SP experience (June 2026):**

| Cargo | Coverage | Source |
|-------|----------|--------|
| Presidente | ~80% | TSE government plan PDFs (real) |
| Governador SP | 10/10 (100%) | TSE government plan PDFs (real) |
| Senador SP | 2/2 (100%) | Câmara/Senado voting records (real) |
| Deputado Federal SP | ~76% | Câmara voting records (real) |
| Deputado Estadual SP | 0% | No data — proxy removed, PDFs wrong |

To populate deputado estadual coverage, replace the PDFs with genuine party program documents and re-run.
