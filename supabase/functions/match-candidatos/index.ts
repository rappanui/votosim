/// <reference lib="deno.ns" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  callAI,
  type CandidatoResultado,
  type CandidatoRow,
  type FallbackData,
  type MatchRequest,
  type MatchResult,
  type PositionWithSlug,
  type RespostaUsuario,
  scoreCandidato,
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
export const MAX_EXEC_CANDIDATES = 3
export const MIN_SCORE_THRESHOLD = 35
const EXEC_CARGOS = new Set(['presidente', 'governador'])
export const DEPUTADO_CARGOS = new Set(['deputado_federal', 'deputado_estadual', 'deputado_distrital'])
// Cargos where voters may choose the party (voto de legenda) instead of an individual.
export const LEGISLATIVE_CARGOS = new Set(['senador', 'deputado_federal', 'deputado_estadual', 'deputado_distrital'])
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
  const view = `v_candidates_${year}`
  const cols = 'politician_id, nome_urna, partido_atual, cargo'

  // Fetch state candidates + national (president runs with estado='BR')
  const [stateRes, nationalRes] = await Promise.all([
    supabase.from(view).select(cols).eq('estado', estado),
    supabase.from(view).select(cols).eq('estado', 'BR'),
  ])

  if (stateRes.error) throw new Error(`Failed to fetch candidates: ${stateRes.error.message}`)
  if (nationalRes.error) throw new Error(`Failed to fetch national candidates: ${nationalRes.error.message}`)

  return [...(stateRes.data ?? []), ...(nationalRes.data ?? [])] as CandidatoRow[]
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
          .select('politician_id, theme_id, posicao, intensidade, confianca_ia')
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
      confiancaIa: p.confianca_ia === null || p.confianca_ia === undefined
        ? undefined
        : p.confianca_ia as number,
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

async function fetchPartyPositions(
  supabase: ReturnType<typeof createSupabaseClient>,
  partySiglas: string[],
  themeMap: Map<string, string>,
): Promise<Map<string, PositionWithSlug[]>> {
  if (partySiglas.length === 0) return new Map()
  const { data, error } = await supabase
    .from('party_positions')
    .select('party_sigla, theme_id, posicao, intensidade, confianca_ia')
    .in('party_sigla', partySiglas)
  if (error) {
    // party_positions may not exist yet (migration pending) — degrade gracefully
    console.warn('[match-candidatos] party_positions not available:', error.message)
    return new Map()
  }
  const byParty = new Map<string, PositionWithSlug[]>()
  for (const row of (data ?? []) as Array<{ party_sigla: string; theme_id: string; posicao: string; intensidade: number; confianca_ia: number | null }>) {
    const slug = themeMap.get(row.theme_id)
    if (!slug) continue
    const list = byParty.get(row.party_sigla) ?? []
    list.push({
      politician_id: row.party_sigla,
      themeSlug: slug,
      posicao: row.posicao,
      intensidade: row.intensidade,
      confiancaIa: row.confianca_ia === null ? undefined : row.confianca_ia,
    })
    byParty.set(row.party_sigla, list)
  }
  return byParty
}

// Returns one { cargo, candidato } entry per (party, legislative cargo) pair.
// Parties with no data in partyPositionsByParty are excluded.
export function buildPartyResults(
  candidates: CandidatoRow[],
  partyPositionsByParty: Map<string, PositionWithSlug[]>,
  respostas: RespostaUsuario[],
): Array<{ cargo: string; candidato: CandidatoResultado }> {
  const cargosPerParty = new Map<string, Set<string>>()
  for (const c of candidates) {
    if (!LEGISLATIVE_CARGOS.has(c.cargo)) continue
    const cargos = cargosPerParty.get(c.partido_atual) ?? new Set()
    cargos.add(c.cargo)
    cargosPerParty.set(c.partido_atual, cargos)
  }

  const results: Array<{ cargo: string; candidato: CandidatoResultado }> = []
  for (const [sigla, cargoSet] of cargosPerParty) {
    const positions = partyPositionsByParty.get(sigla)
    if (!positions || positions.length === 0) continue
    const { alinhamento, cobertura, detalhesTemas } = scoreCandidato(respostas, positions)
    for (const cargo of cargoSet) {
      results.push({
        cargo,
        candidato: {
          politicianId: `party:${sigla}`,
          nomeUrna: sigla,
          partido: sigla,
          alinhamento,
          cobertura,
          detalhesTemas,
          temAlertas: false,
          alertas: [],
          isParty: true,
        },
      })
    }
  }
  return results
}

