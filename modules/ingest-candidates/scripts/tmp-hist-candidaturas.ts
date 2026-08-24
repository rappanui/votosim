import { supabase } from './lib/supabase.js'
async function main() {
  const seq = '250002544673'
  const { data: cand, error } = await supabase
    .from('candidacies')
    .select('id, politician_id, politicians(nome_urna, nome_completo)')
    .eq('tse_sequencial', seq)
    .single()
  if (error || !cand) throw new Error(`not found: ${error?.message}`)
  const pol = (cand as any).politician_id
  const { data: all, error: e2 } = await supabase
    .from('candidacies')
    .select('ano_eleicao, cargo, estado, partido_eleicao, tse_sequencial')
    .eq('politician_id', pol)
    .order('ano_eleicao')
  if (e2) throw new Error(e2.message)
  console.log(`Politician: ${(cand as any).politicians?.nome_urna} (${(cand as any).politicians?.nome_completo})`)
  console.log('Candidaturas no banco:')
  for (const c of all ?? []) console.log(`  ${c.ano_eleicao} | ${c.cargo} | ${c.estado} | ${c.partido_eleicao} | ${c.tse_sequencial}`)
  console.log(`Total: ${all?.length ?? 0}`)
}
main().catch((e: Error) => { console.error(e.message); process.exit(1) })
