import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { supabase } from './lib/supabase.js'

const COL_CPF    = 'NR_CPF_CANDIDATO'
const COL_MOTIVO = 'DS_MOTIVO'
const COL_DETALHE = 'DS_DETALHE'
const COL_DATA   = 'DT_OCORRENCIA'

const TSE_SOURCE_URL  = 'https://dadosabertos.tse.jus.br/dataset/certidoes-de-quitacao-eleitoral'
const TSE_SOURCE_NOME = 'TSE — Ficha Limpa / LC 135/2010'

type CsvRow = Record<string, string>

async function findPoliticianByCpfHash(cpfHash: string): Promise<string | null> {
  const { data } = await supabase
    .from('politicians')
    .select('id')
    .eq('cpf_hash', cpfHash)
    .maybeSingle()

  return (data as { id: string } | null)?.id ?? null
}

async function upsertAlert(politicianId: string, row: CsvRow): Promise<void> {
  const { error } = await supabase.from('politician_alerts').upsert(
    {
      politician_id: politicianId,
      tipo: 'ficha_suja',
      severidade: 'critica',
      titulo: row[COL_MOTIVO]?.substring(0, 100) ?? 'Inelegibilidade registrada no TSE',
      descricao: row[COL_DETALHE]?.substring(0, 500) ?? '',
      fonte_url: TSE_SOURCE_URL,
      fonte_nome: TSE_SOURCE_NOME,
      data_ocorrencia: row[COL_DATA] || null,
      ativo: true,
      validado: true,
      gerado_por_ia: false,
    },
    { onConflict: 'politician_id,tipo,titulo' },
  )

  if (error) throw new Error(`Failed to upsert alert for politician ${politicianId}: ${error.message}`)
}

/** Entry point. Usage: npm run ingest-alerts -- <path-to-certidoes-csv> */
async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: npm run ingest-alerts -- <path-to-certidoes-csv>')
    process.exit(1)
  }

  const content = readFileSync(csvPath, 'latin1')
  const rows: CsvRow[] = parse(content, { delimiter: ';', columns: true, skip_empty_lines: true })
  console.info(`[ingest-alerts] Parsed ${rows.length} rows`)

  let inserted = 0
  let notFound = 0

  for (const row of rows) {
    const cpfHash = row[COL_CPF]?.replace(/\D/g, '')
    if (!cpfHash) continue

    const politicianId = await findPoliticianByCpfHash(cpfHash)
    if (!politicianId) { notFound++; continue }

    await upsertAlert(politicianId, row)
    inserted++
  }

  console.info(`[ingest-alerts] Done. Inserted: ${inserted}, CPF not found: ${notFound}`)
}

main().catch(err => { console.error(err); process.exit(1) })
