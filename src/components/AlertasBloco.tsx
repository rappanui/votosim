import { Acordeao } from './Acordeao'
import { AlertaBadge } from './AlertaBadge'
import type { Alerta } from '@/lib/types'

interface AlertasBlocoProps {
  alertas: Alerta[]
}

/** Documented misconduct, investigations and curated controversies.
 *  Renders nothing when there are none: an empty block would imply the pipeline
 *  looked and found nothing, which is not what absence means here. */
export function AlertasBloco({ alertas }: AlertasBlocoProps) {
  if (alertas.length === 0) return null

  return (
    <Acordeao titulo="Alertas" contador={alertas.length} contadorClassName="text-danger">
      {alertas.map((alerta, i) => (
        <div key={`${alerta.tipo}-${i}`} className="mb-4 last:mb-0">
          <AlertaBadge alerta={alerta} />
          <p className="mt-2 text-sm font-semibold text-gray-700">{alerta.titulo}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{alerta.descricao}</p>
          {!alerta.ativo && alerta.resolucao && (
            <p className="mt-1 rounded bg-gray-50 px-2 py-1 text-[13px] leading-relaxed text-gray-600">
              <span className="font-semibold text-gray-700">Resolvido: </span>
              {alerta.resolucao}
            </p>
          )}
          <a
            href={alerta.fonteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs text-highlight underline"
          >
            Ver fonte ↗
          </a>
        </div>
      ))}
    </Acordeao>
  )
}
