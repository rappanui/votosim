import { supabase } from './lib/supabase.js'
async function main() {
  const { data, error } = await supabase
    .from('parties')
    .select('sigla, espectro')
    .in('sigla', ['PODE', 'PSC'])
  if (error) throw new Error(error.message)
  for (const p of data ?? []) console.log(`${p.sigla} | espectro=${p.espectro}`)
}
main().catch((e: Error) => { console.error(e.message); process.exit(1) })
