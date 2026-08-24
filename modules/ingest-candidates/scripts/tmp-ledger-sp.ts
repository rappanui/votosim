import { supabase } from './lib/supabase.js'

async function main() {
  const { data: cans } = await supabase
    .from('candidacies')
    .select('id, tse_sequencial, partido_eleicao, politicians(nome_urna)')
    .eq('ano_eleicao', 2026).eq('cargo', 'senador').eq('estado', 'SP')
  if (!cans) throw new Error('no candidacies')
  const { data: ledger } = await supabase.from('enrichment_ledger')
    .select('candidacy_id, etapa, status').in('candidacy_id', cans.map(c => c.id))
  const byCand = new Map<string, Record<string, string>>()
  for (const l of ledger ?? []) {
    if (!byCand.has(l.candidacy_id)) byCand.set(l.candidacy_id, {})
    byCand.get(l.candidacy_id)![l.etapa] = l.status
  }
  for (const c of [...cans].sort((a, b) => String(a.tse_sequencial).localeCompare(String(b.tse_sequencial)))) {
    const s = byCand.get(c.id) ?? {}
    console.log(
      String(c.tse_sequencial).padEnd(14),
      String((c as any).politicians?.nome_urna).padEnd(20),
      String(c.partido_eleicao).padEnd(9),
      '| doc:', String(s.documentos_oficiais ?? '-').padEnd(13),
      'ficha:', String(s.ficha_limpa ?? '-').padEnd(11),
      'noticias:', String(s.noticias ?? '-').padEnd(11),
      'dossie:', String(s.dossie ?? '-').padEnd(11),
      'posicoes:', String(s.posicoes ?? '-'),
    )
  }
}

main().catch((e: Error) => { console.error(e.message); process.exit(1) })
