import { Acordeao } from './Acordeao'
import type { Fonte } from '@/lib/types'

const CAMADA_LABELS: Record<1 | 2 | 3, string> = {
  1: 'oficial',
  2: 'imprensa',
  3: 'checagem',
}

/** Sources carry acessado_em so the card can state when it read them — a link
 *  that has since rotted was still real on that date. Returns '' on a
 *  malformed timestamp so the caller can omit the line instead of showing
 *  "NaN/NaN/NaN" to a voter. */
function formatarData(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dia = String(d.getUTCDate()).padStart(2, '0')
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getUTCFullYear()}`
}

interface FontesBlocoProps {
  fontes: Fonte[]
}

export function FontesBloco({ fontes }: FontesBlocoProps) {
  if (fontes.length === 0) return null

  // Lexicographic sort works because acessadoEm is ISO-8601: same-width
  // fields ordered largest-to-smallest sort identically as strings and as
  // dates, so no Date parsing is needed to find the most recent one.
  const maisRecente = fontes.map(f => f.acessadoEm).sort().at(-1) as string
  const dataConsulta = formatarData(maisRecente)

  return (
    <Acordeao titulo="Fontes" contador={fontes.length}>
      {fontes.map(f => (
        <div key={f.id} className="mb-2 flex items-baseline gap-2 last:mb-0">
          <span className="w-16 shrink-0 text-xs text-gray-400">{CAMADA_LABELS[f.camada] ?? 'outra'}</span>
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-[13px] text-highlight underline"
          >
            {f.titulo ?? f.veiculo ?? f.url}
          </a>
        </div>
      ))}
      {dataConsulta !== '' && (
        <p className="mt-3 text-xs text-gray-400">Consultadas em {dataConsulta}</p>
      )}
    </Acordeao>
  )
}
