# Match Party Fallback

**Context:** Documents how candidate positions sourced from their party (not the candidate directly) are handled in match scoring and displayed to voters. Read before touching `ai-providers.ts`, `CandidatoCard.tsx`, or `TemaCandidatoDetalhe`.

---

## What It Is

When a candidate has no direct position on a theme, the Edge Function falls back to the party's position. This fallback is flagged so the frontend can inform the voter that the displayed position reflects the party, not the individual candidate.

## Type Contract

```ts
// src/lib/types.ts
export interface TemaCandidatoDetalhe {
  temaSlug: string
  voterPosicao: VoterPosicao
  voterImportancia: Importancia
  candidatePosicao: number | null
  candidateImportancia: number | null
  alignment: number | null
  contouNoScore: boolean
  posicaoViaPartido: boolean   // true when candidatePosicao came from party, not candidate
}
```

`posicaoViaPartido: true` means the candidate had no direct stance on this theme; the party's position was substituted.

## Edge Function Logic

In `scoreCandidato` (`supabase/functions/match-candidatos/ai-providers.ts`), party positions are passed as an optional parameter:

```ts
function scoreCandidato(
  candidato: Candidato,
  respostas: RespostaUsuario[],
  partyPositions?: PositionWithSlug[]
): ScoreResult
```

For each voter answer, if the candidate has no `politician_positions` row for that theme but the party does, the party's position is used as `candidatePosicao`. The flag is set:

```ts
posicaoViaPartido: true   // set when party fallback is used AND candidate had no real stance
```

Party positions are fetched in `index.ts` alongside alerts (inside `Promise.all`) and passed through `FallbackData`:

```ts
// FallbackData includes:
partyPositionsByParty?: Map<string, PositionWithSlug[]>
```

`scoreWithoutAI` calls `scoreCandidato` with `data.partyPositionsByParty?.get(c.partido_atual)`.

## Frontend Display

`CandidatoCard.tsx` renders a badge next to each theme row when `posicaoViaPartido` is true:

```tsx
{d.posicaoViaPartido && (
  <span className="rounded bg-blue-50 px-1 py-0.5 text-xs font-medium text-blue-600">
    partido
  </span>
)}
```

Voter and candidate positions are shown as text labels (not numeric values):

```
você: favorável · candidato: favorável  [partido]
```

The `voterLabel(posicao: VoterPosicao)` helper in `CandidatoCard.tsx` maps `'favoravel' → 'favorável'`, `'contrario' → 'contrário'`, `'neutro' → 'neutro'`.
