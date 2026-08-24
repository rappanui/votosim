import { supabase } from './lib/supabase.js'
async function main() {
  const { data, error } = await supabase.rpc('get_enum_values' as never).maybeSingle()
  if (error) console.log('rpc err:', error.message)
  const { data: d2, error: e2 } = await supabase
    .from('candidate_sources')
    .select('tipo')
    .limit(5)
  if (e2) console.log('select err:', e2.message)
  console.log('sample rows:', JSON.stringify(d2))
  // Try reading pg_enum through a function
  const { data: d3, error: e3 } = await supabase
    .rpc('exec_sql' as never)
    .select()
  console.log('rpc exec:', e3?.message ?? JSON.stringify(d3))
}
main().catch((e: Error) => { console.error(e.message); process.exit(1) })
