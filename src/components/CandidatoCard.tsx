'use client'

import { useState } from 'react'
import { AlertaBadge } from './AlertaBadge'
import type { CandidatoResultado, TemaCandidatoDetalhe, VoterPosicao } from '@/lib/types'

function getBarColor(alinhamento: number): string {
  if (alinhamento >= 75) return 'bg-success'
  if (alinhamento >= 50) return 'bg-amber-500'
  if (alinhamento >= 25) return 'bg-warning'
  return 'bg-danger'
}

function getTemaIcon(d: TemaCandidatoDetalhe): string {
  if (d.voterPosicao === 'neutro' && d.voterImportancia >= 2) return '●'  // curious
  if (d.alignment === null) return '○'                                      // no data
  if (d.alignment >= 0.75) return '✓'                                       // aligned
  if (d.alignment <= 0.25) return '✗'                                       // divergent
  return '─'                                                                 // partial
}

function candidateLabel(posicao: number | null): string {
  if (posicao === null) return '—'
  if (posicao <= 2) return 'contrário'
  if (posicao >= 4) return 'favorável'
  return 'neutro'
}

function voterLabel(posicao: VoterPosicao): string {
  if (posicao === 'contrario') return 'contrário'
  if (posicao === 'favoravel') return 'favorável'
  return 'neutro'
}

interface CandidatoCardProps {
  candidato: CandidatoResultado
}

export function CandidatoCard({ candidato }: CandidatoCardProps) {
  const [expanded, setExpanded] = useState(false)
  const barColor = getBarColor(candidato.alinhamento)

  const visibleTemas = candidato.detalhesTemas.filter(
    d => d.voterPosicao !== 'neutro' || d.voterImportancia >= 2,
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">{candidato.nomeUrna}</p>
          <p className="text-sm text-gray-500">{candidato.partido}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-primary">{candidato.alinhamento}%</p>
          <p className="text-xs text-gray-400">cobertura {candidato.cobertura}%</p>
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
          {visibleTemas.map(d => (
            <div key={d.temaSlug} className="flex items-center gap-3 px-3 py-2">
              <span className="w-4 shrink-0 text-center text-sm">{getTemaIcon(d)}</span>
              <span className="flex-1 text-xs text-gray-700">
                {d.temaSlug.replace(/_/g, ' ')}
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                você: {voterLabel(d.voterPosicao)} · candidato: {candidateLabel(d.candidatePosicao)}
                {d.posicaoViaPartido && (
                  <span className="rounded bg-blue-50 px-1 py-0.5 text-xs font-medium text-blue-600">
                    partido
                  </span>
                )}
                {d.baixaConfianca && (
                  <span
                    title="Esta classificação foi gerada por IA e ainda não passou por revisão humana."
                    className="rounded bg-amber-50 px-1 py-0.5 text-xs font-medium text-amber-700"
                  >
                    classificação não revisada
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
