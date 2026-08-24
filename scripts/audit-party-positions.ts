import { supabase } from './lib/supabase.js'
import { auditParty, summarizeAudit, type PartyPositionRow, type PartyVerdict } from './lib/party-audit.js'

/** Maximum positions to fetch in a single query. */
const POSITION_FETCH_LIMIT = 10000

/** Entry point. Usage: npm run audit-party-positions */
async function main(): Promise<void> {
  // The column is party_sigla (see docs/migracoes/10_party_positions.sql), mapped
  // onto the audit's `sigla` field.
  const { data, error } = await supabase
    .from('party_positions')
    .select('party_sigla, posicao')
    .limit(POSITION_FETCH_LIMIT)

  if (error) throw new Error(`Failed to read party_positions: ${error.message}`)

  const rows: PartyPositionRow[] = (data ?? []).map(r => ({
    sigla: (r as { party_sigla: string }).party_sigla,
    posicao: (r as { posicao: string }).posicao,
  }))

  console.log(`\nFetched ${rows.length} positions from party_positions.`)
  if (rows.length === POSITION_FETCH_LIMIT) {
    console.log(`⚠️  WARNING: Result may be truncated (limit is ${POSITION_FETCH_LIMIT}). Verdict may be unreliable.`)
  }

  if (rows.length === 0) {
    console.log('party_positions is empty. Gate fails — the party fallback has no data.')
    return
  }

  const bySigla = new Map<string, PartyPositionRow[]>()
  for (const row of rows) {
    const list = bySigla.get(row.sigla) ?? []
    list.push(row)
    bySigla.set(row.sigla, list)
  }

  const verdicts: PartyVerdict[] = [...bySigla.entries()]
    .map(([sigla, partyRows]) => auditParty(sigla, partyRows))
    .sort((a, b) => b.themeCount - a.themeCount)

  console.log('\nPARTY'.padEnd(16) + 'THEMES'.padEnd(9) + 'STANCES'.padEnd(9) + 'ALL FAV'.padEnd(9) + 'DOMINANT'.padEnd(10) + 'VERDICT')
  console.log('-'.repeat(66))
  for (const v of verdicts) {
    const dominantPercent = Math.round(v.dominantShare * 100)
    console.log(
      v.sigla.padEnd(16) +
      String(v.themeCount).padEnd(9) +
      String(v.distinctStances).padEnd(9) +
      (v.allFavoravel ? 'yes' : 'no').padEnd(9) +
      `${dominantPercent}%`.padEnd(10) +
      (v.passes ? 'KEEP' : 'reject'),
    )
  }

  const summary = summarizeAudit(verdicts)
  console.log(`\n${summary.passing} of ${summary.total} parties pass the quality gate.`)
  console.log(
    summary.gatePasses
      ? 'GATE PASSES — preserve party_positions through the truncate (Task 5).'
      : 'GATE FAILS — retire the party fallback for now; do not fetch 2026 party programs.',
  )
}

main().catch(err => { console.error(err); process.exit(1) })
