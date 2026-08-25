/// <reference lib="deno.ns" />
// ─── Exported types ────────────────────────────────────────────────────────────

export interface RespostaUsuario {
  temaSlug: string
  posicao: 'favoravel' | 'contrario' | 'neutro'  // voter's explicit position
  importancia: 1 | 2 | 3                          // voter weight: 1=low · 2=medium · 3=high
}

export interface MatchRequest {
  estado: string
  respostas: RespostaUsuario[]
  sessionToken: string
  timestamp: string
}

export interface CandidatoRow {
  politician_id: string
  candidacy_id: string
  nome_urna: string
  partido_atual: string
  numero_urna: string | null
  cargo: string
}

export type NeutroMotivo = 'nao_encontrado' | 'nao_responde' | 'ambivalente'

export interface PositionWithSlug {
  politician_id: string
  themeSlug: string
  posicao: string
  intensidade: number
  confiancaIa?: number             // 0.0–1.0; absent for pre-SP-1 rows that never wrote it
  neutroMotivo?: NeutroMotivo      // only meaningful when posicao === 'neutro'
  justificativa?: string           // the analyst's account, surfaced per theme in the UI
}

/**
 * Below this, an AI-written position is flagged to the voter as unreviewed.
 * Positions publish with no human curation (unlike alerts under Rule B of
 * docs/legado/base/04_schema_alerts.md), so this is the only signal a voter gets
 * that a specific classification is weaker than the rest.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.75

export interface TemaCandidatoDetalhe {
  temaSlug: string
  temaNome: string                     // human-readable name from themes_catalog
  voterPosicao: 'favoravel' | 'contrario' | 'neutro'
  voterImportancia: 1 | 2 | 3
  // Typed numeric for forward-compat with planned candidate schema migration (see spec §8).
  // This iteration: converted from DB categorical via posicaoToScale(); null = no data.
  candidatePosicao: number | null
  candidateImportancia: number | null  // DB intensidade — platform centrality, display only
  alignment: number | null             // 0.0–1.0; null when voter neutro or no real candidate data
  contouNoScore: boolean
  evidencia: NivelEvidencia            // replaces reading candidatePosicao === null
  neutroMotivo: NeutroMotivo | null
  justificativa: string | null         // why this theme landed where it did
  posicaoViaPartido: boolean           // true when candidatePosicao is sourced from the party program, not the candidate directly
  baixaConfianca: boolean              // true when a real AI-written stance has confiancaIa < LOW_CONFIDENCE_THRESHOLD
}

/** Same vocabulary as parties.espectro and candidate_dossiers.espectro_*. */
export type Espectro =
  | 'esquerda' | 'centro_esquerda' | 'centro'
  | 'centro_direita' | 'direita' | 'sem_classificacao'

/** Whether conduct on a theme matched the declared platform.
 *  Distinct from v3's NivelEvidencia: that measures how well a theme is
 *  documented, this measures whether the documentation agrees with itself. */
export type CoerenciaTema = 'coerente' | 'incoerente' | 'sem_historico'

/** Generated candidate profile — newest version of candidate_dossiers. */
export interface Dossie {
  resumoPerfil: string
  espectroDeclarado: Espectro | null
  espectroInferido: Espectro | null
  /** null means no track record to measure — never zero, which would mean
   *  measured and completely incoherent. */
  coerenciaIndice: number | null
  coerenciaBase: string | null
  geradoEm: string
}

/** One catalogued source. camada: 1 official · 2 press · 3 fact-checking. */
export interface Fonte {
  id: string
  tipo: string
  camada: 1 | 2 | 3
  titulo: string | null
  veiculo: string | null
  url: string
  dataPublicacao: string | null
  acessadoEm: string
}

/** A caveat about how this candidate was read — never an accusation.
 *  Named `ressalva`, not `evidencia`: v3 already owns `evidencia` as the name
 *  of a theme's documentation level, and two meanings for one word in the same
 *  contract is a bug waiting to happen. Populated by deriveObservacoes (Task 3). */
export type ObservacaoCategoria = 'contradicao' | 'ressalva'

export interface Observacao {
  categoria: ObservacaoCategoria
  titulo: string
  descricao: string
  temaSlug: string | null
  fonteUrl: string | null
  // Alert-sourced observações carry the real severidade off politician_alerts.
  // The three deriveObservacoes computes on the fly (no alert row to read
  // from) get a fixed default — see deriveObservacoes in index.ts.
  severidade: string
}

export interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  cargo: string
  numeroUrna: string | null
  alinhamento: number          // 0–100
  alinhamentoApurado: number   // 0–100, audited themes only
  cobertura: number            // 0–100
  confiancaResultado: number   // 0–100, importance-weighted coverage
  detalhesTemas: TemaCandidatoDetalhe[]
  temAlertas: boolean
  alertas: unknown[]
  dossie: Dossie | null
  fontes: Fonte[]
  observacoes: Observacao[]
  coerenciaPorTema: Record<string, CoerenciaTema>
  isParty?: boolean
}

export interface MatchResult {
  cargos: Array<{ cargo: string; candidatos: CandidatoResultado[] }>
  totalCandidatosAnalisados: number
  estado: string
}

export interface FallbackData {
  respostas: RespostaUsuario[]
  candidates: CandidatoRow[]
  positions: PositionWithSlug[]
  estado: string
  partyPositionsByParty?: Map<string, PositionWithSlug[]>  // keyed by partido_atual sigla
  temaNomes?: Map<string, string>
}

// ─── Deterministic scoring (no AI) ────────────────────────────────────────────

// Maps politician posicao+intensidade to a 1–5 scale.
// Retained until candidate schema migrates to numeric posicao (see spec §8 — deferred).
export function posicaoToScale(posicao: string, intensidade: number): number {
  if (posicao === 'favoravel') return Math.min(5, 3 + (intensidade / 5) * 2)
  if (posicao === 'contrario') return Math.max(1, 3 - (intensidade / 5) * 2)
  return 3
}

/**
 * What an unaudited theme contributes to alignment.
 *
 * Deliberately below 0.5 (an audited neutral) and above 0.0 (audited
 * opposition): failing to take a public position has a cost, but a smaller one
 * than disagreeing outright. This is an editorial judgment, not an estimate,
 * and it is disclosed to voters on /sobre. See the spec, §5.
 */
export const P_NAO_INFORMADO = 0.10

/** Party-program positions are real evidence about a candidate, but weaker. */
export const CREDIBILIDADE_PARTIDO = 0.6

export type NivelEvidencia = 'direta' | 'partido' | 'ausente'

const CREDIBILIDADE: Record<NivelEvidencia, number> = {
  direta: 1,
  partido: CREDIBILIDADE_PARTIDO,
  ausente: 0,
}

/**
 * Decides how much a stored position is worth as evidence.
 *
 * The subtlety is `neutro`: it is not a position. The enrichment prompt writes
 * it whenever confidence falls below 0.70, so it merges "found nothing" with
 * "found something that does not pick a side". `neutroMotivo` separates them;
 * a missing motivo means unclassified, which reads as `nao_encontrado`.
 */
export function classifyEvidence(
  pos: PositionWithSlug | undefined,
  viaPartido: boolean,
): NivelEvidencia {
  if (!pos) return 'ausente'
  const audited = viaPartido ? 'partido' : 'direta'
  if (pos.posicao === 'favoravel' || pos.posicao === 'contrario') return audited
  if (pos.posicao === 'neutro') {
    return (pos.neutroMotivo ?? 'nao_encontrado') === 'nao_encontrado' ? 'ausente' : audited
  }
  return 'ausente'  // 'variavel' and anything unrecognised
}

