import Groq from 'groq-sdk'
import 'dotenv/config'

const GROQ_API_KEY = process.env.GROQ_API_KEY
if (!GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY in scripts/.env')

const groq = new Groq({ apiKey: GROQ_API_KEY })

// Primary model (70B, 100K tokens/day). Falls back to the 8B model on rate limit.
const PRIMARY_MODEL = 'llama-3.3-70b-versatile'
// Fallback model (8B, separate daily quota).
const FALLBACK_MODEL = 'llama-3.1-8b-instant'

const VALID_SLUGS = new Set([
  'reforma_tributaria', 'sus_saude_publica', 'privatizacao_estatais',
  'seguranca_publica_estadual', 'educacao_basica', 'meio_ambiente_desmatamento',
  'reforma_previdencia', 'protecao_minorias', 'autonomia_individual',
  'bolsa_familia_transferencia', 'corrupcao_transparencia',
  'politica_economica', 'politica_externa', 'laicidade_valores',
])

export interface PositionEntry {
  temaSlug: string
  posicao: 'favoravel' | 'contrario' | 'neutro' | 'variavel'
  intensidade: number
  justificativa: string
  confianca: number
}

function isValidPosition(entry: unknown): entry is PositionEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const e = entry as Record<string, unknown>
  return (
    typeof e.temaSlug === 'string' &&
    VALID_SLUGS.has(e.temaSlug) &&
    typeof e.posicao === 'string' &&
    ['favoravel', 'contrario', 'neutro', 'variavel'].includes(e.posicao) &&
    typeof e.intensidade === 'number' &&
    e.intensidade >= 1 && e.intensidade <= 5 &&
    typeof e.justificativa === 'string' &&
    typeof e.confianca === 'number' &&
    e.confianca >= 0 && e.confianca <= 1
  )
}

function buildPrompt(candidateName: string, planText: string): string {
  return `
Analise o plano de governo a seguir e identifique as posições do candidato "${candidateName}" sobre os temas listados.
Retorne JSON no formato: { "posicoes": [ ... ] }

Para cada tema com posição clara, inclua no array:
{
  "temaSlug": "slug_exato_da_lista",
  "posicao": "favoravel" ou "contrario" ou "neutro" ou "variavel",
  "intensidade": número de 1 a 5 (1=mencionado brevemente, 3=posição clara, 5=tema central da campanha),
  "justificativa": "trecho ou resumo de até 150 caracteres",
  "confianca": número de 0.0 a 1.0 (sua confiança na classificação)
}

Temas válidos (use apenas estes slugs exatos):
reforma_tributaria, sus_saude_publica, privatizacao_estatais, seguranca_publica_estadual,
educacao_basica, meio_ambiente_desmatamento, reforma_previdencia, protecao_minorias,
autonomia_individual, bolsa_familia_transferencia, corrupcao_transparencia,
politica_economica, politica_externa, laicidade_valores

Regras:
- Omita temas sem posição explícita no texto; nunca invente posições.
- IMPORTANTE: Se o texto não for claramente um programa político ou plano de governo — por exemplo, é uma ata, estatuto partidário, documento de registro legal ou texto sem posições explícitas sobre os temas — retorne { "posicoes": [] } sem nenhuma entrada. Nunca infira posições do contexto geral do partido ou do espectro político.

PLANO DE GOVERNO:
${planText.substring(0, 8000)}
`.trim()
}

function recoverFromFailedGeneration(err: unknown, candidateName: string): string | null {
  const failedGen = (err as { error?: { error?: { failed_generation?: string } } })
    ?.error?.error?.failed_generation ?? ''
  const match = failedGen.match(/(\{"posicoes"[\s\S]*\})(?:\}?)$/) ??
                failedGen.match(/(\{[\s\S]*"posicoes"[\s\S]*\})(?:\}?)$/)
  if (!match) {
    console.error(`[groq] No recoverable JSON for ${candidateName}`)
    return null
  }
  return match[0]
}

async function callGroq(model: string, candidateName: string, planText: string): Promise<string | null> {
  try {
    const completion = await groq.chat.completions.create({
      model,
      messages: [{ role: 'user', content: buildPrompt(candidateName, planText) }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    })
    return (completion.choices[0]?.message?.content ?? '').trim()
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 429) {
      // Rate limit — let caller try next model
      console.warn(`[groq] Rate limit on ${model} for ${candidateName}`)
      return null
    }
    // JSON validation failure (400) — try to recover the partial generation
    return recoverFromFailedGeneration(err, candidateName)
  }
}

export interface ExtractOptions {
  /** When false, skips the 8B fallback model entirely. Use for production ingestion where no data is better than hallucinated data. Default: true */
  allowFallback?: boolean
  /** Minimum confianca score to accept an entry (0–1). Entries below this threshold are discarded. Default: 0 */
  minConfidence?: number
}

/**
 * Extracts political positions from a party program or government plan text.
 * Returns entries validated against known theme slugs and schema constraints.
 * Falls back to a smaller model if the primary model hits its daily rate limit,
 * unless allowFallback is false.
 */
export async function extractPositions(
  candidateName: string,
  planText: string,
  options: ExtractOptions = {},
): Promise<PositionEntry[]> {
  const { allowFallback = true, minConfidence = 0 } = options

  let text = await callGroq(PRIMARY_MODEL, candidateName, planText)

  if (text === null) {
    if (!allowFallback) {
      console.warn(`[groq] Rate limited on primary model for ${candidateName} — fallback disabled, skipping`)
      return []
    }
    console.info(`[groq] Trying fallback model ${FALLBACK_MODEL} for ${candidateName}`)
    text = await callGroq(FALLBACK_MODEL, candidateName, planText)
  }

  if (text === null) {
    console.error(`[groq] Both models failed for ${candidateName}`)
    return []
  }

  let parsed: unknown
  try {
    const raw = JSON.parse(text)
    // Models may use different key names; try common variants before falling back
    parsed = raw.posicoes ?? raw.positions ?? raw['posições'] ?? (Array.isArray(raw) ? raw : null)
  } catch {
    console.error(`[groq] Failed to parse response for ${candidateName}`)
    return []
  }

  if (!Array.isArray(parsed)) {
    console.warn(`[groq] Unexpected response structure for ${candidateName}: ${text.substring(0, 300)}`)
    return []
  }

  const valid = parsed.filter(isValidPosition)
  if (valid.length === 0 && parsed.length > 0) {
    console.warn(`[groq] ${parsed.length} entries rejected by isValidPosition for ${candidateName}. First: ${JSON.stringify(parsed[0])}`)
  }

  return minConfidence > 0 ? valid.filter(e => e.confianca >= minConfidence) : valid
}
