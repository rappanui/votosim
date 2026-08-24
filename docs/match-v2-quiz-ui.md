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

The container is `max-w-4xl`, widened from v2's `max-w-xl` to fit the
`CandidatoCard` detail panel's two-column layout. A single match response
carries every detail — dossier, sources, alerts and derived observations for
every finalist — so the card issues no further requests when expanded.

---

## CandidatoCard (`src/components/CandidatoCard.tsx`)

A composition, not a monolith. The card owns the header, the score bar, the
audit line and the expand toggle; everything else is a child component.

**Collapsed:** `nomeUrna`, `partido · nº numeroUrna · cargo`, two counters
(`⚠ N alertas encontrados` in danger red, `ⓘ N observações encontradas` in
warning orange), the penalized `alinhamento%`, and both coverage metrics
(`cobertura X% · confiança Y%`). Bar color uses the match v3 thresholds —
green ≥55, amber 35–54, orange 20–34, red <20.

The observation counter is omitted entirely at zero; the alert counter always
renders, reading "Nenhum alerta" in gray.

**Expanded:** v3's audit line spans the full width, then a
`md:grid-cols-[1.35fr_1fr]` panel — single column below `md`.

| Side | Component | Renders when |
|------|-----------|--------------|
| left | `TemasPanel` | always |
| right | `CandidatoResumo` | `dossie !== null` |
| right | `AlertasBloco` | `alertas.length > 0` |
| right | `ObservacoesBloco` | `observacoes.length > 0` |
| right | `FontesBloco` | `fontes.length > 0` |

Right-hand blocks are `Acordeao`s, collapsed by default, each showing a count.
`CandidatoResumo` is always open. A block with no data renders nothing.

### Alerts vs. observations

`alertas` carries only accusatory types (`ficha_suja`, `investigacao`,
`polemica`). Everything else becomes an `Observacao`, derived server-side by
`deriveObservacoes`:

| Categoria | Sources |
|-----------|---------|
| `contradicao` | alerts `incoerencia` / `divergencia_espectro`; a theme whose `coerenciaPorTema` is `incoerente`; a dossier whose declared spectrum differs from the inferred one |
| `ressalva` | alerts `ressalva_evidencias`; a theme with `evidencia === 'partido'`; a theme with `baixaConfianca` **and** `evidencia === 'direta'` |

**A theme with `evidencia === 'ausente'` is deliberately not an observation.**
Match v3 already renders it as `○ não encontrado` and already charges it
`P_NAO_INFORMADO` in the score; repeating it here would state one fact twice.

The last `ressalva` row exists because v3 scores a `direta` theme at full
credibility regardless of `confiancaIa`. `baixaConfianca` is computed but
otherwise unused — this block is where it reaches the voter.

### TemasPanel (`src/components/TemasPanel.tsx`)

Holds the five theme states match v3 defines. Themes the voter took a side on
list before neutral ones; the first four show and the rest sit behind a
"Ver os N temas" toggle. Each row carries the icon, `temaNome`, the voter and
candidate labels, the `via partido` and `não revisada` tags, and the position's
`justificativa` below.

Icons and labels are v3's — see `docs/superpowers/specs/2026-08-23-match-v3-scoring-design.md` §7.
