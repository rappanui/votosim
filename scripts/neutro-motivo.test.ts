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

// Regression tests: a review found ABSENCE_PATTERNS overfiring on stance
// descriptions that merely contain a negated verb. Each text below asserts a
// REAL candidate position via a negation or idiom — none of them is a claim
// that a search came up empty.

test('is not fooled by the "não há dúvida" idiom', () => {
  // "não há dúvida" asserts certainty about a stance, not an absent search.
  const j = "não há dúvida de que o candidato apoia a reforma"
  assert.equal(classifyNeutroMotivo(j), null)
})

test('is not fooled by "não existe consenso" describing a personal stance', () => {
  // The party lacks consensus; the candidate's own position is documented.
  const j = "não existe consenso no partido, mas o candidato pessoalmente "
    + "defende a legalização"
  assert.equal(classifyNeutroMotivo(j), null)
})

test('is not fooled by "não menciona X" when X is not an absence object', () => {
  // A stance description: he negates one policy detail while affirming another.
  const j = "o candidato não menciona compensação aos proprietários, "
    + "preferindo desapropriação direta"
  assert.equal(classifyNeutroMotivo(j), null)
})

test('is not fooled by "não aborda diretamente" when a stance follows', () => {
  // Narrows scope ("diretamente"), then states the actual priority.
  const j = "o plano não aborda diretamente a questão X, mas prioriza Y"
  assert.equal(classifyNeutroMotivo(j), null)
})

test('is not fooled by "não trata... de forma ampla" when a stance follows', () => {
  // Qualifies the scope of treatment, then states what the plan does focus on.
  const j = "o plano não trata da reforma de forma ampla, focando apenas em Y"
  assert.equal(classifyNeutroMotivo(j), null)
})
