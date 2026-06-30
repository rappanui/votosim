# Match v2 — Quiz and Results UI

**Context:** Describes the single-page quiz and results page introduced in Match v2, including component behavior, state flow, and routing. Read this before touching `src/app/quiz/`, `src/app/resultados/`, `src/components/QuizCard.tsx`, `src/components/CandidatoCard.tsx`, or `src/context/QuizContext.tsx`.

---

## Routing

| Path | Page | Purpose |
|------|------|---------|
| `/` | `app/page.tsx` | Redirects to `/quiz` |
| `/quiz` | `app/quiz/page.tsx` | Single-page quiz |
| `/resultados` | `app/resultados/page.tsx` | Candidate results |

**Deleted in v2:** `/questionario`, `/resultado`, `/revisao`, `/perfil`.

---

## QuizContext

Simplified state — no more `perfil`, `questionarioIndex`, `setQuestionarioIndex`, `setPerfil`.

```typescript
interface QuizState {
  estado: string                          // UF selected by voter
  respostas: RespostaUsuario[]
  setEstado: (estado: string) => void
  setResposta: (resposta: RespostaUsuario) => void  // upserts by temaSlug
  resetQuiz: () => void                   // clears estado + respostas
}
```

---

## Quiz Page (`/quiz`)

Single-page layout with three zones:

**Sticky header** — estado `<select>` (27 UFs) + `{answered}/{total}` counter. Estado persists in context.

**Scrollable grid** — 2-column responsive grid of `QuizCard`s. Cards are loaded from `themes_catalog` (Supabase, filtered by `exibir_no_quiz = true`, ordered by `ordem_exibicao`).

**Sticky footer** — "Ver candidatos →" button, disabled until:
- `estado` is non-empty, AND
- at least 3 answers with `resposta !== 3` (non-neutral)

On submit: calls `router.push('/resultados')`.

---

## QuizCard (`src/components/QuizCard.tsx`)

One card per quiz theme. Props:

```typescript
interface QuizCardProps {
  tema: TemaQuestionario
  initialResposta?: Resposta
  initialImportancia?: Importancia
  onChange: (resposta: Resposta, importancia: Importancia) => void
}
```

**Interaction rules:**
- Slider default: `3` (neutral). Card starts visually muted (`border-gray-200 bg-gray-50`).
- `importancia` pills are **hidden** until the slider is touched (`touched = false` initially).
- On first slider move: `touched = true`, card border changes to `border-highlight`, pills appear.
- `importancia` default: `2` (medium). Only revealed after touch.
- ⓘ button toggles `notaEducativa` + `contextoQuestionario` inline.

---

## Results Page (`/resultados`)

Client component. On mount:

1. Reads `estado` and `respostas` from `useQuiz()`.
2. If `estado` is empty → `router.push('/quiz')` immediately.
3. POSTs to `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/match-candidatos` with `Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}`.
4. Shows spinner while loading; shows error UI with "Voltar ao questionário" on failure.
5. Renders `CandidatoCard` per candidate, grouped by cargo.

---

## CandidatoCard (`src/components/CandidatoCard.tsx`)

Displays one candidate. Key elements:

- **Header:** `nomeUrna`, `partido`, large `alinhamento%`, small `cobertura%`
- **Bar:** color-coded by `alinhamento` — green ≥75, amber 50–74, orange 25–49, red <25
- **Alerts section:** renders when `temAlertas`. Each alert shows `<AlertaBadge>` + `alerta.titulo` side-by-side.
- **Transparency toggle:** "▼ Ver detalhes por tema" expands a per-theme list.

### Transparency panel

Filters out themes where `voterResposta === 3 && voterImportancia < 2` (neutral and low-importance).

Icons per theme:

| Icon | Condition |
|------|-----------|
| `✓` | `alignment >= 0.75` |
| `─` | `0.25 < alignment < 0.75` |
| `✗` | `alignment <= 0.25` |
| `○` | `alignment === null` (no candidate data) |
| `●` | `voterResposta === 3 && voterImportancia >= 2` (curious: voter neutral but interested) |

Each row shows `você: {voterResposta} · candidato: {label}` where label is `favorável`, `contrário`, `neutro`, or `—`.
