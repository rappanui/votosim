# VotoSim — Edge Function AI Provider Chain

**Context:** Documents the fallback AI chain used by `match-candidatos` to compute match scores. Read before implementing or modifying how the Edge Function calls any AI model. For pipeline script AI (Groq for PDF extraction), see `docs/12_ai_extraction.md` — those are independent contexts with different providers and different concerns.

---

## Why Gemini Was Replaced

The original plan used Gemini 2.0 Flash via Google AI Studio REST API. All tested models returned 429 with `limit: 0`, meaning the free tier is literally zero requests per day — not exhausted, structurally unavailable:

| Model | Result |
|-------|--------|
| `gemini-2.0-flash` | 429, limit: 0 RPD |
| `gemini-2.0-flash-lite` | 429, limit: 0 RPD |
| `gemini-1.5-flash` | 404 — endpoint removed |

The Edge Function uses the same REST API with the same type of key, so it has the same constraint.

---

## Provider Chain

```
callAI()
  ├─ Groq  (llama-3.3-70b-versatile) — 8s timeout
  │    └─ 429 / timeout / error → next
  ├─ Cerebras  (llama-3.3-70b) — 8s timeout
  │    └─ error → next
  ├─ Mistral  (mistral-small-latest) — 8s timeout
  │    └─ error → next
  └─ scoreWithoutAI() — mathematical fallback, always succeeds
```

**Budget:** 3 providers × 8s + processing = ~26s max. Edge Function timeout is 30s. The mathematical fallback is synchronous and always fits within budget.

---

## Provider Reference

| | Groq | Cerebras | Mistral |
|--|------|----------|---------|
| **Base URL** | `https://api.groq.com/openai/v1/chat/completions` | `https://api.cerebras.ai/v1/chat/completions` | `https://api.mistral.ai/v1/chat/completions` |
| **Model** | `llama-3.3-70b-versatile` | `llama-3.3-70b` | `mistral-small-latest` |
| **Env var** | `GROQ_API_KEY` | `CEREBRAS_API_KEY` | `MISTRAL_API_KEY` |
| **Free tier** | 14,400 req/day, 1,000 RPM | ~1,000 RPM, no daily cap | ~1 req/s, no daily cap |
| **Latency** | 200–600ms | 200–800ms | 1–3s |
| **Auth header** | `Bearer ${GROQ_API_KEY}` | `Bearer ${CEREBRAS_API_KEY}` | `Bearer ${MISTRAL_API_KEY}` |

All three use identical OpenAI-compatible request format.

---

## Request Format (Shared Across All Providers)

```json
{
  "model": "<provider-model>",
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT>" },
    { "role": "user",   "content": "<match data as JSON string>" }
  ],
  "response_format": { "type": "json_object" },
  "temperature": 0.1
}
```

Auth: `Authorization: Bearer <KEY>` — identical for all three.

**Groq requirement:** The word "json" must appear in the messages body when using `json_object` mode. It is present via `"Retorne um objeto JSON"` in the prompt instructions.

---

## Provider-Specific Error Handling

The request body and auth are identical — the differences are entirely in how each provider reports errors.

### Groq — `json_validate_failed` Recovery

Groq has a unique failure mode: when the model outputs prose before the JSON, the full response fails validation. The error response carries `failed_generation` with the raw model output, which contains the valid JSON embedded in it.

```
HTTP 400 body:
{
  "error": {
    "error": {
      "code": "json_validate_failed",
      "failed_generation": "Aqui está o resultado:\n{\"cargos\": [...]}"
    }
  }
}
```

Recovery: match `/\{[\s\S]*\}/` on `failed_generation` to extract the JSON. This is handled transparently inside `callGroq()` — callers never see this error.

HTTP 429 → advance to next provider.

### Cerebras — Clean Error Format

No `json_validate_failed` quirk. Error body:
```
{ "error": { "type": "...", "message": "...", "code": "..." } }
```

HTTP 429 or 5xx → advance to next provider.

### Mistral — Rate-Limited Free Tier

Free tier is throttled to ~1 req/s. Under concurrent load, 429 responses are expected and normal — this provider is last in the chain precisely because of this. Error body varies:
```
{ "message": "...", "request_id": "..." }
// or
{ "detail": "..." }
```

HTTP 429 or any error → advance to mathematical fallback.

---

## Request Contract

The Edge Function validates the body at entry before any DB or AI call. Missing or wrong-typed fields return **400**, not 500.

