// scripts/lib/neutro-motivo.ts

/**
 * Why a `neutro` row in politician_positions is neutral.
 *
 * `neutro` is written by the enrichment prompt whenever confidence falls below
 * 0.70, so it merges three different facts. This type separates them.
 *
 *   nao_encontrado — searched, found nothing. Scores P_NAO_INFORMADO.
 *   nao_responde   — has a stance on the theme, orthogonal to our affirmation.
 *   ambivalente    — contradictory, or explicitly context-dependent.
 *
 * See docs/superpowers/specs/2026-08-23-match-v3-scoring-design.md §3.
 */
export type NeutroMotivo = 'nao_encontrado' | 'nao_responde' | 'ambivalente'

export const NEUTRO_MOTIVOS: readonly NeutroMotivo[] =
  ['nao_encontrado', 'nao_responde', 'ambivalente'] as const

/**
 * Phrases that assert an ABSENCE of source material. Each one has to be an
 * explicit claim that a search came up empty — not merely a negation, because
 * justifications routinely negate while describing a real stance ("uma reforma
 * de progressividade, NÃO a simplificação pedida").
 *
 * Round 2 of a precision fix: two prior review rounds each found new
 * overfires from patterns that tried to allow a generic negated verb as long
 * as *some* absence-object word appeared nearby. That shape cannot be made
 * safe — any of those verbs (menciona/aborda/trata/registra/apresenta/...)
 * can take a narrowly negated object that happens to be an absence-object
 * keyword while the sentence as a whole still describes a real stance:
 * "não registra apoio à proposta original, preferindo um modelo alternativo"
 * negates "apoio", not "the search"; "proposta" just happens to be nearby.
 * Same problem for "não se posiciona a favor de X, defendendo Y" — a stance,
 * not a silence.
 *
 * So this list is now restricted to constructions where the absence is
 * stated about the SEARCH or the DOCUMENT as a whole, with no room for a
 * stance to hide in the same sentence: "não foi/foram encontrada", "buscas
 * ... não retornaram", "não faz/há nenhuma X", "sem X", "nenhuma X",
 * "ausência de X". No generic verb + nearby-object lookahead, and no bare
 * "não se posiciona/manifesta/pronuncia" — both shapes are gone for good.
 *
 * Precision matters far more than recall here: a false `nao_encontrado`
 * silently costs a theme 0.40 of alignment in production, while a false
 * `null` only sends the row to the AI pass that exists for exactly this.
 * Recall is expected to be low; that is the intended trade-off.
 */
const ABSENCE_PATTERNS: RegExp[] = [
  // Negates the act of finding/locating/identifying itself.
  /n[ãa]o (foi|foram)\s+(encontrad|localizad|identificad)/i,
  // "Buscas ... não retornaram": the subject of the negation is the search
  // itself (plural "buscas", matching how the ingestion pipeline phrases
  // this), not a candidate's position.
  /\bbuscas\b[\s\S]{0,150}?n[ãa]o retorn\w*/i,
  // "não faz/há nenhuma proposta/menção/referência/declaração": the negated
  // verb and the absence object are adjacent, with nothing between them for
  // a stance to hide in.
  /n[ãa]o (faz|h[áa])\s+nenhum[ao]?\s+(proposta|men[çc][ãa]o|refer[êe]ncia|declara[çc][ãa]o)/i,
  /sem (registro|men[çc][ãa]o|declara[çc][ãa]o|informa[çc][ãa]o|posicionamento)/i,
  /nenhum[ao]?\s+(men[çc][ãa]o|proposta|ocorr[êe]ncia|declara[çc][ãa]o|refer[êe]ncia|evid[êe]ncia)/i,
  /aus[êe]ncia de (declara|men[çc]|posi[çc]|proposta|registro|dados|informa)/i,
]

/**
 * Classifies a stored justification by pattern alone.
 *
 * Returns null when the text is not decidable this way — the caller escalates
 * those to an AI pass. Deliberately conservative: a false `nao_encontrado`
 * costs a theme 0.40 of alignment under P_NAO_INFORMADO = 0.10, so when in
 * doubt this returns null and lets a model look at it.
 */
export function classifyNeutroMotivo(justificativa: string): NeutroMotivo | null {
  const text = (justificativa ?? '').trim()
  if (text === '') return null
  for (const pattern of ABSENCE_PATTERNS) {
    if (pattern.test(text)) return 'nao_encontrado'
  }
  return null
}

/** Narrows an arbitrary string to a NeutroMotivo, for validating AI output. */
export function parseNeutroMotivo(value: unknown): NeutroMotivo | null {
  return typeof value === 'string' && (NEUTRO_MOTIVOS as readonly string[]).includes(value)
    ? value as NeutroMotivo
    : null
}
