import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { supabase } from './lib/supabase.js'
import {
  TSE_COLUMNS as C,
  hashCpf,
  mapCandidacyStatus,
  normalizeParty,
  nullableText,
  parseCargo,
  parseColigacao,
  parseTseDate,
  tierForCargo,
  type CsvRow,
} from './lib/tse.js'

const BATCH_SIZE = 500

/** A politician record ready for upsert. */
export interface PoliticianInput {
  tse_id: string
  cpf_hash: string
  nome_completo: string
  nome_urna: string
  partido_atual: string
  data_nascimento: string | null
  genero: string | null
  escolaridade: string | null
  ocupacao: string | null
  ativo: boolean
}

/** A candidacy record ready for upsert, minus the politician foreign key. */
export interface CandidacyInput {
  ano_eleicao: number
  turno: number
  cargo: string
  estado: string
  numero_urna: string
  partido_eleicao: string
  coligacao: string | null
  composicao_coligacao: string | null
  federacao: string | null
  status: string
  tse_sequencial: string
  tier_processamento: string
}

/** politicians.genero is constrained to 'M' | 'F' | 'O'. */
function mapGenero(raw: string | undefined): string | null {
  const text = raw?.toUpperCase().trim() ?? ''
  if (text.startsWith('MASCULINO')) return 'M'
  if (text.startsWith('FEMININO'))  return 'F'
  return null
}

/** Builds a politician row, or null when the row lacks a usable CPF. */
export function buildPolitician(row: CsvRow): PoliticianInput | null {
  const cpf = row[C.cpf]?.replace(/\D/g, '') ?? ''
  if (!cpf) return null

  return {
    tse_id:          row[C.sequencial]?.trim() ?? '',
    cpf_hash:        hashCpf(cpf),
    nome_completo:   row[C.nomeCivil]?.trim() ?? '',
    nome_urna:       row[C.nomeUrna]?.trim() ?? '',
    partido_atual:   normalizeParty(row[C.partidoSigla] ?? ''),
    data_nascimento: parseTseDate(row[C.nascimento] ?? ''),
    genero:          mapGenero(row[C.genero]),
    escolaridade:    nullableText(row[C.escolaridade]),
    ocupacao:        nullableText(row[C.ocupacao]),
    ativo:           true,
  }
}

/** Builds a candidacy row for an already-parsed office. */
export function buildCandidacy(row: CsvRow, cargo: string, electionYear: number): CandidacyInput {
  return {
    ano_eleicao:        electionYear,
    turno:              Number(row[C.turno] ?? '1') || 1,
    cargo,
    estado:             row[C.uf]?.trim().toUpperCase() ?? '',
    numero_urna:        row[C.numero]?.trim() ?? '',
    partido_eleicao:    normalizeParty(row[C.partidoSigla] ?? ''),
    coligacao:          parseColigacao(row[C.coligacao]),
    composicao_coligacao: nullableText(row[C.composicaoColigacao]),
    federacao:          nullableText(row[C.federacao]),
    status:             mapCandidacyStatus(row[C.situacao] ?? ''),
    tse_sequencial:     row[C.sequencial]?.trim() ?? '',
    tier_processamento: tierForCargo(cargo),
  }
}

/** Collapses the CSV's repeated party columns into one row per party. */
export function dedupeParties(rows: CsvRow[]): { sigla: string; nome_completo: string; numero: number }[] {
  const bySigla = new Map<string, { sigla: string; nome_completo: string; numero: number }>()

  for (const row of rows) {
    const sigla = normalizeParty(row[C.partidoSigla] ?? '')
    if (!sigla || bySigla.has(sigla)) continue

    bySigla.set(sigla, {
      sigla,
      nome_completo: row[C.partidoNome]?.trim() ?? sigla,
      numero:        Number(row[C.partidoNumero] ?? '0'),
    })
  }

  return [...bySigla.values()]
}

