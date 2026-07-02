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

// ─── Framing-aware enrichment (Tier 3 pipeline) ──────────────────────────────

export interface EnrichmentEntry {
  temaSlug: string
  posicao: 'favoravel' | 'contrario' | 'neutro'
  intensidade: number
  justificativa: string
  confianca_ia: number
  fontes: Array<{ tipo: string; descricao: string; url: string | null; data: string; confiabilidade: number }>
}

export function isValidEnrichmentEntry(entry: unknown): entry is EnrichmentEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const e = entry as Record<string, unknown>
  return (
    typeof e.temaSlug === 'string' &&
    VALID_SLUGS.has(e.temaSlug) &&
    typeof e.posicao === 'string' &&
    ['favoravel', 'contrario', 'neutro'].includes(e.posicao) &&
    typeof e.intensidade === 'number' &&
    e.intensidade >= 1 && e.intensidade <= 5 &&
    typeof e.justificativa === 'string' &&
    typeof e.confianca_ia === 'number' &&
    e.confianca_ia >= 0 && e.confianca_ia <= 1 &&
    Array.isArray(e.fontes)
  )
}

const ENRICHMENT_SYSTEM_PROMPT = `Você é um analista político especializado em eleições brasileiras. Sua tarefa é interpretar as posições públicas de um candidato e mapeá-las em um formato estruturado.

Dado o texto sobre um candidato, produza um JSON com a posição dele em cada um dos 14 temas do VotoSim.

REGRA CRÍTICA: Leia a afirmação de cada tema com atenção. Você deve determinar se o candidato CONCORDA ou DISCORDA daquela afirmação específica — não do tema em geral.

Exemplos de armadilhas:
- "reforma_previdencia": a afirmação pede regras MAIS FLEXÍVEIS (menor idade mínima). Bolsonaro AUMENTOU os requisitos → contrario.
- "politica_economica": a afirmação pede MAIS participação estatal. Liberais são contrario.
- "politica_externa": a afirmação pede prioridade ao Ocidente (EUA, UE). Multilateralistas são contrario.

RUBRICA:
- posicao: "favoravel" = concorda com a afirmação; "contrario" = discorda; "neutro" = sem posição clara
- intensidade (1-5): 5=política central da campanha, 4=posição explícita e consistente, 3=mencionado no programa/coalizão, 2=inferido do contexto, 1=sinal fraco
- confianca_ia (0.0-1.0): 0.90+=múltiplas fontes independentes, 0.80-0.90=uma fonte forte, 0.70-0.80=inferência de histórico, <0.70=use "neutro"

OS 14 TEMAS (use o slug exato):
1. reforma_tributaria: "O sistema tributário deve ser reformado para simplificar e unificar os impostos."
2. sus_saude_publica: "O governo deve aumentar o investimento público no SUS como principal forma de garantir saúde."
3. privatizacao_estatais: "O governo deve vender participações em estatais como Petrobras, Correios e Eletrobras."
4. seguranca_publica_estadual: "O combate à criminalidade deve priorizar endurecimento de penas e ampliação do efetivo policial."
5. educacao_basica: "O governo deve aumentar o investimento em escolas públicas e valorização de professores."
6. meio_ambiente_desmatamento: "O governo deve endurecer a fiscalização ambiental, mesmo que limite atividades econômicas rurais."
7. reforma_previdencia: "O governo deve tornar a aposentadoria mais FÁCIL, reduzindo a idade mínima e os requisitos atuais."
8. protecao_minorias: "O governo deve criar e ampliar leis de proteção contra discriminação de grupos minoritários."
9. autonomia_individual: "O governo deve ampliar o direito à arma de fogo para uso pessoal."
10. bolsa_familia_transferencia: "O governo deve ampliar programas de transferência de renda como o Bolsa Família."
11. corrupcao_transparencia: "O governo deve fortalecer os órgãos de controle para ampliar a punição por corrupção."
12. politica_economica: "O governo deve adotar MAIOR participação estatal em investimentos estratégicos."
13. politica_externa: "O Brasil deve priorizar alianças com países ocidentais (EUA, UE) em detrimento de BRICS/China/Rússia."
14. laicidade_valores: "O governo deve adotar legislação baseada em princípios laicos e científicos, independente de posições religiosas."

FORMATO DE SAÍDA (array JSON puro, sem texto antes ou depois):
[
  {
    "temaSlug": "slug_exato",
    "posicao": "favoravel" | "contrario" | "neutro",
    "intensidade": 1-5,
    "justificativa": "Trecho ou resumo objetivo da evidência (max 200 chars)",
    "confianca_ia": 0.70-0.95,
    "fontes": [{"tipo": "ai_interpretacao", "descricao": "fonte usada", "url": null, "data": "ano", "confiabilidade": 0.88}]
  }
]

Omita temas sem evidência documental. Nunca invente posições.`

export function buildEnrichmentUserMessage(candidateName: string, inputText: string): string {
  const MAX_CHARS = 120_000
  const truncated = inputText.length > MAX_CHARS
    ? inputText.substring(0, MAX_CHARS) + '\n[TEXT TRUNCATED]'
    : inputText
  return `Candidato: ${candidateName}\n\n--- TEXTO ---\n${truncated}`
}

export interface EnrichOptions {
  allowFallback?: boolean
  minConfidence?: number
}

async function callGroqEnrich(
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  try {
    const completion = await groq.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    })
    return (completion.choices[0]?.message?.content ?? '').trim()
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 429) {
      console.warn(`[groq] Rate limit on ${model}`)
      return null
    }
    return recoverFromFailedGeneration(err, userMessage.substring(0, 40))
  }
}

/**
 * Extracts political positions using the framing-aware enrichment prompt.
 * Unlike extractPositions(), this uses a system message, understands afirmacao_questionario
 * framing, and returns EnrichmentEntry[] with fontes[] included.
 */
export async function enrichPositions(
  candidateName: string,
  inputText: string,
  options: EnrichOptions = {},
): Promise<EnrichmentEntry[]> {
  const { allowFallback = true, minConfidence = 0 } = options
  const userMessage = buildEnrichmentUserMessage(candidateName, inputText)

  let text = await callGroqEnrich(PRIMARY_MODEL, ENRICHMENT_SYSTEM_PROMPT, userMessage)
  if (text === null && allowFallback) {
    console.info(`[groq] enrichPositions: trying fallback model for ${candidateName}`)
    text = await callGroqEnrich(FALLBACK_MODEL, ENRICHMENT_SYSTEM_PROMPT, userMessage)
  }
  if (text === null) {
    console.error(`[groq] enrichPositions: both models failed for ${candidateName}`)
    return []
  }

  let parsed: unknown
  try {
    const raw = JSON.parse(text)
    parsed = Array.isArray(raw) ? raw : (raw.posicoes ?? raw.positions ?? null)
  } catch {
    console.error(`[groq] enrichPositions: failed to parse JSON for ${candidateName}`)
    return []
  }

  if (!Array.isArray(parsed)) {
    console.warn(`[groq] enrichPositions: unexpected structure for ${candidateName}`)
    return []
  }

  const valid = parsed.filter(isValidEnrichmentEntry)
  if (valid.length === 0 && parsed.length > 0) {
    console.warn(`[groq] enrichPositions: ${parsed.length} entries rejected by validator for ${candidateName}. First: ${JSON.stringify(parsed[0])}`)
  }

  return minConfidence > 0 ? valid.filter(e => e.confianca_ia >= minConfidence) : valid
}
