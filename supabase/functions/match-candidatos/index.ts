import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RespostaUsuario {
  temaSlug: string
  resposta: 1 | 2 | 3 | 4 | 5
  concordancia: 'concordo' | 'neutro' | 'discordo'
  intensidade: 1 | 2 | 3 | 4 | 5
}

interface MatchRequest {
  estado: string
  municipio: string
  faixaEtaria: string
  respostas: RespostaUsuario[]
  sessionToken: string
  timestamp: string
}

interface CandidatoRow {
  politician_id: string
  nome_urna: string
  partido_atual: string
  cargo: string
}

interface PositionRow {
  politician_id: string
  theme_slug: string
  posicao: string
  justificativa: string
}

interface AlertRow {
  politician_id: string
  tipo: string
  severidade: string
  titulo: string
  descricao: string
  fonte_url: string
  badge_cor: string
}

interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  score: number
  temasAlinhados: string[]
  temasDivergentes: string[]
  temAlertas: boolean
  alertas: AlertRow[]
}

interface MatchResult {
  cargos: Array<{ cargo: string; candidatos: CandidatoResultado[] }>
  totalCandidatosAnalisados: number
  estado: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`

const CARGO_ORDER: string[] = [
  'presidente', 'governador', 'senador', 'deputado_federal', 'deputado_estadual', 'deputado_distrital',
]

const MAX_CANDIDATES_PER_CARGO = 5
const GEMINI_TIMEOUT_MS = 30_000

const DEPUTADO_CARGOS = new Set(['deputado_federal', 'deputado_estadual', 'deputado_distrital'])
const PREFILTER_LIMIT_DEPUTADO = 20
const PREFILTER_LIMIT_DEFAULT = 10

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function createSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SERVICE_ROLE_KEY')!,
  )
}

async function fetchCandidates(
  supabase: ReturnType<typeof createSupabaseClient>,
  estado: string,
): Promise<CandidatoRow[]> {
  const year = Deno.env.get('ELECTION_YEAR') ?? '2026'
  const view = `v_candidates_${year}`

  const { data, error } = await supabase
    .from(view)
    .select('politician_id, nome_urna, partido_atual, cargo')
    .eq('estado', estado)

  if (error) throw new Error(`Failed to fetch candidates: ${error.message}`)
  return (data ?? []) as CandidatoRow[]
}

async function fetchPositions(
  supabase: ReturnType<typeof createSupabaseClient>,
  politicianIds: string[],
): Promise<PositionRow[]> {
  const { data, error } = await supabase
    .from('politician_positions')
    .select('politician_id, theme_slug, posicao, justificativa')
    .in('politician_id', politicianIds)

  if (error) throw new Error(`Failed to fetch positions: ${error.message}`)
  return (data ?? []) as PositionRow[]
}

async function fetchAlerts(
  supabase: ReturnType<typeof createSupabaseClient>,
  politicianIds: string[],
): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from('v_candidate_alerts')
    .select('politician_id, tipo, severidade, titulo, descricao, fonte_url, badge_cor')
    .in('politician_id', politicianIds)

  if (error) throw new Error(`Failed to fetch alerts: ${error.message}`)
  return (data ?? []) as AlertRow[]
}

// ─── Pre-filter ───────────────────────────────────────────────────────────────

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item)
    return { ...acc, [key]: [...(acc[key] ?? []), item] }
  }, {})
}

/**
 * Scores each candidate by counting simple position matches with the user's
 * non-neutral answers (concordo+favoravel or discordo+contrario). Used to
 * reduce the candidate set before the Gemini call.
 */
function countSimpleMatches(
  candidateId: string,
  positionsByCandidate: Record<string, PositionRow[]>,
  answers: RespostaUsuario[],
): number {
  const positions = positionsByCandidate[candidateId] ?? []
  const positionMap = new Map(positions.map(p => [p.theme_slug, p.posicao]))
  let matches = 0

  for (const answer of answers) {
    if (answer.concordancia === 'neutro') continue
    const posicao = positionMap.get(answer.temaSlug)
    if (!posicao) continue
    if (answer.concordancia === 'concordo' && posicao === 'favoravel') matches++
    if (answer.concordancia === 'discordo' && posicao === 'contrario') matches++
  }

  return matches
}

function prefilterCandidates(
  candidates: CandidatoRow[],
  positionsByCandidate: Record<string, PositionRow[]>,
  answers: RespostaUsuario[],
): CandidatoRow[] {
  const byCargo = groupBy(candidates, c => c.cargo)

  return Object.entries(byCargo).flatMap(([cargo, group]) => {
    const limit = DEPUTADO_CARGOS.has(cargo) ? PREFILTER_LIMIT_DEPUTADO : PREFILTER_LIMIT_DEFAULT
    return [...group]
      .sort((a, b) =>
        countSimpleMatches(b.politician_id, positionsByCandidate, answers) -
        countSimpleMatches(a.politician_id, positionsByCandidate, answers)
      )
      .slice(0, limit)
  })
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Builds the Gemini prompt with structured candidate data and voter answers.
 * No recommendation language is used anywhere in the prompt.
 */
function buildGeminiPrompt(
  candidates: CandidatoRow[],
  positionsByCandidate: Record<string, PositionRow[]>,
  answers: RespostaUsuario[],
): string {
  const candidateData = candidates.map(c => ({
    politicianId: c.politician_id,
    nomeUrna: c.nome_urna,
    partido: c.partido_atual,
    cargo: c.cargo,
    posicoes: (positionsByCandidate[c.politician_id] ?? []).map(p => ({
      tema: p.theme_slug,
      posicao: p.posicao,
      justificativa: p.justificativa,
    })),
  }))

  return JSON.stringify({
    tarefa: 'Calcule o percentual de alinhamento temático entre as respostas do eleitor e as posições de cada candidato.',
    instrucoes: [
      'Para cada candidato, compare as respostas do eleitor com as posições documentadas.',
      'concordo + favoravel = alinhado. discordo + contrario = alinhado. concordo + contrario = divergente. discordo + favoravel = divergente.',
      'score varia de 0 a 100 (inteiro). Retorne apenas JSON, sem texto adicional.',
      'NÃO use "vote em", "recomendo", "escolha" em nenhum campo.',
      'temas_alinhados e temas_divergentes: liste apenas os slugs dos temas.',
    ],
    formatoEsperado: {
      cargos: [{
        cargo: 'string (presidente | governador | senador | deputado_federal | deputado_estadual | deputado_distrital)',
        candidatos: [{
          politicianId: 'string',
          nomeUrna: 'string',
          partido: 'string',
          score: 'number (0-100)',
          temasAlinhados: ['string'],
          temasDivergentes: ['string'],
        }],
      }],
      totalCandidatosAnalisados: 'number',
      estado: 'string',
    },
    respostasEleitor: answers,
    candidatos: candidateData,
  })
}

// ─── Gemini caller ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'Você é um analisador de alinhamento político imparcial. Computa percentuais de alinhamento temático entre posições de eleitores e candidatos. Nunca recomenda votos. Responde apenas com JSON válido, sem markdown, sem texto extra.'

/** Calls Gemini Flash with a 30-second timeout. Throws if the API returns non-2xx. */
async function callGemini(userPrompt: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    })

    if (!response.ok) throw new Error(`Gemini API returned ${response.status}`)

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  } finally {
    clearTimeout(timer)
  }
}

// ─── Response post-processing ─────────────────────────────────────────────────

function attachAlerts(result: MatchResult, alerts: AlertRow[]): MatchResult {
  const alertMap = groupBy(alerts, a => a.politician_id)

  const cargos = result.cargos.map(grupo => ({
    ...grupo,
    candidatos: grupo.candidatos.map(c => {
      const candidatoAlertas = alertMap[c.politicianId] ?? []
      return { ...c, temAlertas: candidatoAlertas.length > 0, alertas: candidatoAlertas }
    }),
  }))

  return { ...result, cargos }
}

function sortAndLimitCargos(result: MatchResult): MatchResult {
  const orderedCargos = CARGO_ORDER
    .map(cargo => result.cargos.find(g => g.cargo === cargo))
    .filter((g): g is NonNullable<typeof g> => g !== undefined)
    .map(grupo => ({
      ...grupo,
      candidatos: [...grupo.candidatos]
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_CANDIDATES_PER_CARGO),
    }))

  return { ...result, cargos: orderedCargos }
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json() as MatchRequest
    const supabase = createSupabaseClient()

    const candidates = await fetchCandidates(supabase, body.estado)
    if (candidates.length === 0) {
      return jsonResponse({ error: 'Nenhum candidato encontrado para este estado.' }, 404)
    }

    const politicianIds = candidates.map(c => c.politician_id)
    const [positions, alerts] = await Promise.all([
      fetchPositions(supabase, politicianIds),
      fetchAlerts(supabase, politicianIds),
    ])

    const positionsByCandidate = groupBy(positions, p => p.politician_id)
    const filteredCandidates = prefilterCandidates(candidates, positionsByCandidate, body.respostas)

    const filteredIds = filteredCandidates.map(c => c.politician_id)
    const filteredAlerts = alerts.filter(a => filteredIds.includes(a.politician_id))

    const prompt = buildGeminiPrompt(filteredCandidates, positionsByCandidate, body.respostas)
    const geminiText = await callGemini(prompt)

    let rawResult: MatchResult
    try {
      rawResult = JSON.parse(geminiText) as MatchResult
    } catch {
      throw new Error('Gemini returned invalid JSON')
    }

    const withAlerts = attachAlerts(rawResult, filteredAlerts)
    const finalResult = sortAndLimitCargos(withAlerts)

    return jsonResponse(finalResult)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[match-candidatos]', message)
    return jsonResponse({ error: 'Não foi possível processar sua solicitação. Tente novamente.' }, 500)
  }
})
