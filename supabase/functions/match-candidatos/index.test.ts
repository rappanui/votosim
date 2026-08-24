/// <reference lib="deno.ns" />
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  attachAlerts,
  buildPartyResults,
  buildPrompt,
  countSimpleMatches,
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
  type DetalhePosicaoRow,
  type DossierRow,
  type SourceRow,
} from './index.ts'
import type { CandidatoResultado, CandidatoRow, MatchResult, PositionWithSlug, RespostaUsuario } from './ai-providers.ts'

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
    tipo: 'corrupcao',
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
