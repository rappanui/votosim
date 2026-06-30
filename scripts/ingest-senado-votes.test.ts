import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyEmenta,
  categorizeSenadoVote,
  deriveSenadoPosicao,
  type VoteCount,
} from './ingest-senado-votes.ts'

// ─── classifyEmenta ───────────────────────────────────────────────────────────

test('classifyEmenta: SUS keyword → sus_saude_publica', () => {
  const slugs = classifyEmenta('Dispõe sobre o financiamento do SUS e serviços de saúde')
  assert.ok(slugs.includes('sus_saude_publica'))
})

test('classifyEmenta: privatização keyword → privatizacao_estatais', () => {
  const slugs = classifyEmenta('Autoriza a privatização da Eletrobrás S.A.')
  assert.ok(slugs.includes('privatizacao_estatais'))
})

test('classifyEmenta: desmatamento keyword → meio_ambiente_desmatamento', () => {
  const slugs = classifyEmenta('Dispõe sobre a proteção da Amazônia e combate ao desmatamento')
  assert.ok(slugs.includes('meio_ambiente_desmatamento'))
})

test('classifyEmenta: multiple keywords → multiple slugs', () => {
  const slugs = classifyEmenta('Reforma tributária e previdenciária para 2022')
  assert.ok(slugs.length > 0)
})

test('classifyEmenta: unrelated ementa → empty array', () => {
  const slugs = classifyEmenta('Denomina o aeroporto de Palmas como Aeroporto Internacional de Palmas')
  assert.deepEqual(slugs, [])
})

test('classifyEmenta: case-insensitive matching', () => {
  const slugs = classifyEmenta('FORTALECIMENTO DO SUS E HOSPITAIS PÚBLICOS')
  assert.ok(slugs.includes('sus_saude_publica'))
})

test('classifyEmenta: empty string → empty array', () => {
  assert.deepEqual(classifyEmenta(''), [])
})

// ─── categorizeSenadoVote ─────────────────────────────────────────────────────

test('categorizeSenadoVote: Sim → sim', () => {
  assert.equal(categorizeSenadoVote('Sim'), 'sim')
})

test('categorizeSenadoVote: Não → nao', () => {
  assert.equal(categorizeSenadoVote('Não'), 'nao')
})

test('categorizeSenadoVote: Abstenção → skip', () => {
  assert.equal(categorizeSenadoVote('Abstenção'), 'skip')
})

test('categorizeSenadoVote: P-NRV → skip', () => {
  assert.equal(categorizeSenadoVote('P-NRV'), 'skip')
})

test('categorizeSenadoVote: AP → skip', () => {
  assert.equal(categorizeSenadoVote('AP'), 'skip')
})

// ─── deriveSenadoPosicao ──────────────────────────────────────────────────────

test('deriveSenadoPosicao: sim majority → favoravel', () => {
  const count: VoteCount = { sim: 15, nao: 3 }
  const { posicao, intensidade } = deriveSenadoPosicao(count)
  assert.equal(posicao, 'favoravel')
  assert.ok(intensidade >= 1 && intensidade <= 5)
})

test('deriveSenadoPosicao: nao majority → contrario', () => {
  const count: VoteCount = { sim: 2, nao: 12 }
  assert.equal(deriveSenadoPosicao(count).posicao, 'contrario')
})

test('deriveSenadoPosicao: tie → neutro, intensidade 1', () => {
  const count: VoteCount = { sim: 4, nao: 4 }
  const result = deriveSenadoPosicao(count)
  assert.equal(result.posicao, 'neutro')
  assert.equal(result.intensidade, 1)
})

test('deriveSenadoPosicao: zero → neutro, intensidade 1', () => {
  const count: VoteCount = { sim: 0, nao: 0 }
  const result = deriveSenadoPosicao(count)
  assert.equal(result.posicao, 'neutro')
  assert.equal(result.intensidade, 1)
})

test('deriveSenadoPosicao: caps intensidade at 5', () => {
  const count: VoteCount = { sim: 200, nao: 5 }
  assert.ok(deriveSenadoPosicao(count).intensidade <= 5)
})
