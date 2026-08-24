import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateResearch, THEME_SLUGS, type CandidateResearch, type ResearchPosition } from '../src/lib/research-contract.ts'

/** C2: validateResearch requires every one of the 14 THEME_SLUGS to be
 * present exactly once. The other 13 entries beyond educacao_basica exist
 * only to satisfy that shape — kept minimal on purpose. */
function fillerPositions(): ResearchPosition[] {
  return THEME_SLUGS
    .filter(slug => slug !== 'educacao_basica')
    .map(temaSlug => ({
      temaSlug,
      posicao: 'neutro' as const,
      intensidade: 1,
      justificativa: 'Posição mínima para satisfazer a cobertura de 14 temas nos testes.',
      confiancaIa: 0.3,
      coerenciaTema: null,
      fonteRefs: ['s1'],
    }))
}

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
      ...fillerPositions(),
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

// ─── C2: full 14-theme coverage ──────────────────────────────────────────────

test('C2: accepts a document covering all 14 themes', () => {
  const doc = valid()
  assert.equal(doc.posicoes.length, 14)
  assert.deepEqual(validateResearch(doc), [])
})

test('C2: rejects a document missing one theme and names it', () => {
  const doc = valid()
  doc.posicoes = doc.posicoes.filter(p => p.temaSlug !== 'laicidade_valores')
  const errors = validateResearch(doc).join(' ')
  assert.match(errors, /missing themes/i)
  assert.match(errors, /laicidade_valores/)
})

test('C2: rejects a document with zero positions', () => {
  const doc = valid()
  doc.posicoes = []
  const errors = validateResearch(doc).join(' ')
  assert.match(errors, /missing themes/i)
  for (const slug of THEME_SLUGS) assert.match(errors, new RegExp(slug))
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

// ─── Camada 1 must be an official domain — a self-declared "primary" source ──
// on an arbitrary site would let an agent auto-publish a red ficha_suja badge
// on a real politician with no human review (see supabase/functions/
// match-candidatos and the auto-validation rule in ingest-research.ts).

test('validateResearch: camada 1 on a non-official domain is rejected', () => {
  const doc = valid()
  doc.fontes[0].camada = 1
  doc.fontes[0].url = 'https://meublogpolitico.example.com/noticia'
  assert.match(validateResearch(doc).join(' '), /camada 1 requires an official domain/i)
})

test('validateResearch: camada 1 accepts each official suffix', () => {
  for (const url of [
    'https://www.tse.jus.br/x',
    'https://camara.leg.br/x',
    'https://senado.leg.br/x',
    'https://www.gov.br/x',
    'https://mpf.mp.br/x',
  ]) {
    const doc = valid()
    doc.fontes[0].camada = 1
    doc.fontes[0].url = url
    assert.deepEqual(validateResearch(doc), [], `expected ${url} to be accepted`)
  }
})

test('validateResearch: camada 2 and 3 are not restricted to official domains', () => {
  const doc = valid()
  doc.fontes[1].camada = 2
  doc.fontes[1].url = 'https://blog-independente.example/analise'
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: a malformed camada-1 url reports only the url error, not a duplicate domain error', () => {
  const doc = valid()
  doc.fontes[0].camada = 1
  doc.fontes[0].url = 'not-a-url'
  const errors = validateResearch(doc)
  assert.equal(errors.filter(e => /camada 1 requires an official domain/i.test(e)).length, 0)
  assert.match(errors.join(' '), /must be an http\(s\) url/i)
})

// ─── D9: the editorial admission rule ────────────────────────────────────────

test('D9: a polemica backed by one layer-2 source is rejected', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s2'] })
  assert.match(validateResearch(doc).join(' '), /two independent/i)
})

test('D9: a polemica backed by two layer-2 sources is accepted', () => {
  const doc = valid()
  doc.fontes.push({ ref: 's3', tipo: 'noticia', camada: 2, titulo: 'Outra', veiculo: 'G1', url: 'https://g1.example/b', dataPublicacao: '2026-07-02', destinoExibicao: 'card_candidato' })
  doc.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s2', 's3'] })
  assert.deepEqual(validateResearch(doc), [])
})

test('D9: a polemica backed by a single layer-1 source is accepted', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s1'] })
  assert.deepEqual(validateResearch(doc), [])
})

