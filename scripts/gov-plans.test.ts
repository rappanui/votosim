import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planArchiveUrl, bulkArchiveUrl, parsePlanFilename } from './lib/gov-plans.ts'

test('planArchiveUrl: builds the TSE CDN url for a state', () => {
  assert.equal(
    planArchiveUrl(2026, 'SP'),
    'https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_SP.zip',
  )
})

test('planArchiveUrl: uppercases the UF', () => {
  assert.ok(planArchiveUrl(2026, 'br').endsWith('proposta_governo_2026_BR.zip'))
})

test('parsePlanFilename: extracts year, uf and sequencial', () => {
  const parsed = parsePlanFilename('2026BR250000123456.pdf')!
  assert.equal(parsed.year, 2026)
  assert.equal(parsed.uf, 'BR')
  assert.equal(parsed.sequencial, '250000123456')
})

test('parsePlanFilename: handles a nested path', () => {
  const parsed = parsePlanFilename('some/dir/2026SP250000999999.pdf')!
  assert.equal(parsed.uf, 'SP')
  assert.equal(parsed.sequencial, '250000999999')
})

test('parsePlanFilename: returns null for unexpected names', () => {
  assert.equal(parsePlanFilename('leiame.txt'), null)
  assert.equal(parsePlanFilename('2026SP.pdf'), null)
})

test('bulkArchiveUrl: builds the national archive url for each dataset', () => {
  const base = 'https://cdn.tse.jus.br/estatistica/sead/odsele'
  assert.equal(bulkArchiveUrl('coligacao', 2026), `${base}/consulta_coligacao/consulta_coligacao_2026.zip`)
  assert.equal(bulkArchiveUrl('bens', 2026), `${base}/bem_candidato/bem_candidato_2026.zip`)
  assert.equal(bulkArchiveUrl('redes_sociais', 2026), `${base}/consulta_cand/rede_social_candidato_2026.zip`)
  assert.equal(bulkArchiveUrl('cassacao', 2026), `${base}/motivo_cassacao/motivo_cassacao_2026.zip`)
  assert.equal(bulkArchiveUrl('complementar', 2026), `${base}/consulta_cand_complementar/consulta_cand_complementar_2026.zip`)
})

test('bulkArchiveUrl: year is interpolated, not hardcoded', () => {
  assert.ok(bulkArchiveUrl('bens', 2022).endsWith('bem_candidato_2022.zip'))
})
