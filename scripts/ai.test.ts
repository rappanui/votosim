import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildProviderChain, chatWithFallback, type AiProvider } from './lib/ai.js'

// Helper: set env vars, call fn, restore
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('buildProviderChain: returns empty array when no provider keys are set', () => {
  withEnv(
    {
      GROQ_API_KEY: undefined,
      DEEPSEEK_API_KEY: undefined,
      CEREBRAS_API_KEY: undefined,
      AI_PROVIDER_ORDER: undefined,
    },
    () => {
      const chain = buildProviderChain()
      assert.equal(chain.length, 0)
    },
  )
})

test('buildProviderChain: includes groq when GROQ_API_KEY is set', () => {
  withEnv(
    {
      GROQ_API_KEY: 'test-key',
      DEEPSEEK_API_KEY: undefined,
      CEREBRAS_API_KEY: undefined,
      AI_PROVIDER_ORDER: undefined,
    },
    () => {
      const chain = buildProviderChain()
      assert.equal(chain.length, 1)
      assert.equal(chain[0].name, 'groq')
    },
  )
})

test('buildProviderChain: includes deepseek when DEEPSEEK_API_KEY is set', () => {
  withEnv(
    {
      GROQ_API_KEY: undefined,
      DEEPSEEK_API_KEY: 'test-key',
      CEREBRAS_API_KEY: undefined,
      AI_PROVIDER_ORDER: undefined,
    },
    () => {
      const chain = buildProviderChain()
      assert.equal(chain.length, 1)
      assert.equal(chain[0].name, 'deepseek')
    },
  )
})

test('buildProviderChain: includes cerebras when CEREBRAS_API_KEY is set', () => {
  withEnv(
    {
      GROQ_API_KEY: undefined,
      DEEPSEEK_API_KEY: undefined,
      CEREBRAS_API_KEY: 'test-key',
      AI_PROVIDER_ORDER: undefined,
    },
    () => {
      const chain = buildProviderChain()
      assert.equal(chain.length, 1)
      assert.equal(chain[0].name, 'cerebras')
    },
  )
})

test('buildProviderChain: respects AI_PROVIDER_ORDER — cerebras before groq', () => {
  withEnv(
    {
      GROQ_API_KEY: 'gk',
      DEEPSEEK_API_KEY: undefined,
      CEREBRAS_API_KEY: 'ck',
      AI_PROVIDER_ORDER: 'cerebras,groq',
    },
    () => {
      const chain = buildProviderChain()
      assert.equal(chain.length, 2)
      assert.equal(chain[0].name, 'cerebras')
      assert.equal(chain[1].name, 'groq')
    },
  )
})

test('buildProviderChain: explicit order parameter overrides AI_PROVIDER_ORDER env var', () => {
  withEnv(
    {
      GROQ_API_KEY: 'gk',
      DEEPSEEK_API_KEY: 'dk',
      CEREBRAS_API_KEY: 'ck',
      AI_PROVIDER_ORDER: 'groq,deepseek,cerebras',
    },
    () => {
      const chain = buildProviderChain(['cerebras', 'deepseek', 'groq'])
      assert.equal(chain.length, 3)
      assert.equal(chain[0].name, 'cerebras')
      assert.equal(chain[1].name, 'deepseek')
      assert.equal(chain[2].name, 'groq')
    },
  )
})

test('buildProviderChain: skips unknown provider names gracefully', () => {
  withEnv(
    {
      GROQ_API_KEY: 'gk',
      DEEPSEEK_API_KEY: undefined,
      CEREBRAS_API_KEY: undefined,
      AI_PROVIDER_ORDER: 'groq,gemini,openrouter',
    },
    () => {
      const chain = buildProviderChain()
      assert.equal(chain.length, 1)
      assert.equal(chain[0].name, 'groq')
    },
  )
})

test('buildProviderChain: all three providers included when all keys set', () => {
  withEnv(
    {
      GROQ_API_KEY: 'gk',
      DEEPSEEK_API_KEY: 'dk',
      CEREBRAS_API_KEY: 'ck',
      AI_PROVIDER_ORDER: undefined,
    },
    () => {
      const chain = buildProviderChain()
      assert.equal(chain.length, 3)
      assert.deepEqual(chain.map(p => p.name), ['groq', 'deepseek', 'cerebras'])
    },
  )
})

test('chatWithFallback: throws when chain is empty', async () => {
  await assert.rejects(
    () => chatWithFallback('sys', 'user', []),
    /No AI providers configured/,
  )
})

test('chatWithFallback: returns first provider result when successful', async () => {
  const mockA: AiProvider = { name: 'mockA', chat: async () => '{"result":"A"}' }
  const mockB: AiProvider = { name: 'mockB', chat: async () => '{"result":"B"}' }
  const result = await chatWithFallback('sys', 'user', [mockA, mockB])
  assert.equal(result, '{"result":"A"}')
})

test('chatWithFallback: falls through to next provider on null', async () => {
  const mockA: AiProvider = { name: 'mockA', chat: async () => null }
  const mockB: AiProvider = { name: 'mockB', chat: async () => '{"result":"B"}' }
  const result = await chatWithFallback('sys', 'user', [mockA, mockB])
  assert.equal(result, '{"result":"B"}')
})

test('chatWithFallback: noFallback stops after first provider even on null', async () => {
  const mockA: AiProvider = { name: 'mockA', chat: async () => null }
  const mockB: AiProvider = { name: 'mockB', chat: async () => '{"result":"B"}' }
  const result = await chatWithFallback('sys', 'user', [mockA, mockB], true)
  assert.equal(result, null)
})

test('chatWithFallback: returns null when all providers return null', async () => {
  const mockA: AiProvider = { name: 'mockA', chat: async () => null }
  const mockB: AiProvider = { name: 'mockB', chat: async () => null }
  const result = await chatWithFallback('sys', 'user', [mockA, mockB])
  assert.equal(result, null)
})
