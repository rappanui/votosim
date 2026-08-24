'use client'

import { useState } from 'react'
import { AlertaBadge } from './AlertaBadge'
import { TemasPanel, selectVisibleTemas } from './TemasPanel'
import { P_NAO_INFORMADO_PCT } from '@/lib/types'
import type { CandidatoResultado } from '@/lib/types'

// Penalised scores concentrate in the 20–60% range, so the thresholds are
// recalibrated relative to the pre-v3 bar (which used 75/50/25) to avoid
// painting nearly every card red.
function getBarColor(alinhamento: number): string {
  if (alinhamento >= 55) return 'bg-success'
  if (alinhamento >= 35) return 'bg-amber-500'
  if (alinhamento >= 20) return 'bg-warning'
  return 'bg-danger'
}

interface CandidatoCardProps {
  candidato: CandidatoResultado
}

export function CandidatoCard({ candidato }: CandidatoCardProps) {
  const [expanded, setExpanded] = useState(false)
  const barColor = getBarColor(candidato.alinhamento)

  const visibleTemas = selectVisibleTemas(candidato.detalhesTemas)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">{candidato.nomeUrna}</p>
          <p className="text-sm text-gray-500">{candidato.partido}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-primary">{candidato.alinhamento}%</p>
          <p className="text-xs text-gray-400">
            cobertura {candidato.cobertura}% · confiança {candidato.confiancaResultado}%
          </p>
        </div>
      </div>

      <div className="mb-3 h-2 w-full rounded-full bg-gray-100">
        <div
          data-testid="alinhamento-bar"
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${candidato.alinhamento}%` }}
        />
      </div>

      {candidato.temAlertas && candidato.alertas.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {candidato.alertas.map((alerta, i) => (
            <div key={`${alerta.tipo}-${i}`} className="flex items-center gap-2">
              <AlertaBadge alerta={alerta} />
              <span className="text-xs text-gray-700">{alerta.titulo}</span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-xs text-blue-600 underline"
      >
        {expanded ? '▲ Ocultar detalhes' : '▼ Ver detalhes por tema'}
      </button>

      {expanded && visibleTemas.length > 0 && (
        <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100">
          <p data-testid="audit-line" className="px-3 py-2 text-xs leading-relaxed text-gray-500">
            {candidato.alinhamento}% = {candidato.confiancaResultado}% do que importa pra você
            {' × '}{candidato.alinhamentoApurado}% de alinhamento nesses temas
            {' + '}{100 - candidato.confiancaResultado}% não apurado, contado como {P_NAO_INFORMADO_PCT}%
          </p>
          <TemasPanel detalhes={candidato.detalhesTemas} />
        </div>
      )}
    </div>
  )
}
