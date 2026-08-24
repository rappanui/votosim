import { supabase } from './lib/supabase.js'

async function main() {
  const { data: politico } = await supabase
    .from('politicians').select('id, nome_urna').eq('nome_urna', 'GERALDO RUFINO').single()
  if (!politico) throw new Error('politico not found')
  const id = politico.id

  const { data: fontes } = await supabase
    .from('candidate_sources').select('tipo, camada, titulo').eq('politician_id', id)
  console.log('=== FONTES ===')
  for (const f of fontes ?? []) console.log(`  ${f.tipo} camada=${f.camada} — ${f.titulo}`)

  const { data: alertas } = await supabase
    .from('politician_alerts').select('tipo, severidade, validado, ativo, titulo, fonte_nome').eq('politician_id', id)
  console.log('=== ALERTAS ===')
  for (const a of alertas ?? []) console.log(`  tipo=${a.tipo} sev=${a.severidade} validado=${a.validado} ativo=${a.ativo} — ${a.titulo} [${a.fonte_nome}]`)

  const { data: view } = await supabase
    .from('v_candidate_alerts').select('tipo, badge_cor, severidade, titulo').eq('politician_id', id)
  console.log('=== VIEW v_candidate_alerts ===')
  for (const v of view ?? []) console.log(`  ${v.tipo} badge=${v.badge_cor} sev=${v.severidade} — ${v.titulo}`)

  const { data: ledger } = await supabase
    .from('enrichment_ledger').select('etapa, status').eq('candidacy_id', '1f8a1701-ea8b-4002-b58f-e43078e1d1ba')
  console.log('=== LEDGER ===')
  for (const l of ledger ?? []) console.log(`  ${l.etapa} = ${l.status}`)
}

main().catch((e: Error) => { console.error(e.message); process.exit(1) })
