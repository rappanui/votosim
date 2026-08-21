import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findPlanPath, renderBrief, type BriefInput } from './build-brief.ts'

test('findPlanPath: matches a plan by sequencial regardless of part suffix', () => {
  const files = ['BR/2026BR280002542548_01.pdf', 'BR/2026BR280002538811_01.pdf', 'BR/leiame.pdf']
  assert.equal(findPlanPath('280002542548', files), 'BR/2026BR280002542548_01.pdf')
})

test('findPlanPath: returns null when the candidate filed no plan', () => {
  const files = ['BR/2026BR280002542548_01.pdf']
  assert.equal(findPlanPath('280002553884', files), null)
})

test('findPlanPath: ignores leiame and other non-plan files', () => {
  assert.equal(findPlanPath('280002542548', ['BR/leiame.pdf']), null)
})

function briefInput(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    nomeUrna: 'LULA',
    nomeCompleto: 'LUIZ INACIO LULA DA SILVA',
    cargo: 'presidente',
    estado: 'BR',
    partido: 'PT',
    coligacao: 'BRASIL PRONTO PRA MAIS',
    federacao: 'PT/PC do B/PV',
    numeroUrna: '13',
    tseSequencial: '280002542548',
    planoTexto: 'PROGRAMA DE GOVERNO texto completo aqui.',
    redesSociais: ['HTTPS://INSTAGRAM.COM/LULAOFICIAL'],
    temas: [{ slug: 'educacao_basica', afirmacao: 'O governo deve aumentar o investimento em escolas públicas.' }],
    ...overrides,
  }
}

test('renderBrief: includes identity, office and party metadata', () => {
  const out = renderBrief(briefInput())
  assert.match(out, /LULA/)
  assert.match(out, /presidente/)
  assert.match(out, /PT\/PC do B\/PV/)
  assert.match(out, /280002542548/)
})

test('renderBrief: embeds the government plan text', () => {
  assert.match(renderBrief(briefInput()), /PROGRAMA DE GOVERNO texto completo/)
})

test('renderBrief: states plainly when no plan was filed', () => {
  const out = renderBrief(briefInput({ planoTexto: null }))
  assert.match(out, /no government plan/i)
  assert.doesNotMatch(out, /PROGRAMA DE GOVERNO texto/)
})

test('renderBrief: lists every theme with its exact questionnaire wording', () => {
  const out = renderBrief(briefInput())
  assert.match(out, /educacao_basica/)
  assert.match(out, /aumentar o investimento em escolas públicas/)
})

test('renderBrief: lists declared social accounts', () => {
  assert.match(renderBrief(briefInput()), /INSTAGRAM\.COM\/LULAOFICIAL/)
})

test('renderBrief: says so when no social accounts were declared', () => {
  assert.match(renderBrief(briefInput({ redesSociais: [] })), /none declared/i)
})
