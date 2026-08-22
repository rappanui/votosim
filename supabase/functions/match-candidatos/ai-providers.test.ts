/// <reference lib="deno.ns" />
import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { posicaoToScale, scoreCandidato, scoreWithoutAI } from './ai-providers.ts'
import type { FallbackData, PositionWithSlug, RespostaUsuario } from './ai-providers.ts'

// ─── posicaoToScale (unchanged behaviour) ─────────────────────────────────────

Deno.test('posicaoToScale: favoravel intensidade 5 => 5', () => {
  assertEquals(posicaoToScale('favoravel', 5), 5)
})

Deno.test('posicaoToScale: contrario intensidade 5 => 1', () => {
  assertEquals(posicaoToScale('contrario', 5), 1)
})

Deno.test('posicaoToScale: neutro => 3', () => {
  assertEquals(posicaoToScale('neutro', 3), 3)
})

Deno.test('posicaoToScale: variavel => 3', () => {
  assertEquals(posicaoToScale('variavel', 2), 3)
})

// ─── scoreCandidato ───────────────────────────────────────────────────────────

Deno.test('scoreCandidato: perfect alignment scores alinhamento=100 cobertura=100', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  // voterScale=5, candidateScale=posicaoToScale('favoravel',5)=5 → alignment=1.0
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 100)
  assertEquals(result.cobertura, 100)
  assertEquals(result.detalhesTemas[0].contouNoScore, true)
  assertAlmostEquals(result.detalhesTemas[0].alignment!, 1.0, 0.001)
})

Deno.test('scoreCandidato: perfect divergence scores alinhamento=0 cobertura=100', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'contrario', intensidade: 5 },
  ]
  // voterScale=5, candidateScale=1 → alignment=1-4/4=0.0
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 0)
  assertEquals(result.cobertura, 100)
})

Deno.test('scoreCandidato: no candidate positions scores alinhamento=0 cobertura=0', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const result = scoreCandidato(respostas, [])
  assertEquals(result.alinhamento, 0)
  assertEquals(result.cobertura, 0)
  assertEquals(result.detalhesTemas[0].candidatePosicao, null)
  assertEquals(result.detalhesTemas[0].contouNoScore, false)
})

Deno.test('scoreCandidato: neutro voter excluded from score and cobertura, included in detalhesTemas', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'neutro', importancia: 2 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 0)
  assertEquals(result.cobertura, 0)
  assertEquals(result.detalhesTemas.length, 1)
  assertEquals(result.detalhesTemas[0].temaSlug, 'sus')
  assertEquals(result.detalhesTemas[0].contouNoScore, false)
  assertEquals(result.detalhesTemas[0].alignment, null)
})

Deno.test('scoreCandidato: importancia weights voter theme importance', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },   // weight=1.0, alignment=1.0
    { temaSlug: 'edu', posicao: 'favoravel', importancia: 1 },   // weight=0.333, alignment=0.0
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
    { politician_id: 'p1', themeSlug: 'edu', posicao: 'contrario', intensidade: 5 },
  ]
  // weightedSum = 1.0*1.0 + 0.0*(1/3) = 1.0; totalWeight = 1.333
  // alinhamento = round(1.0/1.333*100) = 75
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 75)
  assertEquals(result.cobertura, 100)
})

Deno.test('scoreCandidato: cobertura reflects only themes with real candidate data', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },   // covered
    { temaSlug: 'edu', posicao: 'favoravel', importancia: 3 },   // no candidate data
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  // totalTemas=2, coveredTemas=1 → cobertura=50
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.cobertura, 50)
  assertEquals(result.alinhamento, 100) // only scored on sus, alignment=1.0
})

Deno.test('scoreCandidato: discordo+contrario is perfectly aligned', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'priv', posicao: 'contrario', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'priv', posicao: 'contrario', intensidade: 5 },
  ]
  // voterScale=1, candidateScale=posicaoToScale('contrario',5)=1 → alignment=1.0
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 100)
})

Deno.test('scoreCandidato: neutro candidate posicao excluded from score (no real stance)', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'neutro', intensidade: 3 },
  ]
  // neutro posicao = no real stance → not covered, cobertura=0
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 0)
  assertEquals(result.cobertura, 0)
  assertEquals(result.detalhesTemas[0].contouNoScore, false)
})

