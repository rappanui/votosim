// scripts/neutro-motivo.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyNeutroMotivo } from './lib/neutro-motivo.ts'

// Fixture texts are verbatim excerpts from real politician_positions rows.

test('classifies an explicit "searched and found nothing" as nao_encontrado', () => {
  const j = "Buscas no plano de governo por termos como aborto, união homoafetiva, "
    + "Estado laico e ensino religioso não retornaram nenhuma proposta ou posição "
    + "declarada sobre esses temas."
  assert.equal(classifyNeutroMotivo(j), 'nao_encontrado')
})

test('classifies "não foi encontrada declaração" as nao_encontrado', () => {
  const j = "Não foi encontrada declaração da candidata sobre reforma tributária."
  assert.equal(classifyNeutroMotivo(j), 'nao_encontrado')
})

test('classifies "o plano não faz nenhuma proposta" as nao_encontrado', () => {
  const j = "O plano não faz nenhuma proposta sobre idade mínima ou tempo de "
    + "contribuição para aposentadoria."
  assert.equal(classifyNeutroMotivo(j), 'nao_encontrado')
})

test('returns null for a documented stance that misses the affirmation', () => {
  // The candidate DID take a position; it just does not answer our question.
  // Too subtle for patterns — Task 3 escalates these to the AI.
  const j = "O plano promete 'manter o Bolsa Família', o que é uma posição de "
    + "manutenção, não a ampliação da transferência direta de renda pedida "
    + "especificamente pela afirmação."
  assert.equal(classifyNeutroMotivo(j), null)
})

test('returns null for a mixed/contradictory stance', () => {
  const j = "O plano promete fortalecer a fiscalização contra desmatamento com "
    + "satélite, mas explicitamente separa isso da atividade econômica legal: "
    + "'não criar novas obrigações'."
  assert.equal(classifyNeutroMotivo(j), null)
})

test('returns null for empty or whitespace input', () => {
  assert.equal(classifyNeutroMotivo(''), null)
  assert.equal(classifyNeutroMotivo('   '), null)
})

test('is not fooled by a negation that is part of a real stance', () => {
  // "não a simplificação pedida" is a stance description, not an absence claim.
  const j = "O programa propõe impostos especiais sobre lucros, dividendos e "
    + "grandes fortunas — uma reforma tributária focada em progressividade "
    + "sobre patrimônio, não a simplificação pedida pela afirmação."
  assert.equal(classifyNeutroMotivo(j), null)
})