test('D9: the rule applies only to polemica, not to ficha_suja', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'ficha_suja', severidade: 'critica', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s2'] })
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: rejects an alert with no sources', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'investigacao', severidade: 'alta', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: [] })
  assert.match(validateResearch(doc).join(' '), /at least one source/i)
})

// ─── Resolved alerts — Rule D of docs/legado/base/04_schema_alerts.md: a resolved ──
// matter is never deleted, only marked inactive with a resolution on record.
// A conviction later annulled must be representable as such, not omitted and
// not published as if it were still active.

test('validateResearch: accepts an alert with no resolution (still open)', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'investigacao', severidade: 'alta', titulo: 'T', descricao: 'D', dataOcorrencia: '2025-01-01', resolucao: null, dataResolucao: null, fonteRefs: ['s1'] })
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: accepts a resolved alert with a resolution date', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'ficha_suja', severidade: 'critica', titulo: 'T', descricao: 'D', dataOcorrencia: '2018-04-07', resolucao: 'Condenação anulada pelo STF por incompetência de foro em 2021.', dataResolucao: '2021-03-08', fonteRefs: ['s1'] })
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: accepts a resolved alert with an unknown resolution date', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'ficha_suja', severidade: 'critica', titulo: 'T', descricao: 'D', dataOcorrencia: '2018-04-07', resolucao: 'Condenação anulada.', dataResolucao: null, fonteRefs: ['s1'] })
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: rejects a resolution date without a resolution text', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'ficha_suja', severidade: 'critica', titulo: 'T', descricao: 'D', dataOcorrencia: '2018-04-07', resolucao: null, dataResolucao: '2021-03-08', fonteRefs: ['s1'] })
  assert.match(validateResearch(doc).join(' '), /dataResolucao.*without.*resolucao|resolucao.*required/i)
})

test('validateResearch: rejects a non-string resolucao', () => {
  const doc = valid()
  ;(doc.alertas as unknown as Record<string, unknown>[]).push({ tipo: 'ficha_suja', severidade: 'critica', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: 42, dataResolucao: null, fonteRefs: ['s1'] })
  assert.match(validateResearch(doc).join(' '), /resolucao/i)
})

test('validateResearch: rejects a non-ISO dataResolucao', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'ficha_suja', severidade: 'critica', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: 'Anulada.', dataResolucao: '08/03/2021', fonteRefs: ['s1'] })
  assert.match(validateResearch(doc).join(' '), /dataResolucao.*ISO/i)
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

// ─── D9 regression: distinct-source counting ─────────────────────────────────

test('D9: a polemica citing the same layer-2 ref twice is rejected', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s2', 's2'] })
  assert.match(validateResearch(doc).join(' '), /two independent/i)
})

test('D9: a polemica citing one layer-2 and one layer-3 source is rejected', () => {
  const doc = valid()
  doc.fontes.push({ ref: 's3', tipo: 'checagem', camada: 3, titulo: 'Checagem', veiculo: 'Aos Fatos', url: 'https://aosfatos.example/c', dataPublicacao: '2026-07-03', destinoExibicao: 'card_candidato' })
  doc.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s2', 's3'] })
  assert.match(validateResearch(doc).join(' '), /two independent/i)
})

