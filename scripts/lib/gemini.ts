import { GoogleGenerativeAI } from '@google/generative-ai'
import 'dotenv/config'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY in scripts/.env')

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

/** Theme slugs valid in themes_catalog — Gemini output is validated against this set. */
const VALID_SLUGS = new Set([
  'reforma_tributaria', 'sus_saude_publica', 'privatizacao_estatais',
  'seguranca_publica_estadual', 'educacao_basica', 'meio_ambiente_desmatamento',
  'reforma_previdencia', 'direitos_lgbtqia', 'porte_armas',
  'bolsa_familia_transferencia', 'corrupcao_transparencia',
  'politica_economica', 'politica_externa', 'pauta_moral_costumes',
])

interface PositionEntry {
  temaSlug: string
  posicao: 'favoravel' | 'contrario' | 'neutro' | 'variavel'
  justificativa: string
}

/** Validates that a Gemini-returned position uses a known slug and posicao value. */
function isValidPosition(entry: unknown): entry is PositionEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const e = entry as Record<string, unknown>
  return (
    typeof e.temaSlug === 'string' &&
    VALID_SLUGS.has(e.temaSlug) &&
    typeof e.posicao === 'string' &&
    ['favoravel', 'contrario', 'neutro', 'variavel'].includes(e.posicao) &&
    typeof e.justificativa === 'string'
  )
}

/**
 * Extracts political positions from a candidate's government plan text.
 * Returns only entries that match known theme slugs.
 * Gemini has no web access — it extracts only from the provided text.
 */
export async function extractPositions(
  candidateName: string,
  planText: string,
): Promise<PositionEntry[]> {
  const prompt = `
Analise o plano de governo a seguir e identifique as posições do candidato "${candidateName}" sobre cada um dos 14 temas listados.

Temas: reforma_tributaria, sus_saude_publica, privatizacao_estatais, seguranca_publica_estadual, educacao_basica, meio_ambiente_desmatamento, reforma_previdencia, direitos_lgbtqia, porte_armas, bolsa_familia_transferencia, corrupcao_transparencia, politica_economica, politica_externa, pauta_moral_costumes

Para cada tema onde encontrar uma posição clara, retorne:
{
  "temaSlug": "slug_exato",
  "posicao": "favoravel" | "contrario" | "neutro" | "variavel",
  "justificativa": "trecho ou resumo da posição (máximo 150 caracteres)"
}

Retorne apenas JSON array. Se não houver posição clara para um tema, omita-o.
Não inclua temas que não aparecem no plano. Nunca invente posições.

PLANO DE GOVERNO:
${planText.substring(0, 8000)}
`.trim()

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^```json\n?/, '').replace(/\n?```$/, ''))
  } catch {
    console.error(`[gemini] Failed to parse response for ${candidateName}`)
    return []
  }

  if (!Array.isArray(parsed)) return []
  return parsed.filter(isValidPosition)
}
