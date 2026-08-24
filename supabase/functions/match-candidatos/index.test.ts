/// <reference lib="deno.ns" />
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  attachAlerts,
  buildPartyResults,
  buildPrompt,
  countSimpleMatches,
  deriveObservacoes,
  enrichResult,
  groupBy,
  groupDetalhePosicoes,
  groupSources,
  injectPartyResults,
  pickLatestDossiers,
  prefilterCandidates,
  sortAndLimitCargos,
  MAX_CANDIDATES_PER_CARGO,
  MAX_EXEC_CANDIDATES,
  MIN_SCORE_THRESHOLD,
  PREFILTER_LIMIT_DEFAULT,
  PREFILTER_LIMIT_DEPUTADO,
  type AlertRow,
  type DetalhePosicao,
  type DetalhePosicaoRow,
  type DossierRow,
  type SourceRow,
} from './index.ts'
import type {
  CandidatoResultado,
  CandidatoRow,
  CoerenciaTema,
  Dossie,
  Fonte,
  MatchResult,
  PositionWithSlug,
  RespostaUsuario,
  TemaCandidatoDetalhe,
} from './ai-providers.ts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeR(slug: string, posicao: 'favoravel' | 'contrario' | 'neutro', importancia: 1 | 2 | 3 = 2): RespostaUsuario {
  return { temaSlug: slug, posicao, importancia }
}

function makeCandidato(
  id: string,
  alinhamento: number,
  cobertura = 100,
  alinhamentoApurado = alinhamento,
  confiancaResultado = 100,
): CandidatoResultado {
  return {
    politicianId: id, nomeUrna: id, partido: 'PT', cargo: 'senador', numeroUrna: null,
    alinhamento, alinhamentoApurado, cobertura, confiancaResultado, detalhesTemas: [],
    temAlertas: false, alertas: [],
    dossie: null, fontes: [], observacoes: [], coerenciaPorTema: {},
  }
}

// ─── groupBy ─────────────────────────────────────────────────────────────────

Deno.test('groupBy: groups items by key', () => {
  const items = [
    { cargo: 'senador', id: '1' },
    { cargo: 'senador', id: '2' },
    { cargo: 'deputado', id: '3' },
  ]
  const result = groupBy(items, i => i.cargo)
  assertEquals(result['senador'].length, 2)
  assertEquals(result['deputado'].length, 1)
})

// ─── countSimpleMatches ───────────────────────────────────────────────────────

Deno.test('countSimpleMatches: posicao favoravel + candidato favoravel counts as match', () => {
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  assertEquals(countSimpleMatches('p1', { p1: positions }, [makeR('sus', 'favoravel')]), 1)
})

Deno.test('countSimpleMatches: posicao contrario + candidato contrario counts as match', () => {
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'privatizacao', posicao: 'contrario', intensidade: 5 },
  ]
  assertEquals(countSimpleMatches('p1', { p1: positions }, [makeR('privatizacao', 'contrario')]), 1)
})

Deno.test('countSimpleMatches: posicao neutro is skipped', () => {
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  assertEquals(countSimpleMatches('p1', { p1: positions }, [makeR('sus', 'neutro')]), 0)
})

Deno.test('countSimpleMatches: posicao favoravel + candidato contrario is not a match', () => {
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'contrario', intensidade: 5 },
  ]
  assertEquals(countSimpleMatches('p1', { p1: positions }, [makeR('sus', 'favoravel')]), 0)
})

Deno.test('countSimpleMatches: unknown candidate returns 0', () => {
  assertEquals(countSimpleMatches('unknown', {}, [makeR('sus', 'favoravel')]), 0)
})

// ─── prefilterCandidates ─────────────────────────────────────────────────────

Deno.test('prefilterCandidates: limits deputados to PREFILTER_LIMIT_DEPUTADO', () => {
  const candidates: CandidatoRow[] = Array.from({ length: 30 }, (_, i) => ({
    politician_id: `p${i}`,
    candidacy_id: `c${i}`,
    nome_urna: `CANDIDATO ${i}`,
    partido_atual: 'PT',
    numero_urna: null,
    cargo: 'deputado_federal',
  }))
  const result = prefilterCandidates(candidates, {}, [])
  assertEquals(result.length, PREFILTER_LIMIT_DEPUTADO)
})

