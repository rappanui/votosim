/// <reference lib="deno.ns" />
// ─── Exported types (consumed by index.ts) ────────────────────────────────────

export interface RespostaUsuario {
  temaSlug: string
  resposta: 1 | 2 | 3 | 4 | 5
  concordancia: 'concordo' | 'neutro' | 'discordo'
  intensidade: 1 | 2 | 3 | 4 | 5
}

export interface MatchRequest {
  estado: string
  municipio: string
  faixaEtaria: string
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
}

export interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  score: number
  temasAlinhados: string[]
  temasDivergentes: string[]
  temAlertas: boolean
  alertas: unknown[]
  /** True when this entry represents a party (voto de legenda), not an individual candidate. */
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

// Maps politician posicao+intensidade to a 1–5 scale symmetric with voterToScale.
export function posicaoToScale(posicao: string, intensidade: number): number {
  if (posicao === 'favoravel') return Math.min(5, 3 + (intensidade / 5) * 2)
  if (posicao === 'contrario') return Math.max(1, 3 - (intensidade / 5) * 2)
  return 3
}

// Maps voter concordância+intensidade to the same 1–5 scale.
// concordo+5 → 5.0, discordo+5 → 1.0, concordo+1 → 3.4, discordo+1 → 2.6
export function voterToScale(concordancia: 'concordo' | 'discordo' | 'neutro', intensidade: number): number {
  if (concordancia === 'concordo') return Math.min(5, 3 + (intensidade / 5) * 2)
  if (concordancia === 'discordo') return Math.max(1, 3 - (intensidade / 5) * 2)
  return 3
}

export function scoreCandidato(
  respostas: RespostaUsuario[],
  positions: PositionWithSlug[],
): { score: number; temasAlinhados: string[]; temasDivergentes: string[] } {
  const posMap = new Map(positions.map(p => [p.themeSlug, p]))

  // Candidates with zero coverage on any queried theme score 0 (no data to match on).
  const hasAnyCoverage = respostas.some(r => r.concordancia !== 'neutro' && posMap.has(r.temaSlug))
  if (!hasAnyCoverage) return { score: 0, temasAlinhados: [], temasDivergentes: [] }

  let weightedSum = 0
  let totalWeight = 0
  const temasAlinhados: string[] = []
  const temasDivergentes: string[] = []

  for (const r of respostas) {
    if (r.concordancia === 'neutro') continue

    // Voter intensidade weights how much this topic matters to them.
    const weight = r.intensidade / 5
    const pos = posMap.get(r.temaSlug)

    let alignment: number
    if (pos && pos.posicao !== 'neutro') {
      const vScale = voterToScale(r.concordancia, r.intensidade)
      const pScale = posicaoToScale(pos.posicao, pos.intensidade)
      alignment = 1 - Math.abs(vScale - pScale) / 4
    } else {
      // Missing or neutral politician position → treat as neutral (no information).
      // This penalises sparse candidates vs those with full coverage.
      alignment = 0.5
    }

    weightedSum += alignment * weight
    totalWeight += weight

    if (pos && pos.posicao !== 'neutro' && alignment >= 0.75) temasAlinhados.push(r.temaSlug)
    else if (pos && pos.posicao !== 'neutro' && alignment <= 0.25) temasDivergentes.push(r.temaSlug)
  }

  return {
    score: totalWeight === 0 ? 0 : Math.round((weightedSum / totalWeight) * 100),
    temasAlinhados,
    temasDivergentes,
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
    const { score, temasAlinhados, temasDivergentes } = scoreCandidato(
      data.respostas,
      byCandidate.get(c.politician_id) ?? [],
    )
    const resultado: CandidatoResultado = {
      politicianId: c.politician_id,
      nomeUrna: c.nome_urna,
      partido: c.partido_atual,
      score,
      temasAlinhados,
      temasDivergentes,
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
// LLM-computed scores are non-reproducible and can introduce training-data bias
// (e.g. boosting a party because the model "knows" their ideology). Exact,
// auditable matches are required for a national civic tool.
export async function callAI(_prompt: string, fallback: FallbackData): Promise<MatchResult> {
  return scoreWithoutAI(fallback)
}
