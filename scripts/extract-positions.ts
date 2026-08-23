import { parse } from 'csv-parse/sync'
import { readFileSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const PDFParser = require('pdf2json') as new () => import('events').EventEmitter & { loadPDF: (p: string) => void }
import 'dotenv/config'
import { supabase } from './lib/supabase.js'
import { extractPositions } from './lib/groq.js'
import { sleep } from './lib/sleep.js'

/** Driven by scripts/.env, not hardcoded — see ingest-camara-votes.ts. */
const ELECTION_YEAR = Number(process.env.ELECTION_YEAR)
if (!ELECTION_YEAR) throw new Error('Missing ELECTION_YEAR in scripts/.env')

const RATE_LIMIT_DELAY_MS = 1_000

// consulta_cand CSV columns used for SQ → cpf_hash lookup
const COL_SQ  = 'SQ_CANDIDATO'
const COL_CPF = 'NR_CPF_CANDIDATO'
const COL_UF  = 'SG_UF'

type CsvRow = Record<string, string>

import { createHash } from 'crypto'

function hashCpf(cpf: string): string {
  return createHash('sha256').update(cpf.replace(/\D/g, '')).digest('hex')
}

/** Builds SQ_CANDIDATO → cpf_hash map from the consulta_cand CSV. */
function buildSqToCpfMap(csvPath: string): Map<string, string> {
  const content = readFileSync(csvPath, 'latin1')
  const rows: CsvRow[] = parse(content, { delimiter: ';', columns: true, skip_empty_lines: true })
  const map = new Map<string, string>()
  for (const row of rows) {
    const sq  = row[COL_SQ]?.trim()
    const cpf = row[COL_CPF]?.replace(/\D/g, '')
    if (sq && cpf) map.set(sq, hashCpf(cpf))
  }
  console.info(`[extract-positions] SQ→CPF map: ${map.size} entries`)
  return map
}

/** Extracts SQ_CANDIDATO from PDF filename pattern {ano}{UF}{SQ}.pdf */
function sqFromFilename(filename: string): string | null {
  // e.g. "2022SP250001612465.pdf" → "250001612465"
  const match = basename(filename).match(/^\d{4}[A-Z]{2}(\d+)\.pdf$/i)
  return match?.[1] ?? null
}

async function parsePdf(pdfPath: string): Promise<string | null> {
  return new Promise(resolve => {
    const parser = new PDFParser()
    parser.on('pdfParser_dataReady', (d: { Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }) => {
      try {
        const text = (d.Pages ?? [])
          .flatMap(pg => (pg.Texts ?? []).map(t => {
            try { return decodeURIComponent(t.R?.[0]?.T ?? '') } catch { return '' }
          }))
          .join(' ')
        resolve(text.trim() || null)
      } catch {
        resolve(null)
      }
    })
    parser.on('pdfParser_dataError', () => resolve(null))
    parser.loadPDF(pdfPath)
  })
}

async function loadThemesMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('themes_catalog')
    .select('id, slug')
  if (error) throw new Error(`Failed to load themes: ${error.message}`)
  const map = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ id: string; slug: string }>) {
    map.set(row.slug, row.id)
  }
  console.info(`[extract-positions] Themes loaded: ${map.size}`)
  return map
}

