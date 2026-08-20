/** One stored party position, reduced to what the audit needs. */
export interface PartyPositionRow {
  sigla: string
  posicao: string
}

/** Result of auditing a single party's stored positions. */
export interface PartyVerdict {
  sigla: string
  themeCount: number
  distinctStances: number
  allFavoravel: boolean
  dominantShare: number
  passes: boolean
}

/** Minimum themes a party must cover to be usable as a match fallback. */
export const MIN_THEMES = 10

/** No single stance may cover more than this share of a party's themes. */
export const MAX_DOMINANT_SHARE = 0.80

/**
 * Judges whether one party's stored positions are real data or the original
 * defect: a propaganda document read as "favoravel" on everything.
 */
export function auditParty(
  sigla: string,
  rows: PartyPositionRow[],
  minThemes: number = MIN_THEMES,
): PartyVerdict {
  const stances = rows.map(r => r.posicao)
  const themeCount = stances.length
  const distinctStances = new Set(stances).size
  const allFavoravel = themeCount > 0 && stances.every(s => s === 'favoravel')

  // Calculate dominant stance share
  let dominantShare = 0
  if (themeCount > 0) {
    const stanceCounts = new Map<string, number>()
    for (const stance of stances) {
      stanceCounts.set(stance, (stanceCounts.get(stance) ?? 0) + 1)
    }
    const maxCount = Math.max(...Array.from(stanceCounts.values()))
    dominantShare = maxCount / themeCount
  }

  const passes = themeCount >= minThemes && distinctStances >= 2 && !allFavoravel && dominantShare <= MAX_DOMINANT_SHARE

  return { sigla, themeCount, distinctStances, allFavoravel, dominantShare, passes }
}

/** Aggregates per-party verdicts into the go/no-go decision for the fallback. */
export function summarizeAudit(verdicts: PartyVerdict[]): {
  total: number
  passing: number
  gatePasses: boolean
} {
  const passing = verdicts.filter(v => v.passes).length
  return { total: verdicts.length, passing, gatePasses: passing > 0 }
}
