/// <reference lib="deno.ns" />
// ─── Exported types ────────────────────────────────────────────────────────────

export interface RespostaUsuario {
  temaSlug: string
  posicao: 'favoravel' | 'contrario' | 'neutro'  // voter's explicit position
  importancia: 1 | 2 | 3                          // voter weight: 1=low · 2=medium · 3=high
}

export interface MatchRequest {
  estado: string
  respostas: RespostaUsuario[]
  sessionToken: string
  timestamp: string
}

export interface CandidatoRow {
  politician_id: string
  nome_urna: string
  partido_atual: string
  cargo: string
}

export interface PositionWithSlug {
  politician_id: string
  themeSlug: string
  posicao: string
  intensidade: number
  confiancaIa?: number  // 0.0–1.0; absent for pre-SP-1 rows that never wrote it
}

/**
 * Below this, an AI-written position is flagged to the voter as unreviewed.
 * Positions publish with no human curation (unlike alerts under Rule B of
 * docs/base/04_schema_alerts.md), so this is the only signal a voter gets
 * that a specific classification is weaker than the rest.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.75

export interface TemaCandidatoDetalhe {
  temaSlug: string
  voterPosicao: 'favoravel' | 'contrario' | 'neutro'
  voterImportancia: 1 | 2 | 3
  // Typed numeric for forward-compat with planned candidate schema migration (see spec §8).
  // This iteration: converted from DB categorical via posicaoToScale(); null = no data.
  candidatePosicao: number | null
  candidateImportancia: number | null  // DB intensidade — platform centrality, display only
  alignment: number | null             // 0.0–1.0; null when voter neutro or no real candidate data
  contouNoScore: boolean
  posicaoViaPartido: boolean           // true when candidatePosicao is sourced from the party program, not the candidate directly
  baixaConfianca: boolean              // true when a real AI-written stance has confiancaIa < LOW_CONFIDENCE_THRESHOLD
}

export interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  alinhamento: number        // 0–100
  cobertura: number          // 0–100
  detalhesTemas: TemaCandidatoDetalhe[]
  temAlertas: boolean
  alertas: unknown[]
  isParty?: boolean
}

export interface MatchResult {
  cargos: Array<{ cargo: string; candidatos: CandidatoResultado[] }>
  totalCandidatosAnalisados: number
  estado: string
}

export interface FallbackData {
  respostas: RespostaUsuario[]
  candidates: CandidatoRow[]
  positions: PositionWithSlug[]
  estado: string
  partyPositionsByParty?: Map<string, PositionWithSlug[]>  // keyed by partido_atual sigla
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface ProviderConfig {
  name: string
  url: string
  apiKey: string | undefined
  model: string
}

interface OpenAICompatResponse {
  choices: Array<{ message: { content: string } }>
}

class ProviderError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`${providerName} HTTP ${status}`)
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_TIMEOUT_MS = 8_000

const SYSTEM_PROMPT =
  'Você é um analisador de alinhamento político imparcial. Computa percentuais de alinhamento temático entre posições de eleitores e candidatos. Nunca recomenda votos. Responde apenas com JSON válido, sem markdown, sem texto extra.'

const GROQ_CONFIG: ProviderConfig = {
  name: 'groq',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  apiKey: Deno.env.get('GROQ_API_KEY'),
  model: 'llama-3.3-70b-versatile',
}

const CEREBRAS_CONFIG: ProviderConfig = {
  name: 'cerebras',
  url: 'https://api.cerebras.ai/v1/chat/completions',
  apiKey: Deno.env.get('CEREBRAS_API_KEY'),
  model: 'llama-3.3-70b',
}

const MISTRAL_CONFIG: ProviderConfig = {
  name: 'mistral',
  url: 'https://api.mistral.ai/v1/chat/completions',
  apiKey: Deno.env.get('MISTRAL_API_KEY'),
  model: 'mistral-small-latest',
}

// ─── Shared OpenAI-compatible caller ──────────────────────────────────────────

function buildRequestBody(config: ProviderConfig, userContent: string): string {
  return JSON.stringify({
    model: config.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  })
}

async function callOpenAICompat(config: ProviderConfig, userContent: string): Promise<string> {
  if (!config.apiKey) throw new ProviderError(config.name, 0, 'API key not configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: buildRequestBody(config, userContent),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ProviderError(config.name, res.status, body)
    }
    const data = await res.json() as OpenAICompatResponse
    return data.choices[0].message.content
  } finally {
    clearTimeout(timer)
  }
}

// ─── Provider implementations ──────────────────────────────────────────────────

function tryRecoverGroqJson(err: ProviderError): string | null {
  if (err.status !== 400) return null
  type Body = { error?: { error?: { code?: string; failed_generation?: string } } }
  const inner = (err.body as Body)?.error?.error
  if (inner?.code !== 'json_validate_failed') return null
  const match = (inner.failed_generation ?? '').match(/\{[\s\S]*\}/)
  return match?.[0] ?? null
}

async function callGroq(userContent: string): Promise<string> {
  try {
    return await callOpenAICompat(GROQ_CONFIG, userContent)
  } catch (err: unknown) {
    if (err instanceof ProviderError) {
      const recovered = tryRecoverGroqJson(err)
      if (recovered) return recovered
    }
    throw err
  }
}

async function callCerebras(userContent: string): Promise<string> {
  return callOpenAICompat(CEREBRAS_CONFIG, userContent)
}

async function callMistral(userContent: string): Promise<string> {
  return callOpenAICompat(MISTRAL_CONFIG, userContent)
}

// ─── Deterministic scoring (no AI) ────────────────────────────────────────────

// Maps politician posicao+intensidade to a 1–5 scale.
// Retained until candidate schema migrates to numeric posicao (see spec §8 — deferred).
export function posicaoToScale(posicao: string, intensidade: number): number {
  if (posicao === 'favoravel') return Math.min(5, 3 + (intensidade / 5) * 2)
  if (posicao === 'contrario') return Math.max(1, 3 - (intensidade / 5) * 2)
  return 3
}

export function scoreCandidato(
  respostas: RespostaUsuario[],
  positions: PositionWithSlug[],
  partyPositions?: PositionWithSlug[],
): { alinhamento: number; cobertura: number; detalhesTemas: TemaCandidatoDetalhe[] } {
  const posMap = new Map(positions.map(p => [p.themeSlug, p]))
  const partyPosMap = new Map((partyPositions ?? []).map(p => [p.themeSlug, p]))

  let weightedSum = 0
  let totalWeight = 0
  let totalTemas = 0
  let coveredTemas = 0
  const detalhesTemas: TemaCandidatoDetalhe[] = []

  for (const r of respostas) {
    const candidatePos = posMap.get(r.temaSlug)
    const partyPos = candidatePos === undefined ? partyPosMap.get(r.temaSlug) : undefined
    const effectivePos = candidatePos ?? partyPos
    const posicaoViaPartido = candidatePos === undefined && partyPos !== undefined

    const hasRealStance = effectivePos !== undefined &&
      effectivePos.posicao !== 'neutro' &&
      effectivePos.posicao !== 'variavel'
    const candidatePosicao = hasRealStance
      ? posicaoToScale(effectivePos!.posicao, effectivePos!.intensidade)
      : null
    const candidateImportancia = effectivePos ? effectivePos.intensidade : null
    // Absence of confiancaIa is not itself a low-confidence claim — pre-SP-1
    // rows (2022 seed, party-proxy fallback) never wrote this column.
    const baixaConfianca = hasRealStance &&
      effectivePos!.confiancaIa !== undefined &&
      effectivePos!.confiancaIa < LOW_CONFIDENCE_THRESHOLD

    if (r.posicao === 'neutro') {
      detalhesTemas.push({
        temaSlug: r.temaSlug,
        voterPosicao: r.posicao,
        voterImportancia: r.importancia,
        candidatePosicao,
        candidateImportancia,
        alignment: null,
        contouNoScore: false,
        posicaoViaPartido: posicaoViaPartido && hasRealStance,
        baixaConfianca,
      })
      continue
    }

    totalTemas++

    let alignment: number | null = null
    let contouNoScore = false

    if (hasRealStance) {
      coveredTemas++
      const voterScale = r.posicao === 'favoravel' ? 5 : 1
      alignment = 1 - Math.abs(voterScale - candidatePosicao!) / 4
      const weight = r.importancia / 3
      weightedSum += alignment * weight
      totalWeight += weight
      contouNoScore = true
    }

    detalhesTemas.push({
      temaSlug: r.temaSlug,
      voterPosicao: r.posicao,
      voterImportancia: r.importancia,
      candidatePosicao,
      candidateImportancia,
      alignment,
      contouNoScore,
      posicaoViaPartido: posicaoViaPartido && hasRealStance,
      baixaConfianca,
    })
  }

  return {
    alinhamento: totalWeight === 0 ? 0 : Math.round((weightedSum / totalWeight) * 100),
    cobertura: totalTemas === 0 ? 0 : Math.round((coveredTemas / totalTemas) * 100),
    detalhesTemas,
  }
}

export function scoreWithoutAI(data: FallbackData): MatchResult {
  const byCandidate = new Map<string, PositionWithSlug[]>()
  for (const p of data.positions) {
    const list = byCandidate.get(p.politician_id) ?? []
    list.push(p)
    byCandidate.set(p.politician_id, list)
  }

  const byCargo = new Map<string, CandidatoResultado[]>()
  for (const c of data.candidates) {
    const partyPositions = data.partyPositionsByParty?.get(c.partido_atual)
    const { alinhamento, cobertura, detalhesTemas } = scoreCandidato(
      data.respostas,
      byCandidate.get(c.politician_id) ?? [],
      partyPositions,
    )
    const resultado: CandidatoResultado = {
      politicianId: c.politician_id,
      nomeUrna: c.nome_urna,
      partido: c.partido_atual,
      alinhamento,
      cobertura,
      detalhesTemas,
      temAlertas: false,
      alertas: [],
    }
    const list = byCargo.get(c.cargo) ?? []
    list.push(resultado)
    byCargo.set(c.cargo, list)
  }

  return {
    cargos: [...byCargo.entries()].map(([cargo, candidatos]) => ({ cargo, candidatos })),
    totalCandidatosAnalisados: data.candidates.length,
    estado: data.estado,
  }
}

// ─── Score orchestrator ────────────────────────────────────────────────────────

// Always use deterministic math. AI providers are intentionally bypassed:
// LLM-computed scores are non-reproducible and can introduce training-data bias.
// Exact, auditable matches are required for a national civic tool.
export async function callAI(_prompt: string, fallback: FallbackData): Promise<MatchResult> {
  return scoreWithoutAI(fallback)
}
