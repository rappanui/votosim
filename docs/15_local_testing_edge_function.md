# VotoSim — Local Testing: Edge Functions

**Context:** Explains how to test the `match-candidatos` Edge Function locally without deploying to Supabase. Read before modifying the Edge Function if you want to validate changes quickly. For the AI provider chain and fallback logic, see `docs/14_edge_function_ai.md`.

---

## Why Not `supabase functions serve`

The Supabase CLI's `functions serve` command requires Docker. In WSL2 without Docker Desktop, `supabase start` fails with `supabase start is not running`. The solution is to run the function directly with **Deno**, which is already the runtime Supabase Edge Functions use internally.

---

## Setup: Install Deno

```bash
curl -fsSL https://deno.land/install.sh | sh
# Binary lands at: ~/.deno/bin/deno
```

---

## Files

| File | Purpose |
|------|---------|
| `supabase/functions/dev.sh` | Starts `match-candidatos` on `localhost:8000` using Deno; reads secrets from `.env` |
| `supabase/functions/test-match.sh` | Sends a test POST to the running server; accepts `[estado]` arg (default `SP`) |
| `supabase/functions/.env` | Secrets file for local dev — **never committed** (in `.gitignore`) |
| `match-candidatos/ai-providers.test.ts` | Unit tests for `posicaoToScale`, `scoreCandidato`, `scoreWithoutAI` |
| `match-candidatos/index.test.ts` | Unit tests for `groupBy`, `countSimpleMatches`, `prefilterCandidates`, `attachAlerts`, `sortAndLimitCargos`, `buildPrompt` |

---

## `.env` Format

```bash
# supabase/functions/.env — never commit
SUPABASE_URL=https://<ref>.supabase.co
SERVICE_ROLE_KEY=eyJ...
GROQ_API_KEY=gsk_...
CEREBRAS_API_KEY=csk-...
MISTRAL_API_KEY=...
ELECTION_YEAR=2022
```

---

## Running Unit Tests (no network, no server)

Tests cover all pure functions — no Supabase calls, no AI provider calls, no network.

```bash
~/.deno/bin/deno test --allow-net --allow-env supabase/functions/match-candidatos/
```

Expected output:

```
running 13 tests from ./ai-providers.test.ts  → 13 ok
running 15 tests from ./index.test.ts          → 15 ok
ok | 28 passed | 0 failed
```

---

## Running the Function Locally (integration)

**Terminal 1 — start the server:**
```bash
bash supabase/functions/dev.sh
# Logs: Starting match-candidatos on http://localhost:8000
```

**Terminal 2 — send a test request:**
```bash
bash supabase/functions/test-match.sh SP
# or: bash supabase/functions/test-match.sh RJ
```

The test request sends 6 voter answers for SP and pipes the response through `jq`. A successful response returns a JSON object with `cargos`, `totalCandidatosAnalisados`, and `estado`.

---

## Why `import.meta.main`

`index.ts` contains:

```typescript
if (import.meta.main) {
  Deno.serve(handler)
}
```

This guard ensures `Deno.serve()` is called only when the file is run directly (`deno run index.ts`). When test files import from `index.ts`, the server does not start — the pure functions are available as named exports and the test runner controls the process.

Without this guard, importing `index.ts` in a test would start a Deno HTTP server, which would block the test runner.

---

## Test Architecture

Tests are split into two files that mirror the two source files:

- **`ai-providers.test.ts`** — tests functions that have no dependency on Supabase: `posicaoToScale`, `scoreCandidato`, `scoreWithoutAI`
- **`index.test.ts`** — tests functions that are pure (take arguments, return values, no I/O): `groupBy`, `countSimpleMatches`, `prefilterCandidates`, `buildPrompt`, `attachAlerts`, `sortAndLimitCargos`

Functions that require Supabase (`fetchCandidates`, `fetchPositions`, `fetchAlerts`, `loadThemeSlugMap`) are not unit-tested — they are internal to the handler and validated via the integration test (`test-match.sh`).

---

## Testing via Supabase Dashboard

Use the Dashboard's "Invoke" UI (Edge Functions → match-candidatos → Invoke). Both `estado` and `respostas` are required — omitting either returns HTTP 400.

Minimum valid body:
```json
{
  "estado": "SP",
  "municipio": "São Paulo",
  "faixaEtaria": "25 a 34 anos",
  "sessionToken": "test-dashboard",
  "timestamp": "2026-06-29T00:00:00Z",
  "respostas": [
    { "temaSlug": "sus_saude_publica",        "resposta": 5, "concordancia": "concordo", "intensidade": 5 },
    { "temaSlug": "privatizacao_estatais",     "resposta": 1, "concordancia": "discordo", "intensidade": 5 },
    { "temaSlug": "educacao_basica",           "resposta": 5, "concordancia": "concordo", "intensidade": 4 },
    { "temaSlug": "meio_ambiente_desmatamento","resposta": 5, "concordancia": "concordo", "intensidade": 4 },
    { "temaSlug": "corrupcao_transparencia",   "resposta": 5, "concordancia": "concordo", "intensidade": 5 }
  ]
}
```

---

## Deploy

After validating locally:

```bash
supabase functions deploy match-candidatos --no-verify-jwt
```

Secrets must be set in the Supabase Dashboard (Edge Functions → Secrets) — they are not read from `.env` in production. See `docs/14_edge_function_ai.md#required-supabase-secrets` for the full list.
