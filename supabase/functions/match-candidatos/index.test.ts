/// <reference lib="deno.ns" />
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  attachAlerts,
  buildPartyResults,
  buildPrompt,
  countSimpleMatches,
  groupBy,
  injectPartyResults,
  prefilterCandidates,
  sortAndLimitCargos,
  MAX_CANDIDATES_PER_CARGO,
  MAX_EXEC_CANDIDATES,
  MIN_SCORE_THRESHOLD,
  PREFILTER_LIMIT_DEFAULT,
  PREFILTER_LIMIT_DEPUTADO,
  type AlertRow,
} from './index.ts'
import type { CandidatoResultado, CandidatoRow, MatchResult, PositionWithSlug, RespostaUsuario } from './ai-providers.ts'

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

Deno.test('countSimpleMatches: concordo+favoravel counts as match', () => {
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const answers: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  assertEquals(countSimpleMatches('p1', { p1: positions }, answers), 1)
})

Deno.test('countSimpleMatches: discordo+contrario counts as match', () => {
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'privatizacao', posicao: 'contrario', intensidade: 5 },
  ]
  const answers: RespostaUsuario[] = [
    { temaSlug: 'privatizacao', resposta: 1, concordancia: 'discordo', intensidade: 5 },
  ]
  assertEquals(countSimpleMatches('p1', { p1: positions }, answers), 1)
})

Deno.test('countSimpleMatches: neutro answers are skipped', () => {
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const answers: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 3, concordancia: 'neutro', intensidade: 3 },
  ]
  assertEquals(countSimpleMatches('p1', { p1: positions }, answers), 0)
})

Deno.test('countSimpleMatches: concordo+contrario is not a match', () => {
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'contrario', intensidade: 5 },
  ]
  const answers: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  assertEquals(countSimpleMatches('p1', { p1: positions }, answers), 0)
})

Deno.test('countSimpleMatches: unknown candidate returns 0', () => {
  const answers: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  assertEquals(countSimpleMatches('unknown', {}, answers), 0)
})

// ─── prefilterCandidates ─────────────────────────────────────────────────────

Deno.test('prefilterCandidates: limits deputados to PREFILTER_LIMIT_DEPUTADO', () => {
  const candidates: CandidatoRow[] = Array.from({ length: 30 }, (_, i) => ({
    politician_id: `p${i}`,
    nome_urna: `CANDIDATO ${i}`,
    partido_atual: 'PT',
    cargo: 'deputado_federal',
  }))
  const result = prefilterCandidates(candidates, {}, [])
  assertEquals(result.length, PREFILTER_LIMIT_DEPUTADO)
})

Deno.test('prefilterCandidates: limits non-deputados to PREFILTER_LIMIT_DEFAULT', () => {
  const candidates: CandidatoRow[] = Array.from({ length: 20 }, (_, i) => ({
    politician_id: `p${i}`,
    nome_urna: `CANDIDATO ${i}`,
    partido_atual: 'PT',
    cargo: 'senador',
  }))
  const result = prefilterCandidates(candidates, {}, [])
  assertEquals(result.length, PREFILTER_LIMIT_DEFAULT)
})

Deno.test('prefilterCandidates: selects best-matching candidates', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'best', nome_urna: 'MELHOR', partido_atual: 'PT', cargo: 'senador' },
    { politician_id: 'worst', nome_urna: 'PIOR', partido_atual: 'PL', cargo: 'senador' },
  ]
  const positionsByCandidate: Record<string, PositionWithSlug[]> = {
    best: [{ politician_id: 'best', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 }],
    worst: [{ politician_id: 'worst', themeSlug: 'sus', posicao: 'contrario', intensidade: 5 }],
  }
  const answers: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const result = prefilterCandidates(candidates, positionsByCandidate, answers)
  // Both are within PREFILTER_LIMIT_DEFAULT(10), so both pass — 'best' should come first
  assertEquals(result[0].politician_id, 'best')
})

// ─── attachAlerts ─────────────────────────────────────────────────────────────

Deno.test('attachAlerts: attaches alerts to matching candidates', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 1,
    cargos: [{
      cargo: 'senador',
      candidatos: [{
        politicianId: 'p1',
        nomeUrna: 'A',
        partido: 'PT',
        score: 80,
        temasAlinhados: [],
        temasDivergentes: [],
        temAlertas: false,
        alertas: [],
      }],
    }],
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
    cargos: [{
      cargo: 'senador',
      candidatos: [{
        politicianId: 'p1',
        nomeUrna: 'A',
        partido: 'PT',
        score: 80,
        temasAlinhados: [],
        temasDivergentes: [],
        temAlertas: false,
        alertas: [],
      }],
    }],
  }

  const output = attachAlerts(result, [])
  assertEquals(output.cargos[0].candidatos[0].temAlertas, false)
})

