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

// Round 2 regression tests: a second review round found the generic-verb
// lookahead window (round 1's fix) still overfired whenever the absence
// object happened to land near the verb by coincidence, and that the
// "não se manifesta/pronuncia/posiciona" pattern had no object guard at all.
// Both pattern shapes were removed outright rather than patched again.

test('is not fooled by "não registra apoio a X" when a stance follows', () => {
  // "proposta" sits near "registra" by coincidence — the sentence negates
  // support for the original proposal, not the existence of a proposal.
  const j = "o candidato não registra apoio à proposta original, preferindo "
    + "um modelo alternativo de financiamento"
  assert.equal(classifyNeutroMotivo(j), null)
})

test('is not fooled by "não apresenta ressalvas" when it means full agreement', () => {
  // Negates having reservations, not the existence of the proposal itself.
  const j = "o programa não apresenta ressalvas à proposta, apoiando-a integralmente"
  assert.equal(classifyNeutroMotivo(j), null)
})

test('is not fooled by "não se posiciona a favor de X" when Y is defended instead', () => {
  // A stance: rejects the current model in favor of full nationalization.
  const j = "o candidato não se posiciona a favor do modelo atual, defendendo "
    + "em vez disso a estatização plena"
  assert.equal(classifyNeutroMotivo(j), null)
})

// Round 3 regression tests: a hand inspection of the real corpus found that
// even the round-2 patterns can sit in the SAME sentence as a real position
// on the SAME topic — e.g. an absence claim about the affirmation's literal
// wording, immediately followed by "mas o programa PROPÕE X" describing an
// actual, on-topic stance. No pattern can tell "the stance verb is about a
// different topic than the absence claim" apart from "the stance verb is
// about THIS topic" — that needs a reader. So classifyNeutroMotivo now has a
// guard clause: an absence-pattern match is discarded (returns null instead
// of nao_encontrado) whenever a stance verb also appears in the text.

test('defers to the AI when a matched absence claim sits next to a real tax position', () => {
  // Real corpus overfire (fix round 3): the classifier previously called this
  // nao_encontrado, but the programa DOES propose a documented tax position —
  // it is nao_responde. Quoted as given by the reviewer (truncated with "...");
  // the omitted portion of the real stored justificativa is what trips an
  // ABSENCE_PATTERN — this excerpt alone already returns null with no pattern
  // match, so the assertion holds regardless, and the guard covers the full
  // text once the omitted absence clause is present.
  const j = "O programa protocolado no TSE trata de tributos, mas por outro "
    + "ângulo: propõe taxação das grandes fortunas do estado, fim das "
    + "isenções fiscais..."
  assert.equal(classifyNeutroMotivo(j), null)
})

test('defers to the AI when a matched absence claim sits next to a real rights position', () => {
  // Real corpus overfire (fix round 3): the programa DOES apoia the relevant
  // autonomy/rights position — nao_responde, not nao_encontrado. Quoted as
  // given by the reviewer (truncated with "..."); same caveat as above about
  // the omitted absence-triggering portion of the full stored text.
  const j = "A afirmação é dupla... O programa apoia amplamente a autonomia "
    + "sobre a própria vida em outras frentes — direito ao aborto legal..."
  assert.equal(classifyNeutroMotivo(j), null)
})

test('defers a correctly-matched nao_encontrado to the AI when a stance verb is also present', () => {
  // This one genuinely exercises the guard end-to-end: the text DOES match
  // the "buscas ... não retornaram" absence pattern (Bolsa Família is not
  // found), and this row really is nao_encontrado. But "prioriza" elsewhere
  // in the same justification trips the stance-verb guard, so the classifier
  // now defers it to the AI instead of guessing — the accepted cost of
  // erring toward precision (a few correct rows re-decided by the AI) is
  // cheaper than a missed nao_responde overfire.
  const j = "Buscas por Bolsa Família não retornaram nenhuma ocorrência no "
    + "plano. Sem posição identificável — o plano prioriza reestatização de "
    + "serviços"
  assert.equal(classifyNeutroMotivo(j), null)
})
