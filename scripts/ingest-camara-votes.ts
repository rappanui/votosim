import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { supabase } from './lib/supabase.js'
import { sleep } from './lib/sleep.js'

const ELECTION_YEAR = 2022
const RATE_LIMIT_DELAY_MS = 500
const VOTE_CONFIDENCE = 0.80

// ─── Theme mapping ────────────────────────────────────────────────────────────

export const CAMARA_THEME_MAP: Array<{ keywords: string[]; slugs: string[] }> = [
  { keywords: ['saúde', 'saude'], slugs: ['sus_saude_publica'] },
  { keywords: ['tributação', 'tributacao', 'finanças e orçamento', 'financas e orcamento'], slugs: ['reforma_tributaria', 'politica_economica'] },
  { keywords: ['previdência', 'previdencia', 'assistência social', 'assistencia social'], slugs: ['reforma_previdencia', 'bolsa_familia_transferencia'] },
  { keywords: ['segurança pública', 'seguranca publica', 'penitenciária', 'penitenciaria'], slugs: ['seguranca_publica_estadual'] },
  { keywords: ['educação', 'educacao'], slugs: ['educacao_basica'] },
  { keywords: ['meio ambiente', 'desenvolvimento sustentável', 'desenvolvimento sustentavel'], slugs: ['meio_ambiente_desmatamento'] },
  { keywords: ['direitos humanos', 'minorias'], slugs: ['direitos_lgbtqia', 'pauta_moral_costumes'] },
  { keywords: ['defesa', 'armas', 'segurança nacional', 'seguranca nacional'], slugs: ['porte_armas'] },
  { keywords: ['ética', 'etica', 'anticorrupção', 'anticorrupcao', 'transparência', 'transparencia'], slugs: ['corrupcao_transparencia'] },
  { keywords: ['relações exteriores', 'relacoes exteriores', 'comércio internacional', 'comercio internacional'], slugs: ['politica_externa'] },
  { keywords: ['privatização', 'privatizacao', 'concessões', 'concessoes', 'estatais'], slugs: ['privatizacao_estatais'] },
]

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function mapCamaraThemeToSlugs(camaraTheme: string): string[] {
  const lower = normalize(camaraTheme)
  for (const { keywords, slugs } of CAMARA_THEME_MAP) {
    if (keywords.some(kw => lower.includes(normalize(kw)))) return slugs
  }
  return []
}

// ─── Proposition→slugs map ────────────────────────────────────────────────────

// Raw CSV columns from Câmara Open Data portal
interface ProposicaoTemaRaw { uriProposicao: string; tema: string }
interface VotacaoPropRaw    { idVotacao: string; proposicao_id: string }

// Internal types after normalizing column names
interface ProposicaoTema { idProposicao: string; tema: string }
interface VotacaoProp   { idVotacao: string; idProposicao: string }

export function buildProposicaoToSlugsMap(
  temas: ProposicaoTema[],
  votacoesProps: VotacaoProp[],
): Map<string, string[]> {
  const propToSlugs = new Map<string, Set<string>>()
  for (const { idProposicao, tema } of temas) {
    const slugs = mapCamaraThemeToSlugs(tema)
    if (slugs.length === 0) continue
    if (!propToSlugs.has(idProposicao)) propToSlugs.set(idProposicao, new Set())
    for (const slug of slugs) propToSlugs.get(idProposicao)!.add(slug)
  }

  const result = new Map<string, string[]>()
  for (const { idVotacao, idProposicao } of votacoesProps) {
    const slugSet = propToSlugs.get(idProposicao)
    if (!slugSet || slugSet.size === 0) continue
    if (!result.has(idVotacao)) result.set(idVotacao, [...slugSet])
  }
  return result
}

// ─── Vote categorization ──────────────────────────────────────────────────────

export function categorizeVote(voto: string): 'sim' | 'nao' | 'skip' {
  if (voto === 'Sim') return 'sim'
  if (voto === 'Não') return 'nao'
  return 'skip'
}

// ─── Vote aggregation ─────────────────────────────────────────────────────────

export interface VoteCount { sim: number; nao: number }

export function derivePosicao(count: VoteCount): { posicao: 'favoravel' | 'contrario' | 'neutro'; intensidade: number } {
  const total = count.sim + count.nao
  if (total === 0 || count.sim === count.nao) return { posicao: 'neutro', intensidade: 1 }
  const posicao = count.sim > count.nao ? 'favoravel' : 'contrario'
  const intensidade = Math.min(5, Math.max(1, Math.floor(Math.log2(total)) + 1))
  return { posicao, intensidade }
}

// ─── CSV types ────────────────────────────────────────────────────────────────

// Raw CSV column names from Câmara Open Data
interface VoteRowRaw { idVotacao: string; deputado_id: string; voto: string }
interface VoteRow    { idVotacao: string; idDeputado: string; voto: string }

function hashCpf(cpf: string): string {
  return createHash('sha256').update(cpf.replace(/\D/g, '')).digest('hex')
}

function parseCamaraCsv<T>(path: string): T[] {
  const content = readFileSync(path, 'utf-8').replace(/^﻿/, '') // strip BOM
  return parse(content, { delimiter: ';', columns: true, skip_empty_lines: true }) as T[]
}

// ─── Câmara API ───────────────────────────────────────────────────────────────

async function fetchDeputadoCpf(idDeputado: string): Promise<string | null> {
  const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${idDeputado}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const json = await res.json() as { dados?: { cpf?: string } }
    const cpf = json.dados?.cpf?.replace(/\D/g, '') ?? ''
    return cpf.length === 11 ? cpf : null
  } catch {
    return null
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function loadThemeMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('themes_catalog').select('id, slug')
  if (error) throw new Error(`Failed to load themes: ${error.message}`)
  return new Map((data ?? []).map((r: { id: string; slug: string }) => [r.slug, r.id]))
}