// ─── sortAndLimitCargos ───────────────────────────────────────────────────────

Deno.test('sortAndLimitCargos: sorts candidates by score descending', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 2,
    cargos: [{
      cargo: 'senador',
      candidatos: [
        { politicianId: 'p2', nomeUrna: 'B', partido: 'PL', score: 40, temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [] },
        { politicianId: 'p1', nomeUrna: 'A', partido: 'PT', score: 80, temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [] },
      ],
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
      candidatos: [
        { politicianId: 'p1', nomeUrna: 'A', partido: 'PT', score: 80, temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [] },
        { politicianId: 'p2', nomeUrna: 'B', partido: 'PL', score: 0, temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [] },
        { politicianId: 'p3', nomeUrna: 'C', partido: 'MDB', score: 20, temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [] },
      ],
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
      { cargo: 'senador', candidatos: [{ politicianId: 'p1', nomeUrna: 'A', partido: 'PT', score: 80, temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [] }] },
      { cargo: 'deputado_federal', candidatos: [{ politicianId: 'p2', nomeUrna: 'B', partido: 'PL', score: 0, temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [] }] },
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
      candidatos: Array.from({ length: 10 }, (_, i) => ({
        politicianId: `p${i}`,
        nomeUrna: `C${i}`,
        partido: 'PT',
        score: 40 + i * 5,  // all above MIN_SCORE_THRESHOLD
        temasAlinhados: [],
        temasDivergentes: [],
        temAlertas: false,
        alertas: [],
      })),
    }],
  }

  const output = sortAndLimitCargos(result)
  assertEquals(output.cargos[0].candidatos.length, MAX_CANDIDATES_PER_CARGO)
})

Deno.test('sortAndLimitCargos: limits presidente and governador to MAX_EXEC_CANDIDATES (3)', () => {
  const makeCargo = (cargo: string): MatchResult['cargos'][number] => ({
    cargo,
    candidatos: Array.from({ length: 6 }, (_, i) => ({
      politicianId: `p${i}`,
      nomeUrna: `C${i}`,
      partido: 'PT',
      score: 40 + i * 5,
      temasAlinhados: [],
      temasDivergentes: [],
      temAlertas: false,
      alertas: [],
    })),
  })

  for (const cargo of ['presidente', 'governador']) {
    const result: MatchResult = {
      estado: 'SP',
      totalCandidatosAnalisados: 6,
      cargos: [makeCargo(cargo)],
    }
    const output = sortAndLimitCargos(result)
    assertEquals(output.cargos[0].candidatos.length, MAX_EXEC_CANDIDATES,
      `${cargo} should be limited to ${MAX_EXEC_CANDIDATES}`)
  }
})

Deno.test('sortAndLimitCargos: orders cargos by CARGO_ORDER', () => {
  const makeCandidato = (id: string) => ({
    politicianId: id, nomeUrna: id, partido: 'PT', score: MIN_SCORE_THRESHOLD,
    temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [],
  })
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 2,
    cargos: [
      { cargo: 'deputado_federal', candidatos: [makeCandidato('p1')] },
      { cargo: 'senador', candidatos: [makeCandidato('p2')] },
    ],
  }

  const output = sortAndLimitCargos(result)
  assertEquals(output.cargos[0].cargo, 'senador')
  assertEquals(output.cargos[1].cargo, 'deputado_federal')
})

// ─── buildPartyResults ────────────────────────────────────────────────────────

Deno.test('buildPartyResults: returns empty array when no party positions', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', nome_urna: 'A', partido_atual: 'PT', cargo: 'senador' },
  ]
  const result = buildPartyResults(candidates, new Map(), [])
  assertEquals(result.length, 0)
})

Deno.test('buildPartyResults: creates one entry per legislative cargo per party', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', nome_urna: 'A', partido_atual: 'PT', cargo: 'senador' },
    { politician_id: 'p2', nome_urna: 'B', partido_atual: 'PT', cargo: 'deputado_federal' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'PT', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const result = buildPartyResults(candidates, new Map([['PT', positions]]), respostas)
  assertEquals(result.length, 2)
  assertEquals(result.map(r => r.cargo).sort(), ['deputado_federal', 'senador'])
})

