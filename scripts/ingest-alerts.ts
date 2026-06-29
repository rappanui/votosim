import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { supabase } from './lib/supabase.js'

// motivo_cassacao_{ano}.csv columns (TSE 2022 format)
// Note: this file does NOT contain NR_CPF_CANDIDATO — only SQ_CANDIDATO.
// We resolve CPF by joining with the consulta_cand file passed as second argument.
const COL_SQ         = 'SQ_CANDIDATO'
const COL_MOTIVO     = 'DS_MOTIVO'
const COL_TP_MOTIVO  = 'DS_TP_MOTIVO'
const COL_UF         = 'SG_UF'

// consulta_cand_{ano}.csv columns (used for the CPF lookup)
const CAND_COL_SQ    = 'SQ_CANDIDATO'
const CAND_COL_CPF   = 'NR_CPF_CANDIDATO'
const CAND_COL_CARGO = 'DS_CARGO'

const TSE_SOURCE_URL  = 'https://dadosabertos.tse.jus.br/dataset/candidatos-2022'
const TSE_SOURCE_NOME = 'TSE — Motivo de Cassação / Ficha Limpa / LC 135/2010'

type CsvRow = Record<string, string>

function hashCpf(cpf: string): string {
  return createHash('sha256').update(cpf.replace(/\D/g, '')).digest('hex')
}

/** Builds a map of SQ_CANDIDATO → cpf_hash from the consulta_cand CSV file. */
function buildSqToCpfMap(candCsvPath: string): Map<string, { cpfHash: string; cargo: string }> {
  console.info(`[ingest-alerts] Building SQ→CPF map from ${candCsvPath}`)
  const content = readFileSync(candCsvPath, 'latin1')
  const rows: CsvRow[] = parse(content, { delimiter: ';', columns: true, skip_empty_lines: true })
  const map = new Map<string, { cpfHash: string; cargo: string }>()
  for (const row of rows) {
    const sq  = row[CAND_COL_SQ]?.trim()
    const cpf = row[CAND_COL_CPF]?.replace(/\D/g, '')
    if (sq && cpf) map.set(sq, { cpfHash: hashCpf(cpf), cargo: row[CAND_COL_CARGO] ?? '' })
  }
  console.info(`[ingest-alerts] Map built: ${map.size} candidates indexed`)
  return map
}

async function findPoliticianByCpfHash(cpfHash: string): Promise<string | null> {
  const { data } = await supabase
    .from('politicians')
    .select('id')
    .eq('cpf_hash', cpfHash)
    .maybeSingle()

  return (data as { id: string } | null)?.id ?? null
}

async function upsertAlert(politicianId: string, row: CsvRow, cargo: string): Promise<void> {
  const motivo    = row[COL_MOTIVO]?.substring(0, 100) ?? 'Cassação registrada no TSE'
  const descricao = [row[COL_TP_MOTIVO], cargo, row[COL_UF]].filter(Boolean).join(' — ')

  // Check if the alert already exists — the table may not have a unique constraint yet
  const { data: existing } = await supabase
    .from('politician_alerts')
    .select('id')
    .eq('politician_id', politicianId)
    .eq('tipo', 'ficha_suja')
    .eq('titulo', motivo)
    .maybeSingle()

  if (existing) return // already inserted, skip

  const { error } = await supabase.from('politician_alerts').insert({
    politician_id: politicianId,
    tipo: 'ficha_suja',
    severidade: 'critica',
    titulo: motivo,
    descricao: descricao.substring(0, 500),
    fonte_url: TSE_SOURCE_URL,
    fonte_nome: TSE_SOURCE_NOME,
    data_ocorrencia: null,
    ativo: true,
    validado: true,
    gerado_por_ia: false,
  })

  if (error) throw new Error(`Failed to insert alert for politician ${politicianId}: ${error.message}`)
}

/**
 * Entry point.
 * Usage: npm run ingest-alerts -- <motivo_cassacao.csv> [<consulta_cand.csv>]
 *
 * If consulta_cand.csv is provided, SQ_CANDIDATO in the motivo_cassacao file is resolved
 * to a CPF hash via the candidates file. Without it, rows without CPF are skipped.
 */
async function main(): Promise<void> {
  const alertsCsvPath = process.argv[2]
  const candCsvPath   = process.argv[3]

  if (!alertsCsvPath) {
    console.error('Usage: npm run ingest-alerts -- <motivo_cassacao.csv> [<consulta_cand.csv>]')
    process.exit(1)
  }

  // Build SQ→CPF lookup map if the consulta_cand file is provided
  const sqMap = candCsvPath ? buildSqToCpfMap(candCsvPath) : null
  if (!sqMap) {
    console.warn('[ingest-alerts] No consulta_cand CSV provided — rows without direct CPF will be skipped')
  }

  const content = readFileSync(alertsCsvPath, 'latin1')
  const rows: CsvRow[] = parse(content, { delimiter: ';', columns: true, skip_empty_lines: true })
  console.info(`[ingest-alerts] Parsed ${rows.length} rows from ${alertsCsvPath}`)

  let inserted = 0
  let notFound = 0
  let noSq     = 0

  for (const row of rows) {
    const sq = row[COL_SQ]?.trim()
    if (!sq) { noSq++; continue }

    const lookup = sqMap?.get(sq)
    if (!lookup) { notFound++; continue }

    const politicianId = await findPoliticianByCpfHash(lookup.cpfHash)
    if (!politicianId) { notFound++; continue }

    await upsertAlert(politicianId, row, lookup.cargo)
    inserted++
  }

  console.info(`[ingest-alerts] Done. Inserted: ${inserted}, not found/no-match: ${notFound}, no SQ: ${noSq}`)
}

main().catch(err => { console.error(err); process.exit(1) })
