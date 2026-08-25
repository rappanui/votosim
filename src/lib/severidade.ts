import type { AlertSeverity } from './types'

// Lower number = more severe. Reused from the same convention v_candidate_alerts
// already uses for ordem_exibicao — one severity scale, not two.
const ORDEM: Record<AlertSeverity, number> = { critica: 1, alta: 2, media: 3, baixa: 4 }

const ADJETIVO: Record<AlertSeverity, [singular: string, plural: string]> = {
  critica: ['crítico', 'críticos'],
  alta: ['alto', 'altos'],
  media: ['médio', 'médios'],
  baixa: ['baixo', 'baixos'],
}

const COR: Record<AlertSeverity, string> = {
  critica: 'text-danger',
  alta: 'text-warning',
  media: 'text-amber-700',
  baixa: 'text-gray-500',
}

/** null for an empty list — the caller decides what "nothing found" means,
 *  this function only ever reports on what is actually there. */
export function severidadeMaisAlta(itens: { severidade: AlertSeverity }[]): AlertSeverity | null {
  if (itens.length === 0) return null
  return itens.reduce<AlertSeverity>(
    (pior, item) => (ORDEM[item.severidade] < ORDEM[pior] ? item.severidade : pior),
    itens[0].severidade,
  )
}

/** Green when there is nothing to report — "0 encontrados" reads as good
 *  news, not as the same neutral gray a merely-low-severity find would get. */
export function corPorSeveridade(itens: { severidade: AlertSeverity }[]): string {
  const maisAlta = severidadeMaisAlta(itens)
  return maisAlta === null ? 'text-success' : COR[maisAlta]
}

/** "1 crítico e 2 médios detectados" — groups by severity (most severe
 *  first), singular/plural agreement on both the adjective and the closing
 *  verb, Oxford-comma style for three or more groups. Assumes itens is
 *  non-empty; the caller renders its own zero-state text ("Nenhum alerta"
 *  etc.) instead of calling this. */
export function rotuloPorSeveridade(itens: { severidade: AlertSeverity }[]): string {
  const porSeveridade = new Map<AlertSeverity, number>()
  for (const item of itens) {
    porSeveridade.set(item.severidade, (porSeveridade.get(item.severidade) ?? 0) + 1)
  }

  const ordenado = [...porSeveridade.entries()].sort(([a], [b]) => ORDEM[a] - ORDEM[b])
  const partes = ordenado.map(([sev, n]) => `${n} ${ADJETIVO[sev][n === 1 ? 0 : 1]}`)

  const enumeracao = partes.length <= 1
    ? (partes[0] ?? '')
    : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`

  const verbo = itens.length === 1 ? 'detectado' : 'detectados'
  return `${enumeracao} ${verbo}`
}
