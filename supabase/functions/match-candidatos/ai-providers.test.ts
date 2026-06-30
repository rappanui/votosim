/// <reference lib="deno.ns" />
import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { posicaoToScale, voterToScale, scoreCandidato, scoreWithoutAI } from './ai-providers.ts'
import type { FallbackData, PositionWithSlug, RespostaUsuario } from './ai-providers.ts'

// ─── posicaoToScale ───────────────────────────────────────────────────────────

Deno.test('posicaoToScale: favoravel intensidade 5 => 5', () => {
  assertEquals(posicaoToScale('favoravel', 5), 5)
})

Deno.test('posicaoToScale: favoravel intensidade 0 => 3', () => {
  assertAlmostEquals(posicaoToScale('favoravel', 0), 3, 0.001)
})

Deno.test('posicaoToScale: contrario intensidade 5 => 1', () => {
  assertEquals(posicaoToScale('contrario', 5), 1)
})

Deno.test('posicaoToScale: contrario intensidade 0 => 3', () => {
  assertAlmostEquals(posicaoToScale('contrario', 0), 3, 0.001)
})

Deno.test('posicaoToScale: neutro => 3', () => {
  assertEquals(posicaoToScale('neutro', 3), 3)
})

Deno.test('posicaoToScale: variavel => 3', () => {
  assertEquals(posicaoToScale('variavel', 2), 3)
})

// ─── voterToScale ─────────────────────────────────────────────────────────────

Deno.test('voterToScale: concordo intensidade 5 => 5', () => {
  assertEquals(voterToScale('concordo', 5), 5)
})

Deno.test('voterToScale: discordo intensidade 5 => 1', () => {
  assertEquals(voterToScale('discordo', 5), 1)
})

Deno.test('voterToScale: neutro => 3', () => {
  assertEquals(voterToScale('neutro', 3), 3)
})

Deno.test('voterToScale: concordo intensidade 0 => 3', () => {
  assertAlmostEquals(voterToScale('concordo', 0), 3, 0.001)
})

Deno.test('voterToScale: discordo intensidade 0 => 3', () => {
  assertAlmostEquals(voterToScale('discordo', 0), 3, 0.001)
})

// ─── scoreCandidato ───────────────────────────────────────────────────────────

Deno.test('scoreCandidato: perfect alignment scores 100', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.score, 100)
  assertEquals(result.temasAlinhados, ['sus'])
  assertEquals(result.temasDivergentes, [])
})

Deno.test('scoreCandidato: perfect divergence scores 0', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 1, concordancia: 'discordo', intensidade: 5 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.score, 0)
  assertEquals(result.temasAlinhados, [])
  assertEquals(result.temasDivergentes, ['sus'])
})

Deno.test('scoreCandidato: no positions returns score 0', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const result = scoreCandidato(respostas, [])
  assertEquals(result.score, 0)
  assertEquals(result.temasAlinhados, [])
  assertEquals(result.temasDivergentes, [])
})

Deno.test('scoreCandidato: missing theme applies neutral (50%) default — penalises sparse candidates', () => {
  // Candidate aligned on sus but has no position on educacao.
  // Missing theme contributes 0.5 alignment, so final score < 100.
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
    { temaSlug: 'educacao', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
    // 'educacao' not present — neutral default 0.5
  ]
  const result = scoreCandidato(respostas, positions)
  // sus: alignment=1.0, weight=1.0 → 1.0; educacao: alignment=0.5, weight=1.0 → 0.5
  // score = (1.0 + 0.5) / (1.0 + 1.0) * 100 = 75
  assertEquals(result.score, 75)
})

Deno.test('scoreCandidato: discordo+contrario is aligned', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'privatizacao', resposta: 1, concordancia: 'discordo', intensidade: 5 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'privatizacao', posicao: 'contrario', intensidade: 5 },
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.score, 100)
  assertEquals(result.temasAlinhados, ['privatizacao'])
})

Deno.test('scoreCandidato: voter intensidade weights topic importance', () => {
  // Theme A: discordo+intensidade=1 (low voter weight 0.2), politician favoravel+5
  //   voterScale = max(1, 3-(1/5)*2) = 2.6; politicianScale = 5
  //   alignment = 1 - |2.6-5|/4 = 0.4; contribution = 0.4 * 0.2 = 0.08
  // Theme B: concordo+intensidade=5 (high voter weight 1.0), politician favoravel+5
  //   voterScale = 5; politicianScale = 5; alignment = 1.0; contribution = 1.0 * 1.0 = 1.0
  // weightedSum = 1.08; totalWeight = 1.2; score = round(1.08/1.2*100) = 90
  // Without intensity weighting both themes would count equally → score would be 70
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'A', resposta: 1, concordancia: 'discordo', intensidade: 1 },
    { temaSlug: 'B', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'A', posicao: 'favoravel', intensidade: 5 },
    { politician_id: 'p1', themeSlug: 'B', posicao: 'favoravel', intensidade: 5 },
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.score, 90)
})

Deno.test('scoreCandidato: neutro politician posicao treated as missing (neutral 50%)', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'neutro', intensidade: 3 },
  ]
  // neutro posicao = no clear stance → treated as neutral 0.5, but sus is in posMap
  // hasAnyCoverage = true (sus is in posMap)
  // alignment = 0.5 (neutro branch)
  // score = 50
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.score, 50)
  assertEquals(result.temasAlinhados, [])
  assertEquals(result.temasDivergentes, [])
})

// ─── scoreWithoutAI ───────────────────────────────────────────────────────────

Deno.test('scoreWithoutAI: returns valid MatchResult structure', () => {
  const data: FallbackData = {
    estado: 'SP',
    respostas: [
      { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
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
  assertEquals(result.cargos.length, 1)
  assertEquals(result.cargos[0].cargo, 'senador')
  assertEquals(result.cargos[0].candidatos.length, 2)

  const p1 = result.cargos[0].candidatos.find(c => c.politicianId === 'p1')!
  const p2 = result.cargos[0].candidatos.find(c => c.politicianId === 'p2')!
  assertEquals(p1.score, 100)
  assertEquals(p2.score, 0)
})

Deno.test('scoreWithoutAI: groups by cargo correctly', () => {
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
