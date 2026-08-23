import { fileURLToPath } from 'url'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const PDFParser = require('pdf2json') as new () => import('events').EventEmitter & { loadPDF: (p: string) => void }
import { readdirSync } from 'fs'
import { join, basename } from 'path'
import 'dotenv/config'
import { supabase } from './lib/supabase.js'
import { enrichPositions, type EnrichmentEntry } from './lib/groq.js'
import { sleep } from './lib/sleep.js'

/** Driven by scripts/.env, not hardcoded — see ingest-camara-votes.ts. */
const ELECTION_YEAR = Number(process.env.ELECTION_YEAR)
if (!ELECTION_YEAR) throw new Error('Missing ELECTION_YEAR in scripts/.env')

const RATE_LIMIT_DELAY_MS = 1_000
const PROXY_CONFIDENCE = 0.55

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export function filterNeedingPositions(allIds: string[], withPositions: Set<string>): string[] {
  return allIds.filter(id => !withPositions.has(id))
}

export interface PositionRow {
  politician_id: string
  theme_id: string
  posicao: string
  intensidade: number
  fontes: Array<{ tipo: string; descricao: string; url: null; data: string; confiabilidade: number }>
  gerado_por_ia: boolean
  validado: boolean
  confianca_ia: number
}

export function buildPositionRows(
  politicianId: string,
  entries: EnrichmentEntry[],
  themeMap: Map<string, string>,
  partySigla: string,
): PositionRow[] {
  const rows: PositionRow[] = []
  for (const entry of entries) {
    const themeId = themeMap.get(entry.temaSlug)
    if (!themeId) {
      console.info(`[ingest-party-programs] Unknown theme slug: ${entry.temaSlug} (${partySigla})`)
      continue
    }
    rows.push({
      politician_id: politicianId,
      theme_id: themeId,
      posicao: entry.posicao,
      intensidade: Math.min(5, Math.max(1, Math.round(entry.intensidade))),
      fontes: [{
        tipo: 'programa_partidario',
        descricao: entry.justificativa,
        url: null,
        data: String(ELECTION_YEAR),
        confiabilidade: PROXY_CONFIDENCE,
      }],
      gerado_por_ia: true,
      validado: false,
      confianca_ia: PROXY_CONFIDENCE,
    })
  }
  return rows
}

// ─── PDF helper ───────────────────────────────────────────────────────────────

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

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function loadThemeMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('themes_catalog').select('id, slug')
  if (error) throw new Error(`Failed to load themes: ${error.message}`)
  return new Map((data ?? []).map((r: { id: string; slug: string }) => [r.slug, r.id]))
}

