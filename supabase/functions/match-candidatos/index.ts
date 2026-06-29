/// <reference lib="deno.ns" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  callAI,
  type CandidatoRow,
  type FallbackData,
  type MatchRequest,
  type MatchResult,
  type PositionWithSlug,
  type RespostaUsuario,
} from './ai-providers.ts'

// ─── Local types ──────────────────────────────────────────────────────────────

export interface AlertRow {
  politician_id: string
  tipo: string
  severidade: string
  titulo: string
  descricao: string
  fonte_url: string
  badge_cor: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CARGO_ORDER: string[] = [
  'presidente', 'governador', 'senador', 'deputado_federal', 'deputado_estadual', 'deputado_distrital',
]

export const MAX_CANDIDATES_PER_CARGO = 5
export const DEPUTADO_CARGOS = new Set(['deputado_federal', 'deputado_estadual', 'deputado_distrital'])
export const PREFILTER_LIMIT_DEPUTADO = 20
export const PREFILTER_LIMIT_DEFAULT = 10

export const CORS_HEADERS = {
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
  const { data, error } = await supabase
    .from(`v_candidates_${year}`)
    .select('politician_id, nome_urna, partido_atual, cargo')
    .eq('estado', estado)

  if (error) throw new Error(`Failed to fetch candidates: ${error.message}`)
  return (data ?? []) as CandidatoRow[]
}

async function loadThemeSlugMap(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('themes_catalog').select('id, slug')
  if (error) throw new Error(`Failed to load theme map: ${error.message}`)
  return new Map((data ?? []).map(t => [t.id as string, t.slug as string]))
}

async function fetchPositions(
  supabase: ReturnType<typeof createSupabaseClient>,
  politicianIds: string[],
  themeMap: Map<string, string>,
): Promise<PositionWithSlug[]> {
  // Batch to avoid URL length limits in PostgREST .in() queries (3000+ IDs exceed the limit)
  const CHUNK = 100
  const CONCURRENCY = 5
  const chunks: string[][] = []
  for (let i = 0; i < politicianIds.length; i += CHUNK) chunks.push(politicianIds.slice(i, i + CHUNK))

  const rawRows: Record<string, unknown>[] = []
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      chunks.slice(i, i + CONCURRENCY).map(chunk =>
        supabase.from('politician_positions')
          .select('politician_id, theme_id, posicao, intensidade')
          .in('politician_id', chunk)
      ),
    )
    for (const { data, error } of batch) {
      if (error) throw new Error(`Failed to fetch positions: ${error.message}`)
      rawRows.push(...(data ?? []) as Record<string, unknown>[])
    }
  }

  return rawRows
    .map(p => ({
      politician_id: p.politician_id as string,
      themeSlug: themeMap.get(p.theme_id as string) ?? '',
      posicao: p.posicao as string,
      intensidade: p.intensidade as number,
    }))
    .filter(p => p.themeSlug !== '')
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

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item)
    return { ...acc, [key]: [...(acc[key] ?? []), item] }
  }, {})
}

export function countSimpleMatches(
  candidateId: string,
  positionsByCandidate: Record<string, PositionWithSlug[]>,
  answers: RespostaUsuario[],
): number {
  const positions = positionsByCandidate[candidateId] ?? []
  const positionMap = new Map(positions.map(p => [p.themeSlug, p.posicao]))
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

export function prefilterCandidates(
  candidates: CandidatoRow[],
  positionsByCandidate: Record<string, PositionWithSlug[]>,
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

export function buildPrompt(
  candidates: CandidatoRow[],
  positionsByCandidate: Record<string, PositionWithSlug[]>,
  answers: RespostaUsuario[],
): string {
  const candidateData = candidates.map(c => ({
    politicianId: c.politician_id,
    nomeUrna: c.nome_urna,
    partido: c.partido_atual,
    cargo: c.cargo,
    posicoes: (positionsByCandidate[c.politician_id] ?? []).map(p => ({
      tema: p.themeSlug,
      posicao: p.posicao,
      intensidade: p.intensidade,
    })),
  }))

  return JSON.stringify({
    tarefa: 'Calcule o percentual de alinhamento temático. Retorne um objeto JSON.',
    instrucoes: [
      'Para cada candidato, compare as respostas do eleitor com as posições documentadas.',
      'concordo + favoravel = alinhado. discordo + contrario = alinhado. concordo + contrario = divergente. discordo + favoravel = divergente.',
      'intensidade (1-5) indica força da posição — pese mais as posições de intensidade alta.',
      'score: inteiro 0-100. NÃO use "vote em", "recomendo" ou "escolha" em nenhum campo.',
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

// ─── Response post-processing ─────────────────────────────────────────────────

function alertRowToAlerta(a: AlertRow) {
  return {
    tipo: a.tipo,
    severidade: a.severidade,
    titulo: a.titulo,
    descricao: a.descricao,
    fonteUrl: a.fonte_url,
    badgeCor: a.badge_cor,
  }
}

export function attachAlerts(result: MatchResult, alerts: AlertRow[]): MatchResult {
  const alertMap = groupBy(alerts, a => a.politician_id)
  const cargos = result.cargos.map(grupo => ({
    ...grupo,
    candidatos: grupo.candidatos.map(c => {
      const candidatoAlertas = (alertMap[c.politicianId] ?? []).map(alertRowToAlerta)
      return { ...c, temAlertas: candidatoAlertas.length > 0, alertas: candidatoAlertas }
    }),
  }))
  return { ...result, cargos }
}

export function sortAndLimitCargos(result: MatchResult): MatchResult {
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

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ─── Main handler (exported for direct testing without starting the server) ───

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const body = await req.json() as MatchRequest

    if (!body.estado) {
      return jsonResponse({ error: 'Campo estado é obrigatório.' }, 400)
    }
    if (!Array.isArray(body.respostas)) {
      return jsonResponse({ error: 'Campo respostas deve ser um array.' }, 400)
    }

    const supabase = createSupabaseClient()

    const [candidates, themeMap] = await Promise.all([
      fetchCandidates(supabase, body.estado),
      loadThemeSlugMap(supabase),
    ])

    if (candidates.length === 0) {
      return jsonResponse({ error: 'Nenhum candidato encontrado para este estado.' }, 404)
    }

    const politicianIds = candidates.map(c => c.politician_id)
    const positions = await fetchPositions(supabase, politicianIds, themeMap)

    const positionsByCandidate = groupBy(positions, p => p.politician_id) as Record<string, PositionWithSlug[]>
    const filteredCandidates = prefilterCandidates(candidates, positionsByCandidate, body.respostas)

    const filteredIds = new Set(filteredCandidates.map(c => c.politician_id))
    const filteredPositions = positions.filter(p => filteredIds.has(p.politician_id))
    const filteredAlerts = await fetchAlerts(supabase, [...filteredIds])

    const prompt = buildPrompt(filteredCandidates, positionsByCandidate, body.respostas)
    const fallbackData: FallbackData = {
      respostas: body.respostas,
      candidates: filteredCandidates,
      positions: filteredPositions,
      estado: body.estado,
    }

    const rawResult = await callAI(prompt, fallbackData)
    const withAlerts = attachAlerts(rawResult, filteredAlerts)
    const finalResult = sortAndLimitCargos(withAlerts)

    return jsonResponse(finalResult)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('[match-candidatos]', message)
    return jsonResponse({ error: 'Não foi possível processar sua solicitação. Tente novamente.' }, 500)
  }
}

// ─── Entry point (only when run directly, not when imported by tests) ─────────

if (import.meta.main) {
  Deno.serve(handler)
}
