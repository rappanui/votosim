import { AlertaBadge } from './AlertaBadge'
import type { CandidatoResultado } from '@/lib/types'

const getScoreBarColor = (score: number): string => {
  if (score >= 75) return 'bg-success'
  if (score >= 50) return 'bg-amber-500'
  if (score >= 25) return 'bg-warning'
  return 'bg-danger'
}

interface CandidatoCardProps {
  candidato: CandidatoResultado
}

/**
 * Displays a candidate's match result: name, party, score bar, alignment summary, and alerts.
 * Never uses language implying a vote recommendation.
 */
export function CandidatoCard({ candidato }: CandidatoCardProps) {
  const scoreColor = getScoreBarColor(candidato.score)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">{candidato.nomeUrna}</p>
          <p className="text-sm text-gray-500">{candidato.partido}</p>
        </div>
        <span className="text-2xl font-bold text-primary">{candidato.score}%</span>
      </div>

      <div className="mb-3 h-2 w-full rounded-full bg-gray-100">
        <div
          data-testid="score-bar"
          className={`h-2 rounded-full transition-all ${scoreColor}`}
          style={{ width: `${candidato.score}%` }}
        />
      </div>

      {candidato.temasAlinhados.length > 0 && (
        <p className="mb-1 text-xs text-gray-500">
          <span className="font-medium text-success">Alinhado em: </span>
          {candidato.temasAlinhados.join(', ').replace(/_/g, ' ')}
        </p>
      )}

      {candidato.temasDivergentes.length > 0 && (
        <p className="mb-3 text-xs text-gray-500">
          <span className="font-medium text-danger">Divergente em: </span>
          {candidato.temasDivergentes.join(', ').replace(/_/g, ' ')}
        </p>
      )}

      {candidato.temAlertas && candidato.alertas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidato.alertas.map((alerta, i) => (
            <AlertaBadge key={`${alerta.tipo}-${i}`} alerta={alerta} />
          ))}
        </div>
      )}
    </div>
  )
}
