/// <reference lib="deno.ns" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
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
  type Observacao,
  type PositionWithSlug,
  type RespostaUsuario,
  scoreCandidato,
  scoreWithoutAI,
  type TemaCandidatoDetalhe,
} from './scoring.ts'

// ─── Local types ──────────────────────────────────────────────────────────────

export interface AlertRow {
  politician_id: string
  tipo: string
  // Historical fact: how grave the documented matter was. Never changes.
  severidade: string
  // How much this should still weigh today. v_candidate_alerts coalesces
  // this to severidade when the alert was never reassessed, so it is
  // always present and always the value to color/sort/derive by, never
  // raw severidade directly.
  severidade_atual: string
  severidade_atual_motivo: string | null
  titulo: string
  descricao: string
  fonte_url: string
  badge_cor: string
  // badge_cor is already 'cinza' when !ativo. v_candidate_alerts computes
  // that. These two exist so the frontend can render the ", resolvido"
  // label and show what actually happened, not just a neutral color.
  ativo: boolean
  resolucao: string | null
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
          .select('politician_id, theme_id, posicao, intensidade, confianca_ia, neutro_motivo')
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
      // justificativa is display-only and now arrives via fetchDetalhePosicoes,
      // which runs over the ≤23 finalists rather than every candidate in the state.
    }))
    .filter(p => p.themeSlug !== '')
}

