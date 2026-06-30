import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterNeedingPositions, buildPositionRows } from './ingest-party-programs.ts'
import type { PositionEntry } from './lib/groq.ts'

// ─── filterNeedingPositions ───────────────────────────────────────────────────

test('filterNeedingPositions: returns ids without positions', () => {
  const all = ['p1', 'p2', 'p3']
  const withPositions = new Set(['p2'])
  assert.deepEqual(filterNeedingPositions(all, withPositions), ['p1', 'p3'])
})

test('filterNeedingPositions: returns empty when all have positions', () => {
  const all = ['p1', 'p2']
  const withPositions = new Set(['p1', 'p2'])
  assert.deepEqual(filterNeedingPositions(all, withPositions), [])
})

test('filterNeedingPositions: returns all when none have positions', () => {
  const all = ['p1', 'p2']
  assert.deepEqual(filterNeedingPositions(all, new Set()), ['p1', 'p2'])
})

// ─── buildPositionRows ────────────────────────────────────────────────────────

test('buildPositionRows: maps PositionEntry to DB row correctly', () => {
  const entry: PositionEntry = {
    temaSlug: 'sus_saude_publica',
    posicao: 'favoravel',
    intensidade: 3,
    justificativa: 'Defende o fortalecimento do SUS',
    confianca: 0.8,
  }
  const themeMap = new Map([['sus_saude_publica', 'uuid-123']])
  const rows = buildPositionRows('politician-id', [entry], themeMap, 'PT')

  assert.equal(rows.length, 1)
  assert.equal(rows[0].politician_id, 'politician-id')
  assert.equal(rows[0].theme_id, 'uuid-123')
  assert.equal(rows[0].posicao, 'favoravel')
  assert.equal(rows[0].intensidade, 3)
  assert.equal(rows[0].confianca_ia, 0.55)
  assert.equal(rows[0].validado, false)
  assert.equal(rows[0].gerado_por_ia, true)
  assert.equal(rows[0].fontes[0].tipo, 'programa_partidario')
  assert.equal(rows[0].fontes[0].descricao, 'Defende o fortalecimento do SUS')
})

test('buildPositionRows: skips entries with unknown theme slugs', () => {
  const entry: PositionEntry = {
    temaSlug: 'tema_inexistente',
    posicao: 'favoravel',
    intensidade: 3,
    justificativa: 'irrelevant',
    confianca: 0.8,
  }
  const themeMap = new Map<string, string>()
  const rows = buildPositionRows('p1', [entry], themeMap, 'PT')
  assert.equal(rows.length, 0)
})

test('buildPositionRows: clamps intensidade to integer 1-5', () => {
  const entry: PositionEntry = {
    temaSlug: 'educacao_basica',
    posicao: 'favoravel',
    intensidade: 4.7,
    justificativa: 'test',
    confianca: 0.9,
  }
  const themeMap = new Map([['educacao_basica', 'uuid-edu']])
  const rows = buildPositionRows('p1', [entry], themeMap, 'PT')
  assert.equal(rows[0].intensidade, 5)
})
