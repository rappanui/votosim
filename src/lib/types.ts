/** Represents the voter's agreement with a theme statement. */
export type Concordancia = 'concordo' | 'neutro' | 'discordo'

/** Valid values for a questionnaire answer (Likert scale 1–5). */
export type Resposta = 1 | 2 | 3 | 4 | 5

export type AlertType = 'ficha_suja' | 'investigacao' | 'polemica'
export type AlertSeverity = 'critica' | 'alta' | 'media' | 'baixa'
export type BadgeCor = 'vermelho' | 'laranja' | 'cinza'

/** A single voter answer for one quiz theme. Neutral answers are excluded from the Edge Function payload. */
export interface RespostaUsuario {
  temaSlug: string
  resposta: Resposta
  concordancia: Concordancia
  /** Same numeric value as resposta — kept explicit to match Edge Function contract. */
  intensidade: Resposta
}

/** Voter profile collected on /perfil before the questionnaire. */
export interface PerfilUsuario {
  estado: string
  municipio: string
  faixaEtaria: string
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

export interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  score: number
  temasAlinhados: string[]
  temasDivergentes: string[]
  temAlertas: boolean
  alertas: Alerta[]
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

/**
 * Maps a 1–5 Likert answer to its concordância category.
 * Rule: 1–2 = discordo, 3 = neutro, 4–5 = concordo.
 */
export function derivarConcordancia(resposta: number): Concordancia {
  if (resposta <= 2) return 'discordo'
  if (resposta === 3) return 'neutro'
  return 'concordo'
}
