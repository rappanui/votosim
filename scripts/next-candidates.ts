import { supabase } from './lib/supabase.js'

/**
 * Prints the next candidates with outstanding enrichment work, in the order
 * v_enrichment_queue defines: presidents first, then grouped by state, then by
 * tier and viability.
 *
 * Usage: npm run next-candidates [-- --limit=10] [--cargo=presidente]
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '10'
  const limit = Number(limitArg)
  const cargo = args.find(a => a.startsWith('--cargo='))?.split('=')[1]

  if (!Number.isInteger(limit) || limit <= 0) {
    console.error(`Invalid --limit=${JSON.stringify(limitArg)} — expected a positive integer, e.g. --limit=10`)
    process.exit(1)
  }

  let query = supabase
    .from('v_enrichment_queue')
    .select('candidacy_id, nome_urna, cargo, estado, partido_eleicao, etapas_pendentes, etapas_falhadas, sem_ledger')
    .limit(limit)

  if (cargo) query = query.eq('cargo', cargo)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) {
    console.log('Queue is empty — nothing outstanding.')
    return
  }

  console.log('NOME'.padEnd(28) + 'CARGO'.padEnd(20) + 'UF'.padEnd(4) + 'PARTIDO'.padEnd(16) + 'PEND FAIL SEM_LEDGER')
  console.log('-'.repeat(92))

  let anyNeverSeeded = false

  for (const r of rows) {
    const semLedger = r.sem_ledger === true
    if (semLedger) anyNeverSeeded = true

    // A row with no ledger entries shows PEND=0 FAIL=0, which reads exactly
    // like "everything done" at a glance. Replace those counts with an
    // explicit marker instead of letting the zeros speak for themselves.
    const pendFail = semLedger
      ? 'NEVER SEEDED'.padEnd(10)
      : String(r.etapas_pendentes).padEnd(5) + String(r.etapas_falhadas).padEnd(5)

    console.log(
      String(r.nome_urna).slice(0, 27).padEnd(28) +
      String(r.cargo).padEnd(20) +
      String(r.estado).padEnd(4) +
      String(r.partido_eleicao).padEnd(16) +
      pendFail +
      String(r.sem_ledger),
    )
  }

  console.log(`\n${rows.length} shown.`)
  if (anyNeverSeeded) {
    console.log('NEVER SEEDED rows have no ledger rows at all — their zero counts do not mean the work is done.')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
