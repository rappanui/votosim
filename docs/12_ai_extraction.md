# VotoSim — AI Providers and Extraction Logic (Pipeline Scripts)

**Context:** This document covers the AI provider used by the **pipeline scripts** (`extract-positions.ts`) to extract political positions from government plan PDFs. For the Edge Function match logic (`match-candidatos`), which uses a different provider chain entirely, see `docs/14_edge_function_ai.md`.

---

## Two AI Contexts

| Context | Provider | Model | Purpose |
|---------|----------|-------|---------|
| Edge Function (`match-candidatos`) | None — deterministic math | — | Real-time match scoring; reproducible, auditable; see `docs/14_edge_function_ai.md` |
| Pipeline scripts (`extract-positions`, `ingest-party-programs`) | Groq | `llama-3.3-70b-versatile` | Batch extraction of positions from government plan PDFs |

These are deliberately separate environments (Deno vs. Node.js) with different rate limits and latency requirements. The Edge Function uses no AI — see `docs/14_edge_function_ai.md` for the scoring formula.

---

## Pipeline Scripts: Groq (Llama 3.3 70B → 8B fallback)

The scripts use `groq-sdk` via npm (`scripts/lib/groq.ts`).

**Model selection:**

| Model | Role | Daily limit |
|-------|------|-------------|
| `llama-3.3-70b-versatile` | Primary — more accurate, refuses to hallucinate from non-political text | 100K tokens/day |
| `llama-3.1-8b-instant` | Fallback — triggered on 429 for `extract-positions` only | Separate quota |

When the primary model returns HTTP 429, `extractPositions` can automatically retry with the 8B model — but only if `allowFallback: true` (see `ExtractOptions` below). `ingest-party-programs` sets `allowFallback: false` because the 8B model hallucinates positions from non-political documents. Both models can be exhausted in a large batch run; if both fail (or fallback is disabled), the party/candidate is skipped and logged.

**Why Groq instead of Gemini for scripts:**

| Reason | Detail |
|--------|--------|
| Gemini free tier is 0 RPD | `gemini-2.0-flash` free tier: literally 0 requests per day |
| `gemini-1.5-flash` removed | Returns 404 on `v1beta` endpoint |
| Groq free tier is genuinely free | 100K tokens/day for 70B, separate quota for 8B |
| Scale is small | ~280 TSE PDFs + 28 party programs — well within free tier per day |

**`GROQ_API_KEY`:** Set in `scripts/.env` only. Never in `supabase/functions/` or `.env.local`.

---

## `ExtractOptions` — Controlling Extraction Safety

`extractPositions(name, text, options?)` in `scripts/lib/groq.ts` accepts:

| Option | Default | Description |
|--------|---------|-------------|
| `allowFallback` | `true` | When `false`, skips 8B fallback on rate limit. Use `false` for production ingestion — no data is better than hallucinated data |
| `minConfidence` | `0` | Minimum `confianca` score (0–1) to accept an entry. `ingest-party-programs` uses `0.6` |

**Why these options exist:** The 8B model hallucinates plausible-sounding political positions from legal registration documents (TSE `REGISTRO DE PARTIDO POLÍTICO` forms). The 70B model correctly returns `{ "posicoes": [] }` for the same documents. `ingest-party-programs` locks both options to prevent bad data from entering `party_positions`.

`extract-positions` keeps defaults (`allowFallback: true`, `minConfidence: 0`) because it processes official TSE government plan PDFs which are genuine political documents.

---

## Extraction Prompt

Source: `scripts/lib/groq.ts`, `extractPositions()` function.

```
Input: First 8,000 chars of PDF text (parsed by pdf2json)

Asks for: { "posicoes": [...] }

Per position:
  temaSlug   — one of 14 valid slugs (validated before insert)
  posicao    — favoravel | contrario | neutro | variavel
  intensidade — 1–5 (1 = briefly mentioned, 5 = signature campaign issue)
  justificativa — ≤150 chars excerpt
  confianca  — 0.0–1.0 (model's self-reported confidence)
```

The prompt includes an explicit instruction: if the document is not clearly a political program (e.g., it's a legal registration form, statute, or registration decision), the model must return `{ "posicoes": [] }` and not infer positions from the party's general ideology.

Positions failing validation (unknown slug, out-of-range values, or `confianca` below `minConfidence`) are silently dropped before DB write.

**Response key variants:** The parser accepts `posicoes`, `positions`, or `posições` as the top-level array key — models occasionally respond in English despite a Portuguese prompt.

---

## DB Mapping (`politician_positions`)

The plan text never stores raw candidate names or plan text. What gets persisted:

```typescript
{
  politician_id,
  theme_id,        // UUID from themes_catalog (loaded at startup via loadThemesMap())
  posicao,         // 'favoravel' | 'contrario' | 'neutro' | 'variavel'
  intensidade,     // SMALLINT 1–5
  fontes: [{
    tipo: 'tse_pdf',
    descricao: justificativa,   // ≤150 chars
    url: null,
    data: '2022',
    confiabilidade: confianca,
  }],
  gerado_por_ia: true,
  validado: confianca >= 0.85,  // auto-validated only when confidence is high
  confianca_ia: confianca,
}
```

Conflict key: `(politician_id, theme_id)` — one position per politician per theme.

---

## Known Groq Quirks

**1. `response_format: { type: 'json_object' }` requires "json" in the prompt body.** Groq rejects the request otherwise with a 400 error. The extraction prompt includes "Retorne JSON no formato:" to satisfy this.

**2. `json_validate_failed` (400 error).** Groq occasionally outputs prose text before the JSON object, making the full response invalid JSON. The Groq error response includes a `failed_generation` field containing the model's raw output. The script recovers from this:

```typescript
} catch (err: unknown) {
  const failedGen = (err as {...})?.error?.error?.failed_generation ?? ''
  const match = failedGen.match(/(\{"posicoes"[\s\S]*\})(?:\}?)$/)
  text = match?.[1] ?? '{}'
}
```

**3. PDF quality varies.** Some PDFs are scanned images with no selectable text — `pdf2json` returns empty string. These candidates are logged as `[SKIPPED] Could not extract text` and skipped.

---

## PDF Parsing

Library: `pdf2json` (CommonJS, loaded via `createRequire`).

`pdf-parse` v2 was tried first and abandoned — it has no default export in ESM context and its `PDFParse` class API is incompatible with the Node.js ESM module format used by the scripts.

Text is extracted from all pages by concatenating `decodeURIComponent(text.R[0].T)` for each text element. For large PDFs (e.g., Haddad's 6.8 MB plan), this yields ~550,000 characters; only the first 8,000 are sent to Groq.
