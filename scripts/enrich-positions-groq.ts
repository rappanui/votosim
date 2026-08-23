import { createRequire } from 'module'
import { readFileSync } from 'fs'
import 'dotenv/config'
import { supabase } from './lib/supabase.js'
import { enrichPositions, type EnrichmentEntry } from './lib/groq.js'

/** The candidate view is named per cycle (v_candidates_2022, v_candidates_2026).
 * Driven by scripts/.env so this enriches the cycle being worked. */
const ELECTION_YEAR = Number(process.env.ELECTION_YEAR)
if (!ELECTION_YEAR) throw new Error('Missing ELECTION_YEAR in scripts/.env')
const CANDIDATES_VIEW = `v_candidates_${ELECTION_YEAR}`

const require = createRequire(import.meta.url)
const PDFParser = require('pdf2json') as new () => import('events').EventEmitter & { loadPDF: (p: string) => void }

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function getArg(prefix: string): string | undefined {
  return args.find(a => a.startsWith(prefix))?.split('=').slice(1).join('=')
}

const politicianId  = getArg('--politician-id=')
const inputFile     = getArg('--input=')
const pdfFile       = getArg('--pdf=')
const minConfidence = parseFloat(getArg('--min-confidence=') ?? '0.70')
const dryRun        = args.includes('--dry-run')

if (!politicianId) {
  console.error('Usage: npm run enrich-positions -- --politician-id=UUID [--input=file.txt | --pdf=file.pdf] [--min-confidence=0.70] [--dry-run]')
  process.exit(1)
}

if (!inputFile && !pdfFile) {
  console.error('Provide --input=<text-file> or --pdf=<pdf-file>')
  process.exit(1)
}

// ─── PDF helper ───────────────────────────────────────────────────────────────

function parsePdf(pdfPath: string): Promise<string | null> {
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

// ─── Supabase helpers ─────────────────────────────────────────────────────────

interface Politician { id: string; nome_urna: string }

async function fetchPolitician(id: string): Promise<Politician | null> {
  const { data, error } = await supabase
    .from(CANDIDATES_VIEW)
    .select('politician_id, nome_urna')
    .eq('politician_id', id)
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { politician_id: string; nome_urna: string }
  return { id: row.politician_id, nome_urna: row.nome_urna }
}

async function loadThemeMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('themes_catalog').select('id, slug')
  if (error) throw new Error(`Failed to load themes: ${error.message}`)
  return new Map((data ?? []).map((r: { id: string; slug: string }) => [r.slug, r.id]))
}

async function upsertEnrichmentRows(
  pid: string,
  entries: EnrichmentEntry[],
  themeMap: Map<string, string>,
): Promise<number> {
  const rows = []
  for (const entry of entries) {
    const themeId = themeMap.get(entry.temaSlug)
    if (!themeId) {
      console.warn(`[enrich] Unknown theme slug: ${entry.temaSlug} — skipping`)
      continue
    }
    rows.push({
      politician_id: pid,
      theme_id:      themeId,
      posicao:       entry.posicao,
      intensidade:   Math.min(5, Math.max(1, Math.round(entry.intensidade))),
      fontes:        entry.fontes,
      gerado_por_ia: true,
      validado:      false,
      confianca_ia:  entry.confianca_ia,
    })
  }

  if (rows.length === 0) return 0

  const { error } = await supabase
    .from('politician_positions')
    .upsert(rows, { onConflict: 'politician_id,theme_id' })
  if (error) throw new Error(`Upsert failed: ${error.message}`)
  return rows.length
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const politician = await fetchPolitician(politicianId!)
  if (!politician) {
    console.error(`Politician not found in ${CANDIDATES_VIEW}: ${politicianId}`)
    process.exit(1)
  }
  console.info(`[enrich] Candidate: ${politician.nome_urna} (${politician.id})`)

  let inputText: string | null = null
  if (pdfFile) {
    console.info(`[enrich] Parsing PDF: ${pdfFile}`)
    inputText = await parsePdf(pdfFile)
    if (!inputText) {
      console.error('[enrich] PDF produced no text — try --input with extracted text')
      process.exit(1)
    }
    console.info(`[enrich] PDF text: ${inputText.length.toLocaleString()} chars`)
  } else {
    inputText = readFileSync(inputFile!, 'utf-8')
    console.info(`[enrich] Text file: ${inputText.length.toLocaleString()} chars`)
  }

  console.info('[enrich] Calling Groq...')
  const entries = await enrichPositions(politician.nome_urna, inputText, { minConfidence })
  console.info(`[enrich] ${entries.length} valid entries (min confidence ${minConfidence})`)

  if (entries.length === 0) {
    console.warn('[enrich] No entries returned — nothing to upsert')
    return
  }

  for (const e of entries) {
    const slug  = e.temaSlug.padEnd(30)
    const pos   = e.posicao.padEnd(10)
    console.info(`  ${slug} ${pos} int=${e.intensidade} conf=${e.confianca_ia}`)
  }

  if (dryRun) {
    console.info('[enrich] --dry-run: skipping upsert')
    return
  }

  const themeMap = await loadThemeMap()
  const upserted = await upsertEnrichmentRows(politician.id, entries, themeMap)
  console.info(`[enrich] Done — ${upserted} rows upserted for ${politician.nome_urna}`)
}

main().catch(err => { console.error(err); process.exit(1) })
