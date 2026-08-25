// tests/neutro-motivo.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyNeutroMotivo } from '../src/lib/neutro-motivo.ts'

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
// even the round-2 patterns can sit in the SAME text as a real position on a
// related topic. No pattern can tell "the stance verb is about a genuinely
// unrelated topic" apart from "the stance verb is about a topic close enough
// to be ambiguous" — that needs a reader. So classifyNeutroMotivo now has a
// guard clause: an absence-pattern match is discarded (returns null instead
// of nao_encontrado) whenever a stance verb also appears in the text.

test('defers a genuinely ambiguous row to the AI instead of forcing nao_encontrado', () => {
  // Full text, verbatim from politician_positions.justificativa (real row).
  // This is not a misclassification to correct — it is genuinely ambiguous:
  // the programa has a documented tax position (grandes fortunas, isenções
  // fiscais, remessa de lucros) that is explicitly orthogonal to the
  // affirmation ("nada disso decide a afirmação"), which reads as
  // nao_responde; press searches for the candidate's own statement on the
  // affirmation itself found nothing, which reads as nao_encontrado. The
  // guard's value is exactly this: it routes a row like this to a reader
  // instead of letting a regex pick one of two defensible labels. Verified
  // both halves fire on this text: the "buscas ... não retornaram" absence
  // pattern matches ("Buscas na imprensa por declarações ... não retornaram
  // material atribuível a ele"), and "propõe" trips the stance-verb guard —
  // so the null here comes from the guard, not from an absence-pattern miss.
  const j = "O programa protocolado no TSE trata de tributos, mas por outro "
    + "ângulo: propõe taxação das grandes fortunas do estado, fim das "
    + "isenções fiscais concedidas a grandes empresas com auditoria pública "
    + "desses acordos e proibição de remessa de lucros ao exterior. Nada "
    + "disso decide a afirmação, que pergunta especificamente sobre "
    + "simplificar e unificar os impostos sobre consumo, renda e produção. "
    + "Buscas na imprensa por declarações do candidato sobre a reforma "
    + "tributária não retornaram material atribuível a ele. Registrado como "
    + "neutro por falta de evidência sobre a afirmação como está escrita, "
    + "sem inferir posição por proximidade temática."
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
