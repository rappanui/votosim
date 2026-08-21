import { createHash } from 'crypto'

/** A parsed row from a TSE CSV export. */
export type CsvRow = Record<string, string>

/** TSE CSV column names. Verify against the file header before a new year's run. */
export const TSE_COLUMNS = {
  nomeUrna:       'NM_URNA_CANDIDATO',
  nomeCivil:      'NM_CANDIDATO',
  cpf:            'NR_CPF_CANDIDATO',
  sequencial:     'SQ_CANDIDATO',
  cargo:          'DS_CARGO',
  partidoSigla:   'SG_PARTIDO',
  partidoNome:    'NM_PARTIDO',
  partidoNumero:  'NR_PARTIDO',
  uf:             'SG_UF',
  numero:         'NR_CANDIDATO',
  coligacao:      'NM_COLIGACAO',
  situacao:       'DS_SITUACAO_CANDIDATURA',
  nascimento:     'DT_NASCIMENTO',
  genero:         'DS_GENERO',
  escolaridade:   'DS_GRAU_INSTRUCAO',
  ocupacao:       'DS_OCUPACAO',
  turno:          'NR_TURNO',
  federacao:      'SG_FEDERACAO',
  federacaoNome:  'NM_FEDERACAO',
  composicaoColigacao: 'DS_COMPOSICAO_COLIGACAO',
} as const

const CARGO_MAP: Record<string, string> = {
  'PRESIDENTE':         'presidente',
  'VICE-PRESIDENTE':    'vice_presidente',
  'GOVERNADOR':         'governador',
  'VICE-GOVERNADOR':    'vice_governador',
  'SENADOR':            'senador',
  'DEPUTADO FEDERAL':   'deputado_federal',
  'DEPUTADO ESTADUAL':  'deputado_estadual',
  'DEPUTADO DISTRITAL': 'deputado_distrital',
}

/** Offices researched exhaustively, with no viability gate. */
const TIER_TOTAL = new Set(['presidente', 'governador', 'senador'])
/** Offices where a viability score decides who gets researched. */
const TIER_BY_SCORE = new Set(['deputado_federal', 'deputado_estadual'])

/** SHA-256 of the CPF digits. The raw CPF is never stored. */
export function hashCpf(cpf: string): string {
  return createHash('sha256').update(cpf.replace(/\D/g, '')).digest('hex')
}

/** Maps a TSE office label to our enum, or null when out of scope. */
export function parseCargo(raw: string): string | null {
  return CARGO_MAP[raw.toUpperCase().trim()] ?? null
}

/** TSE writes party acronyms with stray spaces ("PC do B"). */
export function normalizeParty(sigla: string): string {
  return sigla.replaceAll(' ', '').trim()
}

/**
 * Maps TSE situation text to candidacy_status. TSE is still ruling on 2026
 * candidacies, so unresolved text stays 'registrado' rather than guessing.
 */
export function mapCandidacyStatus(raw: string): string {
  const text = raw.toUpperCase().trim()
  if (text.startsWith('DEFERIDO'))   return 'deferido'
  if (text.startsWith('INDEFERIDO')) return 'indeferido'
  if (text.startsWith('CASSADO'))    return 'cassado'
  return 'registrado'
}

/** Converts TSE's DD/MM/YYYY to ISO, or null for its null sentinels. */
export function parseTseDate(raw: string): string | null {
  const text = nullableText(raw)
  if (!text) return null

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!match) return null

  const [, day, month, year] = match
  const monthNum = Number(month)
  const dayNum = Number(day)
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null

  // Round-trip through Date to catch impossible dates like 31/02/2000.
  // The independent range checks above allow any day 1-31 and month 1-12,
  // but Date.parse will reject (silently rolling) invalid calendar dates.
  const iso = `${year}-${month}-${day}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  if (parsed.toISOString().slice(0, 10) !== iso) return null

  return iso
}

/** Which processing tier an office belongs to (spec D1). */
export function tierForCargo(cargo: string): 'total' | 'por_score' | 'fora_escopo' {
  if (TIER_TOTAL.has(cargo)) return 'total'
  if (TIER_BY_SCORE.has(cargo)) return 'por_score'
  return 'fora_escopo'
}

/** TSE writes '#NULO' and '#NE' where other exports would write an empty field. */
export function nullableText(raw: string | undefined): string | null {
  const text = raw?.trim() ?? ''
  if (!text || text === '#NULO' || text === '#NE') return null
  return text
}

/**
 * NM_COLIGACAO carries sentinel words, not just nulls: 'PARTIDO ISOLADO' when the
 * party ran alone and 'FEDERACAO' when the alliance is a federation. Storing either
 * as a coalition name would be wrong. Compared accent-insensitively because the
 * source is latin1 and writes 'FEDERAÇÃO'.
 */
const COALITION_SENTINELS = new Set(['PARTIDO ISOLADO', 'FEDERACAO'])

export function parseColigacao(raw: string | undefined): string | null {
  const text = nullableText(raw)
  if (!text) return null

  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  return COALITION_SENTINELS.has(normalized) ? null : text
}
