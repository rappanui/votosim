import Groq from 'groq-sdk'
import 'dotenv/config'

const GROQ_API_KEY = process.env.GROQ_API_KEY
if (!GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY in scripts/.env')

const groq = new Groq({ apiKey: GROQ_API_KEY })
const MODEL = 'llama-3.3-70b-versatile'

const VALID_SLUGS = new Set([
  'reforma_tributaria', 'sus_saude_publica', 'privatizacao_estatais',
  'seguranca_publica_estadual', 'educacao_basica', 'meio_ambiente_desmatamento',
  'reforma_previdencia', 'direitos_lgbtqia', 'porte_armas',
  'bolsa_familia_transferencia', 'corrupcao_transparencia',
  'politica_economica', 'politica_externa', 'pauta_moral_costumes',
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

/**
 * Extracts political positions from a candidate's government plan text.
 * Returns entries validated against known theme slugs and schema constraints.
 */
export async function extractPositions(
  candidateName: string,
  planText: string,
): Promise<PositionEntry[]> {
  const prompt = `
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
educacao_basica, meio_ambiente_desmatamento, reforma_previdencia, direitos_lgbtqia,
porte_armas, bolsa_familia_transferencia, corrupcao_transparencia,
politica_economica, politica_externa, pauta_moral_costumes

Regras: omita temas sem posição clara no texto; nunca invente posições.

PLANO DE GOVERNO:
${planText.substring(0, 8000)}
`.trim()

  let text: string
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    })
    text = (completion.choices[0]?.message?.content ?? '').trim()
  } catch (err: unknown) {
    // Groq rejects responses where the model adds prose before the JSON.
    // The failed_generation field still contains the JSON we need.
    const failedGen = (err as { error?: { error?: { failed_generation?: string } } })
      ?.error?.error?.failed_generation ?? ''
    // Extract the last JSON object (the one containing "posicoes")
    const match = failedGen.match(/(\{"posicoes"[\s\S]*\})(?:\}?)$/) ??
                  failedGen.match(/(\{[\s\S]*"posicoes"[\s\S]*\})(?:\}?)$/)
    if (!match) {
      console.error(`[groq] No recoverable JSON for ${candidateName}`)
      return []
    }
    text = match[0]
  }

  let parsed: unknown
  try {
    const raw = JSON.parse(text)
    parsed = raw.posicoes ?? raw
  } catch {
    console.error(`[groq] Failed to parse response for ${candidateName}`)
    return []
  }

  if (!Array.isArray(parsed)) return []
  return parsed.filter(isValidPosition)
}
