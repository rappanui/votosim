import { supabase } from './lib/supabase.js'

/**
 * Post-run verification for SP-0. Read-only: confirms the census, ledger and
 * work queue are in the shape the plan expects before the enrichment agent runs.
 *
 * Usage: npm run verify-sp0
 */

async function count(table: string, filters: Record<string, string> = {}): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true })
  for (const [col, val] of Object.entries(filters)) query = query.eq(col, val)
  const { count: n, error } = await query
  if (error) throw new Error(`${table}: ${error.message}`)
  return n ?? 0
}

async function main(): Promise<void> {
  const electionYear = process.env.ELECTION_YEAR ?? '2026'

  console.log('=== CENSUS BY OFFICE ===')
  const offices = [
    'presidente', 'vice_presidente', 'governador', 'vice_governador',
    'senador', 'deputado_federal', 'deputado_estadual', 'deputado_distrital',
  ]
  let total = 0
  for (const cargo of offices) {
    const n = await count('candidacies', { ano_eleicao: electionYear, cargo })
    total += n
    console.log(`  ${cargo.padEnd(20)} ${String(n).padStart(6)}`)
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${String(total).padStart(6)}`)

  console.log('\n=== PROCESSING TIER ===')
  for (const tier of ['total', 'por_score', 'fora_escopo']) {
    const n = await count('candidacies', { ano_eleicao: electionYear, tier_processamento: tier })
    console.log(`  ${tier.padEnd(20)} ${String(n).padStart(6)}`)
  }

  console.log('\n=== LEDGER BY STATUS ===')
  for (const status of ['pendente', 'em_progresso', 'concluido', 'falhou', 'nao_aplicavel']) {
    const n = await count('enrichment_ledger', { status })
    console.log(`  ${status.padEnd(20)} ${String(n).padStart(6)}`)
  }

  console.log('\n=== WORK QUEUE — first 15 ===')
  const { data: queue, error: qErr } = await supabase
    .from('v_enrichment_queue')
    .select('nome_urna, cargo, estado, tier_processamento, etapas_pendentes, sem_ledger')
    .limit(15)
  if (qErr) throw new Error(`v_enrichment_queue: ${qErr.message}`)
  for (const r of (queue ?? []) as Record<string, unknown>[]) {
    console.log(
      `  ${String(r.nome_urna).slice(0, 24).padEnd(25)}` +
      `${String(r.cargo).padEnd(18)}${String(r.estado).padEnd(4)}` +
      `pend=${String(r.etapas_pendentes).padEnd(3)}sem_ledger=${r.sem_ledger}`,
    )
  }

  console.log('\n=== INTEGRITY CHECKS ===')
  const orphanLedger = await supabase
    .from('enrichment_ledger')
    .select('candidacy_id', { count: 'exact', head: true })
  console.log(`  ledger rows                 ${orphanLedger.count}`)

  const { count: noSeq } = await supabase
    .from('candidacies')
    .select('*', { count: 'exact', head: true })
    .eq('ano_eleicao', electionYear)
    .is('tse_sequencial', null)
  console.log(`  candidacies missing tse_sequencial   ${noSeq}  (must be 0)`)

  const { count: noTier } = await supabase
    .from('candidacies')
    .select('*', { count: 'exact', head: true })
    .eq('ano_eleicao', electionYear)
    .is('tier_processamento', null)
  console.log(`  candidacies missing tier            ${noTier}  (must be 0)`)

  const { count: sentinel } = await supabase
    .from('candidacies')
    .select('*', { count: 'exact', head: true })
    .eq('ano_eleicao', electionYear)
    .eq('coligacao', 'PARTIDO ISOLADO')
  console.log(`  coligacao stored as sentinel        ${sentinel}  (must be 0)`)

  const { count: fed } = await supabase
    .from('candidacies')
    .select('*', { count: 'exact', head: true })
    .eq('ano_eleicao', electionYear)
    .not('federacao', 'is', null)
  console.log(`  candidacies with a federation      ${fed}`)
}

main().catch(err => { console.error(err); process.exit(1) })
