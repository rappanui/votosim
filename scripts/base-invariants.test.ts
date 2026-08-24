import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supabase } from './lib/supabase.ts'
import { NEUTRO_MOTIVOS } from './lib/neutro-motivo.ts'

/**
 * Pins the invariants the pipeline is supposed to maintain on the LIVE
 * database — not a mock, the same base the app queries. A failure here is a
 * finding about the data (or a regression in ingestion), not a bug in the
 * test: nothing in this file should be loosened to turn a failure green.
 *
 * Run: cd scripts && npx tsx --test base-invariants.test.ts
 */

const PAGE_SIZE = 1000

/** PostgREST caps a single response at db.max_rows (1000 here) regardless of
 * .range() bounds, so any table that can exceed that must be paged.
 *
 * `filter` is typed loosely (`any` in, `any` out) because supabase-js's
 * PostgrestFilterBuilder generics don't collapse to a single reusable type
 * across `.select()` and `.eq()` — matching how this codebase's other
 * scripts (e.g. verify-sp0.ts) chain query builders untyped. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll<T>(
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (query: any) => any,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1)
    if (filter) query = filter(query)
    const { data, error } = await query
    if (error) throw new Error(`Fetching ${table}: ${error.message}`)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

function isBlank(s: string | null | undefined): boolean {
  return s === null || s === undefined || s.trim().length === 0
}

// ─── 1. Every politician_positions row has a non-empty justificativa ──────────
// This is what neutro_motivo is classified from, and what the card shows as
// the reason a theme is blank (docs/match-v3-scoring.md).

test('politician_positions: every row has a non-empty justificativa', async () => {
  interface Row { id: string; justificativa: string | null }
  const rows = await fetchAll<Row>('politician_positions', 'id, justificativa')
  const offenders = rows.filter(r => isBlank(r.justificativa)).map(r => r.id)
  assert.equal(
    offenders.length, 0,
    `${offenders.length} politician_positions row(s) with blank justificativa: ${offenders.join(', ')}`,
  )
})

// ─── 2. Every posicao='neutro' row has confianca_ia <= 0.5 ────────────────────
// The premise of match v3 §3: `neutro` marks "found nothing", not a position.

test("politician_positions: every 'neutro' row has confianca_ia <= 0.5", async () => {
  interface Row { id: string; confianca_ia: number | null }
  const rows = await fetchAll<Row>(
    'politician_positions',
    'id, confianca_ia',
    q => q.eq('posicao', 'neutro'),
  )
  const offenders = rows
    .filter(r => r.confianca_ia === null || r.confianca_ia > 0.5)
    .map(r => `${r.id} (confianca_ia=${r.confianca_ia})`)
  assert.equal(
    offenders.length, 0,
    `${offenders.length} 'neutro' politician_positions row(s) with confianca_ia > 0.5: ${offenders.join(', ')}`,
  )
})

// ─── 3. neutro_motivo is null or one of the three permitted values, and is ────
//        null on every non-neutro row.
// The DB constraint (docs/base/12_neutro_motivo.sql) is supposed to enforce
// this already — this test catches the constraint being dropped.

test('politician_positions: neutro_motivo is valid, and null on non-neutro rows', async () => {
  interface Row { id: string; posicao: string; neutro_motivo: string | null }
  const rows = await fetchAll<Row>('politician_positions', 'id, posicao, neutro_motivo')

  const invalidValue = rows
    .filter(r => r.neutro_motivo !== null && !NEUTRO_MOTIVOS.includes(r.neutro_motivo as (typeof NEUTRO_MOTIVOS)[number]))
    .map(r => `${r.id} (neutro_motivo=${r.neutro_motivo})`)
  assert.equal(
    invalidValue.length, 0,
    `${invalidValue.length} row(s) with an out-of-vocabulary neutro_motivo: ${invalidValue.join(', ')}`,
  )

  const leakedOntoNonNeutro = rows
    .filter(r => r.posicao !== 'neutro' && r.neutro_motivo !== null)
    .map(r => `${r.id} (posicao=${r.posicao}, neutro_motivo=${r.neutro_motivo})`)
  assert.equal(
    leakedOntoNonNeutro.length, 0,
    `${leakedOntoNonNeutro.length} non-neutro row(s) carrying a neutro_motivo: ${leakedOntoNonNeutro.join(', ')}`,
  )
})

// ─── 4. Every candidate_sources.camada is 1, 2 or 3 ────────────────────────────
// FontesBloco maps exactly those three values.

test('candidate_sources: every camada is 1, 2 or 3', async () => {
  interface Row { id: string; camada: number }
  const rows = await fetchAll<Row>('candidate_sources', 'id, camada')
  const offenders = rows.filter(r => ![1, 2, 3].includes(r.camada)).map(r => `${r.id} (camada=${r.camada})`)
  assert.equal(
    offenders.length, 0,
    `${offenders.length} candidate_sources row(s) with camada outside {1,2,3}: ${offenders.join(', ')}`,
  )
})

// ─── 5. The newest candidate_dossiers row per candidacy has a non-empty ───────
//        resumo_perfil.

test('candidate_dossiers: the newest versao per candidacy has a non-empty resumo_perfil', async () => {
  interface Row { id: string; candidacy_id: string; versao: number; resumo_perfil: string | null }
  const rows = await fetchAll<Row>('candidate_dossiers', 'id, candidacy_id, versao, resumo_perfil')

  const newestByCandidacy = new Map<string, Row>()
  for (const r of rows) {
    const current = newestByCandidacy.get(r.candidacy_id)
    if (!current || r.versao > current.versao) newestByCandidacy.set(r.candidacy_id, r)
  }

  const offenders = [...newestByCandidacy.values()]
    .filter(r => isBlank(r.resumo_perfil))
    .map(r => `${r.id} (candidacy_id=${r.candidacy_id}, versao=${r.versao})`)
  assert.equal(
    offenders.length, 0,
    `${offenders.length} newest-versao candidate_dossiers row(s) with blank resumo_perfil: ${offenders.join(', ')}`,
  )
})

// ─── 6. Every v_candidate_alerts row has a non-empty fonte_url ────────────────
// docs/04_schema_alerts.md calls this required with no exceptions, and
// AlertasBloco renders the link unconditionally.
//
// The view exposes no `id` column (verified against the live schema — it is
// not just omitted from the SELECT below), so offending rows are identified
// by (politician_id, titulo), the closest stable identifier the view offers.

test('v_candidate_alerts: every row has a non-empty fonte_url', async () => {
  interface Row { politician_id: string; titulo: string; fonte_url: string | null }
  const rows = await fetchAll<Row>('v_candidate_alerts', 'politician_id, titulo, fonte_url')
  const offenders = rows
    .filter(r => isBlank(r.fonte_url))
    .map(r => `politician_id=${r.politician_id} titulo="${r.titulo}"`)
  assert.equal(
    offenders.length, 0,
    `${offenders.length} v_candidate_alerts row(s) with blank fonte_url: ${offenders.join('; ')}`,
  )
})
