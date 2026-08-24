import { supabase } from './lib/supabase.js'
async function main() {
  const candidacyId = '1f8a1701-ea8b-4002-b58f-e43078e1d1ba'
  const { data: ledger, error: lErr } = await supabase
    .from('enrichment_ledger')
    .select('etapa, status')
    .eq('candidacy_id', candidacyId)
  if (lErr) throw new Error(lErr.message)
  console.log('LEDGER:')
  for (const r of ledger ?? []) console.log(`  ${r.etapa.padEnd(20)} ${r.status}`)
  const { count: srcCount } = await supabase
    .from('candidate_sources').select('id', { count: 'exact' }).eq('candidacy_id', candidacyId)
  const { count: posCount } = await supabase
    .from('politician_positions').select('id', { count: 'exact' })
    .eq('politician_id', (await supabase.from('candidacies').select('politician_id').eq('id', candidacyId).single()).data?.politician_id)
  const { count: alertCount } = await supabase
    .from('politician_alerts').select('id', { count: 'exact' })
    .eq('candidacy_id', candidacyId)
  console.log(`\nsources: ${srcCount}, positions: ${posCount}, alerts: ${alertCount}`)
}
main().catch((e: Error) => { console.error(e.message); process.exit(1) })
