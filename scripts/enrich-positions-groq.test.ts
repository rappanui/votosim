import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidEnrichmentEntry,
  buildEnrichmentUserMessage,
  type EnrichmentEntry,
} from './lib/groq.js'

// ─── isValidEnrichmentEntry ───────────────────────────────────────────────────

test('isValidEnrichmentEntry: accepts valid favoravel entry', () => {
  const entry: Partial<EnrichmentEntry> = {
    temaSlug: 'sus_saude_publica',
    posicao: 'favoravel',
    intensidade: 4,
    justificativa: 'Defende o SUS público',
    confianca_ia: 0.88,
    fontes: [{ tipo: 'ai_interpretacao', descricao: 'PDF', url: null, data: '2022', confiabilidade: 0.88 }],
  }
  assert.equal(isValidEnrichmentEntry(entry), true)
})

test('isValidEnrichmentEntry: rejects unknown theme slug', () => {
  const entry = {
    temaSlug: 'tema_falso',
    posicao: 'favoravel',
    intensidade: 3,
    justificativa: 'irrelevant',
    confianca_ia: 0.80,
    fontes: [],
  }
  assert.equal(isValidEnrichmentEntry(entry), false)
})

test('isValidEnrichmentEntry: rejects missing fontes', () => {
  const entry = {
    temaSlug: 'educacao_basica',
    posicao: 'contrario',
    intensidade: 3,
    justificativa: 'Cortou verbas',
    confianca_ia: 0.80,
  }
  assert.equal(isValidEnrichmentEntry(entry), false)
})

test('isValidEnrichmentEntry: rejects confianca_ia below 0', () => {
  const entry = {
    temaSlug: 'educacao_basica',
    posicao: 'contrario',
    intensidade: 2,
    justificativa: 'x',
    confianca_ia: -0.1,
    fontes: [],
  }
  assert.equal(isValidEnrichmentEntry(entry), false)
})

test('isValidEnrichmentEntry: rejects intensidade outside 1-5', () => {
  const entry = {
    temaSlug: 'meio_ambiente_desmatamento',
    posicao: 'contrario',
    intensidade: 6,
    justificativa: 'x',
    confianca_ia: 0.85,
    fontes: [],
  }
  assert.equal(isValidEnrichmentEntry(entry), false)
})

test('isValidEnrichmentEntry: accepts neutro posicao', () => {
  const entry: Partial<EnrichmentEntry> = {
    temaSlug: 'bolsa_familia_transferencia',
    posicao: 'neutro',
    intensidade: 2,
    justificativa: 'Posição ambígua',
    confianca_ia: 0.72,
    fontes: [{ tipo: 'ai_interpretacao', descricao: 'x', url: null, data: '2022', confiabilidade: 0.72 }],
  }
  assert.equal(isValidEnrichmentEntry(entry), true)
})

test('isValidEnrichmentEntry: rejects variavel posicao (not valid for enrichment)', () => {
  const entry = {
    temaSlug: 'reforma_tributaria',
    posicao: 'variavel',
    intensidade: 2,
    justificativa: 'x',
    confianca_ia: 0.75,
    fontes: [],
  }
  assert.equal(isValidEnrichmentEntry(entry), false)
})

test('isValidEnrichmentEntry: rejects non-array fontes', () => {
  const entry = {
    temaSlug: 'politica_economica',
    posicao: 'favoravel',
    intensidade: 3,
    justificativa: 'x',
    confianca_ia: 0.80,
    fontes: 'not-an-array',
  }
  assert.equal(isValidEnrichmentEntry(entry), false)
})

// ─── buildEnrichmentUserMessage ───────────────────────────────────────────────

test('buildEnrichmentUserMessage: includes candidate name', () => {
  const msg = buildEnrichmentUserMessage('Lula', 'Texto qualquer')
  assert.ok(msg.includes('Lula'))
})

test('buildEnrichmentUserMessage: includes input text', () => {
  const msg = buildEnrichmentUserMessage('Teste', 'CONTEÚDO_DO_PROGRAMA')
  assert.ok(msg.includes('CONTEÚDO_DO_PROGRAMA'))
})

test('buildEnrichmentUserMessage: truncates very long input', () => {
  const longText = 'x'.repeat(200_000)
  const msg = buildEnrichmentUserMessage('Teste', longText)
  assert.ok(msg.length < 160_000)
})

test('buildEnrichmentUserMessage: short input is not truncated', () => {
  const text = 'Texto curto de teste'
  const msg = buildEnrichmentUserMessage('Candidato', text)
  assert.ok(msg.includes(text))
})
