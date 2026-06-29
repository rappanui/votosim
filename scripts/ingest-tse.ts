import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
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
const COL_NUMERO_PARTIDO = 'NR_PARTIDO'

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

function hashCpf(cpf: string): string {
  return createHash('sha256').update(cpf.replace(/\D/g, '')).digest('hex')
}

function parseCargoOrSkip(rawCargo: string): string | null {
  return CARGO_MAP[rawCargo.toUpperCase().trim()] ?? null
}

async function upsertParty(sigla: string, nome: string, numero: string): Promise<void> {
  console.log(`Upserting party ${sigla} (${numero}): ${nome}`)
  const { error } = await supabase
    .from('parties')
    .upsert({ sigla, nome_completo: nome, numero }, { onConflict: 'sigla', ignoreDuplicates: true })
  if (error) {
    console.error(`Failed to upsert party ${sigla} (${numero}) | ${nome}: ${error.message}`, error)
    // throw new Error(`Failed to upsert party ${sigla} (${numero}): ${error.message}`)
  }
}

async function upsertPolitician(row: CsvRow): Promise<string | null> {
  console.log(`Upserting politician ${row[COL_NOME_CIVIL]}: ${row[COL_NOME_URNA]} | ${row[COL_CPF]} | ${row[COL_PARTIDO_SIGLA]}`)
  const { data, error } = await supabase
    .from('politicians')
    .upsert(
      {
        nome_completo: row[COL_NOME_CIVIL],
        nome_urna: row[COL_NOME_URNA],
        cpf_hash: hashCpf(row[COL_CPF] ?? ''),
        partido_atual: row[COL_PARTIDO_SIGLA].replaceAll(' ', ''),
        ativo: true,
      },
      { onConflict: 'cpf_hash' },
    )
    .select('id')
    .single()

  if (error || !data) {
    console.error(`Failed to upsert politician ${row[COL_NOME_CIVIL]}: ${row[COL_NOME_URNA]} | ${row[COL_CPF]} | ${row[COL_PARTIDO_SIGLA]}: ${error?.message}`, error)
    return null
  }
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
      partido_eleicao: row[COL_PARTIDO_SIGLA].replaceAll(' ', ''),
      status: 'registrado',
    },
    { onConflict: 'politician_id,ano_eleicao,turno,cargo,estado' },
  )
  if (error) {
    console.error(`Failed to upsert candidacy for politician ${politicianId} | ${row[COL_NOME_CIVIL]} | ${row[COL_NOME_URNA]} | ${row[COL_CPF]} | ${row[COL_PARTIDO_SIGLA]}: ${error.message}`, error)
    // throw new Error(`Failed to upsert candidacy for politician ${politicianId}: ${error.message}`)
  }
}

/** Entry point. Usage: npm run ingest-tse -- <path-to-tse-csv> [--estado=SP] */
async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: npm run ingest-tse -- <path-to-tse-csv> [--estado=SP]')
    process.exit(1)
  }

  const estadoFilter = process.argv.find(a => a.startsWith('--estado='))?.split('=')[1]?.toUpperCase()

  const content = readFileSync(csvPath, 'latin1')
  const rows: CsvRow[] = parse(content, { delimiter: ';', columns: true, skip_empty_lines: true })
  console.info(`[ingest-tse] Parsed ${rows.length} rows from CSV${estadoFilter ? ` (filtering: ${estadoFilter})` : ''}`)

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    if (estadoFilter && row[COL_UF]?.trim().toUpperCase() !== estadoFilter) { skipped++; continue }

    const cargo = parseCargoOrSkip(row[COL_CARGO] ?? '')
    if (!cargo) { skipped++; continue }

    await upsertParty(row[COL_PARTIDO_SIGLA].replaceAll(' ', ''), row[COL_PARTIDO_NOME], row[COL_NUMERO_PARTIDO])
    const politicianId = await upsertPolitician(row)
    if (!politicianId) { skipped++; continue }
    await upsertCandidacy(politicianId, row, cargo)
    inserted++
  }

  console.info(`[ingest-tse] Done. Inserted/updated: ${inserted}, skipped: ${skipped}`)
}

main().catch(err => { console.error(err); process.exit(1) })
