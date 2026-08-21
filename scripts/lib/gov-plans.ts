const CDN_BASE = 'https://cdn.tse.jus.br/estatistica/sead/odsele'

/**
 * National bulk datasets from the TSE CKAN package. Each entry is
 * [directory, file stem] — the year is appended to the stem.
 */
const BULK_DATASETS = {
  coligacao:     ['consulta_coligacao', 'consulta_coligacao'],
  bens:          ['bem_candidato', 'bem_candidato'],
  redes_sociais: ['consulta_cand', 'rede_social_candidato'],
  cassacao:      ['motivo_cassacao', 'motivo_cassacao'],
  complementar:  ['consulta_cand_complementar', 'consulta_cand_complementar'],
} as const

export type BulkDataset = keyof typeof BULK_DATASETS

/** URL of the TSE government plan archive for one UF. 'BR' holds presidential plans. */
export function planArchiveUrl(year: number, uf: string): string {
  return `${CDN_BASE}/proposta_governo/proposta_governo_${year}_${uf.toUpperCase()}.zip`
}

/** URL of a national bulk dataset archive. These are not split by UF. */
export function bulkArchiveUrl(dataset: BulkDataset, year: number): string {
  const [dir, stem] = BULK_DATASETS[dataset]
  return `${CDN_BASE}/${dir}/${stem}_${year}.zip`
}

/**
 * TSE names plan files {year}{UF}{SQ_CANDIDATO}.pdf. SQ_CANDIDATO is the join
 * key back to candidacies.tse_sequencial.
 */
export function parsePlanFilename(filename: string): { year: number; uf: string; sequencial: string } | null {
  const base = filename.split('/').pop() ?? filename
  const match = /^(\d{4})([A-Z]{2})(\d{6,})\.pdf$/i.exec(base)
  if (!match) return null

  const [, year, uf, sequencial] = match
  return { year: Number(year), uf: uf.toUpperCase(), sequencial }
}
