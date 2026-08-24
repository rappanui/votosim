'use client'

import { useState } from 'react'
import { AlertasBloco } from './AlertasBloco'
import { CandidatoResumo } from './CandidatoResumo'
import { FontesBloco } from './FontesBloco'
import { ObservacoesBloco } from './ObservacoesBloco'
import { TemasPanel, selectVisibleTemas } from './TemasPanel'
import { P_NAO_INFORMADO_PCT } from '@/lib/types'
import type { CandidatoResultado } from '@/lib/types'

const CARGO_LABELS: Record<string, string> = {
  presidente:         'Presidente',
  governador:         'Governador',
  senador:            'Senador',
  deputado_federal:   'Deputado Federal',
  deputado_estadual:  'Deputado Estadual',
  deputado_distrital: 'Deputado Distrital',
}

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

/** One candidate result. Collapsed it states the penalised score, both coverage
 *  metrics, and how many alerts and observations exist. Expanded it opens the
 *  audit line across the full width, then a two-column panel: themes with their
 *  justifications on the left, profile and evidence on the right. */
export function CandidatoCard({ candidato }: CandidatoCardProps) {
  const [expanded, setExpanded] = useState(false)
  const barColor = getBarColor(candidato.alinhamento)

  const visibleTemas = selectVisibleTemas(candidato.detalhesTemas)
  const temTemas = visibleTemas.length > 0

  const nAlertas = candidato.alertas.length
  const nObservacoes = candidato.observacoes.length
  const cargoLabel = CARGO_LABELS[candidato.cargo] ?? candidato.cargo

  // The alert counter always shows — "Nenhum alerta" is itself information.
  // The observation counter is omitted at zero: nothing to caveat is the
  // default state, not a finding.
  const alertaLabel = nAlertas === 0
    ? 'Nenhum alerta'
    : `${nAlertas} ${nAlertas === 1 ? 'alerta encontrado' : 'alertas encontrados'}`
  const observacaoLabel =
    `${nObservacoes} ${nObservacoes === 1 ? 'observação encontrada' : 'observações encontradas'}`

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-primary">{candidato.nomeUrna}</p>
          <p className="text-sm text-gray-500">
            <span>{candidato.partido}</span>
            {candidato.numeroUrna && ` · nº ${candidato.numeroUrna}`}
            {` · ${cargoLabel}`}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span
              className={`inline-flex items-center gap-1 ${
                nAlertas > 0 ? 'font-semibold text-danger' : 'text-gray-400'
              }`}
            >
              <span aria-hidden="true">⚠</span>
              <span>{alertaLabel}</span>
            </span>
            {nObservacoes > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-warning">
                <span aria-hidden="true">ⓘ</span>
                <span>{observacaoLabel}</span>
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xl font-bold leading-tight text-primary">{candidato.alinhamento}%</p>
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

      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-1 text-sm text-highlight underline"
      >
        {expanded ? '▲ Ocultar detalhes' : '▼ Ver detalhes'}
      </button>

      {expanded && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          {/* The audit line explains the headline percentage, which exists
              whether or not any theme row survives the filter — so it renders
              on every expand, and above the split rather than inside a column. */}
          <p
            data-testid="audit-line"
            className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500"
          >
            {candidato.alinhamento}% = {candidato.confiancaResultado}% do que importa pra você
            {' × '}{candidato.alinhamentoApurado}% de alinhamento nesses temas
            {' + '}{100 - candidato.confiancaResultado}% não apurado, contado como {P_NAO_INFORMADO_PCT}%
          </p>

          <div
            data-testid="detalhe-colunas"
            className={`grid grid-cols-1 gap-4 ${temTemas ? 'md:grid-cols-[1.35fr_1fr]' : ''}`}
          >
            {/* TemasPanel draws its own border-t but no box, so the card keeps
                supplying the frame it was extracted from. Omitted entirely when
                no theme survives the filter, to avoid an empty bordered box —
                the column split collapses with it. */}
            {temTemas && (
              <div className="rounded-lg border border-gray-100">
                <TemasPanel detalhes={candidato.detalhesTemas} />
              </div>
            )}

            <div className="flex flex-col gap-3">
              {/* CandidatoResumo is always open and draws no frame of its own;
                  the card boxes it so it sits level with the accordions below. */}
              {candidato.dossie && (
                <div className="rounded-lg border border-gray-100 px-4 py-3">
                  <CandidatoResumo dossie={candidato.dossie} />
                </div>
              )}
              <AlertasBloco alertas={candidato.alertas} />
              <ObservacoesBloco observacoes={candidato.observacoes} />
              <FontesBloco fontes={candidato.fontes} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
