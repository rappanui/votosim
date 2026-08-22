import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSourceRows, buildPositionRows, buildAlertRows, hasConfirmFlag, parseResearchJson, nextDossierVersion } from './ingest-research.ts'
import type { CandidateResearch } from './lib/research-contract.ts'

function research(): CandidateResearch {
  return {
    tseSequencial: '280002542548',
    dossie: {
      resumoPerfil: 'Resumo.',
      espectroDeclarado: 'esquerda',
      espectroInferido: 'centro_esquerda',
      coerenciaIndice: 80,
      coerenciaBase: '47 votações.',
    },
    fontes: [
      { ref: 's1', tipo: 'plano_governo', camada: 1, titulo: 'Plano', veiculo: 'TSE', url: 'https://a.gov.br/p', dataPublicacao: '2026-08-15', destinoExibicao: 'card_candidato' },
      { ref: 's2', tipo: 'noticia', camada: 2, titulo: 'Nota', veiculo: 'G1', url: 'https://g1.example/x', dataPublicacao: null, destinoExibicao: 'card_candidato' },
    ],
    posicoes: [
      { temaSlug: 'educacao_basica', posicao: 'favoravel', intensidade: 4, justificativa: 'Defende mais verba.', confiancaIa: 0.9, coerenciaTema: 'coerente', fonteRefs: ['s1', 's2'] },
    ],
    alertas: [
      { tipo: 'investigacao', severidade: 'alta', titulo: 'T', descricao: 'D', dataOcorrencia: '2025-03-01', resolucao: null, dataResolucao: null, fonteRefs: ['s2'] },
    ],
  }
}

test('buildSourceRows: carries both foreign keys onto every source', () => {
  const rows = buildSourceRows(research(), 'cand-1', 'pol-1')
  assert.equal(rows.length, 2)
  assert.ok(rows.every(r => r.candidacy_id === 'cand-1' && r.politician_id === 'pol-1'))
})

test('buildSourceRows: maps camelCase contract fields to snake_case columns', () => {
  const [row] = buildSourceRows(research(), 'cand-1', 'pol-1')
  assert.equal(row.tipo, 'plano_governo')
  assert.equal(row.camada, 1)
  assert.equal(row.data_publicacao, '2026-08-15')
  assert.equal(row.destino_exibicao, 'card_candidato')
  assert.equal(row.url, 'https://a.gov.br/p')
})

test('buildSourceRows: passes a null publication date through', () => {
  const rows = buildSourceRows(research(), 'cand-1', 'pol-1')
  assert.equal(rows[1].data_publicacao, null)
})

test('buildPositionRows: resolves theme slug to id and source refs to ids', () => {
  const themes = new Map([['educacao_basica', 'theme-uuid']])
  const sources = new Map([['s1', 'src-1'], ['s2', 'src-2']])
  const [row] = buildPositionRows(research(), 'pol-1', themes, sources)

  assert.equal(row.politician_id, 'pol-1')
  assert.equal(row.theme_id, 'theme-uuid')
  assert.deepEqual(row.source_ids, ['src-1', 'src-2'])
  assert.equal(row.posicao, 'favoravel')
  assert.equal(row.intensidade, 4)
  assert.equal(row.justificativa, 'Defende mais verba.')
  assert.equal(row.coerencia_tema, 'coerente')
})

test('buildPositionRows: marks AI provenance and leaves validation to a human', () => {
  const [row] = buildPositionRows(research(), 'pol-1', new Map([['educacao_basica', 't']]), new Map([['s1', 'a'], ['s2', 'b']]))
  assert.equal(row.gerado_por_ia, true)
  assert.equal(row.validado, false)
})

test('buildPositionRows: skips a theme with no id rather than writing a null FK', () => {
  const rows = buildPositionRows(research(), 'pol-1', new Map(), new Map([['s1', 'a'], ['s2', 'b']]))
  assert.equal(rows.length, 0)
})

test('buildAlertRows: resolves the source reference and maps fields', () => {
  const [row] = buildAlertRows(research(), 'pol-1', new Map([['s2', 'src-2']]))
  assert.equal(row.politician_id, 'pol-1')
  assert.equal(row.source_id, 'src-2')
  assert.equal(row.tipo, 'investigacao')
  assert.equal(row.severidade, 'alta')
  assert.equal(row.data_ocorrencia, '2025-03-01')
})

test('buildAlertRows: polemica requires curation before display, others do not', () => {
  const r = research()
  // s1 is camada 1, so investigacao qualifies for Rule B auto-validation here.
  r.alertas[0].fonteRefs = ['s1']
  r.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'P', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s2'] })
  const rows = buildAlertRows(r, 'pol-1', new Map([['s1', 'src-1'], ['s2', 'src-2']]))

  // Rule B of docs/base/04_schema_alerts.md: polemica needs human curation.
  assert.equal(rows[0].validado, true, 'investigacao backed by a layer-1 source is auto-validated')
  assert.equal(rows[1].validado, false, 'polemica awaits curation')
})

test('buildAlertRows: investigacao backed by a layer-1 source is auto-validated', () => {
  const r = research()
  r.alertas[0].fonteRefs = ['s1'] // s1 is camada 1
  const [row] = buildAlertRows(r, 'pol-1', new Map([['s1', 'src-1'], ['s2', 'src-2']]))
  assert.equal(row.validado, true)
})

