import 'dotenv/config'
import Groq from 'groq-sdk'

export interface AiProvider {
  name: string
  chat(system: string, user: string): Promise<string | null>
}

// ─── Groq ─────────────────────────────────────────────────────────────────────

function createGroqProvider(): AiProvider | null {
  const key = process.env.GROQ_API_KEY
  if (!key) return null
  const client = new Groq({ apiKey: key })
  const model = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'

  return {
    name: 'groq',
    async chat(system, user) {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = []
      if (system) messages.push({ role: 'system', content: system })
      messages.push({ role: 'user', content: user })
      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        })
        return (completion.choices[0]?.message?.content ?? '').trim() || null
      } catch (err: unknown) {
        const status = (err as { status?: number }).status
        if (status === 429) {
          console.warn(`[ai:groq] Rate limit — model: ${model}`)
          return null
        }
        // Recover partial generation from Groq 400 JSON validation errors
        const failedGen =
          (err as { error?: { error?: { failed_generation?: string } } })
            ?.error?.error?.failed_generation ?? ''
        if (failedGen) {
          const match =
            failedGen.match(/(\{"posicoes"[\s\S]*\})(?:\}?)$/) ??
            failedGen.match(/(\{[\s\S]*"posicoes"[\s\S]*\})(?:\}?)$/) ??
            failedGen.match(/(\[[\s\S]*\])$/)
          if (match) return match[0]
        }
        console.error(`[ai:groq] Error: ${String(err)}`)
        return null
      }
    },
  }
}

// ─── DeepSeek ─────────────────────────────────────────────────────────────────

function createDeepSeekProvider(): AiProvider | null {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) return null
  const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

  return {
    name: 'deepseek',
    async chat(system, user) {
      const messages: Array<{ role: string; content: string }> = []
      if (system) messages.push({ role: 'system', content: system })
      messages.push({ role: 'user', content: user })
      try {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
        })
        if (res.status === 429) {
          console.warn(`[ai:deepseek] Rate limit — model: ${model}`)
          return null
        }
        if (!res.ok) {
          console.error(`[ai:deepseek] HTTP ${res.status}: ${await res.text()}`)
          return null
        }
        interface OAIResponse {
          choices?: Array<{ message?: { content?: string } }>
        }
        const data = (await res.json()) as OAIResponse
        return (data.choices?.[0]?.message?.content ?? '').trim() || null
      } catch (err) {
        console.error(`[ai:deepseek] Error: ${String(err)}`)
        return null
      }
    },
  }
}

// ─── Cerebras ─────────────────────────────────────────────────────────────────

function createCerebrasProvider(): AiProvider | null {
  const key = process.env.CEREBRAS_API_KEY
  if (!key) return null
  const model = process.env.CEREBRAS_MODEL ?? 'llama-3.3-70b'

  return {
    name: 'cerebras',
    async chat(system, user) {
      const messages: Array<{ role: string; content: string }> = []
      if (system) messages.push({ role: 'system', content: system })
      messages.push({ role: 'user', content: user })
      try {
        const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
        })
        if (res.status === 429) {
          console.warn(`[ai:cerebras] Rate limit — model: ${model}`)
          return null
        }
        if (!res.ok) {
          console.error(`[ai:cerebras] HTTP ${res.status}: ${await res.text()}`)
          return null
        }
        interface OAIResponse {
          choices?: Array<{ message?: { content?: string } }>
        }
        const data = (await res.json()) as OAIResponse
        return (data.choices?.[0]?.message?.content ?? '').trim() || null
      } catch (err) {
        console.error(`[ai:cerebras] Error: ${String(err)}`)
        return null
      }
    },
  }
}

// ─── Provider chain ───────────────────────────────────────────────────────────

const PROVIDER_FACTORIES: Record<string, () => AiProvider | null> = {
  groq: createGroqProvider,
  deepseek: createDeepSeekProvider,
  cerebras: createCerebrasProvider,
}

const DEFAULT_ORDER = ['groq', 'deepseek', 'cerebras']

/**
 * Builds the provider chain from env vars.
 * If `order` is provided explicitly, uses that list; otherwise reads `AI_PROVIDER_ORDER`
 * env var (default: groq,deepseek,cerebras).
 * Only providers whose API key is set are included in the returned chain.
 * Exported for testing — pass an explicit `order` after setting process.env to verify ordering.
 */
export function buildProviderChain(order?: string[]): AiProvider[] {
  const resolved = order ??
    (process.env.AI_PROVIDER_ORDER
      ? process.env.AI_PROVIDER_ORDER.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : DEFAULT_ORDER)
  return resolved
    .map(name => PROVIDER_FACTORIES[name]?.())
    .filter((p): p is AiProvider => p != null)
}

/**
 * Sends a chat request through the provider chain with automatic fallback.
 *
 * - On 429 or null from a provider, falls through to the next provider in `chain`.
 * - With `noFallback: true`, only the first provider in `chain` is tried.
 * - Returns null if all providers fail or chain is empty.
 * - Throws if chain is empty (no API keys configured).
 */
export async function chatWithFallback(
  system: string,
  user: string,
  chain: AiProvider[],
  noFallback?: boolean,
): Promise<string | null> {
  if (chain.length === 0) {
    throw new Error(
      '[ai] No AI providers configured. Set at least one of: GROQ_API_KEY, DEEPSEEK_API_KEY, CEREBRAS_API_KEY in scripts/.env',
    )
  }
  const providers = noFallback ? [chain[0]] : chain
  for (const provider of providers) {
    console.info(`[ai] Trying provider: ${provider.name}`)
    const result = await provider.chat(system, user)
    if (result !== null) return result
    console.warn(`[ai] Provider ${provider.name} returned null — trying next...`)
  }
  console.error('[ai] All providers exhausted')
  return null
}
