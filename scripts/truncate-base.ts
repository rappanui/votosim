import { supabase } from './lib/supabase.js'

/**
 * Tables cleared by D7, in dependency order. politician_positions and
 * politician_alerts reference politicians; enrichment_ledger, candidate_sources
 * and candidate_dossiers reference candidacies. position_history is derived data
 * (records politician position changes over time) and is cascaded when politicians
 * are cleared, but listed explicitly here so the run prints a confirmation line
 * rather than relying on an implicit cascade.
 */
const TABLES_ALWAYS = [
  'enrichment_ledger',
  'candidate_sources',
  'candidate_dossiers',
  'position_history',
  'politician_positions',
  'politician_alerts',
  'candidacies',
  'politicians',
] as const

/** Cleared only when Task 1's quality gate failed. */
const TABLE_CONDITIONAL = 'party_positions'

async function clearTable(table: string): Promise<void> {
  // .neq on a never-null primary key matches every row; PostgREST requires a
  // filter on delete, so this is the idiom for "delete all".
  const { error } = await supabase
    .from(table)
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (error) throw new Error(`Failed to clear ${table}: ${error.message}`)
  console.log(`  cleared ${table}`)
}

/** Entry point. Usage: npm run truncate-base -- --confirm [--drop-party-positions] */
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (!args.includes('--confirm')) {
    console.error('Refusing to run without --confirm.')
    console.error('This deletes every candidate, position and alert in the database.')
    console.error('Usage: npm run truncate-base -- --confirm [--drop-party-positions]')
    process.exit(1)
  }

  const dropParty = args.includes('--drop-party-positions')

  console.log('Clearing ingested data (D7 clean slate)...')
  for (const table of TABLES_ALWAYS) {
    await clearTable(table)
  }

  if (dropParty) {
    await clearTable(TABLE_CONDITIONAL)
    console.log('\nparty_positions cleared — the party fallback is retired for now.')
  } else {
    console.log(`\n${TABLE_CONDITIONAL} preserved — it passed the Task 1 quality gate.`)
  }

  console.log('themes_catalog and parties preserved — curated reference data.')
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
