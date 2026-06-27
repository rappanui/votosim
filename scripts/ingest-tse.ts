import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { supabase } from './lib/supabase.js'

// TSE CSV column names — verify against actual file headers before running
const COL_NOME_URNA     = 'NM_URNA_CANDIDATO'
const COL_NOME_CIVIL    = 'NM_CANDIDATO'
const COL_CPF           = 'NR_CPF_CANDIDATO'
const COL_CARGO         = 'DS_CARGO'
const COL_PARTIDO_SIGLA = 'SG_PARTIDO'
const COL_PARTIDO_NOME  = 'NM_PARTIDO'
const COL_UF            = 'SG_UF'
const COL_NUMERO        = 'NR_CANDIDATO'

// Change to 2026 when running Plan 5 (production ingestion)
const ELECTION_YEAR = 2022

const CARGO_MAP: Record<string, string> = {
  'PRESIDENTE':         'presidente',
  'GOVERNADOR':         'governador',
  'SENADOR':            'senador',
  'DEPUTADO FEDERAL':   'deputado_federal',
  'DEPUTADO ESTADUAL':  'deputado_estadual',
  'DEPUTADO DISTRITAL': 'deputado_distrital',
}

type CsvRow = Record<string, string>

function parseCargoOrSkip(rawCargo: string): string | null {
  return CARGO_MAP[rawCargo.toUpperCase().trim()] ?? null
}

async function upsertParty(sigla: string, nome: string): Promise<void> {
  const { error } = await supabase
    .from('parties')
    .upsert({ sigla, nome_completo: nome }, { onConflict: 'sigla', ignoreDuplicates: true })
  if (error) throw new Error(`Failed to upsert party ${sigla}: ${error.message}`)
}

async function upsertPolitician(row: CsvRow): Promise<string> {
  const { data, error } = await supabase
    .from('politicians')
    .upsert(
      {
        nome_urna: row[COL_NOME_URNA],
        cpf_hash: row[COL_CPF],
        partido_atual: row[COL_PARTIDO_SIGLA],
        ativo: true,
      },
      { onConflict: 'cpf_hash' },
    )
    .select('id')
    .single()

  if (error) throw new Error(`Failed to upsert politician ${row[COL_NOME_CIVIL]}: ${error.message}`)
  return (data as { id: string }).id
}

async function upsertCandidacy(politicianId: string, row: CsvRow, cargo: string): Promise<void> {
  const { error } = await supabase.from('candidacies').upsert(
    {
      politician_id: politicianId,
      ano_eleicao: ELECTION_YEAR,
      turno: 1,
      cargo,
      estado: row[COL_UF],
      numero_urna: row[COL_NUMERO],
      partido_eleicao: row[COL_PARTIDO_SIGLA],
      status: 'registrado',
    },
    { onConflict: 'politician_id,ano_eleicao,turno,cargo,estado' },
  )
  if (error) throw new Error(`Failed to upsert candidacy for politician ${politicianId}: ${error.message}`)
}

/** Entry point. Usage: npm run ingest-tse -- <path-to-tse-csv> */
async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: npm run ingest-tse -- <path-to-tse-csv>')
    process.exit(1)
  }

  const content = readFileSync(csvPath, 'latin1')
  const rows: CsvRow[] = parse(content, { delimiter: ';', columns: true, skip_empty_lines: true })
  console.info(`[ingest-tse] Parsed ${rows.length} rows from CSV`)

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const cargo = parseCargoOrSkip(row[COL_CARGO] ?? '')
    if (!cargo) { skipped++; continue }

    await upsertParty(row[COL_PARTIDO_SIGLA], row[COL_PARTIDO_NOME])
    const politicianId = await upsertPolitician(row)
    await upsertCandidacy(politicianId, row, cargo)
    inserted++
  }

  console.info(`[ingest-tse] Done. Inserted/updated: ${inserted}, skipped: ${skipped}`)
}

main().catch(err => { console.error(err); process.exit(1) })
