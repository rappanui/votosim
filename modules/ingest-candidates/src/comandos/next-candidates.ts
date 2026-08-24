import { supabase } from '../lib/supabase.js'

/**
 * Prints the next candidates with outstanding enrichment work, in the order
 * v_enrichment_queue defines: presidents first, then grouped by state, then by
 * tier and viability.
 *
 * Usage: npm run next-candidates [-- --limit=10] [--cargo=presidente] [--estado=SP]
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '10'
  const limit = Number(limitArg)
  const cargo = args.find(a => a.startsWith('--cargo='))?.split('=')[1]
  const estado = args.find(a => a.startsWith('--estado='))?.split('=')[1]?.toUpperCase()

  if (!Number.isInteger(limit) || limit <= 0) {
    console.error(`Invalid --limit=${JSON.stringify(limitArg)} — expected a positive integer, e.g. --limit=10`)
    process.exit(1)
  }

  let query = supabase
    .from('v_enrichment_queue')
    .select('candidacy_id, nome_urna, cargo, estado, partido_eleicao, tier_processamento, viabilidade_score, etapas_pendentes, etapas_em_progresso, etapas_falhadas, sem_ledger')
    .limit(limit)

  if (cargo) query = query.eq('cargo', cargo)
  // Legislative races are per-state; without this filter a dev working one
  // state has to page through every other state's candidates to find theirs.
  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) {
    console.log('Queue is empty — nothing outstanding.')
    return
  }

  console.log('NOME'.padEnd(28) + 'CARGO'.padEnd(20) + 'UF'.padEnd(4) + 'PARTIDO'.padEnd(16) + 'PEND EMPR FAIL SEM_LEDGER')
  console.log('-'.repeat(96))

  let anyNeverSeeded = false
  let anyClaimed = false
  let anyUnscoredTier = false

  for (const r of rows) {
    const semLedger = r.sem_ledger === true
    if (semLedger) anyNeverSeeded = true
    const emProgresso = Number(r.etapas_em_progresso ?? 0)
    if (emProgresso > 0) anyClaimed = true
    // tier por_score promises the queue is ranked by viabilidade_score. That
    // score is not computed yet (see the schema comment on the column), so the
    // ordering silently degrades to alphabetical — say so rather than letting
    // the caller assume the top of the list is the most viable candidate.
    if (r.tier_processamento === 'por_score' && r.viabilidade_score === null) anyUnscoredTier = true

    // A row with no ledger entries shows PEND=0 EMPR=0 FAIL=0, which reads
    // exactly like "everything done" at a glance. Replace those counts with
    // an explicit marker instead of letting the zeros speak for themselves.
    const counts = semLedger
      ? 'NEVER SEEDED'.padEnd(15)
      : String(r.etapas_pendentes).padEnd(5) + String(emProgresso).padEnd(5) + String(r.etapas_falhadas).padEnd(5)

    console.log(
      String(r.nome_urna).slice(0, 27).padEnd(28) +
      String(r.cargo).padEnd(20) +
      String(r.estado).padEnd(4) +
      String(r.partido_eleicao).padEnd(16) +
      counts +
      String(r.sem_ledger),
    )
  }

  console.log(`\n${rows.length} shown.`)
  if (anyNeverSeeded) {
    console.log('NEVER SEEDED rows have no ledger rows at all — their zero counts do not mean the work is done.')
  }
  if (anyClaimed) {
    console.log('EMPR > 0 means someone already ran claim-candidate on that name (or a run crashed mid-flight) —')
    console.log('check with the team before starting research on it again.')
  }
  if (anyUnscoredTier) {
    console.log('\nAVISO: estas linhas são do tier "por_score" (deputado federal/estadual), mas viabilidade_score')
    console.log('ainda não foi calculado para nenhuma delas — a ordem acima é alfabética, NÃO por viabilidade.')
    console.log('Não trate o topo da lista como "os candidatos mais relevantes". Combine com o time qual')
    console.log('critério de priorização usar (bancada atual, votação de 2022, cobertura de imprensa, etc.).')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
