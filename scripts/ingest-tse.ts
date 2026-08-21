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

/** A candidacy row with its resolved politician foreign key, ready for dedupe and upsert. */
export type CandidacyRow = CandidacyInput & { politician_id: string }

/**
 * TSE genuinely ships the same person registered twice for the same office in the
 * same state, under two different SQ_CANDIDATO values (e.g. a corrected ballot
 * name filed as a fresh registration). This is not a data error on our side, but
 * it collides on the exact upsert conflict key (politician_id, ano_eleicao,
 * turno, cargo, estado): PostgREST issues one multi-row `INSERT ... ON CONFLICT
 * DO UPDATE` per batch, and a repeated conflict key inside the same batch makes
 * Postgres raise "ON CONFLICT DO UPDATE command cannot affect row a second time",
 * aborting the run. Pairs split across batches don't error, but one candidacy
 * silently overwrites the other. Dedupe before upsert either way, keeping the
 * higher tse_sequencial — the later registration, which TSE considers current.
 */
export function dedupeCandidacies(rows: CandidacyRow[]): { kept: CandidacyRow[]; dropped: number } {
  const byKey = new Map<string, CandidacyRow>()
  let dropped = 0

  for (const row of rows) {
    const key = `${row.politician_id}|${row.ano_eleicao}|${row.turno}|${row.cargo}|${row.estado}`
    const existing = byKey.get(key)

    if (!existing) {
      byKey.set(key, row)
      continue
    }

    const winner = row.tse_sequencial > existing.tse_sequencial ? row : existing
    const loser  = winner === row ? existing : row
    byKey.set(key, winner)
    dropped++
    console.warn(
      `[ingest-tse] Duplicate candidacy for ${key}: keeping tse_sequencial=${winner.tse_sequencial}, ` +
      `dropping tse_sequencial=${loser.tse_sequencial}`,
    )
  }

  return { kept: [...byKey.values()], dropped }
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
  const candidacyRows: CandidacyRow[] = []

  for (const entry of selected) {
    const politician = buildPolitician(entry.row)
    if (!politician) continue // already counted as skipped while building politicianRows above

    const politicianId = idByCpfHash.get(politician.cpf_hash)
    if (!politicianId) {
      // The politicians upsert returned fewer rows than were sent (e.g. a
      // Supabase max-rows setting below BATCH_SIZE) — surface it, don't drop it silently.
      skipped++
      console.warn(`[ingest-tse] No id returned for cpf_hash=${politician.cpf_hash} (${politician.nome_urna}); candidacy dropped`)
      continue
    }

    candidacyRows.push({ politician_id: politicianId, ...buildCandidacy(entry.row, entry.cargo, electionYear) })
  }

  const { kept: dedupedCandidacyRows, dropped: duplicateCandidacies } = dedupeCandidacies(candidacyRows)
  skipped += duplicateCandidacies

  console.log(`[ingest-tse] Upserting ${dedupedCandidacyRows.length} candidacies (${duplicateCandidacies} duplicate registrations collapsed)`)
  await upsertBatched('candidacies', dedupedCandidacyRows, 'politician_id,ano_eleicao,turno,cargo,estado')

  console.log(`[ingest-tse] Done. Politicians: ${politicianRows.length}, candidacies: ${dedupedCandidacyRows.length}, skipped: ${skipped}`)
}

// Only run when invoked directly, so the test file can import the pure helpers.
if (process.argv[1]?.endsWith('ingest-tse.ts')) {
  main().catch(err => { console.error(err); process.exit(1) })
}