Deno.test('prefilterCandidates: limits non-deputados to PREFILTER_LIMIT_DEFAULT', () => {
  const candidates: CandidatoRow[] = Array.from({ length: 20 }, (_, i) => ({
    politician_id: `p${i}`,
    candidacy_id: `c${i}`,
    nome_urna: `CANDIDATO ${i}`,
    partido_atual: 'PT',
    numero_urna: null,
    cargo: 'senador',
  }))
  const result = prefilterCandidates(candidates, {}, [])
  assertEquals(result.length, PREFILTER_LIMIT_DEFAULT)
})

Deno.test('prefilterCandidates: selects best-matching candidates', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'best', candidacy_id: 'cbest', nome_urna: 'MELHOR', partido_atual: 'PT', numero_urna: null, cargo: 'senador' },
    { politician_id: 'worst', candidacy_id: 'cworst', nome_urna: 'PIOR', partido_atual: 'PL', numero_urna: null, cargo: 'senador' },
  ]
  const positionsByCandidate: Record<string, PositionWithSlug[]> = {
    best: [{ politician_id: 'best', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 }],
    worst: [{ politician_id: 'worst', themeSlug: 'sus', posicao: 'contrario', intensidade: 5 }],
  }
  const result = prefilterCandidates(candidates, positionsByCandidate, [makeR('sus', 'favoravel')])
  // Both are within PREFILTER_LIMIT_DEFAULT(10), so both pass — 'best' should come first
  assertEquals(result[0].politician_id, 'best')
})

// ─── attachAlerts ─────────────────────────────────────────────────────────────

Deno.test('attachAlerts: attaches alerts to matching candidates', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 1,
    cargos: [{ cargo: 'senador', candidatos: [makeCandidato('p1', 80)] }],
  }
  const alerts: AlertRow[] = [{
    politician_id: 'p1',
    tipo: 'investigacao',
    severidade: 'alta',
    titulo: 'Investigado',
    descricao: 'Sob investigação',
    fonte_url: 'http://example.com',
    badge_cor: 'red',
  }]
  const output = attachAlerts(result, alerts)
  const candidato = output.cargos[0].candidatos[0]
  assertEquals(candidato.temAlertas, true)
  assertEquals(candidato.alertas.length, 1)
})

Deno.test('attachAlerts: candidates with no alerts keep temAlertas=false', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 1,
    cargos: [{ cargo: 'senador', candidatos: [makeCandidato('p1', 80)] }],
  }
  const output = attachAlerts(result, [])
  assertEquals(output.cargos[0].candidatos[0].temAlertas, false)
})

// ─── sortAndLimitCargos ───────────────────────────────────────────────────────

Deno.test('sortAndLimitCargos: sorts candidates by alinhamento descending', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 2,
    cargos: [{
      cargo: 'senador',
      candidatos: [makeCandidato('p2', 40), makeCandidato('p1', 80)],
    }],
  }
  const output = sortAndLimitCargos(result)
  assertEquals(output.cargos[0].candidatos[0].politicianId, 'p1')
  assertEquals(output.cargos[0].candidatos[1].politicianId, 'p2')
})

Deno.test('sortAndLimitCargos: filters out candidates below MIN_SCORE_THRESHOLD', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 3,
    cargos: [{
      cargo: 'senador',
      candidatos: [makeCandidato('p1', 80), makeCandidato('p2', 0), makeCandidato('p3', 20)],
    }],
  }
  const output = sortAndLimitCargos(result)
  assertEquals(output.cargos[0].candidatos.length, 1)
  assertEquals(output.cargos[0].candidatos[0].politicianId, 'p1')
})

Deno.test('sortAndLimitCargos: removes cargo group when all candidates are below threshold', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 2,
    cargos: [
      { cargo: 'senador', candidatos: [makeCandidato('p1', 80)] },
      { cargo: 'deputado_federal', candidatos: [makeCandidato('p2', 0)] },
    ],
  }
  const output = sortAndLimitCargos(result)
  assertEquals(output.cargos.length, 1)
  assertEquals(output.cargos[0].cargo, 'senador')
})

Deno.test('sortAndLimitCargos: limits senador to MAX_CANDIDATES_PER_CARGO (5)', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 10,
    cargos: [{
      cargo: 'senador',
      candidatos: Array.from({ length: 10 }, (_, i) => makeCandidato(`p${i}`, 40 + i * 5)),
    }],
  }
  const output = sortAndLimitCargos(result)
  assertEquals(output.cargos[0].candidatos.length, MAX_CANDIDATES_PER_CARGO)
})

