import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditParty, summarizeAudit, type PartyPositionRow } from './lib/party-audit.ts'

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
