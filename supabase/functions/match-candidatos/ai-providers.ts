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

export type NeutroMotivo = 'nao_encontrado' | 'nao_responde' | 'ambivalente'

export interface PositionWithSlug {
  politician_id: string
  themeSlug: string
  posicao: string
  intensidade: number
  confiancaIa?: number             // 0.0–1.0; absent for pre-SP-1 rows that never wrote it
  neutroMotivo?: NeutroMotivo      // only meaningful when posicao === 'neutro'
  justificativa?: string           // the analyst's account, surfaced per theme in the UI
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
  temaNome: string                     // human-readable name from themes_catalog
  voterPosicao: 'favoravel' | 'contrario' | 'neutro'
  voterImportancia: 1 | 2 | 3
  // Typed numeric for forward-compat with planned candidate schema migration (see spec §8).
  // This iteration: converted from DB categorical via posicaoToScale(); null = no data.
  candidatePosicao: number | null
  candidateImportancia: number | null  // DB intensidade — platform centrality, display only
  alignment: number | null             // 0.0–1.0; null when voter neutro or no real candidate data
  contouNoScore: boolean
  evidencia: NivelEvidencia            // replaces reading candidatePosicao === null
  neutroMotivo: NeutroMotivo | null
  justificativa: string | null         // why this theme landed where it did
  posicaoViaPartido: boolean           // true when candidatePosicao is sourced from the party program, not the candidate directly
  baixaConfianca: boolean              // true when a real AI-written stance has confiancaIa < LOW_CONFIDENCE_THRESHOLD
}

export interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  alinhamento: number          // 0–100
  alinhamentoApurado: number   // 0–100, audited themes only
  cobertura: number            // 0–100
  confiancaResultado: number   // 0–100, importance-weighted coverage
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
  temaNomes?: Map<string, string>
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

/**
 * What an unaudited theme contributes to alignment.
 *
 * Deliberately below 0.5 (an audited neutral) and above 0.0 (audited
 * opposition): failing to take a public position has a cost, but a smaller one
 * than disagreeing outright. This is an editorial judgment, not an estimate,
 * and it is disclosed to voters on /sobre. See the spec, §5.
 */
export const P_NAO_INFORMADO = 0.10

/** Party-program positions are real evidence about a candidate, but weaker. */
export const CREDIBILIDADE_PARTIDO = 0.6

export type NivelEvidencia = 'direta' | 'partido' | 'ausente'

const CREDIBILIDADE: Record<NivelEvidencia, number> = {
  direta: 1,
  partido: CREDIBILIDADE_PARTIDO,
  ausente: 0,
}

/**
 * Decides how much a stored position is worth as evidence.
 *
 * The subtlety is `neutro`: it is not a position. The enrichment prompt writes
 * it whenever confidence falls below 0.70, so it merges "found nothing" with
 * "found something that does not pick a side". `neutroMotivo` separates them;
 * a missing motivo means unclassified, which reads as `nao_encontrado`.
 */
export function classifyEvidence(
  pos: PositionWithSlug | undefined,
  viaPartido: boolean,
): NivelEvidencia {
  if (!pos) return 'ausente'
  const audited = viaPartido ? 'partido' : 'direta'
  if (pos.posicao === 'favoravel' || pos.posicao === 'contrario') return audited
  if (pos.posicao === 'neutro') {
    return (pos.neutroMotivo ?? 'nao_encontrado') === 'nao_encontrado' ? 'ausente' : audited
  }
  return 'ausente'  // 'variavel' and anything unrecognised
}