Deno.test('sortAndLimitCargos: limits presidente and governador to MAX_EXEC_CANDIDATES (3)', () => {
  const makeCargo = (cargo: string): MatchResult['cargos'][number] => ({
    cargo,
    candidatos: Array.from({ length: 6 }, (_, i) => makeCandidato(`p${i}`, 40 + i * 5)),
  })
  for (const cargo of ['presidente', 'governador']) {
    const result: MatchResult = { estado: 'SP', totalCandidatosAnalisados: 6, cargos: [makeCargo(cargo)] }
    const output = sortAndLimitCargos(result)
    assertEquals(output.cargos[0].candidatos.length, MAX_EXEC_CANDIDATES,
      `${cargo} should be limited to ${MAX_EXEC_CANDIDATES}`)
  }
})

Deno.test('sortAndLimitCargos: orders cargos by CARGO_ORDER', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 2,
    cargos: [
      { cargo: 'deputado_federal', candidatos: [makeCandidato('p1', MIN_SCORE_THRESHOLD)] },
      { cargo: 'senador', candidatos: [makeCandidato('p2', MIN_SCORE_THRESHOLD)] },
    ],
  }
  const output = sortAndLimitCargos(result)
  assertEquals(output.cargos[0].cargo, 'senador')
  assertEquals(output.cargos[1].cargo, 'deputado_federal')
})

Deno.test('sortAndLimitCargos: ties break by cobertura, then by name', () => {
  const mk = (nome: string, alinhamento: number, cobertura: number): CandidatoResultado => ({
    politicianId: nome, nomeUrna: nome, partido: 'X', cargo: 'presidente', numeroUrna: null,
    alinhamento, alinhamentoApurado: alinhamento, cobertura, confiancaResultado: cobertura,
    detalhesTemas: [], temAlertas: false, alertas: [],
    dossie: null, fontes: [], observacoes: [], coerenciaPorTema: {},
  })
  const result: MatchResult = {
    cargos: [{ cargo: 'presidente', candidatos: [
      mk('Zeca', 50, 30),
      mk('Ana', 50, 30),
      mk('Beto', 50, 90),
    ] }],
    totalCandidatosAnalisados: 3,
    estado: 'SP',
  }
  const sorted = sortAndLimitCargos(result).cargos[0].candidatos
  assertEquals(sorted.map(c => c.nomeUrna), ['Beto', 'Ana', 'Zeca'])
})

// ─── buildPartyResults ────────────────────────────────────────────────────────

Deno.test('buildPartyResults: returns empty array when no party positions', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', candidacy_id: 'c1', nome_urna: 'A', partido_atual: 'PT', numero_urna: null, cargo: 'senador' },
  ]
  const result = buildPartyResults(candidates, new Map(), [])
  assertEquals(result.length, 0)
})

Deno.test('buildPartyResults: creates one entry per legislative cargo per party', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', candidacy_id: 'c1', nome_urna: 'A', partido_atual: 'PT', numero_urna: null, cargo: 'senador' },
    { politician_id: 'p2', candidacy_id: 'c2', nome_urna: 'B', partido_atual: 'PT', numero_urna: null, cargo: 'deputado_federal' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'PT', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const result = buildPartyResults(candidates, new Map([['PT', positions]]), [makeR('sus', 'favoravel')])
  assertEquals(result.length, 2)
  assertEquals(result.map(r => r.cargo).sort(), ['deputado_federal', 'senador'])
})

Deno.test('buildPartyResults: sets isParty=true and correct politicianId and alinhamento', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', candidacy_id: 'c1', nome_urna: 'A', partido_atual: 'PT', numero_urna: null, cargo: 'senador' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'PT', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const result = buildPartyResults(candidates, new Map([['PT', positions]]), [makeR('sus', 'favoravel', 3)])
  assertEquals(result.length, 1)
  assertEquals(result[0].candidato.isParty, true)
  assertEquals(result[0].candidato.politicianId, 'party:PT')
  assertEquals(result[0].candidato.partido, 'PT')
  assertEquals(result[0].candidato.alinhamento, 100)
})

Deno.test('buildPartyResults: excludes parties without positions', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', candidacy_id: 'c1', nome_urna: 'A', partido_atual: 'PT', numero_urna: null, cargo: 'senador' },
    { politician_id: 'p2', candidacy_id: 'c2', nome_urna: 'B', partido_atual: 'PL', numero_urna: null, cargo: 'senador' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'PT', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const result = buildPartyResults(candidates, new Map([['PT', positions]]), [makeR('sus', 'favoravel')])
  assertEquals(result.length, 1)
  assertEquals(result[0].candidato.partido, 'PT')
})

