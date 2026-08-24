/// <reference lib="deno.ns" />
import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { classifyEvidence, P_NAO_INFORMADO, posicaoToScale, scoreCandidato, scoreWithoutAI } from './ai-providers.ts'
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

Deno.test('scoreCandidato: no candidate positions scores alinhamento=10 cobertura=0', () => {
  // Match v3: unaudited themes are no longer free. With zero coverage,
  // confianca=0, so alinhamento collapses to P_NAO_INFORMADO (10), not 0.
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'favoravel', importancia: 3 },
  ]
  const result = scoreCandidato(respostas, [])
  assertEquals(result.alinhamento, 10)
  assertEquals(result.cobertura, 0)
  assertEquals(result.detalhesTemas[0].candidatePosicao, null)
  assertEquals(result.detalhesTemas[0].contouNoScore, false)
})

Deno.test('scoreCandidato: neutro-only voter excluded from denominators, scores P_NAO_INFORMADO', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'sus', posicao: 'neutro', importancia: 2 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p1', themeSlug: 'sus', posicao: 'favoravel', intensidade: 5 },
  ]
  // Match v3: the voter took no side on anything (the only theme is neutro),
  // so massaTotal stays 0 and confianca is 0 — alinhamento collapses to the
  // same P_NAO_INFORMADO baseline as zero coverage, not to 0.
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 10)
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
  // Both themes are audited, so confianca=100% and the P_NAO_INFORMADO term
  // drops out: apuradoScore = somaPonderada/massaApurada = 1.0/1.333 = 0.75
  // alinhamento = round(0.75*100) = 75
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
  // totalTemas=2, credTemas=1 → cobertura=50
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.cobertura, 50)
  // Match v3: confianca=50% (only sus is weighted evidence out of equal
  // weights), apurado=100% (sus is a perfect match) →
  // alinhamento = 0.5*1.0 + 0.5*P_NAO_INFORMADO = 0.55
  assertEquals(result.alinhamento, 55)
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
  // neutro with no neutroMotivo defaults to nao_encontrado => ausente => not
  // covered, cobertura=0. Match v3: alinhamento collapses to P_NAO_INFORMADO.
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 10)
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
  // 'variavel' classifies as ausente → not covered. Match v3: alinhamento
  // collapses to P_NAO_INFORMADO instead of 0.
  const result = scoreCandidato(respostas, positions)
  assertEquals(result.alinhamento, 10)
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
      { politician_id: 'p1', candidacy_id: 'c1', nome_urna: 'CANDIDATO A', partido_atual: 'PT', numero_urna: null, cargo: 'senador' },
      { politician_id: 'p2', candidacy_id: 'c2', nome_urna: 'CANDIDATO B', partido_atual: 'PL', numero_urna: null, cargo: 'senador' },
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
      { politician_id: 'p1', candidacy_id: 'c1', nome_urna: 'A', partido_atual: 'PT', numero_urna: null, cargo: 'senador' },
      { politician_id: 'p2', candidacy_id: 'c2', nome_urna: 'B', partido_atual: 'PL', numero_urna: null, cargo: 'deputado_federal' },
    ],
    positions: [],
  }
  const result = scoreWithoutAI(data)
  const cargos = result.cargos.map(g => g.cargo).sort()
  assertEquals(cargos, ['deputado_federal', 'senador'])
})

// ─── classifyEvidence ─────────────────────────────────────────────────────────

Deno.test('classifyEvidence: favoravel is direta', () => {
  assertEquals(
    classifyEvidence({ politician_id: 'p1', themeSlug: 's', posicao: 'favoravel', intensidade: 4 }, false),
    'direta',
  )
})

Deno.test('classifyEvidence: neutro with nao_encontrado is ausente', () => {
  assertEquals(
    classifyEvidence(
      { politician_id: 'p1', themeSlug: 's', posicao: 'neutro', intensidade: 1, neutroMotivo: 'nao_encontrado' },
      false,
    ),
    'ausente',
  )
})

Deno.test('classifyEvidence: neutro with nao_responde is direta', () => {
  assertEquals(
    classifyEvidence(
      { politician_id: 'p1', themeSlug: 's', posicao: 'neutro', intensidade: 2, neutroMotivo: 'nao_responde' },
      false,
    ),
    'direta',
  )
})

