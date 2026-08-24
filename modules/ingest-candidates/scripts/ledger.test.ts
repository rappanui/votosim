import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLedgerRows, ALL_STAGES } from './lib/ledger.ts'

test('buildLedgerRows: emits one row per stage', () => {
  const rows = buildLedgerRows('c1', 'presidente', 'total')
  assert.equal(rows.length, ALL_STAGES.length)
  assert.deepEqual(rows.map(r => r.etapa).sort(), [...ALL_STAGES].sort())
})

test('buildLedgerRows: executive offices have all stages pending', () => {
  const rows = buildLedgerRows('c1', 'governador', 'total')
  assert.ok(rows.every(r => r.status === 'pendente'))
})

test('buildLedgerRows: senate candidates file no government plan', () => {
  const rows = buildLedgerRows('c2', 'senador', 'total')
  const docs = rows.find(r => r.etapa === 'documentos_oficiais')!
  assert.equal(docs.status, 'nao_aplicavel')
  // Everything else is still work to do.
  assert.ok(rows.filter(r => r.etapa !== 'documentos_oficiais').every(r => r.status === 'pendente'))
})

test('buildLedgerRows: deputies file no government plan either', () => {
  const rows = buildLedgerRows('c3', 'deputado_federal', 'por_score')
  assert.equal(rows.find(r => r.etapa === 'documentos_oficiais')!.status, 'nao_aplicavel')
})

test('buildLedgerRows: out-of-scope offices are nao_aplicavel across the board', () => {
  const rows = buildLedgerRows('c4', 'deputado_distrital', 'fora_escopo')
  assert.ok(rows.every(r => r.status === 'nao_aplicavel'))
})

test('buildLedgerRows: carries the candidacy id onto every row', () => {
  const rows = buildLedgerRows('abc', 'presidente', 'total')
  assert.ok(rows.every(r => r.candidacy_id === 'abc'))
})
