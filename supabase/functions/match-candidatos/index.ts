/// <reference lib="deno.ns" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  callAI,
  type CandidatoResultado,
  type CandidatoRow,
  type CoerenciaTema,
  type Dossie,
  type Espectro,
  type FallbackData,
  type Fonte,
  type MatchRequest,
  type MatchResult,
  type NeutroMotivo,
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
  const cols = 'candidacy_id, politician_id, nome_urna, partido_atual, numero_urna, cargo'

  // Fetch state candidates + national (president runs with estado='BR')
  const [stateRes, nationalRes] = await Promise.all([
    supabase.from(view).select(cols).eq('estado', estado),
    supabase.from(view).select(cols).eq('estado', 'BR'),
  ])

  if (stateRes.error) throw new Error(`Failed to fetch candidates: ${stateRes.error.message}`)
  if (nationalRes.error) throw new Error(`Failed to fetch national candidates: ${nationalRes.error.message}`)

  return [...(stateRes.data ?? []), ...(nationalRes.data ?? [])] as CandidatoRow[]
}

async function loadThemeMaps(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<{ slugById: Map<string, string>; nomeBySlug: Map<string, string> }> {
  const { data, error } = await supabase.from('themes_catalog').select('id, slug, nome')
  if (error) throw new Error(`Failed to fetch themes: ${error.message}`)
  const slugById = new Map<string, string>()
  const nomeBySlug = new Map<string, string>()
  for (const t of (data ?? []) as Array<{ id: string; slug: string; nome: string }>) {
    slugById.set(t.id, t.slug)
    nomeBySlug.set(t.slug, t.nome)
  }
  return { slugById, nomeBySlug }
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
          .select('politician_id, theme_id, posicao, intensidade, confianca_ia, neutro_motivo, justificativa')
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
      neutroMotivo: (p.neutro_motivo ?? undefined) as NeutroMotivo | undefined,
      justificativa: (p.justificativa ?? undefined) as string | undefined,
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

// ─── Enrichment: dossiers, sources, theme coherence ──────────────────────────

export interface DossierRow {
  candidacy_id: string
  resumo_perfil: string
  espectro_declarado: string | null
  espectro_inferido: string | null
  coerencia_indice: number | null
  coerencia_base: string | null
  versao: number
  gerado_em: string
}

export interface SourceRow {
  id: string
  politician_id: string
  tipo: string
  camada: number
  titulo: string | null
  veiculo: string | null
  url: string
  data_publicacao: string | null
  acessado_em: string
}

export interface DetalhePosicaoRow {
  politician_id: string
  theme_id: string
  coerencia_tema: string | null
  justificativa: string | null
}

/** The columns of politician_positions the card displays and the scorer ignores. */
export interface DetalhePosicao {
  coerenciaTema: CoerenciaTema | null
  justificativa: string | null
}

// candidate_dossiers is versioned so a profile can be regenerated without
// losing the previous take. Only the newest version is voter-facing.
export function pickLatestDossiers(rows: DossierRow[]): Map<string, Dossie> {
  const best = new Map<string, DossierRow>()
  for (const row of rows) {
    const current = best.get(row.candidacy_id)
    if (current === undefined || row.versao > current.versao) best.set(row.candidacy_id, row)
  }
  return new Map([...best].map(([candidacyId, r]) => [candidacyId, {
    resumoPerfil: r.resumo_perfil,
    espectroDeclarado: r.espectro_declarado as Espectro | null,
    espectroInferido: r.espectro_inferido as Espectro | null,
    coerenciaIndice: r.coerencia_indice,
    coerenciaBase: r.coerencia_base,
    geradoEm: r.gerado_em,
  }]))
}

// Official sources first: a court or TSE record outranks press coverage.
export function groupSources(rows: SourceRow[]): Map<string, Fonte[]> {
  const byPolitician = new Map<string, Fonte[]>()
  for (const r of rows) {
    const list = byPolitician.get(r.politician_id) ?? []
    list.push({
      id: r.id,
      tipo: r.tipo,
      camada: r.camada as 1 | 2 | 3,
      titulo: r.titulo,
      veiculo: r.veiculo,
      url: r.url,
      dataPublicacao: r.data_publicacao,
      acessadoEm: r.acessado_em,
    })
    byPolitician.set(r.politician_id, list)
  }
  for (const list of byPolitician.values()) list.sort((a, b) => a.camada - b.camada)
  return byPolitician
}

// A null coerencia_tema means "not assessed", which is not a finding — it stays
// null rather than becoming a third displayed meaning. The row is still kept,
// because most rows carry a justificativa and no coherence assessment.
export function groupDetalhePosicoes(
  rows: DetalhePosicaoRow[],
  slugById: Map<string, string>,
): Map<string, Map<string, DetalhePosicao>> {
  const byPolitician = new Map<string, Map<string, DetalhePosicao>>()
  for (const r of rows) {
    const slug = slugById.get(r.theme_id)
    if (slug === undefined) continue
    const byTheme = byPolitician.get(r.politician_id) ?? new Map<string, DetalhePosicao>()
    byTheme.set(slug, {
      coerenciaTema: (r.coerencia_tema ?? null) as CoerenciaTema | null,
      justificativa: r.justificativa,
    })
    byPolitician.set(r.politician_id, byTheme)
  }
  return byPolitician
}

async function fetchDossiers(
  supabase: ReturnType<typeof createSupabaseClient>,
  candidacyIds: string[],
): Promise<Map<string, Dossie>> {
  if (candidacyIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('candidate_dossiers')
    .select('candidacy_id, resumo_perfil, espectro_declarado, espectro_inferido, coerencia_indice, coerencia_base, versao, gerado_em')
    .in('candidacy_id', candidacyIds)
  if (error) throw new Error(`Failed to fetch dossiers: ${error.message}`)
  return pickLatestDossiers((data ?? []) as DossierRow[])
}

async function fetchSources(
  supabase: ReturnType<typeof createSupabaseClient>,
  politicianIds: string[],
): Promise<Map<string, Fonte[]>> {
  if (politicianIds.length === 0) return new Map()
  // destino_exibicao 'interno' is pipeline bookkeeping, never shown to a voter.
  const { data, error } = await supabase
    .from('candidate_sources')
    .select('id, politician_id, tipo, camada, titulo, veiculo, url, data_publicacao, acessado_em')
    .in('politician_id', politicianIds)
    .neq('destino_exibicao', 'interno')
  if (error) throw new Error(`Failed to fetch sources: ${error.message}`)
  return groupSources((data ?? []) as SourceRow[])
}

// Deliberately a separate query from v3's fetchPositions: that one runs over
// every candidate in the state before the pre-filter, purely to rank and
// discard, while this one runs over the ≤23 finalists that reach the screen.
// Neither column here is read by the arithmetic.
async function fetchDetalhePosicoes(
  supabase: ReturnType<typeof createSupabaseClient>,
  politicianIds: string[],
  slugById: Map<string, string>,
): Promise<Map<string, Map<string, DetalhePosicao>>> {
  if (politicianIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('politician_positions')
    .select('politician_id, theme_id, coerencia_tema, justificativa')
    .in('politician_id', politicianIds)
  if (error) throw new Error(`Failed to fetch position details: ${error.message}`)
  return groupDetalhePosicoes((data ?? []) as DetalhePosicaoRow[], slugById)
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
    const { alinhamento, alinhamentoApurado, cobertura, confiancaResultado, detalhesTemas } =
      scoreCandidato(respostas, positions)
    for (const cargo of cargoSet) {
      results.push({
        cargo,
        candidato: {
          politicianId: `party:${sigla}`,
          nomeUrna: sigla,
          partido: sigla,
          cargo,
          numeroUrna: null,
          alinhamento,
          alinhamentoApurado,
          cobertura,
          confiancaResultado,
          detalhesTemas,
          temAlertas: false,
          alertas: [],
          dossie: null,
          fontes: [],
          observacoes: [],
          coerenciaPorTema: {},
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
        .sort((a, b) =>
          b.alinhamento - a.alinhamento ||
          b.cobertura - a.cobertura ||
          a.nomeUrna.localeCompare(b.nomeUrna, 'pt-BR')
        )
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

    const [candidates, { slugById, nomeBySlug }] = await Promise.all([
      fetchCandidates(supabase, body.estado),
      loadThemeMaps(supabase),
    ])

    if (candidates.length === 0) {
      return jsonResponse({ error: 'Nenhum candidato encontrado para este estado.' }, 404)
    }

    const politicianIds = candidates.map(c => c.politician_id)
    const positions = await fetchPositions(supabase, politicianIds, slugById)

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
      fetchPartyPositions(supabase, partySiglas, slugById),
    ])

    const prompt = buildPrompt(filteredCandidates, positionsByCandidate, body.respostas)
    const fallbackData: FallbackData = {
      respostas: body.respostas,
      candidates: filteredCandidates,
      positions: filteredPositions,
      estado: body.estado,
      partyPositionsByParty,
      temaNomes: nomeBySlug,
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
