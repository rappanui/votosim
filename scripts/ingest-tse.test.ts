import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPolitician, buildCandidacy, dedupeParties } from './ingest-tse.ts'
import type { CsvRow } from './lib/tse.ts'

function makeRow(overrides: Partial<CsvRow> = {}): CsvRow {
  return {
    NM_URNA_CANDIDATO: 'FULANO',
    NM_CANDIDATO: 'FULANO DE TAL',
    NR_CPF_CANDIDATO: '12345678900',
    SQ_CANDIDATO: '250000123456',
    DS_CARGO: 'PRESIDENTE',
    SG_PARTIDO: 'PX',
    NM_PARTIDO: 'Partido X',
    NR_PARTIDO: '99',
    SG_UF: 'BR',
    NR_CANDIDATO: '99',
    NM_COLIGACAO: 'COLIGACAO TESTE',
    DS_SITUACAO_CANDIDATURA: 'DEFERIDO',
    DT_NASCIMENTO: '25/12/1970',
    DS_GENERO: 'MASCULINO',
    DS_GRAU_INSTRUCAO: 'SUPERIOR COMPLETO',
    DS_OCUPACAO: 'ADVOGADO',
    NR_TURNO: '1',
    SG_FEDERACAO: 'PT/PC do B/PV',
    NM_FEDERACAO: 'Federacao Brasil da Esperanca',
    DS_COMPOSICAO_COLIGACAO: 'PT/PC do B/PV',
    ...overrides,
  }
}

test('buildPolitician: maps all TSE fields', () => {
  const p = buildPolitician(makeRow())!
  assert.equal(p.tse_id, '250000123456')
  assert.equal(p.nome_completo, 'FULANO DE TAL')
  assert.equal(p.nome_urna, 'FULANO')
  assert.equal(p.partido_atual, 'PX')
  assert.equal(p.data_nascimento, '1970-12-25')
  assert.equal(p.ocupacao, 'ADVOGADO')
  assert.equal(p.ativo, true)
  assert.match(p.cpf_hash, /^[0-9a-f]{64}$/)
})

test('buildPolitician: maps gender to the single-letter check constraint', () => {
  assert.equal(buildPolitician(makeRow({ DS_GENERO: 'MASCULINO' }))!.genero, 'M')
  assert.equal(buildPolitician(makeRow({ DS_GENERO: 'FEMININO' }))!.genero, 'F')
  assert.equal(buildPolitician(makeRow({ DS_GENERO: 'NAO INFORMADO' }))!.genero, null)
})

test('buildPolitician: returns null when the CPF is missing', () => {
  assert.equal(buildPolitician(makeRow({ NR_CPF_CANDIDATO: '' })), null)
})

test('buildCandidacy: carries sequencial, coalition, status and tier', () => {
  const c = buildCandidacy(makeRow(), 'presidente', 2026)
  assert.equal(c.ano_eleicao, 2026)
  assert.equal(c.turno, 1)
  assert.equal(c.cargo, 'presidente')
  assert.equal(c.estado, 'BR')
  assert.equal(c.tse_sequencial, '250000123456')
  assert.equal(c.coligacao, 'COLIGACAO TESTE')
  assert.equal(c.status, 'deferido')
  assert.equal(c.tier_processamento, 'total')
})

test('buildCandidacy: deputies get the score tier, distrital is out of scope', () => {
  assert.equal(buildCandidacy(makeRow(), 'deputado_federal', 2026).tier_processamento, 'por_score')
  assert.equal(buildCandidacy(makeRow(), 'deputado_distrital', 2026).tier_processamento, 'fora_escopo')
})

test('buildCandidacy: empty coalition becomes null, not an empty string', () => {
  assert.equal(buildCandidacy(makeRow({ NM_COLIGACAO: '#NULO' }), 'presidente', 2026).coligacao, null)
  assert.equal(buildCandidacy(makeRow({ NM_COLIGACAO: '' }), 'presidente', 2026).coligacao, null)
})

test('dedupeParties: collapses repeated parties to one row each', () => {
  const rows = [makeRow(), makeRow(), makeRow({ SG_PARTIDO: 'PY', NM_PARTIDO: 'Partido Y', NR_PARTIDO: '88' })]
  const parties = dedupeParties(rows)
  assert.equal(parties.length, 2)
  assert.deepEqual(parties.map(p => p.sigla).sort(), ['PX', 'PY'])
  assert.equal(parties.find(p => p.sigla === 'PY')!.numero, 88)
})

test('dedupeParties: skips rows with no party acronym', () => {
  assert.equal(dedupeParties([makeRow({ SG_PARTIDO: '' })]).length, 0)
})
