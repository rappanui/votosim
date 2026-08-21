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
  const limit = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '10')
  const cargo = args.find(a => a.startsWith('--cargo='))?.split('=')[1]

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

  for (const r of rows) {
    console.log(
      String(r.nome_urna).slice(0, 27).padEnd(28) +
      String(r.cargo).padEnd(20) +
      String(r.estado).padEnd(4) +
      String(r.partido_eleicao).padEnd(16) +
      String(r.etapas_pendentes).padEnd(5) +
      String(r.etapas_falhadas).padEnd(5) +
      String(r.sem_ledger),
    )
  }

  console.log(`\n${rows.length} shown.`)
}

main().catch(err => { console.error(err); process.exit(1) })
