# Quiz Response Buttons

**Context:** Documents the quiz UX model — how a voter answers each theme, how importance is captured, and how unanswered themes are handled in the match. Read before touching `QuizCard.tsx`, `quiz/page.tsx`, or any code that reads `RespostaUsuario`.

---

## Voter Response Model

Each quiz card asks the voter's position on a theme. The voter picks one of three buttons:

| Button label | `VoterPosicao` value |
|--------------|----------------------|
| Discordo     | `'contrario'`        |
| Neutro       | `'neutro'`           |
| Concordo     | `'favoravel'`        |

This replaced the previous 1–5 slider. The type `Resposta = 1 | 2 | 3 | 4 | 5` was removed; `VoterPosicao = 'favoravel' | 'contrario' | 'neutro'` is now canonical.

```ts
// src/lib/types.ts
export type VoterPosicao = 'favoravel' | 'contrario' | 'neutro'

export interface RespostaUsuario {
  temaSlug: string
  posicao: VoterPosicao
  importancia: Importancia
}
```

## Importance Slider

The importance slider (1–5) is always visible — it appears on every card regardless of which button was clicked, or whether one was clicked at all. There is no gating on importance visibility.

The rationale: if the voter selects "Neutro" without touching the slider, that is a valid answered state. Hiding importance until a button is clicked would prevent voters from setting importance on "Neutro" responses.

## Unanswered Themes

Themes the voter skips entirely (no button clicked) are excluded from the match. Only themes in `respostas[]` — the array of `RespostaUsuario` — influence candidate scoring.

```ts
// QuizContext.tsx
respostas: RespostaUsuario[]  // only themes the voter actively answered
```

The match gate requires at least 3 answered themes (`respostas.length >= 3`) before the results page is enabled.

## QuizCard Props

```ts
interface QuizCardProps {
  tema: Tema
  initialPosicao?: VoterPosicao   // restores prior answer on back-navigation
  initialImportancia?: Importancia
  onChange: (posicao: VoterPosicao | null, importancia: Importancia) => void
}
```

`onChange` receives `null` for `posicao` if the voter has not yet selected a button (e.g. on first render before interaction). The parent (`quiz/page.tsx`) only writes to `respostas` when `posicao !== null`.

## Match Scoring

In the Edge Function (`supabase/functions/match-candidatos/`), `RespostaUsuario.posicao` is a string. Comparisons use string equality:

```ts
if (r.posicao === 'neutro') { /* voter is neutral — skip scoring for this theme */ }
const voterScale = r.posicao === 'favoravel' ? 5 : 1
```
