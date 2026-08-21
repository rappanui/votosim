import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateResearch, type CandidateResearch } from './lib/research-contract.ts'

function valid(): CandidateResearch {
  return {
    tseSequencial: '280002542548',
    dossie: {
      resumoPerfil: 'Resumo do perfil do candidato em linguagem acessível.',
      espectroDeclarado: 'esquerda',
      espectroInferido: 'esquerda',
      coerenciaIndice: 72.5,
      coerenciaBase: 'Comparado com 47 votações nominais entre 2023 e 2026.',
    },
    fontes: [
      { ref: 's1', tipo: 'plano_governo', camada: 1, titulo: 'Plano de governo', veiculo: 'TSE', url: 'https://example.gov.br/plano', dataPublicacao: '2026-08-15', destinoExibicao: 'card_candidato' },
      { ref: 's2', tipo: 'noticia', camada: 2, titulo: 'Reportagem', veiculo: 'Folha', url: 'https://folha.example/a', dataPublicacao: '2026-07-01', destinoExibicao: 'card_candidato' },
    ],
    posicoes: [
      { temaSlug: 'educacao_basica', posicao: 'favoravel', intensidade: 4, justificativa: 'Defende ampliação do investimento.', confiancaIa: 0.9, coerenciaTema: 'coerente', fonteRefs: ['s1'] },
    ],
    alertas: [],
  }
}

test('validateResearch: accepts a well-formed document', () => {
  assert.deepEqual(validateResearch(valid()), [])
})

test('validateResearch: rejects a position referencing an undeclared source', () => {
  const doc = valid()
  doc.posicoes[0].fonteRefs = ['nope']
  const errors = validateResearch(doc)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /undeclared source/i)
})

test('validateResearch: rejects a position with no sources at all', () => {
  const doc = valid()
  doc.posicoes[0].fonteRefs = []
  assert.match(validateResearch(doc).join(' '), /at least one source/i)
})

test('validateResearch: rejects an unknown theme slug', () => {
  const doc = valid()
  doc.posicoes[0].temaSlug = 'tema_inventado'
  assert.match(validateResearch(doc).join(' '), /unknown theme/i)
})

test('validateResearch: rejects a duplicated theme', () => {
  const doc = valid()
  doc.posicoes.push({ ...doc.posicoes[0] })
  assert.match(validateResearch(doc).join(' '), /duplicate theme/i)
})

test('validateResearch: rejects intensidade outside 1-5', () => {
  const doc = valid()
  doc.posicoes[0].intensidade = 6
  assert.match(validateResearch(doc).join(' '), /intensidade/i)
})

test('validateResearch: rejects confiancaIa outside 0-1', () => {
  const doc = valid()
  doc.posicoes[0].confiancaIa = 1.4
  assert.match(validateResearch(doc).join(' '), /confiancaIa/i)
})

test('validateResearch: rejects an invalid spectrum value', () => {
  const doc = valid()
  doc.dossie.espectroInferido = 'centro-direita'
  assert.match(validateResearch(doc).join(' '), /spectrum/i)
})

test('validateResearch: accepts a null coherence index but rejects a negative one', () => {
  const doc = valid()
  doc.dossie.coerenciaIndice = null
  assert.deepEqual(validateResearch(doc), [])
  doc.dossie.coerenciaIndice = -1
  assert.match(validateResearch(doc).join(' '), /coerenciaIndice/i)
})

test('validateResearch: rejects duplicate source refs', () => {
  const doc = valid()
  doc.fontes.push({ ...doc.fontes[0] })
  assert.match(validateResearch(doc).join(' '), /duplicate source ref/i)
})

test('validateResearch: rejects two sources sharing a url', () => {
  // candidate_sources has UNIQUE (politician_id, url), and the ingester maps
  // ref -> id by url. Duplicates would collapse the mapping silently.
  const doc = valid()
  doc.fontes.push({ ...doc.fontes[0], ref: 's3' })
  assert.match(validateResearch(doc).join(' '), /duplicate source url/i)
})

test('validateResearch: rejects a non-http url', () => {
  const doc = valid()
  doc.fontes[1].url = 'javascript:alert(1)'
  assert.match(validateResearch(doc).join(' '), /url/i)
})

test('validateResearch: rejects camada outside 1-3', () => {
  const doc = valid()
  ;(doc.fontes[1] as { camada: number }).camada = 4
  assert.match(validateResearch(doc).join(' '), /camada/i)
})

// ─── D9: the editorial admission rule ────────────────────────────────────────

test('D9: a polemica backed by one layer-2 source is rejected', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'T', descricao: 'D', dataOcorrencia: null, fonteRefs: ['s2'] })
  assert.match(validateResearch(doc).join(' '), /two independent/i)
})

test('D9: a polemica backed by two layer-2 sources is accepted', () => {
  const doc = valid()
  doc.fontes.push({ ref: 's3', tipo: 'noticia', camada: 2, titulo: 'Outra', veiculo: 'G1', url: 'https://g1.example/b', dataPublicacao: '2026-07-02', destinoExibicao: 'card_candidato' })
  doc.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'T', descricao: 'D', dataOcorrencia: null, fonteRefs: ['s2', 's3'] })
  assert.deepEqual(validateResearch(doc), [])
})

test('D9: a polemica backed by a single layer-1 source is accepted', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'T', descricao: 'D', dataOcorrencia: null, fonteRefs: ['s1'] })
  assert.deepEqual(validateResearch(doc), [])
})

test('D9: the rule applies only to polemica, not to ficha_suja', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'ficha_suja', severidade: 'critica', titulo: 'T', descricao: 'D', dataOcorrencia: null, fonteRefs: ['s2'] })
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: rejects an alert with no sources', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'investigacao', severidade: 'alta', titulo: 'T', descricao: 'D', dataOcorrencia: null, fonteRefs: [] })
  assert.match(validateResearch(doc).join(' '), /at least one source/i)
})

test('validateResearch: reports every problem, not just the first', () => {
  const doc = valid()
  doc.posicoes[0].temaSlug = 'inventado'
  doc.posicoes[0].intensidade = 9
  assert.ok(validateResearch(doc).length >= 2)
})

test('validateResearch: rejects a non-object input', () => {
  assert.ok(validateResearch(null).length > 0)
  assert.ok(validateResearch('texto').length > 0)
})