// Merges party match entries into the existing MatchResult cargo groups.
// Creates new cargo groups if needed (e.g. for cargos with zero individual matches above threshold).
export function injectPartyResults(
  result: MatchResult,
  partyResults: Array<{ cargo: string; candidato: CandidatoResultado }>,
): MatchResult {
  if (partyResults.length === 0) return result
  const cargoMap = new Map(result.cargos.map(g => [g.cargo, { ...g, candidatos: [...g.candidatos] }]))
  for (const { cargo, candidato } of partyResults) {
    if (!cargoMap.has(cargo)) cargoMap.set(cargo, { cargo, candidatos: [] })
    cargoMap.get(cargo)!.candidatos.push(candidato)
  }
  return { ...result, cargos: [...cargoMap.values()] }
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
    if (answer.posicao === 'neutro') continue
    const posicao = positionMap.get(answer.temaSlug)
    if (!posicao) continue
    if (answer.posicao === 'favoravel' && posicao === 'favoravel') matches++
    if (answer.posicao === 'contrario' && posicao === 'contrario') matches++
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
      'Para cada candidato, compare a posição do eleitor (favoravel=Concordo, contrario=Discordo, neutro=Neutro — ignorar no score) com as posições documentadas.',
      'posicao favoravel + candidato favoravel = alinhado. posicao contrario + candidato contrario = alinhado. posicao favoravel + candidato contrario = divergente. posicao contrario + candidato favoravel = divergente.',
      'intensidade (1-5) indica força da posição — pese mais as posições de intensidade alta.',
      'importancia (1-3) indica peso do tema para o eleitor — pese mais os temas de alta importancia.',
      'alinhamento: inteiro 0-100. NÃO use "vote em", "recomendo" ou "escolha" em nenhum campo.',
    ],
    formatoEsperado: {
      cargos: [{
        cargo: 'string (presidente | governador | senador | deputado_federal | deputado_estadual | deputado_distrital)',
        candidatos: [{
          politicianId: 'string',
          nomeUrna: 'string',
          partido: 'string',
          alinhamento: 'number (0-100)',
          cobertura: 'number (0-100)',
        }],
      }],
      totalCandidatosAnalisados: 'number',
      estado: 'string',
    },
    respostasEleitor: answers.map(a => ({
      temaSlug: a.temaSlug,
      posicao: a.posicao,
      importancia: a.importancia,
    })),
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
        .filter(c => c.alinhamento >= MIN_SCORE_THRESHOLD)
        .sort((a, b) => b.alinhamento - a.alinhamento)
        .slice(0, EXEC_CARGOS.has(grupo.cargo) ? MAX_EXEC_CANDIDATES : MAX_CANDIDATES_PER_CARGO),
    }))
    .filter(g => g.candidatos.length > 0)
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
    // Fetch party positions early: used for per-theme fallback on individual candidates
    // AND for full party match entries (voto de legenda in legislative cargos).
    const partySiglas = [...new Set(
      candidates.filter(c => LEGISLATIVE_CARGOS.has(c.cargo)).map(c => c.partido_atual),
    )]
    const [filteredAlerts, partyPositionsByParty] = await Promise.all([
      fetchAlerts(supabase, [...filteredIds]),
      fetchPartyPositions(supabase, partySiglas, themeMap),
    ])

    const prompt = buildPrompt(filteredCandidates, positionsByCandidate, body.respostas)
    const fallbackData: FallbackData = {
      respostas: body.respostas,
      candidates: filteredCandidates,
      positions: filteredPositions,
      estado: body.estado,
      partyPositionsByParty,
    }

    const rawResult = await callAI(prompt, fallbackData)

    // Party match entries: parties appear as standalone results for legislative cargos
    // (voters may choose the party via voto de legenda). These are distinct from the
    // per-theme party fallback above — here the party IS the candidate entry.
    const partyEntries = buildPartyResults(candidates, partyPositionsByParty, body.respostas)
    const mergedResult = injectPartyResults(rawResult, partyEntries)

    const withAlerts = attachAlerts(mergedResult, filteredAlerts)
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
