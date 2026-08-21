import { supabase } from './lib/supabase.js'
import { buildLedgerRows, type LedgerRow } from './lib/ledger.js'

const PAGE_SIZE = 1000

interface CandidacyRecord {
  id: string
  cargo: string
  tier_processamento: string
}

/** Entry point. Usage: npm run bootstrap-ledger [-- --cargo=presidente] */
async function main(): Promise<void> {
  const electionYear = Number(process.env.ELECTION_YEAR)
  if (!electionYear) throw new Error('Missing ELECTION_YEAR in scripts/.env')

  const cargoFilter = process.argv.slice(2)
    .find(a => a.startsWith('--cargo='))?.split('=')[1]?.toLowerCase()

  const rows: LedgerRow[] = []
  let from = 0

  // Paginate: PostgREST caps a single select well below a full national census.
  for (;;) {
    let query = supabase
      .from('candidacies')
      .select('id, cargo, tier_processamento')
      .eq('ano_eleicao', electionYear)
      .range(from, from + PAGE_SIZE - 1)

    if (cargoFilter) query = query.eq('cargo', cargoFilter)

    const { data, error } = await query
    if (error) throw new Error(`Failed to read candidacies: ${error.message}`)

    const page = (data ?? []) as CandidacyRecord[]
    for (const c of page) {
      rows.push(...buildLedgerRows(c.id, c.cargo, c.tier_processamento))
    }

    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  console.log(`[bootstrap-ledger] Building ${rows.length} ledger rows`)

  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const batch = rows.slice(i, i + PAGE_SIZE)
    // ignoreDuplicates keeps the script idempotent: re-running never resets
    // the status of a stage already in progress or completed.
    const { error } = await supabase
      .from('enrichment_ledger')
      .upsert(batch, { onConflict: 'candidacy_id,etapa', ignoreDuplicates: true })

    if (error) throw new Error(`Failed to write ledger at offset ${i}: ${error.message}`)
    console.log(`  ${Math.min(i + PAGE_SIZE, rows.length)}/${rows.length}`)
  }

  console.log('[bootstrap-ledger] Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