Deno.test('scoreCandidato: variavel candidate posicao excluded from score', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'variavel', intensidade: 3 },
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 0)
  assertEquals(result.cobertura, 0)
  assertEquals(result.detalhesTemas[0].candidatePosicao, null)
})

// ─── baixaConfianca — flags an AI-written position for the voter, since ──────
// positions publish with no human curation (unlike alerts under Rule B).

Deno.test('scoreCandidato: confiancaIa below 0.75 sets baixaConfianca true', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5, confiancaIa: 0.6 },
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.detalhesTemas[0].baixaConfianca, true)
})

Deno.test('scoreCandidato: confiancaIa at or above 0.75 sets baixaConfianca false', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
    { temaSlug: 'edu', posicao: 'favoravel', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5, confiancaIa: 0.75 },
    { politician_id: 'p1', themeSlug: 'edu', posicao: 'favoravel', intensidade: 5, confiancaIa: 0.95 },
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.detalhesTemas[0].baixaConfianca, false)
  assertEquals(result.detalhesTemas[1].baixaConfianca, false)
})

Deno.test('scoreCandidato: missing confiancaIa (legacy/proxy rows) sets baixaConfianca false, not true', () => {
  // Absence of a score is not the same claim as "the AI was unsure" — the 2022
  // pipeline and the party-proxy fallback never wrote this column at all.
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.detalhesTemas[0].baixaConfianca, false)
})

Deno.test('scoreCandidato: no candidate data at all sets baixaConfianca false, not a low-confidence claim', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const result = scoreCandidato(respostas, [])
  assertEquals(result.detalhesTemas[0].baixaConfianca, false)
})

Deno.test('scoreCandidato: baixaConfianca follows the party-sourced position when the candidate has none', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const partyPositions: PositionWithSlug[] = [
    { politician_id: 'party:PT', themeSlug: 'sus', posicao: 'favoravel', intensidade: 3, confiancaIa: 0.55 },
  ]
  const result = scoreCandidato(respostas, [], partyPositions)
  assertEquals(result.detalhesTemas[0].posicaoViaPartido, true)
  assertEquals(result.detalhesTemas[0].baixaConfianca, true)
})

// ─── scoreWithoutAI ───────────────────────────────────────────────────────────

Deno.test('scoreWithoutAI: returns valid MatchResult structure with alinhamento and cobertura', () => {
  const data: FallbackData = {
    estado: 'SP',
    respostas: [
      { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
    ],
    candidates: [
      { politician_id: 'p1', nome_urna: 'CANDIDATO A', partido_atual: 'PT', cargo: 'senador' },
      { politician_id: 'p2', nome_urna: 'CANDIDATO B', partido_atual: 'PL', cargo: 'senador' },
    ],
    positions: [
      { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
      { politician_id: 'p2', themeSlug: 'sus', posicao: 'contrario', intensidade: 5 },
    ],
  }
  const result = scoreWithoutAI(data)
  assertEquals(result.estado, 'SP')
  assertEquals(result.totalCandidatosAnalisados, 2)
  const p1 = result.cargos[0].candidatos.find(c => c.politicianId === 'p1')!
  const p2 = result.cargos[0].candidatos.find(c => c.politicianId === 'p2')!
  assertEquals(p1.alinhamento, 100)
  assertEquals(p1.cobertura, 100)
  assertEquals(p2.alinhamento, 0)
  assertEquals(p2.cobertura, 100)
})

Deno.test('scoreWithoutAI: groups candidates by cargo', () => {
  const data: FallbackData = {
    estado: 'SP',
    respostas: [],
    candidates: [
      { politician_id: 'p1', nome_urna: 'A', partido_atual: 'PT', cargo: 'senador' },
      { politician_id: 'p2', nome_urna: 'B', partido_atual: 'PL', cargo: 'deputado_federal' },
    ],
    positions: [],
  }
  const result = scoreWithoutAI(data)
  const cargos = result.cargos.map(g => g.cargo).sort()
  assertEquals(cargos, ['deputado_federal', 'senador'])
})
