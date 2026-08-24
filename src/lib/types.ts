/** Voter's explicit position on a quiz theme. */
export type VoterPosicao = 'favoravel' | 'contrario' | 'neutro'

/** Voter's declared importance weight for a theme (1=low, 2=medium, 3=high). */
export type Importancia = 1 | 2 | 3

export type AlertType = 'ficha_suja' | 'investigacao' | 'polemica'
export type AlertSeverity = 'critica' | 'alta' | 'media' | 'baixa'
export type BadgeCor = 'vermelho' | 'laranja' | 'cinza'

/** A single voter answer for one quiz theme.
 * Only themes the voter actively answered are stored and sent (unanswered = null, excluded). */
export interface RespostaUsuario {
  temaSlug: string
  posicao: VoterPosicao    // favoravel=Concordo · contrario=Discordo · neutro=Neutro
  importancia: Importancia // voter's declared weight for this theme
}

/** Match request sent to the Edge Function. */
export interface PerfilUsuario {
  estado: string
  respostas: RespostaUsuario[]
  sessionToken: string
  timestamp: string
}

export interface Alerta {
  tipo: AlertType
  severidade: AlertSeverity
  titulo: string
  descricao: string
  fonteUrl: string
  badgeCor: BadgeCor
}

/** How much evidence backs a candidate's position on one theme. */
export type NivelEvidencia = 'direta' | 'partido' | 'ausente'

/** Why a `neutro` row is neutral. See the match v3 spec, §3. */
export type NeutroMotivo = 'nao_encontrado' | 'nao_responde' | 'ambivalente'

/**
 * What an unaudited theme is worth, as a percentage, for display copy.
 * Mirrors P_NAO_INFORMADO in the Edge Function's ai-providers.ts — the two
 * runtimes share no module, so this is the single edit site on the app side.
 */
export const P_NAO_INFORMADO_PCT = 10

/** Per-theme breakdown enabling the transparency panel in results. */
export interface TemaCandidatoDetalhe {
  temaSlug: string
  temaNome: string                     // human-readable name from themes_catalog
  voterPosicao: VoterPosicao
  voterImportancia: Importancia
  candidatePosicao: number | null      // 1–5 via posicaoToScale; null = no data or variavel
  candidateImportancia: number | null  // candidate platform centrality (DB intensidade)
  alignment: number | null             // 0.0–1.0; null when voter neutro or no real candidate data
  contouNoScore: boolean
  evidencia: NivelEvidencia            // replaces reading candidatePosicao === null
  neutroMotivo: NeutroMotivo | null
  justificativa: string | null         // why this theme landed where it did
  posicaoViaPartido: boolean           // true when candidatePosicao is sourced from the party program, not the candidate directly
  baixaConfianca: boolean              // true when a real AI-written stance has confianca_ia below the review threshold
}

export interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  alinhamento: number          // 0–100, penalised: unaudited themes count as P_NAO_INFORMADO_PCT
  alinhamentoApurado: number   // 0–100, audited themes only
  cobertura: number            // 0–100
  confiancaResultado: number   // 0–100, importance-weighted coverage
  detalhesTemas: TemaCandidatoDetalhe[]
  temAlertas: boolean
  alertas: Alerta[]
  isParty?: boolean
}

export interface CargoResultado {
  cargo: string
  candidatos: CandidatoResultado[]
}

export interface MatchResult {
  cargos: CargoResultado[]
  totalCandidatosAnalisados: number
  estado: string
}

/** A question row from `themes_catalog` as returned by Supabase. */
export interface TemaQuestionario {
  slug: string
  nome: string
  afirmacaoQuestionario: string
  contextoQuestionario: string
  notaEducativa: string
}