export function scoreCandidato(
  respostas: RespostaUsuario[],
  positions: PositionWithSlug[],
  partyPositions?: PositionWithSlug[],
  temaNomes?: Map<string, string>,
): {
  alinhamento: number
  alinhamentoApurado: number
  cobertura: number
  confiancaResultado: number
  detalhesTemas: TemaCandidatoDetalhe[]
} {
  const posMap = new Map(positions.map(p => [p.themeSlug, p]))
  const partyPosMap = new Map((partyPositions ?? []).map(p => [p.themeSlug, p]))

  let massaTotal = 0        // Σ w — every theme the voter took a side on
  let massaApurada = 0      // Σ w · credibilidade — the part backed by evidence
  let somaPonderada = 0     // Σ w · credibilidade · alignment
  let totalTemas = 0        // unweighted theme count, for `cobertura`
  let credTemas = 0         // Σ credibilidade, for `cobertura`
  const detalhesTemas: TemaCandidatoDetalhe[] = []

  for (const r of respostas) {
    const candidatePos = posMap.get(r.temaSlug)
    const partyPos = candidatePos === undefined ? partyPosMap.get(r.temaSlug) : undefined
    const effectivePos = candidatePos ?? partyPos
    const viaPartido = candidatePos === undefined && partyPos !== undefined

    const evidencia = classifyEvidence(effectivePos, viaPartido)
    const credibilidade = CREDIBILIDADE[evidencia]
    const apurado = credibilidade > 0

    // An audited neutral converts to scale 3, which the alignment formula below
    // turns into exactly 0.5 against either voter position. No special case.
    const candidatePosicao = apurado
      ? posicaoToScale(effectivePos!.posicao, effectivePos!.intensidade)
      : null
    const candidateImportancia = effectivePos ? effectivePos.intensidade : null
    // Absence of confiancaIa is not itself a low-confidence claim — pre-SP-1
    // rows (2022 seed, party-proxy fallback) never wrote this column.
    const baixaConfianca = apurado &&
      effectivePos!.confiancaIa !== undefined &&
      effectivePos!.confiancaIa < LOW_CONFIDENCE_THRESHOLD

    const base = {
      temaSlug: r.temaSlug,
      temaNome: temaNomes?.get(r.temaSlug) ?? r.temaSlug,
      voterPosicao: r.posicao,
      voterImportancia: r.importancia,
      evidencia,
      neutroMotivo: effectivePos?.neutroMotivo ?? null,
      justificativa: effectivePos?.justificativa ?? null,
      candidatePosicao,
      candidateImportancia,
      posicaoViaPartido: evidencia === 'partido',
      baixaConfianca,
    }

    if (r.posicao === 'neutro') {
      // The voter declined to take a side: this theme cannot measure agreement,
      // so it stays out of both the score and the coverage denominators.
      detalhesTemas.push({ ...base, alignment: null, contouNoScore: false })
      continue
    }

    const w = r.importancia / 3
    massaTotal += w
    totalTemas++
    credTemas += credibilidade

    let alignment: number | null = null
    if (apurado) {
      const voterScale = r.posicao === 'favoravel' ? 5 : 1
      alignment = 1 - Math.abs(voterScale - candidatePosicao!) / 4
      massaApurada += w * credibilidade
      somaPonderada += w * credibilidade * alignment
    }

    detalhesTemas.push({ ...base, alignment, contouNoScore: apurado })
  }

  // The voter was neutral on everything: massaTotal is 0/0-undefined, so treat
  // confianca as 0 rather than special-casing the return — the formula below
  // already collapses to P_NAO_INFORMADO when there is no weighted evidence,
  // which keeps this branch consistent with the "zero coverage" case.
  const confianca = massaTotal === 0 ? 0 : massaApurada / massaTotal
  const apuradoScore = massaApurada === 0 ? 0 : somaPonderada / massaApurada
  // The identity the results card shows as its audit line. Keep them in sync;
  // a property test in ai-providers.test.ts enforces it.
  const alinhamento = confianca * apuradoScore + (1 - confianca) * P_NAO_INFORMADO

  return {
    alinhamento: Math.round(alinhamento * 100),
    alinhamentoApurado: Math.round(apuradoScore * 100),
    cobertura: totalTemas === 0 ? 0 : Math.round((credTemas / totalTemas) * 100),
    confiancaResultado: Math.round(confianca * 100),
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
    const { alinhamento, alinhamentoApurado, cobertura, confiancaResultado, detalhesTemas } =
      scoreCandidato(
        data.respostas,
        byCandidate.get(c.politician_id) ?? [],
        partyPositions,
        data.temaNomes,
      )
    const resultado: CandidatoResultado = {
      politicianId: c.politician_id,
      nomeUrna: c.nome_urna,
      partido: c.partido_atual,
      alinhamento,
      alinhamentoApurado,
      cobertura,
      confiancaResultado,
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
