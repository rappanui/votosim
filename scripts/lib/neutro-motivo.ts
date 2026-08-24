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
 * The distinguishing feature: an absence claim negates the act of finding
 * ("não foi encontrada", "não retornaram nenhuma proposta"), whereas a stance
 * description negates the object ("não a simplificação", "não menciona
 * compensação, preferindo Y").
 *
 * Fixed after a review finding: the generic verbs (menciona/aborda/trata/...)
 * used to fire bare, so "não menciona compensação, preferindo desapropriação
 * direta" — a real stance — was misread as an absence claim. They now require
 * an explicit absence object within two words of the verb ("não menciona
 * nenhuma proposta"), not just the negated verb alone. The bare "não há /
 * existe / se encontra" idiom match was dropped outright — it fires on
 * unrelated idioms like "não há dúvida de que o candidato apoia X" — rather
 * than trying to rescope it. Precision matters more than recall here: a false
 * `nao_encontrado` costs a theme 0.40 of alignment, while a false `null` only
 * sends the row to the AI pass that exists for exactly this.
 */
const ABSENCE_PATTERNS: RegExp[] = [
  // Negates the act of finding/searching itself — always an absence claim.
  /n[ãa]o (foi|foram)\s+(encontrad|localizad|identificad)/i,
  // Generic "did (not) do X" verbs: safe only when an absence object follows
  // within a short span. A bare "não menciona X" must NOT match.
  /n[ãa]o (retorn\w*|apresent\w*|menciona\w*|aborda\w*|trata\w*|consta\w*|cont[ée]m|possui\w*|traz\w*|registra\w*|faz)(?:\s+\S+){0,2}\s+(nenhum[ao]?|qualquer|men[çc][ãa]o|refer[êe]ncia\w*|proposta|declara[çc][ãa]o|posi[çc][ãa]o|posicionamento|registro|dado)/i,
  /n[ãa]o se (manifest|pronunci|posicion)/i,
  /sem (registro|declara[çc][ãa]o|men[çc][ãa]o|informa[çc][ãa]o|posi[çc][ãa]o|posicionamento|refer[êe]ncia|proposta|dados)/i,
  /nenhum[ao]?\s+(declara[çc][ãa]o|men[çc][ãa]o|registro|posi[çc][ãa]o|refer[êe]ncia|promessa|proposta|ocorr[êe]ncia|proposi[çc][ãa]o|evid[êe]ncia)/i,
  /aus[êe]ncia de (declara|men[çc]|posi[çc]|proposta|registro|dados|informa)/i,
  /(silencia|silêncio|omisso|omiss[ãa]o) (sobre|quanto|a respeito|em rela[çc])/i,
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