test('D9: a polemica citing two layer-3 sources is rejected', () => {
  const doc = valid()
  doc.fontes.push({ ref: 's3', tipo: 'checagem', camada: 3, titulo: 'Checagem A', veiculo: 'Aos Fatos', url: 'https://aosfatos.example/c', dataPublicacao: '2026-07-03', destinoExibicao: 'card_candidato' })
  doc.fontes.push({ ref: 's4', tipo: 'checagem', camada: 3, titulo: 'Checagem B', veiculo: 'Lupa', url: 'https://lupa.example/d', dataPublicacao: '2026-07-04', destinoExibicao: 'card_candidato' })
  doc.alertas.push({ tipo: 'polemica', severidade: 'media', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s3', 's4'] })
  assert.match(validateResearch(doc).join(' '), /two independent/i)
})

// ─── D8: voter-visible source required ────────────────────────────────────────

test('D8: a position citing only an interno source is rejected', () => {
  const doc = valid()
  doc.fontes.push({ ref: 's3', tipo: 'noticia', camada: 2, titulo: 'Nota interna', veiculo: 'Interno', url: 'https://internal.example/x', dataPublicacao: '2026-07-05', destinoExibicao: 'interno' })
  doc.posicoes[0].fonteRefs = ['s3']
  assert.match(validateResearch(doc).join(' '), /voter-visible source/i)
})

test('D8: a position citing both an interno and a card_candidato source is accepted', () => {
  const doc = valid()
  doc.fontes.push({ ref: 's3', tipo: 'noticia', camada: 2, titulo: 'Nota interna', veiculo: 'Interno', url: 'https://internal.example/x', dataPublicacao: '2026-07-05', destinoExibicao: 'interno' })
  doc.posicoes[0].fonteRefs = ['s1', 's3']
  assert.deepEqual(validateResearch(doc), [])
})

// ─── Dates: ISO only, ambiguous formats rejected ─────────────────────────────

test('validateResearch: rejects a non-ISO dataPublicacao', () => {
  const doc = valid()
  doc.fontes[0].dataPublicacao = '15/07/2026'
  assert.match(validateResearch(doc).join(' '), /iso/i)
})

test('validateResearch: rejects a non-ISO dataOcorrencia', () => {
  const doc = valid()
  doc.alertas.push({ tipo: 'investigacao', severidade: 'alta', titulo: 'T', descricao: 'D', dataOcorrencia: '15/07/2026', resolucao: null, dataResolucao: null, fonteRefs: ['s1'] })
  assert.match(validateResearch(doc).join(' '), /iso/i)
})

test('validateResearch: accepts a null dataPublicacao and dataOcorrencia', () => {
  const doc = valid()
  doc.fontes[0].dataPublicacao = null
  doc.alertas.push({ tipo: 'investigacao', severidade: 'alta', titulo: 'T', descricao: 'D', dataOcorrencia: null, resolucao: null, dataResolucao: null, fonteRefs: ['s1'] })
  assert.deepEqual(validateResearch(doc), [])
})

// ─── Minor: numeric boundaries and NaN ────────────────────────────────────────

test('validateResearch: accepts intensidade at the boundaries 1 and 5', () => {
  const doc1 = valid()
  doc1.posicoes[0].intensidade = 1
  assert.deepEqual(validateResearch(doc1), [])
  const doc5 = valid()
  doc5.posicoes[0].intensidade = 5
  assert.deepEqual(validateResearch(doc5), [])
})

test('validateResearch: accepts confiancaIa at the boundaries 0 and 1', () => {
  const doc0 = valid()
  doc0.posicoes[0].confiancaIa = 0
  assert.deepEqual(validateResearch(doc0), [])
  const doc1 = valid()
  doc1.posicoes[0].confiancaIa = 1
  assert.deepEqual(validateResearch(doc1), [])
})

test('validateResearch: accepts coerenciaIndice at the boundaries 0 and 100', () => {
  const doc0 = valid()
  doc0.dossie.coerenciaIndice = 0
  assert.deepEqual(validateResearch(doc0), [])
  const doc100 = valid()
  doc100.dossie.coerenciaIndice = 100
  assert.deepEqual(validateResearch(doc100), [])
})

test('validateResearch: accepts camada at the boundaries 1 and 3', () => {
  const doc1 = valid()
  doc1.fontes[0].camada = 1
  assert.deepEqual(validateResearch(doc1), [])
  const doc3 = valid()
  doc3.fontes[1].camada = 3
  assert.deepEqual(validateResearch(doc3), [])
})

test('validateResearch: rejects NaN for confiancaIa', () => {
  const doc = valid()
  doc.posicoes[0].confiancaIa = NaN
  assert.match(validateResearch(doc).join(' '), /confiancaIa/i)
})

test('validateResearch: rejects NaN for coerenciaIndice', () => {
  const doc = valid()
  doc.dossie.coerenciaIndice = NaN
  assert.match(validateResearch(doc).join(' '), /coerenciaIndice/i)
})

// ─── Minor: titulo/veiculo/coerenciaBase type-checked ────────────────────────

test('validateResearch: rejects a non-string titulo on a source', () => {
  const doc = valid()
  ;(doc.fontes[0] as { titulo: unknown }).titulo = 42
  assert.match(validateResearch(doc).join(' '), /titulo/i)
})

// ─── 2026-08-23 schema additions: plataforma_partidaria, biografia, ressalva_evidencias ─
// Added to source_tipo / alert_type on the live database (docs/referencia/schema-adicoes-sp0.md)
// and to candidate-research-procedure.md's E1 section, but never to this validator —
// any research JSON citing them was silently rejected until now.

test('validateResearch: accepts plataforma_partidaria as a source tipo', () => {
  const doc = valid()
  doc.fontes[0].tipo = 'plataforma_partidaria'
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: accepts biografia as a source tipo', () => {
  const doc = valid()
  doc.fontes[0].tipo = 'biografia'
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: accepts desempenho_mandato as a source tipo', () => {
  // E4b cites attendance, votes, authored bills and CEAP spending. None of the
  // pre-existing tipos covers them: bens_declarados is declared assets, votacao
  // is a single roll-call. Without this the E4b rule cannot cite its own source.
  const doc = valid()
  doc.fontes[0].tipo = 'desempenho_mandato'
  assert.deepEqual(validateResearch(doc), [])
})

// ─── neutroMotivo: which flavor of "neutro" this position records ──────────

test('validateResearch: accepts a neutro position carrying a valid neutroMotivo', () => {
  const doc = valid()
  doc.posicoes[0].posicao = 'neutro'
  doc.posicoes[0].neutroMotivo = 'nao_responde'
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: rejects an unknown neutroMotivo value', () => {
  const doc = valid()
  doc.posicoes[0].posicao = 'neutro'
  // deliberately invalid — the contract is what we are testing
  doc.posicoes[0].neutroMotivo = 'sei_la' as never
  const errors = validateResearch(doc)
  assert.ok(errors.some(e => e.includes('neutroMotivo')), errors.join(' | '))
})

test('validateResearch: rejects neutroMotivo on a non-neutro position', () => {
  const doc = valid()
  doc.posicoes[0].posicao = 'favoravel'
  doc.posicoes[0].neutroMotivo = 'nao_encontrado'
  const errors = validateResearch(doc)
  assert.ok(errors.some(e => e.includes('neutroMotivo')), errors.join(' | '))
})

test('validateResearch: accepts a neutro position with neutroMotivo omitted', () => {
  // Backward compatibility: fillerPositions() already emits 13 neutro entries
  // with no motivo, and every existing payload looks like that. Readers
  // default a missing motivo to nao_encontrado.
  const doc = valid()
  doc.posicoes[0].posicao = 'neutro'
  delete doc.posicoes[0].neutroMotivo
  assert.deepEqual(validateResearch(doc), [])
})

test('validateResearch: accepts ressalva_evidencias as an alert tipo', () => {
  const doc = valid()
  doc.alertas.push({
    tipo: 'ressalva_evidencias',
    severidade: 'baixa',
    titulo: 'Extração de PDF degradada',
    descricao: 'O texto do plano de governo extraiu embaralhado; posições basearam-se na plataforma do partido.',
    dataOcorrencia: null,
    fonteRefs: ['s1'],
    resolucao: null,
    dataResolucao: null,
  })
  assert.deepEqual(validateResearch(doc), [])
})
