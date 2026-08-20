import 'dotenv/config'
import { buildProviderChain, chatWithFallback } from './ai.js'

// Build the provider chain once at module load.
// On 429 or error, chatWithFallback falls through to the next provider in the chain.
const _chain = buildProviderChain()

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

export function isValidPosition(entry: unknown): entry is PositionEntry {
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

export interface ExtractOptions {
  /** When false, only the first provider in the AI chain is tried — no cross-provider fallback. Default: true */
  allowFallback?: boolean
  /** Minimum confianca score to accept an entry (0–1). Default: 0 */
  minConfidence?: number
}

/**
 * Extracts political positions from a party program or government plan text.
 * Returns entries validated against known theme slugs and schema constraints.
 * Falls back through the provider chain (Groq → DeepSeek → Cerebras) on rate limit,
 * unless allowFallback is false (then only the first configured provider is tried).
 */
export async function extractPositions(
  candidateName: string,
  planText: string,
  options: ExtractOptions = {},
): Promise<PositionEntry[]> {
  const { allowFallback = true, minConfidence = 0 } = options

  const text = await chatWithFallback(
    '',
    buildPrompt(candidateName, planText),
    _chain,
    !allowFallback,
  )

  if (text === null) {
    console.error(`[groq] extractPositions: all providers failed for ${candidateName}`)
    return []
  }

  let parsed: unknown
  try {
    const raw = JSON.parse(text)
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
    console.warn(
      `[groq] ${parsed.length} entries rejected by isValidPosition for ${candidateName}. First: ${JSON.stringify(parsed[0])}`,
    )
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
  /** When false, only the first provider in the AI chain is tried — no cross-provider fallback. Default: true */
  allowFallback?: boolean
  /** Minimum confianca_ia score to accept an entry (0–1). Default: 0 */
  minConfidence?: number
}

/**
 * Extracts political positions using the framing-aware enrichment prompt.
 * Uses a system message, understands afirmacao_questionario framing, and returns
 * EnrichmentEntry[] with fontes[] included.
 * Falls back through the provider chain (Groq → DeepSeek → Cerebras) on rate limit
 * unless allowFallback is false.
 */
export async function enrichPositions(
  candidateName: string,
  inputText: string,
  options: EnrichOptions = {},
): Promise<EnrichmentEntry[]> {
  const { allowFallback = true, minConfidence = 0 } = options
  const userMessage = buildEnrichmentUserMessage(candidateName, inputText)

  const text = await chatWithFallback(
    ENRICHMENT_SYSTEM_PROMPT,
    userMessage,
    _chain,
    !allowFallback,
  )

  if (text === null) {
    console.error(`[groq] enrichPositions: all providers failed for ${candidateName}`)
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
    console.warn(
      `[groq] enrichPositions: ${parsed.length} entries rejected by validator for ${candidateName}. First: ${JSON.stringify(parsed[0])}`,
    )
  }

  return minConfidence > 0 ? valid.filter(e => e.confianca_ia >= minConfidence) : valid
}