Deno.test('buildPartyResults: excludes non-legislative cargos (presidente, governador)', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', candidacy_id: 'c1', nome_urna: 'A', partido_atual: 'PT', numero_urna: null, cargo: 'presidente' },
    { politician_id: 'p2', candidacy_id: 'c2', nome_urna: 'B', partido_atual: 'PT', numero_urna: null, cargo: 'governador' },
    { politician_id: 'p3', candidacy_id: 'c3', nome_urna: 'C', partido_atual: 'PT', numero_urna: null, cargo: 'senador' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'PT', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const result = buildPartyResults(candidates, new Map([['PT', positions]]), [makeR('sus', 'favoravel')])
  assertEquals(result.length, 1)
  assertEquals(result[0].cargo, 'senador')
})

// ─── injectPartyResults ───────────────────────────────────────────────────────

Deno.test('injectPartyResults: returns result unchanged when partyResults empty', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 1,
    cargos: [{ cargo: 'senador', candidatos: [makeCandidato('p1', 80)] }],
  }
  const output = injectPartyResults(result, [])
  assertEquals(output, result)
})

Deno.test('injectPartyResults: adds party candidato to existing cargo group', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 1,
    cargos: [{ cargo: 'senador', candidatos: [makeCandidato('p1', 80)] }],
  }
  const partyEntry: CandidatoResultado = {
    politicianId: 'party:PT', nomeUrna: 'PT', partido: 'PT', cargo: 'senador', numeroUrna: null,
    alinhamento: 90, alinhamentoApurado: 90, cobertura: 100, confiancaResultado: 100, detalhesTemas: [],
    temAlertas: false, alertas: [],
    dossie: null, fontes: [], observacoes: [], coerenciaPorTema: {}, isParty: true,
  }
  const output = injectPartyResults(result, [{ cargo: 'senador', candidato: partyEntry }])
  assertEquals(output.cargos[0].candidatos.length, 2)
  assertEquals(output.cargos[0].candidatos.find(c => c.isParty)?.politicianId, 'party:PT')
})

Deno.test('injectPartyResults: creates new cargo group when cargo has no individual results', () => {
  const result: MatchResult = { estado: 'SP', totalCandidatosAnalisados: 0, cargos: [] }
  const partyEntry: CandidatoResultado = {
    politicianId: 'party:PT', nomeUrna: 'PT', partido: 'PT', cargo: 'senador', numeroUrna: null,
    alinhamento: 70, alinhamentoApurado: 70, cobertura: 100, confiancaResultado: 100, detalhesTemas: [],
    temAlertas: false, alertas: [],
    dossie: null, fontes: [], observacoes: [], coerenciaPorTema: {}, isParty: true,
  }
  const output = injectPartyResults(result, [{ cargo: 'senador', candidato: partyEntry }])
  assertEquals(output.cargos.length, 1)
  assertEquals(output.cargos[0].cargo, 'senador')
  assertEquals(output.cargos[0].candidatos.length, 1)
})

// ─── buildPrompt ──────────────────────────────────────────────────────────────

Deno.test('buildPrompt: returns valid JSON string', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', candidacy_id: 'c1', nome_urna: 'CANDIDATO A', partido_atual: 'PT', numero_urna: null, cargo: 'senador' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const prompt = buildPrompt(candidates, groupBy(positions, p => p.politician_id), [makeR('sus', 'favoravel')])
  // Must be parseable JSON
  const parsed = JSON.parse(prompt)
  assertEquals(typeof parsed.tarefa, 'string')
  assertEquals(parsed.candidatos.length, 1)
  assertEquals(parsed.candidatos[0].nomeUrna, 'CANDIDATO A')
})

// ─── Enrichment mappers ──────────────────────────────────────────────────────

Deno.test('pickLatestDossiers: keeps the highest versao per candidacy', () => {
  const rows: DossierRow[] = [
    { candidacy_id: 'c1', resumo_perfil: 'antigo', espectro_declarado: 'centro',
      espectro_inferido: 'centro', coerencia_indice: 50, coerencia_base: 'base v1',
      versao: 1, gerado_em: '2026-08-01T00:00:00Z' },
    { candidacy_id: 'c1', resumo_perfil: 'novo', espectro_declarado: 'centro',
      espectro_inferido: 'direita', coerencia_indice: 70, coerencia_base: 'base v2',
      versao: 2, gerado_em: '2026-08-20T00:00:00Z' },
  ]
  const out = pickLatestDossiers(rows)
  assertEquals(out.size, 1)
  assertEquals(out.get('c1')?.resumoPerfil, 'novo')
  assertEquals(out.get('c1')?.espectroInferido, 'direita')
})