async function findPoliticianByCpfHash(cpfHash: string): Promise<string | null> {
  const { data } = await supabase
    .from('politicians')
    .select('id')
    .eq('cpf_hash', cpfHash)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function upsertPositions(
  politicianId: string,
  themeSlug: string,
  count: VoteCount,
  themeMap: Map<string, string>,
): Promise<void> {
  const themeId = themeMap.get(themeSlug)
  if (!themeId) return

  const { posicao, intensidade } = derivePosicao(count)

  const { error } = await supabase
    .from('politician_positions')
    .upsert({
      politician_id: politicianId,
      theme_id: themeId,
      posicao,
      intensidade,
      fontes: [{ tipo: 'votacao_camara', descricao: `${count.sim} votos sim / ${count.nao} votos não`, url: null, data: String(ELECTION_YEAR), confiabilidade: VOTE_CONFIDENCE }],
      gerado_por_ia: false,
      validado: true,
      confianca_ia: VOTE_CONFIDENCE,
    }, { onConflict: 'politician_id,theme_id' })

  if (error) throw new Error(`Upsert failed for ${politicianId}/${themeSlug}: ${error.message}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Usage: npm run ingest-camara-votes -- data/camara_2022
 */
async function main(): Promise<void> {
  const dataDir = process.argv[2]
  if (!dataDir) {
    console.error('Usage: npm run ingest-camara-votes -- <data-dir>')
    console.error('Example: npm run ingest-camara-votes -- data/camara_2022')
    process.exit(1)
  }

  console.info('[ingest-camara-votes] Loading CSVs...')
  // proposicoesTemas uses uriProposicao (URL) — extract numeric ID from end
  const temasRaw = parseCamaraCsv<ProposicaoTemaRaw>(`${dataDir}/proposicoesTemas-${ELECTION_YEAR}.csv`)
  const temasRows: ProposicaoTema[] = temasRaw.map(r => ({
    idProposicao: r.uriProposicao.split('/').pop() ?? '',
    tema: r.tema,
  }))
  // votacoesProposicoes uses proposicao_id
  const votacoesRaw = parseCamaraCsv<VotacaoPropRaw>(`${dataDir}/votacoesProposicoes-${ELECTION_YEAR}.csv`)
  const votacoesProps: VotacaoProp[] = votacoesRaw.map(r => ({
    idVotacao: r.idVotacao,
    idProposicao: r.proposicao_id,
  }))
  // votacoesVotos uses deputado_id
  const voteRowsRaw = parseCamaraCsv<VoteRowRaw>(`${dataDir}/votacoesVotos-${ELECTION_YEAR}.csv`)
  const voteRows: VoteRow[] = voteRowsRaw.map(r => ({
    idVotacao: r.idVotacao,
    idDeputado: r.deputado_id,
    voto: r.voto,
  }))

  console.info(`[ingest-camara-votes] ${temasRows.length} tema rows, ${votacoesProps.length} proposition rows, ${voteRows.length} vote rows`)

  const votacaoToSlugs = buildProposicaoToSlugsMap(temasRows, votacoesProps)
  console.info(`[ingest-camara-votes] ${votacaoToSlugs.size} vote sessions mapped to VotoSim themes`)

  const relevantDeputyIds = new Set<string>()
  for (const row of voteRows) {
    if (votacaoToSlugs.has(row.idVotacao)) relevantDeputyIds.add(row.idDeputado)
  }
  console.info(`[ingest-camara-votes] ${relevantDeputyIds.size} deputies with relevant votes`)

  const themeMap = await loadThemeMap()

  const deputyToPolitician = new Map<string, string>()
  let cpfResolved = 0
  let cpfFailed = 0
  for (const idDeputado of relevantDeputyIds) {
    const cpf = await fetchDeputadoCpf(idDeputado)
    if (cpf) {
      const politicianId = await findPoliticianByCpfHash(hashCpf(cpf))
      if (politicianId) {
        deputyToPolitician.set(idDeputado, politicianId)
        cpfResolved++
      } else {
        cpfFailed++
      }
    } else {
      cpfFailed++
    }
    await sleep(RATE_LIMIT_DELAY_MS)
    if ((cpfResolved + cpfFailed) % 50 === 0) {
      console.info(`[ingest-camara-votes] CPF progress: ${cpfResolved} resolved, ${cpfFailed} failed`)
    }
  }
  console.info(`[ingest-camara-votes] CPF resolution done: ${cpfResolved} matched, ${cpfFailed} not found`)

  const tally = new Map<string, Map<string, VoteCount>>()
  for (const row of voteRows) {
    const slugs = votacaoToSlugs.get(row.idVotacao)
    if (!slugs) continue
    const politicianId = deputyToPolitician.get(row.idDeputado)
    if (!politicianId) continue
    const cat = categorizeVote(row.voto)
    if (cat === 'skip') continue

    if (!tally.has(politicianId)) tally.set(politicianId, new Map())
    for (const slug of slugs) {
      const cur = tally.get(politicianId)!.get(slug) ?? { sim: 0, nao: 0 }
      if (cat === 'sim') cur.sim++
      else cur.nao++
      tally.get(politicianId)!.set(slug, cur)
    }
  }

  let upserted = 0
  for (const [politicianId, slugMap] of tally) {
    for (const [themeSlug, count] of slugMap) {
      await upsertPositions(politicianId, themeSlug, count, themeMap)
      upserted++
    }
  }

  console.info(`[ingest-camara-votes] Done. Position rows upserted: ${upserted} for ${tally.size} deputies`)
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1) })
}
