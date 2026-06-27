import { supabase } from './lib/supabase.js'
import { extractPositions } from './lib/gemini.js'
import { sleep } from './lib/sleep.js'

// Change to 2026 when running Plan 5 (production ingestion)
const ELECTION_YEAR = 2022

const DIVULGACAND_URL = 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/'
const RATE_LIMIT_DELAY_MS = 1_000

interface CandidateToProcess {
  id: string
  nome_civil: string
  nome_urna: string
  cargo: string
  estado: string
  numero_urna: string
}

/** Returns all candidates for ELECTION_YEAR that have no entries in politician_positions yet. */
async function fetchCandidatesWithoutPositions(): Promise<CandidateToProcess[]> {
  const [candidaciesResult, positionsResult] = await Promise.all([
    supabase
      .from('candidacies')
      .select('politician_id, cargo, estado, numero_urna, politicians!inner(id, nome_urna)')
      .eq('ano_eleicao', ELECTION_YEAR)
      .eq('turno', 1)
      .not('status', 'in', '("indeferido","cassado")'),
    supabase
      .from('politician_positions')
      .select('politician_id'),
  ])

  if (candidaciesResult.error) throw new Error(`Failed to fetch candidacies: ${candidaciesResult.error.message}`)
  if (positionsResult.error) throw new Error(`Failed to fetch positions: ${positionsResult.error.message}`)

  const withPositions = new Set(
    ((positionsResult.data ?? []) as Array<{ politician_id: string }>).map(p => p.politician_id),
  )

  type RawRow = {
    politician_id: string
    cargo: string
    estado: string
    numero_urna: string
    politicians: { id: string; nome_urna: string }
  }

  return ((candidaciesResult.data ?? []) as RawRow[])
    .filter(row => !withPositions.has(row.politician_id))
    .map(row => ({
      id: row.politicians.id,
      nome_civil: row.politicians.nome_urna,
      nome_urna: row.politicians.nome_urna,
      cargo: row.cargo,
      estado: row.estado,
      numero_urna: row.numero_urna,
    }))
}

async function fetchGovernmentPlan(
  estado: string,
  numeroUrna: string,
): Promise<string | null> {
  const url = `${DIVULGACAND_URL}${ELECTION_YEAR}/2/${estado}/${numeroUrna}/proposta`
  const response = await fetch(url)
  if (!response.ok) return null

  const json = await response.json() as { arquivos?: Array<{ url?: string }> }
  const pdfUrl = json.arquivos?.[0]?.url
  if (!pdfUrl) return null

  const textResponse = await fetch(pdfUrl)
  return textResponse.ok ? textResponse.text() : null
}

async function savePositions(
  politicianId: string,
  positions: Array<{ temaSlug: string; posicao: string; justificativa: string }>,
): Promise<void> {
  const rows = positions.map(p => ({
    politician_id: politicianId,
    theme_slug: p.temaSlug,
    posicao: p.posicao,
    justificativa: p.justificativa,
    source: 'divulgacand_gemini',
  }))

  const { error } = await supabase
    .from('politician_positions')
    .upsert(rows, { onConflict: 'politician_id,theme_slug' })

  if (error) throw new Error(`Failed to save positions: ${error.message}`)
}

/** Entry point. Processes all candidates that don't yet have positions in the DB. */
async function main(): Promise<void> {
  const candidates = await fetchCandidatesWithoutPositions()
  console.info(`[extract-positions] ${candidates.length} candidates to process`)

  for (const candidate of candidates) {
    console.info(`[extract-positions] Processing: ${candidate.nome_urna}`)

    try {
      const planText = await fetchGovernmentPlan(candidate.estado, candidate.numero_urna)

      if (!planText) {
        console.info(`[extract-positions] [SKIPPED] No government plan: ${candidate.nome_urna}`)
        await sleep(RATE_LIMIT_DELAY_MS)
        continue
      }

      const positions = await extractPositions(candidate.nome_civil, planText)
      if (positions.length > 0) await savePositions(candidate.id, positions)
      console.info(`[extract-positions] Saved ${positions.length} positions for ${candidate.nome_urna}`)
    } catch (err) {
      console.error(`[extract-positions] Error for ${candidate.nome_urna}:`, err)
    }

    await sleep(RATE_LIMIT_DELAY_MS)
  }

  console.info('[extract-positions] Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