Deno.test('pickLatestDossiers: preserves a null coerencia_indice as null', () => {
  const rows: DossierRow[] = [
    { candidacy_id: 'c1', resumo_perfil: 'r', espectro_declarado: null,
      espectro_inferido: null, coerencia_indice: null, coerencia_base: 'sem histórico',
      versao: 1, gerado_em: '2026-08-01T00:00:00Z' },
  ]
  assertEquals(pickLatestDossiers(rows).get('c1')?.coerenciaIndice, null)
})

Deno.test('groupSources: groups by politician and orders camada 1 first', () => {
  const rows: SourceRow[] = [
    { id: 's2', politician_id: 'p1', tipo: 'noticia', camada: 2, titulo: 'Matéria',
      veiculo: 'CNN Brasil', url: 'https://cnn.example', data_publicacao: '2026-08-05',
      acessado_em: '2026-08-22T00:00:00Z' },
    { id: 's1', politician_id: 'p1', tipo: 'judicial', camada: 1, titulo: 'Acórdão',
      veiculo: 'TRE-SP', url: 'https://tre.example', data_publicacao: '2025-12-01',
      acessado_em: '2026-08-22T00:00:00Z' },
  ]
  assertEquals(groupSources(rows).get('p1')?.map(f => f.id), ['s1', 's2'])
})

Deno.test('groupDetalhePosicoes: keys by politician then theme slug', () => {
  const rows: DetalhePosicaoRow[] = [
    { politician_id: 'p1', theme_id: 't1', coerencia_tema: 'incoerente', justificativa: 'Votou contra em 2023.' },
    { politician_id: 'p1', theme_id: 't2', coerencia_tema: 'coerente', justificativa: null },
  ]
  const slugById = new Map([['t1', 'saude_sus'], ['t2', 'seguranca_publica_estadual']])
  const out = groupDetalhePosicoes(rows, slugById)
  assertEquals(out.get('p1')?.get('saude_sus')?.coerenciaTema, 'incoerente')
  assertEquals(out.get('p1')?.get('saude_sus')?.justificativa, 'Votou contra em 2023.')
  assertEquals(out.get('p1')?.get('seguranca_publica_estadual')?.justificativa, null)
})

// A row with neither column carries nothing, but a row with only one still
// matters — most rows have a justificativa and no coherence assessment.
Deno.test('groupDetalhePosicoes: keeps a row that has only a justificativa', () => {
  const rows: DetalhePosicaoRow[] = [
    { politician_id: 'p1', theme_id: 't1', coerencia_tema: null, justificativa: 'Nada encontrado no plano.' },
  ]
  const out = groupDetalhePosicoes(rows, new Map([['t1', 'saude_sus']]))
  assertEquals(out.get('p1')?.get('saude_sus')?.coerenciaTema, null)
  assertEquals(out.get('p1')?.get('saude_sus')?.justificativa, 'Nada encontrado no plano.')
})

Deno.test('groupDetalhePosicoes: drops rows whose theme is not in the catalog', () => {
  const rows: DetalhePosicaoRow[] = [
    { politician_id: 'p1', theme_id: 'orfao', coerencia_tema: 'incoerente', justificativa: 'x' },
  ]
  assertEquals(groupDetalhePosicoes(rows, new Map()).size, 0)
})

// ─── deriveObservacoes ───────────────────────────────────────────────────────

function makeDetalhe(overrides: Partial<TemaCandidatoDetalhe> = {}): TemaCandidatoDetalhe {
  return {
    temaSlug: 'saude_sus', temaNome: 'Saúde pública',
    voterPosicao: 'favoravel', voterImportancia: 3,
    evidencia: 'direta', neutroMotivo: null, justificativa: null,
    candidatePosicao: 5, candidateImportancia: 4, alignment: 1,
    contouNoScore: true, posicaoViaPartido: false, baixaConfianca: false,
    ...overrides,
  }
}

function makeAlertRow(tipo: string, badgeCor: string): AlertRow {
  return {
    politician_id: 'p1', tipo, severidade: 'baixa',
    titulo: `Título ${tipo}`, descricao: `Descrição ${tipo}`,
    fonte_url: 'https://fonte.example', badge_cor: badgeCor,
  }
}

Deno.test('deriveObservacoes: an incoerencia alert is a contradiction', () => {
  const out = deriveObservacoes([makeAlertRow('incoerencia', 'roxo')], [], null, new Map())
  assertEquals(out.length, 1)
  assertEquals(out[0].categoria, 'contradicao')
  assertEquals(out[0].fonteUrl, 'https://fonte.example')
})