Deno.test('classifyEvidence: neutro with no motivo defaults to ausente', () => {
  // NULL means unclassified. ~85% of those turn out to be nao_encontrado, and
  // defaulting the other way would silently award 0.5 to unaudited themes.
  assertEquals(
    classifyEvidence({ politician_id: 'p1', themeSlug: 's', posicao: 'neutro', intensidade: 1 }, false),
    'ausente',
  )
})

Deno.test('classifyEvidence: missing position is ausente', () => {
  assertEquals(classifyEvidence(undefined, false), 'ausente')
})

Deno.test('classifyEvidence: party-sourced stance is partido', () => {
  assertEquals(
    classifyEvidence({ politician_id: 'PT', themeSlug: 's', posicao: 'favoravel', intensidade: 4 }, true),
    'partido',
  )
})

// ─── Scoring ──────────────────────────────────────────────────────────────────

Deno.test('scoreCandidato: Grassi regression — 5 audited of 14 scores 39', () => {
  // The real quiz run that motivated match v3: alignment 90% over 5 themes was
  // displayed as the headline. It must now read 39%.
  const temas = [
    'reforma_tributaria', 'sus_saude_publica', 'seguranca_publica_estadual',
    'educacao_basica', 'meio_ambiente_desmatamento',
    'privatizacao_estatais', 'reforma_previdencia', 'protecao_minorias',
    'autonomia_individual', 'corrupcao_transparencia', 'politica_economica',
    'bolsa_familia_transferencia', 'politica_externa', 'laicidade_valores',
  ]
  const respostas: RespostaUsuario[] = temas.map(t => ({
    temaSlug: t,
    posicao: t === 'autonomia_individual' ? 'contrario' : 'favoravel',
    importancia: 2,
  }))
  const positions: PositionWithSlug[] = [
    { politician_id: 'g', themeSlug: 'reforma_tributaria', posicao: 'favoravel', intensidade: 5 },
    { politician_id: 'g', themeSlug: 'sus_saude_publica', posicao: 'favoravel', intensidade: 4 },
    { politician_id: 'g', themeSlug: 'seguranca_publica_estadual', posicao: 'favoravel', intensidade: 4 },
    { politician_id: 'g', themeSlug: 'educacao_basica', posicao: 'favoravel', intensidade: 4 },
    { politician_id: 'g', themeSlug: 'meio_ambiente_desmatamento', posicao: 'favoravel', intensidade: 3 },
    ...temas.slice(5).map(t => ({
      politician_id: 'g', themeSlug: t, posicao: 'neutro', intensidade: 1,
      neutroMotivo: 'nao_encontrado' as const,
    })),
  ]
  const r = scoreCandidato(respostas, positions)
  assertEquals(r.alinhamentoApurado, 90)
  assertEquals(r.cobertura, 36)
  assertEquals(r.confiancaResultado, 36)
  assertEquals(r.alinhamento, 39)
})

Deno.test('scoreCandidato: full coverage leaves the score unpenalized', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'a', posicao: 'favoravel', importancia: 3 },
    { temaSlug: 'b', posicao: 'contrario', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p', themeSlug: 'a', posicao: 'favoravel', intensidade: 5 },
    { politician_id: 'p', themeSlug: 'b', posicao: 'contrario', intensidade: 5 },
  ]
  const r = scoreCandidato(respostas, positions)
  assertEquals(r.cobertura, 100)
  assertEquals(r.confiancaResultado, 100)
  assertEquals(r.alinhamento, r.alinhamentoApurado)
  assertEquals(r.alinhamento, 100)
})

Deno.test('scoreCandidato: zero coverage scores exactly P_NAO_INFORMADO', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'a', posicao: 'favoravel', importancia: 3 },
  ]
  const r = scoreCandidato(respostas, [])
  assertEquals(r.cobertura, 0)
  assertEquals(r.confiancaResultado, 0)
  assertEquals(r.alinhamento, Math.round(P_NAO_INFORMADO * 100))
})

Deno.test('scoreCandidato: an audited neutral scores 0.5, not the penalty', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'a', posicao: 'favoravel', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    {
      politician_id: 'p', themeSlug: 'a', posicao: 'neutro', intensidade: 2,
      neutroMotivo: 'nao_responde',
    },
  ]
  const r = scoreCandidato(respostas, positions)
  assertEquals(r.cobertura, 100)
  assertEquals(r.alinhamento, 50)
  assertEquals(r.detalhesTemas[0].evidencia, 'direta')
})