```typescript
interface MatchRequest {
  estado: string          // required — UF code (e.g. 'SP')
  municipio: string
  faixaEtaria: string
  respostas: RespostaUsuario[]  // required — must be an array (may be empty)
  sessionToken: string
  timestamp: string
}

interface RespostaUsuario {
  temaSlug: string
  resposta: 1 | 2 | 3 | 4 | 5
  concordancia: 'concordo' | 'neutro' | 'discordo'
  intensidade: 1 | 2 | 3 | 4 | 5
}
```

**Validation rules (returns 400 if violated):**
- `body.estado` must be truthy
- `body.respostas` must be an `Array` (`Array.isArray` check)

> When testing via the Supabase Dashboard "Invoke" UI, always include both `estado` and `respostas` in the body. Omitting either returns 400 — without these guards, the function throws a runtime error deeper in the call stack.

---

## Expected AI Response Schema

All three providers receive the same `formatoEsperado` and must return:

```typescript
interface MatchResult {
  cargos: Array<{
    cargo: string  // 'presidente' | 'governador' | 'senador' | 'deputado_federal' | 'deputado_estadual'
    candidatos: Array<{
      politicianId: string
      nomeUrna: string
      partido: string
      score: number           // integer 0–100
      temasAlinhados: string[]    // theme slugs where voter and candidate align
      temasDivergentes: string[]  // theme slugs where they diverge
    }>
  }>
  totalCandidatosAnalisados: number
  estado: string
}
```

Alerts are **never sent to the AI** — they are fetched from `v_candidate_alerts` and attached in `index.ts` after the AI call completes.

### Alert fields in the final response

`v_candidate_alerts` returns snake_case columns. The Edge Function maps them to camelCase before including in the response so the frontend receives the expected contract:

| DB column (`AlertRow`) | Response field (`Alerta`) |
|------------------------|--------------------------|
| `fonte_url` | `fonteUrl` |
| `badge_cor` | `badgeCor` |
| `politician_id` | _(stripped — not sent to frontend)_ |
| `tipo`, `severidade`, `titulo`, `descricao` | same names |

The mapping is applied in `attachAlerts()` via `alertRowToAlerta()` in `index.ts`.

---

## Score Sem IA — Mathematical Fallback

When all three AI providers fail, alignment is computed directly from DB data without any AI call.

**Map candidate position to 1–5 voter scale:**

```
posicao=favoravel, intensidade=5 → 5.0   (strongly pro)
posicao=favoravel, intensidade=3 → 4.2
posicao=favoravel, intensidade=1 → 3.4
posicao=neutro or variavel       → 3.0
posicao=contrario, intensidade=1 → 2.6
posicao=contrario, intensidade=3 → 1.8
posicao=contrario, intensidade=5 → 1.0   (strongly against)
```

Formula: `candidateScale = 3 + (sign) * (intensidade / 5) * 2`  
where sign is `+1` for `favoravel`, `-1` for `contrario`, `0` for `neutro`/`variavel`.

**Per-theme alignment:** `1 - |voterAnswer - candidateScale| / 4`  
Range: `0.0` (polar opposite) → `1.0` (perfect match).

**Overall score:** `round(mean(perThemeAlignments) * 100)`  
Only themes where both voter and candidate have data are counted.

**Classification:** aligned if `alignment >= 0.75`; divergent if `alignment <= 0.25`.

---

## DB Schema Note

`politician_positions` stores `theme_id` (UUID FK to `themes_catalog`), not a slug string. The Edge Function needs slugs to build the prompt and to run `scoreWithoutAI`. Resolution: load a UUID→slug reverse map from `themes_catalog` at request start, remap all positions before use.

```typescript
const themeMap = await loadThemeSlugMap(supabase)  // Map<uuid, slug>
const positions = rawPositions.map(p => ({
  ...p,
  themeSlug: themeMap.get(p.theme_id) ?? '',
})).filter(p => p.themeSlug !== '')
```

---

## Required Supabase Secrets

Set in Dashboard → Edge Functions → Secrets:

| Secret | Source | Notes |
|--------|--------|-------|
| `GROQ_API_KEY` | `console.groq.com` | Same value as `scripts/.env` |
| `CEREBRAS_API_KEY` | `inference.cerebras.ai` | Free developer account, no credit card |
| `MISTRAL_API_KEY` | `console.mistral.ai` → La Plateforme | Free tier |
| `SERVICE_ROLE_KEY` | Supabase Dashboard → API | Unchanged |
| `ELECTION_YEAR` | Manual | `'2022'` or `'2026'` |

`GEMINI_API_KEY` is no longer used anywhere and should be deleted from secrets.