Deno.test('deriveObservacoes: a ressalva_evidencias alert is a ressalva', () => {
  const out = deriveObservacoes([makeAlertRow('ressalva_evidencias', 'amarelo')], [], null, new Map())
  assertEquals(out.length, 1)
  assertEquals(out[0].categoria, 'ressalva')
})

Deno.test('deriveObservacoes: an incoerente theme becomes a contradiction naming the theme', () => {
  const coerencia = new Map<string, CoerenciaTema>([['saude_sus', 'incoerente']])
  const out = deriveObservacoes([], [makeDetalhe({ justificativa: 'Votou contra em 2023.' })], null, coerencia)
  assertEquals(out.length, 1)
  assertEquals(out[0].categoria, 'contradicao')
  assertEquals(out[0].titulo, 'Saúde pública')
  assertEquals(out[0].descricao, 'Votou contra em 2023.')
  assertEquals(out[0].temaSlug, 'saude_sus')
})

Deno.test('deriveObservacoes: a coerente theme produces nothing', () => {
  const coerencia = new Map<string, CoerenciaTema>([['saude_sus', 'coerente']])
  assertEquals(deriveObservacoes([], [makeDetalhe()], null, coerencia).length, 0)
})

Deno.test('deriveObservacoes: a party-sourced theme is a ressalva', () => {
  const out = deriveObservacoes(
    [], [makeDetalhe({ evidencia: 'partido', posicaoViaPartido: true })], null, new Map(),
  )
  assertEquals(out.length, 1)
  assertEquals(out[0].categoria, 'ressalva')
  assertEquals(out[0].temaSlug, 'saude_sus')
})

Deno.test('deriveObservacoes: a low-confidence direct stance is a ressalva', () => {
  const out = deriveObservacoes([], [makeDetalhe({ baixaConfianca: true })], null, new Map())
  assertEquals(out.length, 1)
  assertEquals(out[0].categoria, 'ressalva')
})

// D5: v3 already renders `○ não encontrado` per theme and already prices it into
// the score. Repeating it here would report one fact twice.
Deno.test('deriveObservacoes: an unaudited theme produces nothing', () => {
  const detalhe = makeDetalhe({
    evidencia: 'ausente', neutroMotivo: 'nao_encontrado',
    candidatePosicao: null, alignment: null, contouNoScore: false,
  })
  assertEquals(deriveObservacoes([], [detalhe], null, new Map()).length, 0)
})

Deno.test('deriveObservacoes: an audited neutral produces nothing', () => {
  const detalhe = makeDetalhe({
    evidencia: 'direta', neutroMotivo: 'nao_responde',
    candidatePosicao: 3, alignment: 0.5,
  })
  assertEquals(deriveObservacoes([], [detalhe], null, new Map()).length, 0)
})

// baixaConfianca is only meaningful where credibility was actually applied.
Deno.test('deriveObservacoes: low confidence on an absent theme produces nothing', () => {
  const detalhe = makeDetalhe({
    evidencia: 'ausente', baixaConfianca: true,
    candidatePosicao: null, alignment: null, contouNoScore: false,
  })
  assertEquals(deriveObservacoes([], [detalhe], null, new Map()).length, 0)
})

Deno.test('deriveObservacoes: diverging declared and inferred spectrum is a contradiction', () => {
  const dossie: Dossie = {
    resumoPerfil: 'r', espectroDeclarado: 'centro', espectroInferido: 'direita',
    coerenciaIndice: null, coerenciaBase: null, geradoEm: '2026-08-22T00:00:00Z',
  }
  const out = deriveObservacoes([], [], dossie, new Map())
  assertEquals(out.length, 1)
  assertEquals(out[0].categoria, 'contradicao')
})

Deno.test('deriveObservacoes: matching spectra produce nothing', () => {
  const dossie: Dossie = {
    resumoPerfil: 'r', espectroDeclarado: 'centro', espectroInferido: 'centro',
    coerenciaIndice: null, coerenciaBase: null, geradoEm: '2026-08-22T00:00:00Z',
  }
  assertEquals(deriveObservacoes([], [], dossie, new Map()).length, 0)
})

Deno.test('deriveObservacoes: a half-known spectrum produces nothing', () => {
  const dossie: Dossie = {
    resumoPerfil: 'r', espectroDeclarado: 'centro', espectroInferido: null,
    coerenciaIndice: null, coerenciaBase: null, geradoEm: '2026-08-22T00:00:00Z',
  }
  assertEquals(deriveObservacoes([], [], dossie, new Map()).length, 0)
})

