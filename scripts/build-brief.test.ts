import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findPlanPath, findPlanPaths, diagnosePlanAvailability, renderBrief, loadSocialAccounts, type BriefInput } from './build-brief.ts'

// ─── diagnosePlanAvailability ────────────────────────────────────────────────
// F11: "no plan found" has four very different causes, and reporting them all
// as NONE FILED wrote false statements into voter-facing dossiers.

test('diagnosePlanAvailability: a found plan is just found', () => {
  const d = diagnosePlanAvailability({
    cargo: 'presidente', estado: 'BR',
    planPathsForCandidate: ['planos/BR/2026BR280002542548_01.pdf'],
    allPlanFiles: ['planos/BR/2026BR280002542548_01.pdf'],
  })
  assert.equal(d.kind, 'found')
})

test('diagnosePlanAvailability: legislative offices are not expected to file a plan', () => {
  for (const cargo of ['senador', 'deputado_federal', 'deputado_estadual']) {
    const d = diagnosePlanAvailability({
      cargo, estado: 'SP',
      planPathsForCandidate: [],
      allPlanFiles: [], // empty dir must NOT read as misconfigured for these
    })
    assert.equal(d.kind, 'not_expected', `${cargo} should not expect a plan`)
  }
})

test('diagnosePlanAvailability: an executive with an empty plans dir is a misconfiguration, not an absent plan', () => {
  const d = diagnosePlanAvailability({
    cargo: 'governador', estado: 'SP',
    planPathsForCandidate: [],
    allPlanFiles: [],
  })
  assert.equal(d.kind, 'misconfigured')
})

test('diagnosePlanAvailability: an executive whose UF was never downloaded is flagged separately', () => {
  const d = diagnosePlanAvailability({
    cargo: 'governador', estado: 'MG',
    planPathsForCandidate: [],
    allPlanFiles: ['planos/BR/2026BR280002542548_01.pdf', 'planos/SP/2026SP250002541303_01.pdf'],
  })
  assert.equal(d.kind, 'uf_not_downloaded')
})

test('diagnosePlanAvailability: an executive whose UF is present but has no file genuinely filed nothing', () => {
  const d = diagnosePlanAvailability({
    cargo: 'presidente', estado: 'BR',
    planPathsForCandidate: [],
    allPlanFiles: ['planos/BR/2026BR280002542548_01.pdf'], // other candidates filed; this one did not
  })
  assert.equal(d.kind, 'genuinely_absent')
})

test('diagnosePlanAvailability: a legislative candidate who did file one is still reported as found', () => {
  const d = diagnosePlanAvailability({
    cargo: 'senador', estado: 'SP',
    planPathsForCandidate: ['planos/SP/2026SP250009999999_01.pdf'],
    allPlanFiles: ['planos/SP/2026SP250009999999_01.pdf'],
  })
  assert.equal(d.kind, 'found')
})

test('findPlanPaths: returns every part of a split plan, in order', () => {
  const files = [
    'SP/2026SP250002544912_03.pdf',
    'SP/2026SP250002544912_01.pdf',
    'SP/2026SP250002544912_02.pdf',
    'SP/2026SP250002541303_01.pdf',
  ]
  assert.deepEqual(findPlanPaths('250002544912', files), [
    'SP/2026SP250002544912_01.pdf',
    'SP/2026SP250002544912_02.pdf',
    'SP/2026SP250002544912_03.pdf',
  ])
})

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
    redesSociais: [
      'HTTPS://INSTAGRAM.COM/LULAOFICIAL',
      'HTTPS://X.COM/LULAOFICIAL',
      'HTTPS://WWW.YOUTUBE.COM/@LULAOFICIAL',
    ],
    temas: [
      { slug: 'educacao_basica', afirmacao: 'O governo deve aumentar o investimento em escolas públicas.', contexto: 'Refere-se a investimento federal direto, não a repasses estaduais.' },
      { slug: 'sus_saude_publica', afirmacao: 'O governo deve aumentar o investimento público no SUS.', contexto: null },
      { slug: 'reforma_tributaria', afirmacao: 'O sistema tributário deve ser reformado para simplificar impostos.', contexto: 'Trata da simplificação, não do volume total de arrecadação.' },
    ],
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

test('renderBrief: lists every theme with its exact questionnaire wording, in order', () => {
  const out = renderBrief(briefInput())
  assert.match(out, /educacao_basica/)
  assert.match(out, /aumentar o investimento em escolas públicas/)
  assert.match(out, /sus_saude_publica/)
  assert.match(out, /investimento público no SUS/)
  assert.match(out, /reforma_tributaria/)
  assert.match(out, /simplificar impostos/)

  const educacaoIdx = out.indexOf('educacao_basica')
  const susIdx = out.indexOf('sus_saude_publica')
  const reformaIdx = out.indexOf('reforma_tributaria')
  assert.ok(educacaoIdx < susIdx && susIdx < reformaIdx, 'themes must render in the order given')
})

// I8: contexto_questionario is the disambiguating paragraph against the
// framing trap. It must render under its affirmation, labelled as context
// rather than folded silently into the affirmation text.
test('renderBrief: renders contexto_questionario labelled as context, under its affirmation', () => {
  const out = renderBrief(briefInput())
  assert.match(out, /Context for judging this affirmation:.*Refere-se a investimento federal direto/)
  const afirmacaoIdx = out.indexOf('aumentar o investimento em escolas públicas')
  const contextoIdx = out.indexOf('Refere-se a investimento federal direto')
  assert.ok(afirmacaoIdx < contextoIdx, 'context must render after its affirmation')
})

test('renderBrief: omits the context line when a theme has none', () => {
  const out = renderBrief(briefInput())
  const susIdx = out.indexOf('sus_saude_publica')
  const reformaIdx = out.indexOf('reforma_tributaria')
  const susSection = out.slice(susIdx, reformaIdx)
  assert.doesNotMatch(susSection, /Context for judging this affirmation/)
})

test('renderBrief: lists every declared social account', () => {
  const out = renderBrief(briefInput())
  assert.match(out, /INSTAGRAM\.COM\/LULAOFICIAL/)
  assert.match(out, /X\.COM\/LULAOFICIAL/)
  assert.match(out, /YOUTUBE\.COM\/@LULAOFICIAL/)
})

test('renderBrief: says so when no social accounts were declared', () => {
  assert.match(renderBrief(briefInput({ redesSociais: [] })), /none declared/i)
})

// Regression test for the double-read bug: rede_social_candidato_2026_BRASIL.csv
// is the exact union of the 28 per-election-unit files, so reading every .csv in
// the directory read each candidate's rows twice. loadSocialAccounts must read
// only the one file for the candidate's estado (BR for federal offices).
test('loadSocialAccounts: returns each declared URL exactly once for a state', () => {
  // Pablo Marçal, presidente — 5 accounts declared to the TSE, verified by hand
  // against data/tse-2026/extracted/rede_social_candidato_2026/rede_social_candidato_2026_BR.csv
  const urls = loadSocialAccounts('280002553884', 'BR')
  assert.equal(urls.length, 5, `expected 5 declared accounts, got ${urls.length}: ${JSON.stringify(urls)}`)
  assert.equal(new Set(urls).size, urls.length, 'no URL should be duplicated')
})