/** Upserts in batches — per-row round trips are what lost ~836 records in 2022. */
async function upsertBatched<T>(
  table: string,
  rows: T[],
  onConflict: string,
  select?: string,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const query = supabase.from(table).upsert(batch, { onConflict })
    const { data, error } = select ? await query.select(select) : await query

    if (error) throw new Error(`Failed to upsert into ${table} at offset ${i}: ${error.message}`)
    if (data) results.push(...(data as Record<string, unknown>[]))

    console.log(`  ${table}: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`)
  }

  return results
}

/** Entry point. Usage: npm run ingest-tse -- <path-to-tse-csv> [--estado=SP] [--cargo=presidente] */
async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: npm run ingest-tse -- <path-to-tse-csv> [--estado=SP] [--cargo=presidente]')
    process.exit(1)
  }

  const electionYear = Number(process.env.ELECTION_YEAR)
  if (!electionYear) throw new Error('Missing ELECTION_YEAR in scripts/.env')

  const args = process.argv.slice(3)
  const estadoFilter = args.find(a => a.startsWith('--estado='))?.split('=')[1]?.toUpperCase()
  const cargoFilter  = args.find(a => a.startsWith('--cargo='))?.split('=')[1]?.toLowerCase()

  const content = readFileSync(csvPath, 'latin1')
  const allRows: CsvRow[] = parse(content, { delimiter: ';', columns: true, skip_empty_lines: true })
  console.log(`[ingest-tse] Parsed ${allRows.length} rows for election ${electionYear}`)

  // ─── Filter to the rows we actually want ───────────────────────────────────
  const selected: { row: CsvRow; cargo: string }[] = []
  let skipped = 0

  for (const row of allRows) {
    const cargo = parseCargo(row[C.cargo] ?? '')
    if (!cargo) { skipped++; continue }
    if (cargoFilter && cargo !== cargoFilter) { skipped++; continue }
    if (estadoFilter && row[C.uf]?.trim().toUpperCase() !== estadoFilter) { skipped++; continue }
    selected.push({ row, cargo })
  }

  console.log(`[ingest-tse] Selected ${selected.length}, skipped ${skipped}`)
  if (selected.length === 0) { console.log('Nothing to do.'); return }

  // ─── Parties (deduped — the old script upserted once per candidate row) ─────
  const parties = dedupeParties(selected.map(s => s.row))
  console.log(`[ingest-tse] Upserting ${parties.length} parties`)
  await upsertBatched('parties', parties, 'sigla')

  // ─── Politicians ───────────────────────────────────────────────────────────
  const politicianRows: PoliticianInput[] = []
  const rowByCpfHash = new Map<string, { row: CsvRow; cargo: string }>()

  for (const entry of selected) {
    const politician = buildPolitician(entry.row)
    if (!politician) { skipped++; continue }
    // A person can appear twice (two offices); one politicians row serves both.
    if (!rowByCpfHash.has(politician.cpf_hash)) {
      politicianRows.push(politician)
    }
    rowByCpfHash.set(politician.cpf_hash, entry)
  }

  console.log(`[ingest-tse] Upserting ${politicianRows.length} politicians`)
  const inserted = await upsertBatched('politicians', politicianRows, 'cpf_hash', 'id, cpf_hash')

  const idByCpfHash = new Map<string, string>()
  for (const record of inserted) {
    idByCpfHash.set(record.cpf_hash as string, record.id as string)
  }

  // ─── Candidacies ───────────────────────────────────────────────────────────
  const candidacyRows = selected
    .map(entry => {
      const politician = buildPolitician(entry.row)
      if (!politician) return null
      const politicianId = idByCpfHash.get(politician.cpf_hash)
      if (!politicianId) return null
      return { politician_id: politicianId, ...buildCandidacy(entry.row, entry.cargo, electionYear) }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  console.log(`[ingest-tse] Upserting ${candidacyRows.length} candidacies`)
  await upsertBatched('candidacies', candidacyRows, 'politician_id,ano_eleicao,turno,cargo,estado')

  console.log(`[ingest-tse] Done. Politicians: ${politicianRows.length}, candidacies: ${candidacyRows.length}, skipped: ${skipped}`)
}

// Only run when invoked directly, so the test file can import the pure helpers.
if (process.argv[1]?.endsWith('ingest-tse.ts')) {
  main().catch(err => { console.error(err); process.exit(1) })
}
