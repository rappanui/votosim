# Candidate Data Enrichment Strategy

**Context:** This document describes the tiered pipeline for collecting, interpreting, and storing reliable political positions for all 14 VotoSim themes. It supersedes the TSE PDF pipeline (`scripts/extract-positions.ts`), which produced biased and incomplete data (all "favoravel", covering only 5–8 of 14 themes per candidate). Read this before writing any data ingestion or AI interpretation code.

---

## Why the Old Pipeline Failed

The TSE party program PDFs are propaganda documents. They:
- Describe everything in positive framing ("we support X"), never as opposition
- Cover 5–8 of 14 themes at most (81% of 2022 candidates)
- Produce `posicao: "favoravel"` on every theme for every candidate, making the match algorithm meaningless

A left-wing voter who filled all 14 themes would see Bolsonaro at 91% alignment because both PDFs said "favoravel" to everything.

---

## Architecture: Three-Tier Pipeline

### Tier 1 — Parliamentary Voting Records (free, automated)
**Sources:** Câmara (`dados.camara.leg.br`) + Senado (`legis.senado.leg.br`) open data APIs

**Scope:** All federal deputies and senators with a mandate

**Method:**
- Download roll-call votes from the last legislature
- Map propositions to theme slugs by keyword matching (`scripts/ingest-camara-votes.ts`, `scripts/ingest-senado-votes.ts`)
- Derive `posicao` from vote tally: `sim > nao` → `favoravel`, `nao > sim` → `contrario`, else `neutro`
- Source type: `votacao_camara` / `votacao_senado`, `validado: true`

**Coverage:** Reliable for mandataries. Covers policy behavior, not rhetoric.

### Tier 2 — Party Programs (cheap AI, semi-automated)
**Sources:** TSE party program PDFs (~33 parties)

**Scope:** All parties with representation; fills gaps for candidates without Tier 1 data

**Method:**
- Extract PDF text
- Send to LLM with the enrichment prompt (see `candidate-enrichment-prompt.md`)
- Store as party-level positions with lower weight (`confianca_ia: 0.70`, `validado: false`)
- Party positions are injected as fallback when candidate has no direct data on a theme

**Coverage:** Useful as fallback. Party ≠ candidate, so lower confidence. See `docs/18_party_match.md`.

### Tier 3 — Manual AI-Assisted Research (per priority candidate)
**Scope:**
- All presidential candidates
- All 27 governors
- Candidates without a mandate (no Tier 1 data available)
- Any candidate where Tier 1 + 2 coverage is below 70%

**Method:**
- Use Claude Code (Pro plan) as the AI agent — no API key needed, runs in session
- Sources: PDF proposals + news search + historical speeches + voting record summaries
- Interpret each of the 14 themes against the exact question framing in `afirmacao_questionario`
- Upsert to `politician_positions` with `gerado_por_ia: true`, `validado: false`, `confianca_ia: 0.85–0.90`
- Source type: `ai_interpretacao`

**Why Claude Code instead of Groq API:** Claude Code has web browsing + PDF reading built in, costs nothing extra on Pro, and produces far more reliable interpretations than a raw LLM call without search access.

**For Groq / automated pipelines:** Use `docs/candidate-enrichment-prompt.md` as the system prompt. Works well for candidates with rich documentary evidence; less reliable for obscure candidates.

---

## Data Quality Standards

Every candidate record must meet these standards before the match algorithm uses it:

| Field | Requirement |
|-------|-------------|
| `posicao` | One of: `favoravel`, `contrario`, `neutro` |
| `intensidade` | Integer 1–5 (see scoring rubric in enrichment prompt) |
| `confianca_ia` | ≥ 0.70 to be used in match; below 0.70 treat as null |
| Theme coverage | Minimum 10 of 14 themes; below 10 triggers party fallback for missing themes |
| `fontes` | At least one entry with `tipo`, `descricao`, and `confiabilidade` |

The match function (`supabase/functions/match-candidatos/index.ts`) reports `cobertura` (% of voter's non-neutral themes with real candidate data). Candidates below 30% coverage get a warning badge in the UI.

---

## Rollout Plan

1. **SP pilot (now):** Presidente + Governador SP + top 20 deputados federais SP
   - Manual enrichment via Claude Code session
   - Validates token cost and interpretation quality before scaling

2. **National executives:** 27 governors + presidential candidates for 2026
   - Run per-candidate Claude Code sessions before election registration closes
   - ~30 candidates, ~1 session per 2 candidates

3. **Federal legislature:** 513 deputies + senators
   - Primarily Tier 1 (voting records) — already partially automated
   - Fill gaps with Tier 3 for candidates with <10 themes covered

4. **State legislature:** Deputados estaduais — lowest priority, highest volume
   - Tier 1 + Tier 2 (party fallback) only; manual research not viable at this scale

---

## Source Type Reference

| `fontes[].tipo` | Meaning | Typical `confiabilidade` |
|-----------------|---------|--------------------------|
| `votacao_camara` | Roll-call vote at Câmara | 0.95 |
| `votacao_senado` | Roll-call vote at Senado | 0.95 |
| `programa_partido` | Party program PDF | 0.70 |
| `ai_interpretacao` | AI research from PDF + news + speeches | 0.85–0.90 |
| `tse_pdf` | TSE candidate proposal PDF (deprecated) | 0.40 |

The `tse_pdf` source type remains in the codebase for migration purposes but should be re-enriched with Tier 3 for any candidate that matters.

---

## Key Constraint: Question Framing

The `afirmacao_questionario` for each theme is a specific political stance, not a neutral description of the topic. When interpreting candidate positions:

- `favoravel` = candidate AGREES with the affirmation as written
- `contrario` = candidate DISAGREES with the affirmation as written
- `neutro` = candidate has no clear or consistent position

**Example traps:**
- `reforma_previdencia` asks about *reducing* retirement requirements. Bolsonaro *increased* them → `contrario`
- `politica_economica` asks about *more state participation*. Bolsonaro favors less → `contrario`
- `politica_externa` asks about *Western alignment*. Lula favors South-South multilateralism → `contrario`

Misreading the framing is the single most common failure mode. The enrichment prompt includes these examples explicitly.
