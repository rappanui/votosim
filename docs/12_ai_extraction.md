# VotoSim — AI Providers and Extraction Logic (Pipeline Scripts)

**Context:** This document covers the AI provider used by the **pipeline scripts** (`extract-positions.ts`) to extract political positions from government plan PDFs. For the Edge Function match logic (`match-candidatos`), which uses a different provider chain entirely, see `docs/14_edge_function_ai.md`.

---

## Two AI Contexts

| Context | Provider | Model | Purpose |
|---------|----------|-------|---------|
| Edge Function (`match-candidatos`) | Google Gemini | `gemini-2.0-flash` | Real-time match scoring during user session |
| Pipeline scripts (`extract-positions`) | Groq | `llama-3.3-70b-versatile` | Batch extraction of positions from government plans |

These are deliberately separate — different environments (Deno vs. Node.js), different rate limits, and different latency requirements.

---

## Edge Function: Gemini 2.0 Flash

Calls Gemini via raw `fetch` to the REST endpoint `/v1beta/models/gemini-2.0-flash:generateContent`. This runs inside Supabase's Deno runtime where npm packages don't work.

**Configuration (Supabase secrets):**
- `GEMINI_API_KEY` — Google AI Studio key
- `ELECTION_YEAR` — `'2022'` or `'2026'`; controls which view (`v_candidates_2022` vs `v_candidates_2026`) the function queries

**Why Gemini for the Edge Function:** Deno-compatible via fetch; fast enough for a 30s session timeout; returns structured JSON with `responseMimeType: 'application/json'`.

---

## Pipeline Scripts: Groq (Llama 3.3 70B)

The `extract-positions.ts` script uses `groq-sdk` via npm (`scripts/lib/gemini.ts` — file is misnamed, actually calls Groq).

**Why Groq instead of Gemini for scripts:**

| Reason | Detail |
|--------|--------|
| Gemini free tier is 0 RPD for scripts | `gemini-2.0-flash` via REST API requires billing enabled; free tier limit is literally 0 |
| `gemini-1.5-flash` removed | Returns 404 on `v1beta` endpoint — no longer available |
| Groq free tier is genuinely free | 14,400 req/day, 1,000 RPM for `llama-3.3-70b-versatile` — no credit card required |
| Scale is small | ~280 total PDFs nationally (only GOVERNADOR + PRESIDENTE submit plans) — well within free tier |

**`GROQ_API_KEY`:** Set in `scripts/.env` only. Never in `supabase/functions/` or `.env.local`.

---

## Extraction Prompt

Source: `scripts/lib/gemini.ts`, `extractPositions()` function.

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

Positions failing validation (unknown slug, out-of-range values) are silently dropped before DB write.

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
