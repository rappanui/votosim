# Match v3 — Evidence-Aware Scoring

**Context:** The scoring model the app ships today. It replaces the algorithm in
`docs/match-v2-scoring.md`, which let a candidate documented on 5 of 14 themes score
90% and outrank better-documented ones. Read this before touching
`supabase/functions/match-candidatos/ai-providers.ts`, `index.ts`,
`src/components/CandidatoCard.tsx`, or `src/lib/types.ts`. The voter data model and
theme slugs in the v2 document are still current; only its scoring section is dead.

---

## Deploy order

This branch creates a hard ordering requirement that nothing enforces at
runtime — read this before deploying any of the three pieces:

1. **Migration** — `docs/base/12_neutro_motivo.sql` (adds
   `politician_positions.neutro_motivo`).
2. **Edge Function** — `supabase/functions/match-candidatos/`.
3. **Next.js app.**

`index.ts:108` selects `neutro_motivo` unconditionally, with no fallback: on
an environment where the migration has not run yet, every quiz submission
returns a 500. And if the app ships ahead of the function, the card's audit
line renders `undefined%` and `NaN%` instead of real numbers, because it
reads fields the deployed function does not yet send.

This is a documentation note only — there is no runtime check that enforces
the order, and adding one is a larger change than this note, out of scope
here.

---

## The defect this fixes

A real quiz run returned `VETERINÁRIO WILSON GRASSI — 90%, cobertura 36%`, with 9 of
14 themes rendered as an identical `—`. Three problems compounded:

1. **Unknown themes were free.** They were dropped from both the numerator and the
   denominator, so the headline was a mean over whichever themes happened to be
   documented. Ranking used that mean alone.
2. **`neutro` never meant neutral.** The enrichment prompt told the model to write
   `neutro` whenever its confidence fell below 0.70, so the value merged "found
   nothing" with "has a stance that does not answer the affirmation" with "genuinely
   ambivalent". Every `neutro` row in the database had `confianca_ia <= 0.50`.
3. **The party fallback was dead code.** `party_positions` had zero rows and was only
   fetched for legislative cargos; the motivating case was a presidential candidate.

## Evidence levels

Each theme the voter took a side on gets one level and a credibility factor:

| Level | Source | Credibility | Counts toward coverage |
|---|---|---|---|
| `direta` | candidate `favoravel` / `contrario`, or an audited neutral | 1.0 | yes |
| `partido` | party program position | 0.6 | partially |
| `ausente` | `neutro` with motivo `nao_encontrado` or none, `variavel`, no row | 0 | no |

`partido` is implemented and unit-tested but **inert**: no party has positions yet.

> **Before populating `party_positions`, fix this:** `buildPartyResults` in
> `index.ts` calls `scoreCandidato` without the `temaNomes` map, so legenda entries
> would render raw theme slugs instead of human names. Harmless while the table is
> empty; a visible defect the moment it is not.
>
> **Same bucket, a second gap:** `index.ts:154`'s `party_positions` select also
> omits `neutro_motivo` and `justificativa` — correctly, because migration 12
> (`docs/base/12_neutro_motivo.sql`) only altered `politician_positions`, and
> neither column exists on `party_positions`. The consequence: a party-sourced
> neutral can never be audited (there is no motivo to distinguish `nao_encontrado`
> from `nao_responde`/`ambivalente`), and a party theme row renders no
> justification. Fix both gaps together before `party_positions` gets real rows.

## The arithmetic

With `w = importancia / 3` over the voter's non-neutral answers:

```
massaTotal    = Σ wᵢ
massaApurada  = Σ wᵢ · credibilidadeᵢ
confianca     = massaApurada / massaTotal
apurado       = Σ (wᵢ · credibilidadeᵢ · alignmentᵢ) / massaApurada
alinhamento   = confianca · apurado + (1 − confianca) · P_NAO_INFORMADO
```

`P_NAO_INFORMADO = 0.10`, a named constant in `ai-providers.ts`, mirrored as
`P_NAO_INFORMADO_PCT = 10` in `src/lib/types.ts` for display copy.

The last line is an exact identity, and the card shows it to the voter as an audit
line. **`alinhamento` is computed from the already-rounded `confianca` and `apurado`
on purpose**, so the headline reproduces exactly from the two numbers printed beside
it. That costs up to a point of precision and buys a number a voter can verify by
hand. A property test over 200 seeds asserts the identity with zero tolerance.