Deno.test('scoreCandidato: cobertura and confianca diverge on weighted gaps', () => {
  // Two themes audited, one not — but the unaudited one is the only one the
  // voter marked as high importance. Plain coverage says 67%; the weighted
  // metric, which is what the score uses, says 40%.
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'a', posicao: 'favoravel', importancia: 1 },
    { temaSlug: 'b', posicao: 'favoravel', importancia: 1 },
    { temaSlug: 'c', posicao: 'favoravel', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p', themeSlug: 'a', posicao: 'favoravel', intensidade: 5 },
    { politician_id: 'p', themeSlug: 'b', posicao: 'favoravel', intensidade: 5 },
  ]
  const r = scoreCandidato(respostas, positions)
  assertEquals(r.cobertura, 67)
  assertEquals(r.confiancaResultado, 40)
})

Deno.test('scoreCandidato: party-sourced stance carries reduced credibility', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'a', posicao: 'favoravel', importancia: 3 },
  ]
  const partyPositions: PositionWithSlug[] = [
    { politician_id: 'PT', themeSlug: 'a', posicao: 'favoravel', intensidade: 5 },
  ]
  const r = scoreCandidato(respostas, [], partyPositions)
  // credibility 0.6: confianca=60, apurado=100 → 0.6*1.0 + 0.4*0.10 = 0.64
  assertEquals(r.confiancaResultado, 60)
  assertEquals(r.alinhamentoApurado, 100)
  assertEquals(r.alinhamento, 64)
  assertEquals(r.detalhesTemas[0].evidencia, 'partido')
  assertEquals(r.detalhesTemas[0].posicaoViaPartido, true)
})

Deno.test('scoreCandidato: voter-neutral themes stay out of both denominators', () => {
  const respostas: RespostaUsuario[] = [
    { temaSlug: 'a', posicao: 'favoravel', importancia: 3 },
    { temaSlug: 'b', posicao: 'neutro', importancia: 3 },
  ]
  const positions: PositionWithSlug[] = [
    { politician_id: 'p', themeSlug: 'a', posicao: 'favoravel', intensidade: 5 },
  ]
  const r = scoreCandidato(respostas, positions)
  assertEquals(r.cobertura, 100)
  assertEquals(r.confiancaResultado, 100)
  assertEquals(r.alinhamento, 100)
})

Deno.test('scoreCandidato: the displayed identity holds exactly for random inputs', () => {
  // This is the test that keeps the arithmetic and the card's audit line from
  // drifting apart. alinhamento is derived from the ROUNDED confiancaResultado
  // and alinhamentoApurado, so the recombination must match exactly — no
  // tolerance needed. Seeds route themes across all three evidence levels
  // (direta, partido, ausente) so credibilidade=0.6 is exercised too, not
  // just the single hand-written party-credibility test.
  const posicoes = ['favoravel', 'contrario', 'neutro'] as const
  const motivos = ['nao_encontrado', 'nao_responde', 'ambivalente'] as const
  for (let seed = 0; seed < 200; seed++) {
    const n = 1 + (seed % 14)
    const respostas: RespostaUsuario[] = []
    const positions: PositionWithSlug[] = []
    const partyPositions: PositionWithSlug[] = []
    for (let i = 0; i < n; i++) {
      const slug = `t${i}`
      respostas.push({
        temaSlug: slug,
        posicao: (seed + i) % 5 === 0 ? 'neutro' : ((seed + i) % 2 === 0 ? 'favoravel' : 'contrario'),
        importancia: ((seed + i) % 3 + 1) as 1 | 2 | 3,
      })
      if ((seed + i) % 4 !== 0) {
        const posicao = posicoes[(seed + i) % 3]
        const pos: PositionWithSlug = {
          politician_id: 'p', themeSlug: slug, posicao, intensidade: ((seed + i) % 5) + 1,
          ...(posicao === 'neutro' ? { neutroMotivo: motivos[(seed + i) % 3] } : {}),
        }
        // Route roughly half of the audited themes through the party program
        // instead of the candidate directly, exercising evidencia='partido'.
        if ((seed + i) % 8 < 4) {
          positions.push(pos)
        } else {
          partyPositions.push({ ...pos, politician_id: 'PT' })
        }
      }
    }
    const r = scoreCandidato(respostas, positions, partyPositions)
    const expected = Math.round(
      (r.confiancaResultado / 100) * (r.alinhamentoApurado / 100) * 100 +
        (1 - r.confiancaResultado / 100) * P_NAO_INFORMADO * 100,
    )
    assertEquals(r.alinhamento, expected, `seed ${seed}`)
  }
})
