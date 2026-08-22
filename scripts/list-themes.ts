import { supabase } from './lib/supabase.js'

/** Prints the questionnaire themes. Read-only helper. Usage: npm run list-themes */
async function main(): Promise<void> {
  const { data, error } = await supabase
    .from('themes_catalog')
    .select('slug, nome, afirmacao_questionario, exibir_no_quiz, ordem_exibicao')
    .order('ordem_exibicao')

  if (error) throw new Error(error.message)

  for (const t of (data ?? []) as Record<string, unknown>[]) {
    console.log(`${String(t.slug).padEnd(30)} quiz=${t.exibir_no_quiz}`)
    console.log(`  ${t.afirmacao_questionario}\n`)
  }
  console.log(`total: ${(data ?? []).length}`)
}

main().catch(err => { console.error(err); process.exit(1) })