Deno.test('deriveObservacoes: contradictions are ordered before ressalvas', () => {
  const coerencia = new Map<string, CoerenciaTema>([['saude_sus', 'incoerente']])
  const out = deriveObservacoes(
    [makeAlertRow('ressalva_evidencias', 'amarelo')],
    [makeDetalhe({ justificativa: 'j' })],
    null, coerencia,
  )
  assertEquals(out.map(o => o.categoria), ['contradicao', 'ressalva'])
})

Deno.test('deriveObservacoes: an incoerencia alert and an incoerente theme about the same theme collapse to one', () => {
  const alerta = makeAlertRow('incoerencia', 'roxo')
  alerta.titulo = 'Saúde pública'
  const coerencia = new Map<string, CoerenciaTema>([['saude_sus', 'incoerente']])
  const out = deriveObservacoes([alerta], [makeDetalhe({ justificativa: 'Votou contra em 2023.' })], null, coerencia)
  assertEquals(out.length, 1)
  assertEquals(out[0].categoria, 'contradicao')
})

Deno.test('deriveObservacoes: contradictions about different themes both survive', () => {
  const alerta = makeAlertRow('incoerencia', 'roxo')
  alerta.titulo = 'Meio ambiente'
  const coerencia = new Map<string, CoerenciaTema>([['saude_sus', 'incoerente']])
  const out = deriveObservacoes([alerta], [makeDetalhe({ justificativa: 'j' })], null, coerencia)
  assertEquals(out.length, 2)
})

Deno.test('deriveObservacoes: keeps two distinct ressalvas about one theme, since only contradictions have a same-finding guarantee', () => {
  const alerta = makeAlertRow('ressalva_evidencias', 'amarelo')
  alerta.titulo = 'Saúde pública'
  const out = deriveObservacoes(
    [alerta], [makeDetalhe({ evidencia: 'partido', posicaoViaPartido: true })], null, new Map(),
  )
  assertEquals(out.length, 2)
})

// ─── attachAlerts splits accusatory from observational ───────────────────────

Deno.test('attachAlerts: keeps only accusatory types in alertas', () => {
  const result: MatchResult = {
    cargos: [{ cargo: 'presidente', candidatos: [makeCandidato('p1', 80)] }],
    totalCandidatosAnalisados: 1, estado: 'SP',
  }
  const out = attachAlerts(result, [
    makeAlertRow('ficha_suja', 'vermelho'),
    makeAlertRow('ressalva_evidencias', 'amarelo'),
  ])
  const c = out.cargos[0].candidatos[0]
  assertEquals(c.alertas.length, 1)
  assertEquals((c.alertas[0] as { tipo: string }).tipo, 'ficha_suja')
  assertEquals(c.temAlertas, true)
})

Deno.test('attachAlerts: only observational alerts leaves temAlertas false', () => {
  const result: MatchResult = {
    cargos: [{ cargo: 'presidente', candidatos: [makeCandidato('p1', 80)] }],
    totalCandidatosAnalisados: 1, estado: 'SP',
  }
  const out = attachAlerts(result, [makeAlertRow('ressalva_evidencias', 'amarelo')])
  assertEquals(out.cargos[0].candidatos[0].temAlertas, false)
})

// ─── enrichResult ────────────────────────────────────────────────────────────

Deno.test('enrichResult: attaches dossier, sources, coherence and observations', () => {
  const result: MatchResult = {
    cargos: [{
      cargo: 'presidente',
      candidatos: [{
        ...makeCandidato('p1', 80),
        detalhesTemas: [makeDetalhe({ evidencia: 'partido', posicaoViaPartido: true })],
      }],
    }],
    totalCandidatosAnalisados: 1, estado: 'SP',
  }
  const dossie: Dossie = {
    resumoPerfil: 'Advogada de Cuiabá.', espectroDeclarado: 'centro', espectroInferido: 'centro',
    coerenciaIndice: null, coerenciaBase: 'Sem histórico.', geradoEm: '2026-08-22T00:00:00Z',
  }
  const fonte: Fonte = {
    id: 's1', tipo: 'noticia', camada: 2, titulo: 'Matéria', veiculo: 'CNN Brasil',
    url: 'https://cnn.example', dataPublicacao: '2026-08-05', acessadoEm: '2026-08-22T00:00:00Z',
  }
  const out = enrichResult(result, {
    alerts: [makeAlertRow('ficha_suja', 'vermelho')],
    candidacyIdByPolitician: new Map([['p1', 'c1']]),
    dossieByCandidacy: new Map([['c1', dossie]]),
    fontesByPolitician: new Map([['p1', [fonte]]]),
    detalhesByPolitician: new Map([['p1', new Map<string, DetalhePosicao>([
      ['saude_sus', { coerenciaTema: 'coerente', justificativa: 'O plano foca na atenção primária.' }],
    ])]]),
  })
  const c = out.cargos[0].candidatos[0]
  assertEquals(c.dossie?.resumoPerfil, 'Advogada de Cuiabá.')
  assertEquals(c.fontes.length, 1)
  assertEquals(c.alertas.length, 1)
  assertEquals(c.coerenciaPorTema['saude_sus'], 'coerente')
  assertEquals(c.observacoes.length, 1)
  assertEquals(c.observacoes[0].categoria, 'ressalva')
})

