import { supabase } from './lib/supabase.js'

async function main() {
  const { data, error } = await supabase
    .from('candidacies')
    .select('tse_sequencial, cargo, estado, numero_urna, partido_eleicao, politicians(nome_urna, nome_completo)')
    .eq('ano_eleicao', 2026)
    .eq('cargo', 'senador')
    .eq('estado', 'SP')
    .order('numero_urna')
  if (error) throw new Error(error.message)
  for (const c of data ?? []) {
    console.log(
      String(c.tse_sequencial).padEnd(14),
      '|', String((c as any).politicians?.nome_urna).padEnd(24),
      '|', String(c.partido_eleicao).padEnd(10),
      '|', String(c.numero_urna).padEnd(4),
      '|', String((c as any).politicians?.nome_completo),
    )
  }
}

main().catch((e: Error) => { console.error(e.message); process.exit(1) })
