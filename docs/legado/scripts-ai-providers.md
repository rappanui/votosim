# Scripts AI Provider Abstraction

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-08-20
> **Motivo:** Documenta a abstração multi-provedor em `scripts/lib/ai.ts` (Groq/Cerebras) — o arquivo e seu teste foram apagados na Fase A por serem órfãos: o único consumidor já havia sido descartado antes.
> **Substituído por:** nada; o recurso não foi construído.


**Context:** Documents the multi-provider AI abstraction in `scripts/lib/ai.ts`. Read before modifying any script that calls an AI model, or before adding a new provider. The abstraction replaced direct Groq SDK calls in `groq.ts`.

---

## Provider Chain

Three providers are supported, tried in order:

| Priority | Provider  | Model                  | Free tier           |
|----------|-----------|------------------------|---------------------|
| 1st      | Groq      | `llama-3.3-70b-versatile` | ~100K tokens/day |
| 2nd      | DeepSeek  | `deepseek-chat`        | Limited free credits |
| 3rd      | Cerebras  | `llama-3.3-70b`        | Generous free tier  |

No 8B or smaller model fallback exists. If all providers are exhausted without a response, `chatWithFallback` throws rather than degrading silently.

## API

```ts
// scripts/lib/ai.ts

export interface AiProvider {
  name: string
  chat(system: string, user: string): Promise<string | null>
}

export function buildProviderChain(order?: string[]): AiProvider[]
export function chatWithFallback(
  system: string,
  user: string,
  chain: AiProvider[],
  noFallback?: boolean
): Promise<string>
```

## `buildProviderChain`

Reads `AI_PROVIDER_ORDER` env var (comma-separated, e.g. `"groq,deepseek"`) or uses the default order `['groq', 'deepseek', 'cerebras']`. Filters to only providers whose API key env var is set:

| Provider  | Required env var    |
|-----------|---------------------|
| Groq      | `GROQ_API_KEY`      |
| DeepSeek  | `DEEPSEEK_API_KEY`  |
| Cerebras  | `CEREBRAS_API_KEY`  |

Accepts an explicit `order` argument to override the env var (used in tests).

Unknown provider names are silently dropped (filter uses `!= null`, catching both `null` and `undefined`).

## `chatWithFallback`

Tries providers in chain order. Falls through to the next provider if `chat()` returns `null`. Throws `Error('All providers failed')` if the chain is exhausted.

When `noFallback: true`, throws immediately on the first `null` response without trying the next provider. Scripts use this via `!allowFallback`.

## Integration in `groq.ts`

`scripts/lib/groq.ts` builds the chain once at module load and delegates all LLM calls through `chatWithFallback`:

```ts
import { buildProviderChain, chatWithFallback } from './ai.js'

const _chain = buildProviderChain()

// inside extractPositions:
const response = await chatWithFallback('', buildPrompt(...), _chain, !allowFallback)

// inside enrichPositions:
const response = await chatWithFallback(ENRICHMENT_SYSTEM_PROMPT, userMessage, _chain, !allowFallback)
```

The Groq SDK is imported only inside `ai.ts`. `groq.ts` has no direct SDK dependency.

## Environment Setup

Copy `scripts/.env.example` to `scripts/.env` and fill in at least `GROQ_API_KEY`. DeepSeek and Cerebras keys are optional — the chain skips providers whose key is absent.

`AI_PROVIDER_ORDER` is optional. Omit it to use the default Groq → DeepSeek → Cerebras order.
