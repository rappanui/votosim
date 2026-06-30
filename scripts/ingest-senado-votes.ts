import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import { supabase } from './lib/supabase.js'
import { sleep } from './lib/sleep.js'

const execAsync = promisify(exec)

const ELECTION_YEAR = 2022
const RATE_LIMIT_DELAY_MS = 1_000
const VOTE_CONFIDENCE = 0.75
// Senators elected in 2022 started voting in Feb 2023 (57th legislature)
const VOTE_DATE_START = '2023-02-01'
const VOTE_DATE_END   = '2026-06-29'

// ─── Keyword classifier ───────────────────────────────────────────────────────

const THEME_KEYWORDS: Array<{ slugs: string[]; keywords: string[] }> = [
  { slugs: ['sus_saude_publica'],           keywords: ['saúde', 'sus', 'hospital', 'médico', 'medicamento', 'enfermagem', 'sanitário', 'saude', 'medico', 'sanitario'] },
  { slugs: ['privatizacao_estatais'],       keywords: ['privatização', 'privatizacao', 'concessão', 'concessao', 'petrobras', 'eletrobrás', 'eletrobras', 'estatal'] },
  { slugs: ['reforma_tributaria', 'politica_economica'], keywords: ['tributário', 'tributario', 'tributo', 'imposto', 'reforma fiscal', 'icms', 'iva', 'fiscal'] },
  { slugs: ['seguranca_publica_estadual'],  keywords: ['segurança pública', 'seguranca publica', 'polícia', 'policia', 'presídio', 'presidio', 'crime', 'penitenciária', 'penitenciaria'] },
  { slugs: ['educacao_basica'],             keywords: ['educação', 'educacao', 'escola', 'ensino', 'professor', 'bncc', 'universitário', 'universitario'] },
  { slugs: ['meio_ambiente_desmatamento'],  keywords: ['meio ambiente', 'desmatamento', 'floresta', 'amazônia', 'amazonia', 'clima', 'emissão', 'emissao', 'carbono'] },
  { slugs: ['reforma_previdencia'],         keywords: ['previdência', 'previdencia', 'aposentadoria', 'inss', 'pensão', 'pensao'] },
  { slugs: ['bolsa_familia_transferencia'], keywords: ['bolsa família', 'bolsa familia', 'auxílio brasil', 'auxilio brasil', 'transferência de renda', 'transferencia de renda', 'benefício social', 'beneficio social'] },
  { slugs: ['direitos_lgbtqia'],            keywords: ['lgbtqia', 'lgbtq', 'homofobia', 'transfobia', 'diversidade sexual', 'identidade de gênero', 'identidade de genero'] },
  { slugs: ['porte_armas'],                 keywords: ['arma de fogo', 'armamento', 'porte de arma', 'desarmamento', 'clube de tiro', 'caçador', 'cacador'] },
  { slugs: ['corrupcao_transparencia'],     keywords: ['corrupção', 'corrupcao', 'transparência', 'transparencia', 'lavagem de dinheiro', 'ficha limpa', 'improbidade'] },
  { slugs: ['politica_economica'],          keywords: ['juros', 'banco central', 'inflação', 'inflacao', 'orçamento', 'orcamento', 'pib', 'crescimento econômico', 'crescimento economico'] },
  { slugs: ['politica_externa'],            keywords: ['política externa', 'politica externa', 'relações exteriores', 'relacoes exteriores', 'mercosul', 'acordo internacional', 'diplomacia'] },
  { slugs: ['pauta_moral_costumes'],        keywords: ['aborto', 'eutanásia', 'eutanasia', 'drogas', 'família tradicional', 'familia tradicional', 'valores cristãos', 'valores cristaos'] },
]

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function classifyEmenta(ementa: string): string[] {
  if (!ementa) return []
  const lower = normalize(ementa)
  const matched = new Set<string>()
  for (const { slugs, keywords } of THEME_KEYWORDS) {
    if (keywords.some(kw => lower.includes(normalize(kw)))) {
      for (const slug of slugs) matched.add(slug)
    }
  }
  return [...matched]
}

// ─── Vote categorization ──────────────────────────────────────────────────────

