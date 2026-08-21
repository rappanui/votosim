/** The five interpretive stages the per-candidate agent runs. */
export type EnrichmentStage =
  | 'documentos_oficiais'
  | 'ficha_limpa'
  | 'noticias'
  | 'dossie'
  | 'posicoes'

export type LedgerStatus =
  | 'pendente'
  | 'em_progresso'
  | 'concluido'
  | 'falhou'
  | 'nao_aplicavel'

export const ALL_STAGES: EnrichmentStage[] = [
  'documentos_oficiais',
  'ficha_limpa',
  'noticias',
  'dossie',
  'posicoes',
]

/** One ledger row: the state of one stage for one candidacy. */
export interface LedgerRow {
  candidacy_id: string
  etapa: EnrichmentStage
  status: LedgerStatus
}

/** Only presidente and governador file a government plan with the TSE. */
const FILES_GOVERNMENT_PLAN = new Set(['presidente', 'governador'])

/**
 * Builds the initial ledger for one candidacy, marking stages that genuinely
 * do not apply rather than leaving them to be reported as failures later.
 */
export function buildLedgerRows(candidacyId: string, cargo: string, tier: string): LedgerRow[] {
  return ALL_STAGES.map(etapa => ({
    candidacy_id: candidacyId,
    etapa,
    status: resolveStatus(etapa, cargo, tier),
  }))
}

function resolveStatus(etapa: EnrichmentStage, cargo: string, tier: string): LedgerStatus {
  if (tier === 'fora_escopo') return 'nao_aplicavel'
  if (etapa === 'documentos_oficiais' && !FILES_GOVERNMENT_PLAN.has(cargo)) return 'nao_aplicavel'
  return 'pendente'
}