// D13: justificativa no longer arrives through scoreCandidato, so enrichResult
// is the only thing that can put it on a theme row.
Deno.test('enrichResult: attaches justificativa onto the matching theme', () => {
  const result: MatchResult = {
    cargos: [{
      cargo: 'presidente',
      candidatos: [{ ...makeCandidato('p1', 80), detalhesTemas: [makeDetalhe({ justificativa: null })] }],
    }],
    totalCandidatosAnalisados: 1, estado: 'SP',
  }
  const out = enrichResult(result, {
    alerts: [], candidacyIdByPolitician: new Map(), dossieByCandidacy: new Map(),
    fontesByPolitician: new Map(),
    detalhesByPolitician: new Map([['p1', new Map<string, DetalhePosicao>([
      ['saude_sus', { coerenciaTema: null, justificativa: 'Buscas no plano não retornaram nada.' }],
    ])]]),
  })
  assertEquals(
    out.cargos[0].candidatos[0].detalhesTemas[0].justificativa,
    'Buscas no plano não retornaram nada.',
  )
})

// The incoerente description falls back to the justificativa, so the attach has
// to happen before deriveObservacoes reads it.
Deno.test('enrichResult: an incoerente theme takes its description from the attached justificativa', () => {
  const result: MatchResult = {
    cargos: [{
      cargo: 'presidente',
      candidatos: [{ ...makeCandidato('p1', 80), detalhesTemas: [makeDetalhe({ justificativa: null })] }],
    }],
    totalCandidatosAnalisados: 1, estado: 'SP',
  }
  const out = enrichResult(result, {
    alerts: [], candidacyIdByPolitician: new Map(), dossieByCandidacy: new Map(),
    fontesByPolitician: new Map(),
    detalhesByPolitician: new Map([['p1', new Map<string, DetalhePosicao>([
      ['saude_sus', { coerenciaTema: 'incoerente', justificativa: 'Defendeu no plano, votou contra em 2023.' }],
    ])]]),
  })
  const obs = out.cargos[0].candidatos[0].observacoes
  assertEquals(obs.length, 1)
  assertEquals(obs[0].categoria, 'contradicao')
  assertEquals(obs[0].descricao, 'Defendeu no plano, votou contra em 2023.')
})

Deno.test('enrichResult: a party entry gets no dossier, sources or observations', () => {
  const partyCandidato: CandidatoResultado = {
    ...makeCandidato('party:PT', 70), nomeUrna: 'PT', isParty: true,
    detalhesTemas: [makeDetalhe({ evidencia: 'partido', posicaoViaPartido: true })],
  }
  const result: MatchResult = {
    cargos: [{ cargo: 'senador', candidatos: [partyCandidato] }],
    totalCandidatosAnalisados: 1, estado: 'SP',
  }
  const out = enrichResult(result, {
    alerts: [], candidacyIdByPolitician: new Map(), dossieByCandidacy: new Map(),
    fontesByPolitician: new Map(), detalhesByPolitician: new Map(),
  })
  const c = out.cargos[0].candidatos[0]
  assertEquals(c.dossie, null)
  assertEquals(c.fontes.length, 0)
  assertEquals(c.observacoes.length, 0)
})

Deno.test('enrichResult: a candidate with no enrichment data keeps empty defaults', () => {
  const result: MatchResult = {
    cargos: [{ cargo: 'presidente', candidatos: [makeCandidato('p9', 60)] }],
    totalCandidatosAnalisados: 1, estado: 'SP',
  }
  const out = enrichResult(result, {
    alerts: [], candidacyIdByPolitician: new Map(), dossieByCandidacy: new Map(),
    fontesByPolitician: new Map(), detalhesByPolitician: new Map(),
  })
  const c = out.cargos[0].candidatos[0]
  assertEquals(c.dossie, null)
  assertEquals(c.fontes.length, 0)
  assertEquals(c.observacoes.length, 0)
  assertEquals(c.alertas.length, 0)
})
