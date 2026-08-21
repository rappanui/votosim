import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hashCpf, parseCargo, normalizeParty, mapCandidacyStatus, parseTseDate, tierForCargo,
  nullableText, parseColigacao,
} from './lib/tse.ts'

test('hashCpf: strips punctuation before hashing', () => {
  assert.equal(hashCpf('123.456.789-00'), hashCpf('12345678900'))
})

test('hashCpf: produces a 64-char hex digest', () => {
  assert.match(hashCpf('12345678900'), /^[0-9a-f]{64}$/)
})

test('parseCargo: maps known TSE labels case-insensitively', () => {
  assert.equal(parseCargo('PRESIDENTE'), 'presidente')
  assert.equal(parseCargo('deputado federal'), 'deputado_federal')
  assert.equal(parseCargo('  GOVERNADOR  '), 'governador')
})

test('parseCargo: returns null for offices out of scope', () => {
  assert.equal(parseCargo('VEREADOR'), null)
  assert.equal(parseCargo('PREFEITO'), null)
  assert.equal(parseCargo(''), null)
})

test('parseCargo: still maps deputado distrital', () => {
  // Mapped so the census stays complete; tierForCargo excludes it from work.
  assert.equal(parseCargo('DEPUTADO DISTRITAL'), 'deputado_distrital')
})

test('normalizeParty: removes internal spaces', () => {
  assert.equal(normalizeParty('UNIÃO '), 'UNIÃO')
  assert.equal(normalizeParty('PC do B'), 'PCdoB')
})

test('mapCandidacyStatus: maps TSE situation text to the enum', () => {
  assert.equal(mapCandidacyStatus('DEFERIDO'), 'deferido')
  assert.equal(mapCandidacyStatus('Deferido com recurso'), 'deferido')
  assert.equal(mapCandidacyStatus('INDEFERIDO'), 'indeferido')
  assert.equal(mapCandidacyStatus('CASSADO'), 'cassado')
})

test('mapCandidacyStatus: unknown text falls back to registrado', () => {
  assert.equal(mapCandidacyStatus('AGUARDANDO JULGAMENTO'), 'registrado')
  assert.equal(mapCandidacyStatus(''), 'registrado')
})

test('parseTseDate: converts DD/MM/YYYY to ISO', () => {
  assert.equal(parseTseDate('25/12/1970'), '1970-12-25')
})

test('parseTseDate: returns null for TSE null sentinels', () => {
  assert.equal(parseTseDate(''), null)
  assert.equal(parseTseDate('#NULO#'), null)
  assert.equal(parseTseDate('99/99/9999'), null)
})

test('parseTseDate: rejects impossible calendar dates', () => {
  assert.equal(parseTseDate('31/02/2000'), null)
  assert.equal(parseTseDate('31/04/2001'), null)
})

test('parseTseDate: accepts valid leap days', () => {
  assert.equal(parseTseDate('29/02/2000'), '2000-02-29')
})

test('parseTseDate: rejects leap day in non-leap years', () => {
  assert.equal(parseTseDate('29/02/2001'), null)
})

test('parseTseDate: recognizes actual TSE null sentinel without trailing hash', () => {
  assert.equal(parseTseDate('#NULO'), null)
})

test('tierForCargo: executive and senate are researched in full', () => {
  assert.equal(tierForCargo('presidente'), 'total')
  assert.equal(tierForCargo('governador'), 'total')
  assert.equal(tierForCargo('senador'), 'total')
})

test('tierForCargo: deputies are gated by score', () => {
  assert.equal(tierForCargo('deputado_federal'), 'por_score')
  assert.equal(tierForCargo('deputado_estadual'), 'por_score')
})

test('tierForCargo: distrital is out of scope', () => {
  assert.equal(tierForCargo('deputado_distrital'), 'fora_escopo')
})

test('nullableText: TSE null sentinels become null', () => {
  assert.equal(nullableText(''), null)
  assert.equal(nullableText('   '), null)
  assert.equal(nullableText('#NULO'), null)
  assert.equal(nullableText('#NE'), null)
  assert.equal(nullableText(undefined), null)
})

test('nullableText: real text is trimmed and kept', () => {
  assert.equal(nullableText('  ADVOGADO  '), 'ADVOGADO')
})

test('parseColigacao: strips the sentinels TSE uses for "no coalition"', () => {
  // Verified in the real 2026 SP file: 1,882 rows say PARTIDO ISOLADO and
  // 701 say FEDERACAO. Neither is a coalition name.
  assert.equal(parseColigacao('PARTIDO ISOLADO'), null)
  assert.equal(parseColigacao('FEDERAÇÃO'), null)
  assert.equal(parseColigacao('FEDERACAO'), null)
  assert.equal(parseColigacao('#NULO'), null)
  assert.equal(parseColigacao(''), null)
})

test('parseColigacao: a real coalition name survives unchanged, accents included', () => {
  assert.equal(parseColigacao('BRASIL PRONTO PRA MAIS'), 'BRASIL PRONTO PRA MAIS')
  assert.equal(parseColigacao('CORAGEM PARA SEGUIR AVANÇANDO'), 'CORAGEM PARA SEGUIR AVANÇANDO')
})
