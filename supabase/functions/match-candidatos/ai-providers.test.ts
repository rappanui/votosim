/// <reference lib="deno.ns" />
import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { posicaoToScale, scoreCandidato, scoreWithoutAI } from './ai-providers.ts'
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

Deno.test('scoreCandidato: missing theme slug is ignored', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', resposta: 5, concordancia: 'concordo', intensidade: 5 },
    { temaSlug: 'educacao', resposta: 5, concordancia: 'concordo', intensidade: 5 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
    // 'educacao' not present
  ]
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.score, 100)
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