Worked example — Grassi, uniform importance, 5 audited themes averaging 0.90:

```
confianca   = 5/14 = 0.357
alinhamento = 0.357 × 0.90 + 0.643 × 0.10 = 0.388 → 39%
```

### The ladder

Per-theme contribution, worst to best:

| | Situation | Value |
|---|---|---|
| 4 | audited, opposes the voter | 0.0 |
| 3 | **not audited** | **0.10** |
| 2 | audited, no side (`nao_responde`, `ambivalente`) | 0.5 |
| 1 | audited, agrees | 0.75–1.0 by `intensidade` |

An audited neutral needs no special case: `posicaoToScale` returns 3, and
`1 − |5−3|/4` is exactly 0.5 for a favourable or a contrary voter alike.

### Two coverage metrics

- **`cobertura`** — plain fraction of audited themes, over the themes this voter took
  a side on. Unweighted. Not voter-independent: answering `neutro` removes a theme
  from this denominator too.
- **`confiancaResultado`** — the same, weighted by the voter's declared importance.
  This is the term in the formula.

Their divergence is information no single number carries: high `cobertura` with low
`confiancaResultado` means "we know a lot about this candidate, just not about what
you prioritise". Do not confuse `confiancaResultado` (per candidate) with
`confiancaIa` (per theme, the model's confidence in one classification).

## `neutro_motivo`

`politician_positions.neutro_motivo` (migration in `docs/base/12_neutro_motivo.sql`)
records which of the three facts a `neutro` row is:

| Value | Meaning | Alignment |
|---|---|---|
| `nao_encontrado` | searched, found nothing | `P_NAO_INFORMADO` |
| `nao_responde` | has a stance on the theme, orthogonal to the affirmation | 0.5 |
| `ambivalente` | contradictory or explicitly conditional | 0.5 |

**NULL is read as `nao_encontrado`.** Every row ingested before 2026-08-24 is NULL,
and no backfill was run — see below. `scripts/ingest-research.ts` and the enrichment
prompt now write the field at the source, so the data heals forward as candidates are
researched.

### Why no backfill

Measured against live data with the voter profile that motivated this work:
reclassifying the ~15% of `neutro` rows that are `nao_responde` moves scores by
**4.1–4.6 points on average** (14 at most), reorders positions four and below, and
never changes a top three. Grassi goes 39% → 47%. The arithmetic above already does
the work; the backfill is a refinement, not a prerequisite.

If it is ever wanted, write it in the pattern this project already uses —
`build-brief` → a Claude Code research agent → a script that validates and applies an
`id → motivo` mapping idempotently. **Not** on `scripts/lib/ai.ts`: that module is an
orphan of the pre-SP-0 pipeline, nothing current imports it, and its Groq and Cerebras
model defaults name models that no longer exist.

## What the voter sees

The card shows the penalised `alinhamento` as its headline, `cobertura` and
`confiança` beneath it, and on expand an audit line plus a row per theme:

| Icon | Label | Meaning |
|---|---|---|
| `✓` `─` `✗` | favorável / contrário | audited: aligned, partial, divergent |
| `◐` | neutro · não responde à afirmação | audited, no side |
| `○` | **não encontrado** | not audited — this is what costs |

Each row also renders its stored `justificativa`, so a blank theme states what was
searched and what was found rather than showing a bare dash.

> **`justificativa` is display-only, and is fetched in the wrong place.**
> `fetchPositions` selects it for every candidate in the state, while at most 23
> survive `sortAndLimitCargos` — roughly 95% of the text is fetched and discarded on
> every quiz submission. Nothing in the scoring path computes on it: it is a pure
> pass-through at `ai-providers.ts:312`, and there is no runtime classifier in the
> Edge Function. Moving it to a post-ranking fetch is owned by the candidate-detail
> work; the removal and the replacement must land together, or theme rows silently
> lose their explanation. See `docs/superpowers/notes/2026-08-24-reply-justificativa-in-the-prefilter-query.md`.

`/sobre` documents the formula, both metrics, and — required, not optional — the fact
that penalising silence is a deliberate editorial choice that favours candidates who
publish explicit platforms over deliberately vague ones. Coverage measures how
explicit a candidate's programme is, not how hard we searched: Lula has 13 audited
positions from 1 source, Eduardo Paes 8 from 13.