Deno.test('buildPartyResults: sets isParty=true and correct politicianId', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', nome_urna: 'A', partido_atual: 'PT', cargo: 'senador' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'PT', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const result = buildPartyResults(candidates, new Map([['PT', positions]]), respostas)
  assertEquals(result.length, 1)
  assertEquals(result[0].candidato.isParty, true)
  assertEquals(result[0].candidato.politicianId, 'party:PT')
  assertEquals(result[0].candidato.partido, 'PT')
  assertEquals(result[0].candidato.score, 100)
})

Deno.test('buildPartyResults: excludes parties without positions', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', nome_urna: 'A', partido_atual: 'PT', cargo: 'senador' },
    { politician_id: 'p2', nome_urna: 'B', partido_atual: 'PL', cargo: 'senador' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'PT', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  // PL has no entry in partyPositions
  const result = buildPartyResults(candidates, new Map([['PT', positions]]), respostas)
  assertEquals(result.length, 1)
  assertEquals(result[0].candidato.partido, 'PT')
})

Deno.test('buildPartyResults: excludes non-legislative cargos (presidente, governador)', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', nome_urna: 'A', partido_atual: 'PT', cargo: 'presidente' },
    { politician_id: 'p2', nome_urna: 'B', partido_atual: 'PT', cargo: 'governador' },
    { politician_id: 'p3', nome_urna: 'C', partido_atual: 'PT', cargo: 'senador' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'PT', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const result = buildPartyResults(candidates, new Map([['PT', positions]]), respostas)
  assertEquals(result.length, 1)
  assertEquals(result[0].cargo, 'senador')
})

// ─── injectPartyResults ───────────────────────────────────────────────────────

Deno.test('injectPartyResults: returns result unchanged when partyResults empty', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 1,
    cargos: [{ cargo: 'senador', candidatos: [{ politicianId: 'p1', nomeUrna: 'A', partido: 'PT', score: 80, temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [] }] }],
  }
  const output = injectPartyResults(result, [])
  assertEquals(output, result)
})

Deno.test('injectPartyResults: adds party candidato to existing cargo group', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 1,
    cargos: [{ cargo: 'senador', candidatos: [{ politicianId: 'p1', nomeUrna: 'A', partido: 'PT', score: 80, temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [] }] }],
  }
  const partyEntry: CandidatoResultado = {
    politicianId: 'party:PT', nomeUrna: 'PT', partido: 'PT', score: 90,
    temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [], isParty: true,
  }
  const output = injectPartyResults(result, [{ cargo: 'senador', candidato: partyEntry }])
  assertEquals(output.cargos[0].candidatos.length, 2)
  assertEquals(output.cargos[0].candidatos.find(c => c.isParty)?.politicianId, 'party:PT')
})

Deno.test('injectPartyResults: creates new cargo group when cargo has no individual results', () => {
  const result: MatchResult = {
    estado: 'SP',
    totalCandidatosAnalisados: 0,
    cargos: [],
  }
  const partyEntry: CandidatoResultado = {
    politicianId: 'party:PT', nomeUrna: 'PT', partido: 'PT', score: 70,
    temasAlinhados: [], temasDivergentes: [], temAlertas: false, alertas: [], isParty: true,
  }
  const output = injectPartyResults(result, [{ cargo: 'senador', candidato: partyEntry }])
  assertEquals(output.cargos.length, 1)
  assertEquals(output.cargos[0].cargo, 'senador')
  assertEquals(output.cargos[0].candidatos.length, 1)
})

// ─── buildPrompt ──────────────────────────────────────────────────────────────

Deno.test('buildPrompt: returns valid JSON string', () => {
  const candidates: CandidatoRow[] = [
    { politician_id: 'p1', nome_urna: 'CANDIDATO A', partido_atual: 'PT', cargo: 'senador' },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const answers: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const prompt = buildPrompt(candidates, groupBy(positions, p => p.politician_id), answers)
  // Must be parseable JSON
  const parsed = JSON.parse(prompt)
  assertEquals(typeof parsed.tarefa, 'string')
  assertEquals(parsed.candidatos.length, 1)
  assertEquals(parsed.candidatos[0].nomeUrna, 'CANDIDATO A')
})
