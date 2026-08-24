# Match v2 — Scoring Model

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-08-24
> **Motivo:** Já se autodeclarava superado pelo match v3 desde 2026-08-23; também referencia `ai-providers.ts`, renomeado para `scoring.ts` na Fase A.
> **Substituído por:** `docs/referencia/calculo-do-match.md`


**Context:** Describes the dual-metric scoring algorithm introduced in Match v2 (`feature/match-v2`), the voter and candidate data types it operates on, and the theme slug renames. Read this before touching `supabase/functions/match-candidatos/ai-providers.ts` or any code that constructs `RespostaUsuario` payloads.

> **Superseded (2026-08-23):** the scoring algorithm described below was replaced
> by Match v3. See `docs/match-v3-scoring.md`.
> The voter data model and the theme slug renames in this document are still current.

---

## Overview

Match v2 replaces a single opaque score with two transparent metrics per candidate:

| Metric | Range | Meaning |
|--------|-------|---------|
| `alinhamento` | 0–100 | Weighted average of how closely the candidate's positions match the voter's on covered themes |
| `cobertura` | 0–100 % | Share of the voter's non-neutral themes where the candidate has a real (non-neutral, non-variável) position |

Low `cobertura` means the candidate has thin data — the score is less reliable.

---

## Voter Data Model

```typescript
interface RespostaUsuario {
  temaSlug: string
  resposta: 1 | 2 | 3 | 4 | 5   // Likert: 1=strongly disagree, 3=neutral, 5=strongly agree
  importancia: 1 | 2 | 3         // voter's declared weight: 1=low, 2=medium, 3=high
}

interface PerfilUsuario {
  estado: string
  respostas: RespostaUsuario[]
  sessionToken: string
  timestamp: string
}
```

**Removed from v1:** `concordancia`, `intensidade` (voter side); `municipio`, `faixaEtaria` (profile). Never add them back.

Neutral answers (`resposta === 3`) are **included** in the payload — the Edge Function handles exclusion from scoring.

---

## Scoring Algorithm (`scoreCandidato`)

Lives in `supabase/functions/match-candidatos/ai-providers.ts`.

### Input
- `respostas: RespostaUsuario[]` — voter's answers
- `positions: PositionWithSlug[]` — candidate positions from DB

### Step 1 — Candidate scale conversion (`posicaoToScale`)

Converts categorical DB value (`favoravel`, `contrario`, `neutro`, `variavel`, `null`) to a 1–5 number or `null`:

```
favoravel  → 5
contrario  → 1
neutro     → null   (excluded from coverage)
variavel   → null   (excluded from coverage)
null/other → null
```

### Step 2 — Per-theme computation

For each `RespostaUsuario`:

| Condition | `alignment` | `contouNoScore` | Included in cobertura? |
|-----------|-------------|-----------------|------------------------|
| `resposta === 3` (voter neutral) | `null` | `false` | excluded from denominator |
| `candidatePosicao === null` | `null` | `false` | counts against cobertura (denominator +1, numerator +0) |
| otherwise | `1 - abs(resposta - candidatePosicao) / 4` | `true` | counts for cobertura (denominator +1, numerator +1) |

### Step 3 — Aggregation

```
weight        = importancia / 3          // 1→0.333, 2→0.667, 3→1.0
alinhamento   = round(Σ(alignment × weight) / Σweight × 100)
cobertura     = round(coveredTemas / totalTemas × 100)
```

`totalTemas` = non-neutral voter answers; `coveredTemas` = those where `candidatePosicao !== null`.

### Output

```typescript
interface TemaCandidatoDetalhe {
  temaSlug: string
  voterResposta: Resposta
  voterImportancia: Importancia
  candidatePosicao: number | null   // typed for future DB migration
  candidateImportancia: number | null
  alignment: number | null
  contouNoScore: boolean
}

interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  alinhamento: number          // 0–100
  cobertura: number            // 0–100
  detalhesTemas: TemaCandidatoDetalhe[]
  temAlertas: boolean
  alertas: Alerta[]
}
```

---

## Theme Slug Renames (v1 → v2)

Applied in `themes_catalog` (DB), `scripts/lib/groq.ts` (extraction prompt), and `VALID_SLUGS`.

| Old slug | New slug |
|----------|----------|
| `direitos_lgbtqia` | `protecao_minorias` |
| `porte_armas` | `autonomia_individual` |
| `pauta_moral_costumes` | `laicidade_valores` |

**DB migration** must be run manually in Supabase SQL Editor — see the plan at `docs/superpowers/plans/2026-06-30-11-match-v2.md` Task 1 for the exact `UPDATE` statements.
