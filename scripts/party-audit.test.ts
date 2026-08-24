import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditParty, summarizeAudit, MAX_DOMINANT_SHARE, type PartyPositionRow } from './lib/party-audit.ts'

function rows(sigla: string, stances: string[]): PartyPositionRow[] {
  return stances.map(posicao => ({ sigla, posicao }))
}

test('auditParty: fails a party that is favoravel on every theme', () => {
  const v = auditParty('PX', rows('PX', Array(14).fill('favoravel')))
  assert.equal(v.allFavoravel, true)
  assert.equal(v.passes, false)
})

test('auditParty: fails a party below the theme threshold', () => {
  const v = auditParty('PY', rows('PY', ['favoravel', 'contrario', 'neutro']))
  assert.equal(v.themeCount, 3)
  assert.equal(v.passes, false)
})

test('auditParty: passes a party with 10+ themes and varied stances', () => {
  const stances = [...Array(7).fill('favoravel'), ...Array(3).fill('contrario')]
  const v = auditParty('PZ', rows('PZ', stances))
  assert.equal(v.themeCount, 10)
  assert.equal(v.distinctStances, 2)
  assert.equal(v.passes, true)
})

test('auditParty: a single stance repeated is not variety even if not favoravel', () => {
  const v = auditParty('PW', rows('PW', Array(12).fill('contrario')))
  assert.equal(v.distinctStances, 1)
  assert.equal(v.passes, false)
})

test('auditParty: fails a party with 13 favoravel and 1 contrario due to dominance', () => {
  const stances = [...Array(13).fill('favoravel'), 'contrario']
  const v = auditParty('PD', rows('PD', stances))
  assert.equal(v.themeCount, 14)
  assert.equal(v.distinctStances, 2)
  assert.equal(v.allFavoravel, false)
  assert.ok(v.dominantShare > MAX_DOMINANT_SHARE)
  assert.equal(v.passes, false)
})

test('auditParty: passes a party with 11 favoravel and 3 contrario (dominantShare below threshold)', () => {
  const stances = [...Array(11).fill('favoravel'), ...Array(3).fill('contrario')]
  const v = auditParty('PE', rows('PE', stances))
  assert.equal(v.themeCount, 14)
  assert.equal(v.distinctStances, 2)
  assert.ok(v.dominantShare <= MAX_DOMINANT_SHARE)
  assert.equal(v.passes, true)
})

test('auditParty: fails a party with 9 themes (below minimum)', () => {
  const stances = [...Array(6).fill('favoravel'), ...Array(3).fill('contrario')]
  const v = auditParty('PF', rows('PF', stances))
  assert.equal(v.themeCount, 9)
  assert.equal(v.passes, false)
})

test('auditParty: fails a party with zero rows', () => {
  const v = auditParty('PZ', rows('PZ', []))
  assert.equal(v.themeCount, 0)
  assert.equal(v.allFavoravel, false)
  assert.equal(v.dominantShare, 0)
  assert.equal(v.passes, false)
})

test('summarizeAudit: gate passes only when at least one party passes', () => {
  const passing = auditParty('PZ', rows('PZ', [...Array(7).fill('favoravel'), ...Array(3).fill('contrario')]))
  const failing = auditParty('PX', rows('PX', Array(14).fill('favoravel')))
  assert.equal(summarizeAudit([passing, failing]).gatePasses, true)
  assert.equal(summarizeAudit([failing]).gatePasses, false)
  assert.equal(summarizeAudit([]).gatePasses, false)
})

test('summarizeAudit: counts totals correctly', () => {
  const a = auditParty('A', rows('A', Array(14).fill('favoravel')))
  const b = auditParty('B', rows('B', [...Array(6).fill('favoravel'), ...Array(6).fill('neutro')]))
  const s = summarizeAudit([a, b])
  assert.equal(s.total, 2)
  assert.equal(s.passing, 1)
})