test('buildAlertRows: investigacao backed by a layer-2 source is not auto-validated', () => {
  // research()'s investigacao cites only s2, which is camada 2 (noticia) —
  // Rule B requires a TSE/STF-grade (camada 1) source.
  const [row] = buildAlertRows(research(), 'pol-1', new Map([['s1', 'src-1'], ['s2', 'src-2']]))
  assert.equal(row.validado, false)
})

test('buildAlertRows: fills fonte_url and fonte_nome from the catalogue for the legacy NOT NULL columns', () => {
  const [row] = buildAlertRows(research(), 'pol-1', new Map([['s2', 'src-2']]), research().fontes)
  assert.equal(row.fonte_url, 'https://g1.example/x')
  assert.equal(row.fonte_nome, 'G1')
})

// ─── I11: the --confirm gate ─────────────────────────────────────────────────

test('hasConfirmFlag: recognises the bare flag', () => {
  assert.equal(hasConfirmFlag(['--confirm']), true)
  assert.equal(hasConfirmFlag(['--tokens=100', '--confirm', '--duracao-ms=50']), true)
})

test('hasConfirmFlag: absent without it', () => {
  assert.equal(hasConfirmFlag([]), false)
  assert.equal(hasConfirmFlag(['--tokens=100']), false)
})

// ─── MINOR: guarded JSON parsing ─────────────────────────────────────────────

test('parseResearchJson: parses well-formed JSON', () => {
  const doc = parseResearchJson('{"tseSequencial": "1"}', 'data/research/1.json') as unknown as { tseSequencial: string }
  assert.equal(doc.tseSequencial, '1')
})

test('parseResearchJson: names the file in the error on malformed JSON', () => {
  assert.throws(
    () => parseResearchJson('{not json', 'data/research/280002542548.json'),
    /data\/research\/280002542548\.json.*not valid JSON/,
  )
})

// ─── I3: dossier versioning ───────────────────────────────────────────────────

test('nextDossierVersion: starts at 1 when no prior dossier exists', () => {
  assert.equal(nextDossierVersion(null), 1)
})

test('nextDossierVersion: increments past the current max', () => {
  assert.equal(nextDossierVersion(1), 2)
  assert.equal(nextDossierVersion(4), 5)
})

test('buildAlertRows: an alert citing an interno source first still writes the voter-visible source', () => {
  const r = research()
  r.fontes.push({
    ref: 's3', tipo: 'noticia', camada: 2, titulo: 'Nota interna', veiculo: 'Memo',
    url: 'https://interno.example/x', dataPublicacao: null, destinoExibicao: 'interno',
  })
  r.alertas.push({
    tipo: 'investigacao', severidade: 'alta', titulo: 'T2', descricao: 'D2',
    dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s3', 's1'],
  })
  const rows = buildAlertRows(r, 'pol-1', new Map([['s1', 'src-1'], ['s2', 'src-2'], ['s3', 'src-3']]))
  const row = rows[1]

  assert.equal(row.source_id, 'src-1')
  assert.equal(row.fonte_url, 'https://a.gov.br/p')
  assert.equal(row.fonte_nome, 'TSE')
})

// ─── Resolved alerts — Rule D of docs/base/04_schema_alerts.md ──────────────

test('buildAlertRows: an unresolved alert maps to ativo=true with no resolucao', () => {
  const rows = buildAlertRows(research(), 'pol-1', new Map([['s2', 'src-2']]))
  assert.equal(rows[0].ativo, true)
  assert.equal(rows[0].resolucao, null)
  assert.equal(rows[0].data_resolucao, null)
})

test('buildAlertRows: a resolved alert maps to ativo=false and carries the resolution through', () => {
  const r = research()
  r.alertas[0].resolucao = 'Condenação anulada pelo STF por incompetência de foro em 2021.'
  r.alertas[0].dataResolucao = '2021-03-08'
  const rows = buildAlertRows(r, 'pol-1', new Map([['s2', 'src-2']]))
  assert.equal(rows[0].ativo, false)
  assert.equal(rows[0].resolucao, 'Condenação anulada pelo STF por incompetência de foro em 2021.')
  assert.equal(rows[0].data_resolucao, '2021-03-08')
})

test('buildAlertRows: a resolved matter is never auto-validated, regardless of source layer', () => {
  // A resolved ficha_suja is exactly the case Rule B does not cover — the
  // point of the badge is that it is CURRENT. Publishing a resolved matter
  // unreviewed would imply an active disqualification that no longer exists.
  const r = research()
  r.alertas[0].tipo = 'ficha_suja'
  r.alertas[0].fonteRefs = ['s1'] // s1 is camada 1 — would auto-validate if unresolved
  r.alertas[0].resolucao = 'Condenação anulada pelo STF em 2021.'
  r.alertas[0].dataResolucao = '2021-03-08'
  const rows = buildAlertRows(r, 'pol-1', new Map([['s1', 'src-1']]))
  assert.equal(rows[0].validado, false, 'a resolved matter always waits for curation, even on a layer-1 source')
  assert.equal(rows[0].ativo, false)
})
