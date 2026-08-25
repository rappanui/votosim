/** Voter's explicit position on a quiz theme. */
export type VoterPosicao = 'favoravel' | 'contrario' | 'neutro'

/** Voter's declared importance weight for a theme (1=low, 2=medium, 3=high). */
export type Importancia = 1 | 2 | 3

export type AlertType =
  | 'ficha_suja'
  | 'investigacao'
  | 'polemica'
  | 'incoerencia'
  | 'divergencia_espectro'
  | 'ressalva_evidencias'
export type AlertSeverity = 'critica' | 'alta' | 'media' | 'baixa'
export type BadgeCor = 'vermelho' | 'laranja' | 'cinza' | 'roxo' | 'azul' | 'amarelo'

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
  // ativo=false means resolved (absolved, conviction annulled, case
  // archived) — the matter is still on record for transparency, just no
  // longer current. resolucao is only non-null when ativo is false.
  ativo: boolean
  resolucao: string | null
}

/** How much evidence backs a candidate's position on one theme. */
export type NivelEvidencia = 'direta' | 'partido' | 'ausente'

/** Why a `neutro` row is neutral. See the match v3 spec, §3. */
export type NeutroMotivo = 'nao_encontrado' | 'nao_responde' | 'ambivalente'

/**
 * What an unaudited theme is worth, as a percentage, for display copy.
 * Mirrors P_NAO_INFORMADO in the Edge Function's scoring.ts — the two
 * runtimes share no module, so this is the single edit site on the app side.
 */
export const P_NAO_INFORMADO_PCT = 10

/** Office labels shown to voters. One map: the results page heading and the
 *  candidate card both read it, and they used to disagree about
 *  deputado_distrital. Display copy, not part of the Edge Function contract —
 *  it lives here because this is the module both consumers already import. */
export const CARGO_LABELS: Record<string, string> = {
  presidente:         'Presidente',
  governador:         'Governador',
  senador:            'Senador',
  deputado_federal:   'Deputado Federal',
  deputado_estadual:  'Deputado Estadual',
  deputado_distrital: 'Deputado Distrital',
}

/** Same vocabulary as parties.espectro. */
export type Espectro =
  | 'esquerda' | 'centro_esquerda' | 'centro'
  | 'centro_direita' | 'direita' | 'sem_classificacao'

/** Whether conduct on a theme matched the declared platform. Distinct from
 *  NivelEvidencia, which measures how well the theme is documented. */
export type CoerenciaTema = 'coerente' | 'incoerente' | 'sem_historico'

/** Generated candidate profile — newest version of candidate_dossiers. */
export interface Dossie {
  resumoPerfil: string
  espectroDeclarado: Espectro | null
  espectroInferido: Espectro | null
  /** null = no track record to measure. Never zero for that case. */
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

/** A caveat about how a candidate was read — never an accusation.
 *  Themes with evidencia 'ausente' are deliberately absent: the theme row and
 *  the score already account for them. */
export type ObservacaoCategoria = 'contradicao' | 'ressalva'

export interface Observacao {
  categoria: ObservacaoCategoria
  titulo: string
  descricao: string
  temaSlug: string | null
  fonteUrl: string | null
  // Alert-sourced observações (incoerencia, divergencia_espectro,
  // ressalva_evidencias) carry the real severidade a curator/pipeline
  // assigned. The three observações deriveObservacoes computes on the fly
  // from dossie/positions data (no politician_alerts row to read a severity
  // from) get a fixed default instead — see deriveObservacoes in
  // supabase/functions/match-candidatos/index.ts for which gets which.
  severidade: AlertSeverity
}

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
  cargo: string
  numeroUrna: string | null
  alinhamento: number          // 0–100, penalised: unaudited themes count as P_NAO_INFORMADO_PCT
  alinhamentoApurado: number   // 0–100, audited themes only
  cobertura: number            // 0–100
  confiancaResultado: number   // 0–100, importance-weighted coverage
  detalhesTemas: TemaCandidatoDetalhe[]
  temAlertas: boolean
  alertas: Alerta[]
  dossie: Dossie | null
  fontes: Fonte[]
  observacoes: Observacao[]
  coerenciaPorTema: Record<string, CoerenciaTema>
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
