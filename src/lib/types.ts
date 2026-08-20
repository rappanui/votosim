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

/** Per-theme breakdown enabling the transparency panel in results. */
export interface TemaCandidatoDetalhe {
  temaSlug: string
  voterPosicao: VoterPosicao
  voterImportancia: Importancia
  candidatePosicao: number | null      // 1–5 via posicaoToScale; null = no data or variavel
  candidateImportancia: number | null  // candidate platform centrality (DB intensidade)
  alignment: number | null             // 0.0–1.0; null when voter neutro or no real candidate data
  contouNoScore: boolean
  posicaoViaPartido: boolean           // true when candidatePosicao is sourced from the party program, not the candidate directly
}

export interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  alinhamento: number        // 0–100
  cobertura: number          // 0–100
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