// Works for both old SiglaVoto and new SiglaDescricaoVoto field values
export function categorizeSenadoVote(siglaVoto: string): 'sim' | 'nao' | 'skip' {
  if (siglaVoto === 'Sim') return 'sim'
  if (siglaVoto === 'Não') return 'nao'
  return 'skip'
}

// ─── Posicao derivation ───────────────────────────────────────────────────────

export interface VoteCount { sim: number; nao: number }

export function deriveSenadoPosicao(count: VoteCount): { posicao: 'favoravel' | 'contrario' | 'neutro'; intensidade: number } {
  const total = count.sim + count.nao
  if (total === 0 || count.sim === count.nao) return { posicao: 'neutro', intensidade: 1 }
  const posicao = count.sim > count.nao ? 'favoravel' : 'contrario'
  const intensidade = Math.min(5, Math.max(1, Math.floor(Math.log2(total)) + 1))
  return { posicao, intensidade }
}

// ─── Senado API types ─────────────────────────────────────────────────────────

interface SenadoInfo {
  codigo: string
  nomeParlamentar: string
  nomeCompleto: string
  uf: string
}

interface SenadoVotacao {
  Materia: { Ementa?: string; EmentaMateria?: string }
  SiglaDescricaoVoto: string
  DescricaoVotacao?: string
}

// ─── Senado API helpers ───────────────────────────────────────────────────────

async function fetchSenadoJson<T>(url: string): Promise<T | null> {
  try {
    const { stdout } = await execAsync(
      `curl -s --max-time 60 -H "Accept: application/json" "${url}"`,
      { maxBuffer: 64 * 1024 * 1024 },
    )
    if (!stdout.trim()) {
      console.warn(`[senado-api] Empty response for ${url}`)
      return null
    }
    return JSON.parse(stdout) as T
  } catch (err) {
    console.warn(`[senado-api] Fetch error: ${(err as Error).message}`)
    return null
  }
}

async function fetchSenadorList(): Promise<SenadoInfo[]> {
  const data = await fetchSenadoJson<{
    ListaParlamentarEmExercicio?: {
      Parlamentares?: {
        Parlamentar?: {
          IdentificacaoParlamentar: {
            CodigoParlamentar: string
            NomeParlamentar: string
            NomeCompletoParlamentar: string
            UfParlamentar: string
          }
        } | {
          IdentificacaoParlamentar: {
            CodigoParlamentar: string
            NomeParlamentar: string
            NomeCompletoParlamentar: string
            UfParlamentar: string
          }
        }[]
      }
    }
  }>('https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json')

  const parlamentares = data?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar
  if (!parlamentares) return []
  const list = Array.isArray(parlamentares) ? parlamentares : [parlamentares]
  return list
    .map(p => ({
      codigo: p.IdentificacaoParlamentar.CodigoParlamentar,
      nomeParlamentar: p.IdentificacaoParlamentar.NomeParlamentar,
      nomeCompleto: p.IdentificacaoParlamentar.NomeCompletoParlamentar,
      uf: p.IdentificacaoParlamentar.UfParlamentar,
    }))
    .filter(p => p.codigo)
}

async function fetchSenadorVotes(codigo: string): Promise<SenadoVotacao[]> {
  const url = `https://legis.senado.leg.br/dadosabertos/senador/${codigo}/votacoes.json?dataInicio=${VOTE_DATE_START}&dataFim=${VOTE_DATE_END}`
  const data = await fetchSenadoJson<{
    VotacaoParlamentar?: { Parlamentar?: { Votacoes?: { Votacao?: SenadoVotacao | SenadoVotacao[] } } }
    VotacaoSenador?: { Votacoes?: { Votacao?: SenadoVotacao | SenadoVotacao[] } }
  }>(url)

  // Support both new API format (VotacaoParlamentar) and old (VotacaoSenador)
  const votacoes =
    data?.VotacaoParlamentar?.Parlamentar?.Votacoes?.Votacao ??
    data?.VotacaoSenador?.Votacoes?.Votacao
  if (!votacoes) return []
  return Array.isArray(votacoes) ? votacoes : [votacoes]
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function loadThemeMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('themes_catalog').select('id, slug')
  if (error) throw new Error(`Failed to load themes: ${error.message}`)
  return new Map((data ?? []).map((r: { id: string; slug: string }) => [r.slug, r.id]))
}

