import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mapCamaraThemeToSlugs,
  buildProposicaoToSlugsMap,
  categorizeVote,
  derivePosicao,
  type VoteCount,
} from './ingest-camara-votes.ts'

// ─── mapCamaraThemeToSlugs ────────────────────────────────────────────────────

test('mapCamaraThemeToSlugs: maps Saúde to sus_saude_publica', () => {
  const slugs = mapCamaraThemeToSlugs('Saúde')
  assert.ok(slugs.includes('sus_saude_publica'))
})

test('mapCamaraThemeToSlugs: maps Tributação to reforma_tributaria and politica_economica', () => {
  const slugs = mapCamaraThemeToSlugs('Tributação')
  assert.ok(slugs.includes('reforma_tributaria'))
  assert.ok(slugs.includes('politica_economica'))
})

test('mapCamaraThemeToSlugs: returns empty for unknown theme', () => {
  assert.deepEqual(mapCamaraThemeToSlugs('Esportes e Lazer'), [])
})

test('mapCamaraThemeToSlugs: case-insensitive matching', () => {
  const slugs = mapCamaraThemeToSlugs('SAÚDE')
  assert.ok(slugs.includes('sus_saude_publica'))
})

// ─── buildProposicaoToSlugsMap ────────────────────────────────────────────────

test('buildProposicaoToSlugsMap: single votacao maps to slugs from themes', () => {
  const votacoesProps = [{ idVotacao: 'v1', idProposicao: 'p1' }]
  const temas = [{ idProposicao: 'p1', tema: 'Saúde' }]
  const map = buildProposicaoToSlugsMap(temas, votacoesProps)
  assert.deepEqual(map.get('v1'), ['sus_saude_publica'])
})

test('buildProposicaoToSlugsMap: votacao with no matching proposition is absent', () => {
  const votacoesProps = [{ idVotacao: 'v99', idProposicao: 'p99' }]
  const temas: Array<{ idProposicao: string; tema: string }> = []
  const map = buildProposicaoToSlugsMap(temas, votacoesProps)
  assert.equal(map.has('v99'), false)
})

test('buildProposicaoToSlugsMap: deduplicates slugs for same votacao', () => {
  const votacoesProps = [
    { idVotacao: 'v1', idProposicao: 'p1' },
    { idVotacao: 'v1', idProposicao: 'p1' },
  ]
  const temas = [{ idProposicao: 'p1', tema: 'Saúde' }]
  const map = buildProposicaoToSlugsMap(temas, votacoesProps)
  assert.equal(map.get('v1')?.length, 1)
})

// ─── categorizeVote ───────────────────────────────────────────────────────────

test('categorizeVote: Sim → sim', () => {
  assert.equal(categorizeVote('Sim'), 'sim')
})

test('categorizeVote: Não → nao', () => {
  assert.equal(categorizeVote('Não'), 'nao')
})

test('categorizeVote: Abstenção → skip', () => {
  assert.equal(categorizeVote('Abstenção'), 'skip')
})

test('categorizeVote: Obstrução → skip', () => {
  assert.equal(categorizeVote('Obstrução'), 'skip')
})

// ─── derivePosicao ────────────────────────────────────────────────────────────

test('derivePosicao: sim majority → favoravel', () => {
  const count: VoteCount = { sim: 10, nao: 2 }
  const { posicao, intensidade } = derivePosicao(count)
  assert.equal(posicao, 'favoravel')
  assert.ok(intensidade >= 1 && intensidade <= 5)
})

test('derivePosicao: nao majority → contrario', () => {
  const count: VoteCount = { sim: 1, nao: 8 }
  assert.equal(derivePosicao(count).posicao, 'contrario')
})

test('derivePosicao: tie → neutro', () => {
  const count: VoteCount = { sim: 3, nao: 3 }
  const { posicao, intensidade } = derivePosicao(count)
  assert.equal(posicao, 'neutro')
  assert.equal(intensidade, 1)
})

test('derivePosicao: zero votes → neutro with intensidade 1', () => {
  const count: VoteCount = { sim: 0, nao: 0 }
  const { posicao, intensidade } = derivePosicao(count)
  assert.equal(posicao, 'neutro')
  assert.equal(intensidade, 1)
})

test('derivePosicao: intensidade caps at 5 for many votes', () => {
  const count: VoteCount = { sim: 100, nao: 2 }
  assert.ok(derivePosicao(count).intensidade <= 5)
})

test('derivePosicao: intensidade is at least 1 for single vote', () => {
  const count: VoteCount = { sim: 1, nao: 0 }
  assert.ok(derivePosicao(count).intensidade >= 1)
})