async function findPoliticianByCpfHash(cpfHash: string): Promise<string | null> {
  const { data } = await supabase
    .from('politicians')
    .select('id')
    .eq('cpf_hash', cpfHash)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function savePositions(
  politicianId: string,
  positions: import('./lib/groq.js').PositionEntry[],
  themesMap: Map<string, string>,
): Promise<number> {
  const rows = []
  for (const p of positions) {
    const themeId = themesMap.get(p.temaSlug)
    if (!themeId) {
      console.info(`[extract-positions] Unknown theme slug: ${p.temaSlug}`)
      continue
    }
    rows.push({
      politician_id: politicianId,
      theme_id: themeId,
      posicao: p.posicao,
      intensidade: Math.round(p.intensidade),
      fontes: [{ tipo: 'tse_pdf', descricao: p.justificativa, url: null, data: '2022', confiabilidade: p.confianca }],
      gerado_por_ia: true,
      validado: p.confianca >= 0.85,
      confianca_ia: p.confianca,
    })
  }

  if (rows.length === 0) return 0

  const { error } = await supabase
    .from('politician_positions')
    .upsert(rows, { onConflict: 'politician_id,theme_id' })

  if (error) throw new Error(`Failed to save positions: ${error.message}`)
  return rows.length
}

async function hasPoliticianPositions(politicianId: string): Promise<boolean> {
  const { count } = await supabase
    .from('politician_positions')
    .select('*', { count: 'exact', head: true })
    .eq('politician_id', politicianId)
  return (count ?? 0) > 0
}

/**
 * Entry point.
 * Usage: npm run extract-positions -- <propostas-dir> <consulta_cand.csv> [--estado=SP]
 *
 * <propostas-dir>: directory containing extracted PDF files (e.g. data/propostas_2022)
 * <consulta_cand.csv>: TSE candidates CSV used to resolve SQ_CANDIDATO → CPF
 * --estado=SP: optional filter to process only one state (folder name inside propostas-dir)
 */
async function main(): Promise<void> {
  const propostsDir = process.argv[2]
  const candCsvPath = process.argv[3]
  const estadoArg   = process.argv.find(a => a.startsWith('--estado='))?.split('=')[1]?.toUpperCase()

  if (!propostsDir || !candCsvPath) {
    console.error('Usage: npm run extract-positions -- <propostas-dir> <consulta_cand.csv> [--estado=SP]')
    process.exit(1)
  }

  const sqMap = buildSqToCpfMap(candCsvPath)
  const themesMap = await loadThemesMap()

  // Collect all PDF files from state subdirectories
  const stateFilter = estadoArg ? [estadoArg] : undefined
  const states = readdirSync(propostsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && (!stateFilter || stateFilter.includes(d.name.toUpperCase())))
    .map(d => d.name)

  if (states.length === 0) {
    console.error(`[extract-positions] No state directories found in ${propostsDir}`)
    process.exit(1)
  }

  const pdfs: Array<{ path: string; sq: string; uf: string }> = []
  for (const uf of states) {
    const dir = join(propostsDir, uf)
    for (const file of readdirSync(dir).filter(f => f.endsWith('.pdf') && f !== 'leiame.pdf')) {
      const sq = sqFromFilename(file)
      if (sq) pdfs.push({ path: join(dir, file), sq, uf })
    }
  }

  console.info(`[extract-positions] ${pdfs.length} PDFs to process (states: ${states.join(', ')})`)

  let saved = 0
  let skipped = 0
  let errors = 0

  for (const { path: pdfPath, sq, uf } of pdfs) {
    const cpfHash = sqMap.get(sq)
    if (!cpfHash) {
      console.info(`[extract-positions] [SKIPPED] No CPF for SQ ${sq} (${uf})`)
      skipped++
      continue
    }

    const politicianId = await findPoliticianByCpfHash(cpfHash)
    if (!politicianId) {
      console.info(`[extract-positions] [SKIPPED] Politician not in DB for SQ ${sq}`)
      skipped++
      continue
    }

    if (await hasPoliticianPositions(politicianId)) {
      console.info(`[extract-positions] [SKIPPED] Already has positions: SQ ${sq}`)
      skipped++
      continue
    }

    const text = await parsePdf(pdfPath)
    if (!text?.trim()) {
      console.info(`[extract-positions] [SKIPPED] Could not extract text from ${basename(pdfPath)}`)
      skipped++
      continue
    }

    try {
      const positions = await extractPositions(sq, text)
      if (positions.length > 0) {
        const count = await savePositions(politicianId, positions, themesMap)
        console.info(`[extract-positions] Saved ${count} positions for SQ ${sq} (${uf})`)
        saved++
      } else {
        console.info(`[extract-positions] No positions extracted for SQ ${sq}`)
        skipped++
      }
    } catch (err) {
      console.error(`[extract-positions] Error for SQ ${sq}:`, err)
      errors++
    }

    await sleep(RATE_LIMIT_DELAY_MS)
  }

  console.info(`[extract-positions] Done. Saved: ${saved}, skipped: ${skipped}, errors: ${errors}`)
}

main().catch(err => { console.error(err); process.exit(1) })