// Matches senator to politician by ballot name, then full name as fallback.
// CPF was removed from the Senado API in 2024; name matching is the only option.
async function findPoliticianByName(nomeParlamentar: string, nomeCompleto: string): Promise<string | null> {
  const nomeUrna = nomeParlamentar.toUpperCase()

  const { data: byUrna } = await supabase
    .from('politicians')
    .select('id')
    .eq('nome_urna', nomeUrna)
    .limit(1)
  if (byUrna && byUrna.length > 0) return (byUrna[0] as { id: string }).id

  const nomeCompletoUpper = nomeCompleto.toUpperCase()
  const { data: byCompleto } = await supabase
    .from('politicians')
    .select('id')
    .eq('nome_completo', nomeCompletoUpper)
    .limit(1)
  return (byCompleto && byCompleto.length > 0)
    ? (byCompleto[0] as { id: string }).id
    : null
}

async function upsertSenadorPositions(
  politicianId: string,
  tally: Map<string, VoteCount>,
  themeMap: Map<string, string>,
): Promise<number> {
  const rows = []
  for (const [themeSlug, count] of tally) {
    const themeId = themeMap.get(themeSlug)
    if (!themeId) continue
    const { posicao, intensidade } = deriveSenadoPosicao(count)
    rows.push({
      politician_id: politicianId,
      theme_id: themeId,
      posicao,
      intensidade,
      fontes: [{
        tipo: 'votacao_senado',
        descricao: `${count.sim} votos sim / ${count.nao} votos não (${VOTE_DATE_START} a ${VOTE_DATE_END})`,
        url: null,
        data: String(ELECTION_YEAR),
        confiabilidade: VOTE_CONFIDENCE,
      }],
      gerado_por_ia: false,
      validado: true,
      confianca_ia: VOTE_CONFIDENCE,
    })
  }
  if (rows.length === 0) return 0
  const { error } = await supabase
    .from('politician_positions')
    .upsert(rows, { onConflict: 'politician_id,theme_id' })
  if (error) throw new Error(`Upsert failed for ${politicianId}: ${error.message}`)
  return rows.length
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Usage: npm run ingest-senado-votes
 */
async function main(): Promise<void> {
  const senators = await fetchSenadorList()
  console.info(`[ingest-senado-votes] ${senators.length} senators found`)

  const themeMap = await loadThemeMap()

  let totalUpserted = 0
  let notFound = 0
  let processed = 0

  for (const { codigo, nomeParlamentar, nomeCompleto, uf } of senators) {
    processed++
    console.info(`[ingest-senado-votes] [${processed}/${senators.length}] Processing ${nomeParlamentar} (${uf})`)

    const politicianId = await findPoliticianByName(nomeParlamentar, nomeCompleto)
    if (!politicianId) {
      console.warn(`[ingest-senado-votes] ${nomeParlamentar} not found in politicians table`)
      notFound++
      continue
    }

    const votes = await fetchSenadorVotes(codigo)
    await sleep(RATE_LIMIT_DELAY_MS)

    if (votes.length === 0) {
      console.info(`[ingest-senado-votes] ${nomeParlamentar}: no votes in date range`)
      continue
    }

    const tally = new Map<string, VoteCount>()
    for (const vote of votes) {
      const siglaVoto = vote.SiglaDescricaoVoto
      const cat = categorizeSenadoVote(siglaVoto)
      if (cat === 'skip') continue
      // Use all available text for keyword matching
      const ementa = [
        vote.Materia?.Ementa,
        vote.Materia?.EmentaMateria,
        vote.DescricaoVotacao,
      ].filter(Boolean).join(' ')
      const slugs = classifyEmenta(ementa)
      for (const slug of slugs) {
        const cur = tally.get(slug) ?? { sim: 0, nao: 0 }
        if (cat === 'sim') cur.sim++
        else cur.nao++
        tally.set(slug, cur)
      }
    }

    const upserted = await upsertSenadorPositions(politicianId, tally, themeMap)
    console.info(`[ingest-senado-votes] ${nomeParlamentar}: ${votes.length} votes → ${upserted} positions upserted`)
    totalUpserted += upserted
  }

  console.info(`\n[ingest-senado-votes] Done. Position rows upserted: ${totalUpserted}, senators not matched: ${notFound}`)
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1) })
}
