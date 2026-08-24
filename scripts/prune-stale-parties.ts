import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { supabase } from './lib/supabase.js'
import { TSE_COLUMNS as C, normalizeParty, type CsvRow } from './lib/tse.js'

/**
 * Removes parties that no longer contest the current election.
 *
 * Why this exists: `parties.numero` is UNIQUE, on the assumption that a party
 * number identifies a party permanently. The TSE does not work that way — it
 * reassigns the numbers of extinct and merged parties to new ones. Ingesting a
 * new cycle's census while extinct parties still occupy their old numbers fails
 * with `duplicate key value violates unique constraint "parties_numero_key"`.
 *
 * Measured for 2026: MISSÃO took 14 from PTB, PODE moved 19 → 20 while PSC still
 * held 20, MOBILIZA took 33 from PMN, DEMOCRATA took 35 from PMB.
 *
 * Comparison is done on canonicalised siglas via normalizeParty, because the TSE
 * writes acronyms uppercase (PCDOB) while the database may hold another casing
 * (PCdoB). Comparing raw values would delete a live party.
 */

interface StaleParty {
  sigla: string
  numero: number
  espectro: string | null
}

/** Siglas contesting the election, canonicalised, read from the census CSV. */
export function siglasInCensus(rows: CsvRow[]): Set<string> {
  const siglas = new Set<string>()
  for (const row of rows) {
    const sigla = normalizeParty(row[C.partidoSigla] ?? '')
    if (sigla) siglas.add(sigla)
  }
  return siglas
}

/** Parties present in the database but absent from the census. */
export function findStale(stored: StaleParty[], inCensus: Set<string>): StaleParty[] {
  return stored.filter(p => !inCensus.has(p.sigla))
}

/** Entry point. Usage: npm run prune-stale-parties -- <census-csv> [--confirm] */
async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: npm run prune-stale-parties -- <census-csv> [--confirm]')
    process.exit(1)
  }

  const content = readFileSync(csvPath, 'latin1')
  const rows: CsvRow[] = parse(content, { delimiter: ';', columns: true, skip_empty_lines: true })
  const inCensus = siglasInCensus(rows)
  console.log(`[prune] ${inCensus.size} parties contest this election`)

  const { data, error } = await supabase.from('parties').select('sigla, numero, espectro')
  if (error) throw new Error(`Failed to read parties: ${error.message}`)

  const stale = findStale((data ?? []) as StaleParty[], inCensus)
  if (stale.length === 0) {
    console.log('[prune] Nothing to remove.')
    return
  }

  console.log(`\n[prune] ${stale.length} parties in the database no longer contest:`)
  for (const p of stale) {
    console.log(`  ${p.sigla.padEnd(14)} numero=${String(p.numero).padEnd(4)} espectro=${p.espectro ?? 'NULL'}`)
  }

  if (!process.argv.includes('--confirm')) {
    console.log('\n[prune] Dry run. Re-run with --confirm to delete these rows.')
    return
  }

  const { error: delError } = await supabase
    .from('parties')
    .delete()
    .in('sigla', stale.map(p => p.sigla))

  if (delError) throw new Error(`Failed to delete: ${delError.message}`)

  const { count } = await supabase.from('parties').select('*', { count: 'exact', head: true })
  console.log(`\n[prune] Removed ${stale.length}. parties now holds ${count} rows.`)
}

// Only run when invoked directly, so the pure helpers stay importable by tests.
if (process.argv[1]?.endsWith('prune-stale-parties.ts')) {
  main().catch(err => { console.error(err); process.exit(1) })
}
