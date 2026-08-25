import type { AlertSeverity } from './types'

export type Genero = 'masc' | 'fem'

// Lower number = more severe. Reused from the same convention v_candidate_alerts
// already uses for ordem_exibicao, so there is one severity scale, not two.
const ORDEM: Record<AlertSeverity, number> = { critica: 1, alta: 2, media: 3, baixa: 4 }

// Triage vocabulary (leve/moderado/grave/critico), not the raw CVSS-style
// severity names (baixa/media/alta/critica). Chosen 2026-08-25: baixa/media/
// alta only read naturally with an explicit noun ("alerta de severidade
// baixa"), and this text elides the noun ("1 baixo detectado"), so most of
// the CVSS set reads oddly standalone. leve/moderado/grave/critico is the
// same progression ANVISA and WHO clinical-severity guidance use, built
// specifically to describe a case without naming it. leve and grave do not
// change form by gender; moderado and critico do.
const ADJETIVO: Record<AlertSeverity, Record<Genero, [singular: string, plural: string]>> = {
  critica: { masc: ['crítico', 'críticos'], fem: ['crítica', 'críticas'] },
  alta:    { masc: ['grave', 'graves'],     fem: ['grave', 'graves'] },
  media:   { masc: ['moderado', 'moderados'], fem: ['moderada', 'moderadas'] },
  baixa:   { masc: ['leve', 'leves'],       fem: ['leve', 'leves'] },
}

const DETECTADO: Record<Genero, [singular: string, plural: string]> = {
  masc: ['detectado', 'detectados'],
  fem: ['detectada', 'detectadas'],
}

const COR: Record<AlertSeverity, string> = {
  critica: 'text-danger',
  alta: 'text-warning',
  media: 'text-amber-700',
  baixa: 'text-gray-500',
}

/** null for an empty list. The caller decides what "nothing found" means,
 *  this function only ever reports on what is actually there. */
export function severidadeMaisAlta(itens: { severidade: AlertSeverity }[]): AlertSeverity | null {
  if (itens.length === 0) return null
  return itens.reduce<AlertSeverity>(
    (pior, item) => (ORDEM[item.severidade] < ORDEM[pior] ? item.severidade : pior),
    itens[0].severidade,
  )
}

/** Green when there is nothing to report: "0 detectados" reads as good news,
 *  not as the same neutral gray a merely-low-severity find would get. */
export function corPorSeveridade(itens: { severidade: AlertSeverity }[]): string {
  const maisAlta = severidadeMaisAlta(itens)
  return maisAlta === null ? 'text-success' : COR[maisAlta]
}

/** Singular label for one severity value, e.g. "Severidade: {rotuloSeveridade
 *  (a.severidade, 'fem')}" next to a badge. Capitalize at the call site. */
export function rotuloSeveridade(severidade: AlertSeverity, genero: Genero): string {
  return ADJETIVO[severidade][genero][0]
}

/** "1 crítico e 2 moderados detectados", or "0 detectados" for an empty
 *  list: quantity, severity level and the closing verb are three
 *  independent parts, so an empty list states the quantity and drops the
 *  level instead of inventing one. Groups by severity, most severe first,
 *  singular/plural agreement on both the adjective and the closing verb,
 *  Oxford-comma style for three or more groups. `genero` picks masculine
 *  (for alertas) or feminine (for observações) agreement throughout. */
export function rotuloPorSeveridade(itens: { severidade: AlertSeverity }[], genero: Genero): string {
  const [detectadoSingular, detectadoPlural] = DETECTADO[genero]
  if (itens.length === 0) return `0 ${detectadoPlural}`

  const porSeveridade = new Map<AlertSeverity, number>()
  for (const item of itens) {
    porSeveridade.set(item.severidade, (porSeveridade.get(item.severidade) ?? 0) + 1)
  }

  const ordenado = [...porSeveridade.entries()].sort(([a], [b]) => ORDEM[a] - ORDEM[b])
  const partes = ordenado.map(([sev, n]) => `${n} ${ADJETIVO[sev][genero][n === 1 ? 0 : 1]}`)

  const enumeracao = partes.length <= 1
    ? (partes[0] ?? '')
    : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`

  const verbo = itens.length === 1 ? detectadoSingular : detectadoPlural
  return `${enumeracao} ${verbo}`
}