export function scoreCandidato(
  respostas: RespostaUsuario[],
  positions: PositionWithSlug[],
  partyPositions?: PositionWithSlug[],
  temaNomes?: Map<string, string>,
): {
  alinhamento: number
  alinhamentoApurado: number
  cobertura: number
  confiancaResultado: number
  detalhesTemas: TemaCandidatoDetalhe[]
} {
  const posMap = new Map(positions.map(p => [p.themeSlug, p]))
  const partyPosMap = new Map((partyPositions ?? []).map(p => [p.themeSlug, p]))

  let massaTotal = 0        // Σ w — every theme the voter took a side on
  let massaApurada = 0      // Σ w · credibilidade — the part backed by evidence
  let somaPonderada = 0     // Σ w · credibilidade · alignment
  let totalTemas = 0        // unweighted theme count, for `cobertura`
  let credTemas = 0         // Σ credibilidade, for `cobertura`
  const detalhesTemas: TemaCandidatoDetalhe[] = []

  for (const r of respostas) {
    const candidatePos = posMap.get(r.temaSlug)
    const partyPos = candidatePos === undefined ? partyPosMap.get(r.temaSlug) : undefined
    const effectivePos = candidatePos ?? partyPos
    const viaPartido = candidatePos === undefined && partyPos !== undefined

    const evidencia = classifyEvidence(effectivePos, viaPartido)
    const credibilidade = CREDIBILIDADE[evidencia]
    const apurado = credibilidade > 0

    // An audited neutral converts to scale 3, which the alignment formula below
    // turns into exactly 0.5 against either voter position. No special case.
    const candidatePosicao = apurado
      ? posicaoToScale(effectivePos!.posicao, effectivePos!.intensidade)
      : null
    const candidateImportancia = effectivePos ? effectivePos.intensidade : null
    // Absence of confiancaIa is not itself a low-confidence claim — pre-SP-1
    // rows (2022 seed, party-proxy fallback) never wrote this column.
    const baixaConfianca = apurado &&
      effectivePos!.confiancaIa !== undefined &&
      effectivePos!.confiancaIa < LOW_CONFIDENCE_THRESHOLD

    const base = {
      temaSlug: r.temaSlug,
      temaNome: temaNomes?.get(r.temaSlug) ?? r.temaSlug,
      voterPosicao: r.posicao,
      voterImportancia: r.importancia,
      evidencia,
      neutroMotivo: effectivePos?.neutroMotivo ?? null,
      justificativa: effectivePos?.justificativa ?? null,
      candidatePosicao,
      candidateImportancia,
      posicaoViaPartido: evidencia === 'partido',
      baixaConfianca,
    }

    if (r.posicao === 'neutro') {
      // The voter declined to take a side: this theme cannot measure agreement,
      // so it stays out of both the score and the coverage denominators.
      detalhesTemas.push({ ...base, alignment: null, contouNoScore: false })
      continue
    }

    const w = r.importancia / 3
    massaTotal += w
    totalTemas++
    credTemas += credibilidade

    let alignment: number | null = null
    if (apurado) {
      const voterScale = r.posicao === 'favoravel' ? 5 : 1
      alignment = 1 - Math.abs(voterScale - candidatePosicao!) / 4
      massaApurada += w * credibilidade
      somaPonderada += w * credibilidade * alignment
    }

    detalhesTemas.push({ ...base, alignment, contouNoScore: apurado })
  }

  // The voter was neutral on everything: massaTotal is 0/0-undefined, so treat
  // confianca as 0 rather than special-casing the return — the formula below
  // already collapses to P_NAO_INFORMADO when there is no weighted evidence,
  // which keeps this branch consistent with the "zero coverage" case.
  const confianca = massaTotal === 0 ? 0 : massaApurada / massaTotal
  const apuradoScore = massaApurada === 0 ? 0 : somaPonderada / massaApurada

  const coberturaPct = totalTemas === 0 ? 0 : Math.round((credTemas / totalTemas) * 100)
  const confiancaPct = Math.round(confianca * 100)
  const apuradoPct = Math.round(apuradoScore * 100)
  // Derived from the ROUNDED components on purpose: the results card shows this
  // same arithmetic to the voter as an audit line, and a headline that does not
  // reproduce from the numbers beside it is worse than one that is a fraction
  // of a point less precise. A property test in scoring.test.ts enforces
  // this identity holds exactly against the returned rounded values.
  const alinhamentoPct = Math.round(
    (confiancaPct / 100) * (apuradoPct / 100) * 100 + (1 - confiancaPct / 100) * P_NAO_INFORMADO * 100,
  )

  return {
    alinhamento: alinhamentoPct,
    alinhamentoApurado: apuradoPct,
    cobertura: coberturaPct,
    confiancaResultado: confiancaPct,
    detalhesTemas,
  }
}

export function scoreWithoutAI(data: FallbackData): MatchResult {
  const byCandidate = new Map<string, PositionWithSlug[]>()
  for (const p of data.positions) {
    const list = byCandidate.get(p.politician_id) ?? []
    list.push(p)
    byCandidate.set(p.politician_id, list)
  }

  const byCargo = new Map<string, CandidatoResultado[]>()
  for (const c of data.candidates) {
    const partyPositions = data.partyPositionsByParty?.get(c.partido_atual)
    const { alinhamento, alinhamentoApurado, cobertura, confiancaResultado, detalhesTemas } =
      scoreCandidato(
        data.respostas,
        byCandidate.get(c.politician_id) ?? [],
        partyPositions,
        data.temaNomes,
      )
    const resultado: CandidatoResultado = {
      politicianId: c.politician_id,
      nomeUrna: c.nome_urna,
      partido: c.partido_atual,
      cargo: c.cargo,
      numeroUrna: c.numero_urna,
      alinhamento,
      alinhamentoApurado,
      cobertura,
      confiancaResultado,
      detalhesTemas,
      temAlertas: false,
      alertas: [],
      dossie: null,
      fontes: [],
      observacoes: [],
      coerenciaPorTema: {},
    }
    const list = byCargo.get(c.cargo) ?? []
    list.push(resultado)
    byCargo.set(c.cargo, list)
  }

  return {
    cargos: [...byCargo.entries()].map(([cargo, candidatos]) => ({ cargo, candidatos })),
    totalCandidatosAnalisados: data.candidates.length,
    estado: data.estado,
  }
}