async function loadPoliticiansByParty(sigla: string): Promise<string[]> {
  const PAGE = 1000
  const ids: string[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('politicians')
      .select('id, candidacies!inner(ano_eleicao)')
      .eq('partido_atual', sigla)
      .eq('candidacies.ano_eleicao', ELECTION_YEAR)
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Failed to load politicians for ${sigla}: ${error.message}`)
    const page = (data ?? []) as Array<{ id: string }>
    ids.push(...page.map(r => r.id))
    if (page.length < PAGE) break
    offset += PAGE
  }
  return ids
}

async function loadPoliticiansWithPositions(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  // Keep chunk small enough that CHUNK × max_themes_per_politician < Supabase default row limit (1000)
  // With max 14 themes per politician: CHUNK = 60 → 60 × 14 = 840 rows per query (safe margin)
  const CHUNK = 60
  const result = new Set<string>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('politician_positions')
      .select('politician_id')
      .in('politician_id', ids.slice(i, i + CHUNK))
    if (error) throw new Error(`Failed to check existing positions: ${error.message}`)
    for (const r of (data ?? []) as Array<{ politician_id: string }>) result.add(r.politician_id)
  }
  return result
}

async function insertProxyPositions(rows: PositionRow[]): Promise<void> {
  if (rows.length === 0) return
  // Use upsert with ignoreDuplicates so re-runs don't overwrite real positions or throw on conflict
  const { error } = await supabase
    .from('politician_positions')
    .upsert(rows, { onConflict: 'politician_id,theme_id', ignoreDuplicates: true })
  if (error) throw new Error(`Failed to insert positions: ${error.message}`)
}

async function upsertPartyPositions(
  sigla: string,
  entries: import('./lib/groq.js').EnrichmentEntry[],
  themeMap: Map<string, string>,
): Promise<number> {
  // Deduplicate by temaSlug: keep the entry with highest confianca_ia when AI returns duplicates
  const deduped = new Map<string, import('./lib/groq.js').EnrichmentEntry>()
  for (const entry of entries) {
    const existing = deduped.get(entry.temaSlug)
    if (!existing || entry.confianca_ia > existing.confianca_ia) deduped.set(entry.temaSlug, entry)
  }

  const rows = [...deduped.values()].flatMap(entry => {
    const themeId = themeMap.get(entry.temaSlug)
    // 'variavel' means the party has no unified stance — skip for party-level match
    if (!themeId || entry.posicao === 'variavel') return []
    return [{
      party_sigla: sigla,
      theme_id: themeId,
      posicao: entry.posicao,
      intensidade: Math.min(5, Math.max(1, Math.round(entry.intensidade))),
      fontes: [{
        tipo: 'programa_partidario',
        descricao: entry.justificativa,
        url: null,
        data: String(ELECTION_YEAR),
        confiabilidade: PROXY_CONFIDENCE,
      }],
      gerado_por_ia: true,
      validado: false,
      confianca_ia: PROXY_CONFIDENCE,
    }]
  })
  if (rows.length === 0) return 0
  const { error } = await supabase
    .from('party_positions')
    .upsert(rows, { onConflict: 'party_sigla,theme_id' })
  if (error) throw new Error(`Failed to upsert party positions for ${sigla}: ${error.message}`)
  return rows.length
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Usage: npm run ingest-party-programs -- [data/party-programs]
 * Default dir: data/party-programs (relative to scripts/)
 *
 * For each PDF:
 *  1. UPSERTs party-level positions into `party_positions` (used for party match).
 *  2. INSERTs proxy positions into `politician_positions` for members without data.
 */
async function main(): Promise<void> {
  const partyProgramsDir = process.argv[2] ?? 'data/party-programs'

  const pdfs = readdirSync(partyProgramsDir)
    .filter(f => f.endsWith('.pdf'))
    .map(f => ({ path: join(partyProgramsDir, f), sigla: basename(f, '.pdf') }))

  if (pdfs.length === 0) {
    console.error(`[ingest-party-programs] No PDFs found in ${partyProgramsDir}`)
    process.exit(1)
  }

  console.info(`[ingest-party-programs] Found ${pdfs.length} party PDFs: ${pdfs.map(p => p.sigla).join(', ')}`)

  const themeMap = await loadThemeMap()

  let totalPartyRows = 0
  let totalInserted = 0
  let totalSkipped = 0

  for (const { path, sigla } of pdfs) {
    console.info(`\n[ingest-party-programs] Processing ${sigla}...`)

    const text = await parsePdf(path)
    if (!text) {
      console.warn(`[ingest-party-programs] [SKIPPED] Could not extract text from ${sigla}.pdf`)
      continue
    }

    const entries = await enrichPositions(sigla, text, { allowFallback: false, minConfidence: 0.6 })
    if (entries.length === 0) {
      console.warn(`[ingest-party-programs] [SKIPPED] No positions extracted for ${sigla}`)
      await sleep(RATE_LIMIT_DELAY_MS)
      continue
    }

    console.info(`[ingest-party-programs] ${sigla}: ${entries.length} positions extracted`)

    // 1. Store party-level positions for party match feature.
    const partyRows = await upsertPartyPositions(sigla, entries, themeMap)
    totalPartyRows += partyRows
    console.info(`[ingest-party-programs] ${sigla}: ${partyRows} party_positions upserted`)

    // 2. Proxy positions for individual members without data.
    const allPoliticianIds = await loadPoliticiansByParty(sigla)
    if (allPoliticianIds.length === 0) {
      console.info(`[ingest-party-programs] ${sigla}: no politicians in DB, skipping proxy`)
      await sleep(RATE_LIMIT_DELAY_MS)
      continue
    }

    const withPositions = await loadPoliticiansWithPositions(allPoliticianIds)
    const needingPositions = filterNeedingPositions(allPoliticianIds, withPositions)

    console.info(`[ingest-party-programs] ${sigla}: ${allPoliticianIds.length} politicians, ${needingPositions.length} without positions`)

    // Batch all rows together to avoid N×1 API calls (1 call per 500 rows)
    const allProxyRows = needingPositions.flatMap(id => buildPositionRows(id, entries, themeMap, sigla))
    const PROXY_BATCH = 500
    for (let i = 0; i < allProxyRows.length; i += PROXY_BATCH) {
      await insertProxyPositions(allProxyRows.slice(i, i + PROXY_BATCH))
    }
    totalInserted += allProxyRows.length

    totalSkipped += withPositions.size
    await sleep(RATE_LIMIT_DELAY_MS)
  }

  console.info(`\n[ingest-party-programs] Done. Party positions upserted: ${totalPartyRows}, proxy positions inserted: ${totalInserted}, politicians skipped (already had data): ${totalSkipped}`)
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1) })
}