async function fetchAlerts(
  supabase: ReturnType<typeof createSupabaseClient>,
  politicianIds: string[],
): Promise<AlertRow[]> {
  if (politicianIds.length === 0) return []
  const { data, error } = await supabase
    .from('v_candidate_alerts')
    .select('politician_id, tipo, severidade, severidade_atual, severidade_atual_motivo, titulo, descricao, fonte_url, badge_cor, ativo, resolucao')
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

// ─── Response post-processing ─────────────────────────────────────────────────

function alertRowToAlerta(a: AlertRow) {
  return {
    tipo: a.tipo,
    severidade: a.severidade,
    severidadeAtual: a.severidade_atual,
    severidadeAtualMotivo: a.severidade_atual_motivo,
    titulo: a.titulo,
    descricao: a.descricao,
    fonteUrl: a.fonte_url,
    badgeCor: a.badge_cor,
    ativo: a.ativo,
    resolucao: a.resolucao,
  }
}

// An accusation about conduct. These drive the "alertas" counter.
export const ALERT_TIPOS_ACUSATORIOS = new Set(['ficha_suja', 'investigacao', 'polemica'])
// A caveat about the reading itself. These drive the "observações" counter and
// must never appear in the same visual register as an accusation.
export const ALERT_TIPOS_OBSERVACAO = new Set(['incoerencia', 'divergencia_espectro', 'ressalva_evidencias'])

const ESPECTRO_LABELS: Record<string, string> = {
  esquerda:          'esquerda',
  centro_esquerda:   'centro-esquerda',
  centro:            'centro',
  centro_direita:    'centro-direita',
  direita:           'direita',
  sem_classificacao: 'sem classificação',
}

/**
 * Caveats about how this candidate was read.
 *
 * Deliberately silent about `evidencia === 'ausente'`: match v3 already renders
 * those themes as `○ não encontrado` and already charges them
 * P_NAO_INFORMADO in the score. Repeating them here would state one fact twice
 * and push a typical counter to ~9, burying the findings that are actually
 * about this candidate rather than about our coverage.
 *
 * Contradictions come first — a voter should meet the stronger claim before the
 * methodological one.
 */
export function deriveObservacoes(
  obsAlerts: AlertRow[],
  detalhes: TemaCandidatoDetalhe[],
  dossie: Dossie | null,
  coerenciaPorTema: Map<string, CoerenciaTema>,
): Observacao[] {
  const contradicoes: Observacao[] = []
  const ressalvas: Observacao[] = []

  for (const a of obsAlerts) {
    const isRessalva = a.tipo === 'ressalva_evidencias'
    ;(isRessalva ? ressalvas : contradicoes).push({
      categoria: isRessalva ? 'ressalva' : 'contradicao',
      titulo: a.titulo,
      descricao: a.descricao,
      temaSlug: null,
      fonteUrl: a.fonte_url,
      // severidade_atual, not severidade: already coalesced by
      // v_candidate_alerts, so this is the present-day weight, same value
      // the corresponding Alerta on this candidate would show.
      severidade: a.severidade_atual,
    })
  }

  if (dossie?.espectroDeclarado && dossie.espectroInferido &&
      dossie.espectroDeclarado !== dossie.espectroInferido) {
    const declarado = ESPECTRO_LABELS[dossie.espectroDeclarado] ?? dossie.espectroDeclarado
    const inferido = ESPECTRO_LABELS[dossie.espectroInferido] ?? dossie.espectroInferido
    contradicoes.push({
      categoria: 'contradicao',
      titulo: 'Espectro declarado diverge do inferido',
      descricao: `O candidato se apresenta como ${declarado}, mas a análise das posições documentadas aponta ${inferido}.`,
      temaSlug: null,
      fonteUrl: null,
      severidade: 'baixa',
    })
  }

  for (const d of detalhes) {
    if (coerenciaPorTema.get(d.temaSlug) === 'incoerente') {
      contradicoes.push({
        categoria: 'contradicao',
        titulo: d.temaNome,
        descricao: d.justificativa ?? 'A conduta registrada contradiz a plataforma declarada neste tema.',
        temaSlug: d.temaSlug,
        fonteUrl: null,
        // Default chosen 2026-08-25: real incoerencia alerts (the closest
        // analogue with a human-assigned severity) split across media/alta/
        // baixa with no clear majority, so this couldn't be inferred from
        // data — alta was a deliberate product call, not a derived value.
        severidade: 'alta',
      })
    }
    if (d.evidencia === 'partido') {
      ressalvas.push({
        categoria: 'ressalva',
        titulo: d.temaNome,
        descricao: 'Posição lida no programa do partido — não há declaração do próprio candidato sobre este tema.',
        temaSlug: d.temaSlug,
        fonteUrl: null,
        severidade: 'baixa',
      })
    }
    // Only where credibility was actually applied: v3 scores a `direta` theme at
    // full credibility regardless of how sure the model was, and nothing else in
    // v3 surfaces that. An `ausente` theme is already accounted for elsewhere.
    if (d.baixaConfianca && d.evidencia === 'direta') {
      ressalvas.push({
        categoria: 'ressalva',
        titulo: d.temaNome,
        descricao: 'Posição classificada por IA com confiança abaixo do limiar de revisão, mas contada integralmente no cálculo.',
        temaSlug: d.temaSlug,
        fonteUrl: null,
        severidade: 'baixa',
      })
    }
  }

  // The enrichment pipeline that writes coerencia_tema = 'incoerente' on a theme
  // is the same one that emits the incoerencia alert about it, so the two
  // describe one finding. An alert carries no temaSlug — only a titulo — and
  // the theme-derived entry's titulo is the theme's own name, so keying on
  // titulo is what collapses them. An alert titled after a different theme
  // does not match and survives as its own observation: we cannot prove it is
  // the same finding, and inventing a match would hide a real one.
  //
  // Scoped to contradicoes only: that "same pipeline, same finding" guarantee
  // was established for the incoerencia alert / incoerente theme pair alone.
  // On the ressalva side a freeform ressalva_evidencias alert can legitimately
  // share a theme's display name with a structured partido/baixaConfianca
  // ressalva while describing a different caveat — collapsing those would
  // drop the structured entry (the more useful one, since it carries
  // temaSlug) for no evidence they are the same finding.
  const vistos = new Set<string>()
  const semRepeticao = (o: Observacao) => {
    const chave = `${o.categoria}|${o.titulo}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  }

  return [...contradicoes.filter(semRepeticao), ...ressalvas]
}

export function attachAlerts(result: MatchResult, alerts: AlertRow[]): MatchResult {
  const alertMap = groupBy(alerts.filter(a => ALERT_TIPOS_ACUSATORIOS.has(a.tipo)), a => a.politician_id)
  const cargos = result.cargos.map(grupo => ({
    ...grupo,
    candidatos: grupo.candidatos.map(c => {
      const candidatoAlertas = (alertMap[c.politicianId] ?? []).map(alertRowToAlerta)
      return { ...c, temAlertas: candidatoAlertas.length > 0, alertas: candidatoAlertas }
    }),
  }))
  return { ...result, cargos }
}

export interface EnrichmentContext {
  alerts: AlertRow[]
  candidacyIdByPolitician: Map<string, string>
  dossieByCandidacy: Map<string, Dossie>
  fontesByPolitician: Map<string, Fonte[]>
  detalhesByPolitician: Map<string, Map<string, DetalhePosicao>>
}

// Party entries (voto de legenda) are not people: no candidacy, no dossier, no
// source catalogue, and every theme is party-sourced by construction — flagging
// that as a ressalva would be noise on every row.
export function enrichResult(result: MatchResult, ctx: EnrichmentContext): MatchResult {
  const alertsByPolitician = groupBy(ctx.alerts, a => a.politician_id)
  const withAlerts = attachAlerts(result, ctx.alerts)

  return {
    ...withAlerts,
    cargos: withAlerts.cargos.map(grupo => ({
      ...grupo,
      candidatos: grupo.candidatos.map(c => {
        if (c.isParty) return c

        const detalhes = ctx.detalhesByPolitician.get(c.politicianId) ?? new Map<string, DetalhePosicao>()

        // justificativa no longer reaches scoreCandidato (D13) — this is the
        // only place it can be put on a theme row, and deriveObservacoes below
        // reads it, so it has to happen first.
        const detalhesTemas = c.detalhesTemas.map(d => ({
          ...d,
          justificativa: detalhes.get(d.temaSlug)?.justificativa ?? null,
        }))

        const coerencia = new Map<string, CoerenciaTema>()
        for (const [slug, det] of detalhes) {
          if (det.coerenciaTema !== null) coerencia.set(slug, det.coerenciaTema)
        }

        const candidacyId = ctx.candidacyIdByPolitician.get(c.politicianId)
        const dossie = candidacyId === undefined
          ? null
          : ctx.dossieByCandidacy.get(candidacyId) ?? null
        const obsAlerts = (alertsByPolitician[c.politicianId] ?? [])
          .filter(a => ALERT_TIPOS_OBSERVACAO.has(a.tipo))

        return {
          ...c,
          detalhesTemas,
          dossie,
          fontes: ctx.fontesByPolitician.get(c.politicianId) ?? [],
          coerenciaPorTema: Object.fromEntries(coerencia),
          observacoes: deriveObservacoes(obsAlerts, detalhesTemas, dossie, coerencia),
        }
      }),
    })),
  }
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
    // Only party positions are needed before scoring. Everything else is fetched
    // after the trim below, when the set is ≤23 candidates instead of ~90.
    const partyPositionsByParty = await fetchPartyPositions(supabase, partySiglas, slugById)

    const fallbackData: FallbackData = {
      respostas: body.respostas,
      candidates: filteredCandidates,
      positions: filteredPositions,
      estado: body.estado,
      partyPositionsByParty,
      temaNomes: nomeBySlug,
    }

    const rawResult = scoreWithoutAI(fallbackData)

    // Party match entries: parties appear as standalone results for legislative cargos
    // (voters may choose the party via voto de legenda). These are distinct from the
    // per-theme party fallback above — here the party IS the candidate entry.
    const partyEntries = buildPartyResults(candidates, partyPositionsByParty, body.respostas)
    const mergedResult = injectPartyResults(rawResult, partyEntries)

    const trimmed = sortAndLimitCargos(mergedResult)

    const finalistIds = [...new Set(
      trimmed.cargos.flatMap(g => g.candidatos).filter(c => !c.isParty).map(c => c.politicianId),
    )]
    const candidacyIdByPolitician = new Map(
      candidates
        .filter(c => finalistIds.includes(c.politician_id))
        .map(c => [c.politician_id, c.candidacy_id]),
    )
    const candidacyIds = [...new Set([...candidacyIdByPolitician.values()])]

    // Scoring is already complete and correct at this point. Enrichment is
    // decorative: a dossier table that 46 of 20,004 candidates have a row in
    // must never cost a voter their result. Each block already renders nothing
    // when its data is absent (D8), so an empty fallback is a valid state.
    const [alertsR, dossieR, fontesR, detalhesR] = await Promise.allSettled([
      fetchAlerts(supabase, finalistIds),
      fetchDossiers(supabase, candidacyIds),
      fetchSources(supabase, finalistIds),
      fetchDetalhePosicoes(supabase, finalistIds, slugById),
    ])

    for (const [nome, r] of [
      ['alerts', alertsR], ['dossiers', dossieR], ['sources', fontesR], ['position details', detalhesR],
    ] as const) {
      if (r.status === 'rejected') console.error(`[match-candidatos] enrichment: ${nome} failed:`, r.reason)
    }

    const finalResult = enrichResult(trimmed, {
      alerts: alertsR.status === 'fulfilled' ? alertsR.value : [],
      candidacyIdByPolitician,
      dossieByCandidacy: dossieR.status === 'fulfilled' ? dossieR.value : new Map(),
      fontesByPolitician: fontesR.status === 'fulfilled' ? fontesR.value : new Map(),
      detalhesByPolitician: detalhesR.status === 'fulfilled' ? detalhesR.value : new Map(),
    })

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
