'use client'

import { useState } from 'react'
import type { TemaCandidatoDetalhe, VoterPosicao } from '@/lib/types'

export const PREVIEW_COUNT = 4

// ── Moved verbatim from the v3 card (see Task 7 Step 1) ─────────────────────
// v3 owns the meaning of these states. Do not redesign them here.
// LegendaIcones.tsx documents them for the reader — keep the two in sync.

function getTemaIcon(d: TemaCandidatoDetalhe): string {
  if (d.voterPosicao === 'neutro' && d.voterImportancia >= 2) return '●'  // curious
  if (d.evidencia === 'ausente') return '○'                                // not audited
  if (d.alignment === null) return '○'
  if (d.alignment >= 0.75) return '✓'
  if (d.alignment <= 0.25) return '✗'
  if (d.alignment === 0.5 && d.neutroMotivo !== null) return '◐'           // audited, no side
  return '─'
}

function candidateLabel(d: TemaCandidatoDetalhe): string {
  if (d.evidencia === 'ausente') return 'não encontrado'
  if (d.neutroMotivo === 'nao_responde') return 'não responde à afirmação'
  if (d.neutroMotivo === 'ambivalente') return 'posição ambivalente'
  if (d.candidatePosicao === null) return 'não encontrado'
  if (d.candidatePosicao <= 2) return 'contrário'
  if (d.candidatePosicao >= 4) return 'favorável'
  return 'neutro'
}

function voterLabel(posicao: VoterPosicao): string {
  if (posicao === 'contrario') return 'contrário'
  if (posicao === 'favoravel') return 'favorável'
  return 'neutro'
}

// ── End of the v3-owned block ───────────────────────────────────────────────

/**
 * Themes worth showing: the ones the voter took a side on, plus the neutral
 * ones they still flagged as mattering. Exported so the card can tell whether
 * the panel would render anything at all without duplicating the rule.
 */
export function selectVisibleTemas(detalhes: TemaCandidatoDetalhe[]): TemaCandidatoDetalhe[] {
  return detalhes.filter(d => d.voterPosicao !== 'neutro' || d.voterImportancia >= 2)
}

interface TemasPanelProps {
  detalhes: TemaCandidatoDetalhe[]
}

/** Per-theme transparency list. Themes the voter took a side on come first —
 *  those are the only ones that moved the score. */
export function TemasPanel({ detalhes }: TemasPanelProps) {
  const [showAll, setShowAll] = useState(false)

  const visibleTemas = selectVisibleTemas(detalhes)
  const ordered = [...visibleTemas].sort((a, b) => {
    const aNeutro = a.voterPosicao === 'neutro' ? 1 : 0
    const bNeutro = b.voterPosicao === 'neutro' ? 1 : 0
    return aNeutro - bNeutro
  })
  const preview = showAll ? ordered : ordered.slice(0, PREVIEW_COUNT)

  if (visibleTemas.length === 0) return null

  return (
    <div>
      <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-400">
        Seus temas
      </p>

      <div className="divide-y divide-gray-100 border-t border-gray-100">
        {preview.map(d => (
          <div key={d.temaSlug} className="flex flex-col px-3 py-2">
            <div className="flex items-center gap-3">
              <span data-testid="tema-icone" className="w-4 shrink-0 text-center text-sm">
                {getTemaIcon(d)}
              </span>
              <span data-testid="tema-nome" className="flex-1 text-xs text-gray-700">
                {d.temaNome}
              </span>
              <span className="text-xs text-gray-400">
                você: {voterLabel(d.voterPosicao)} · candidato: <span>{candidateLabel(d)}</span>
              </span>
            </div>
            {(d.posicaoViaPartido || d.baixaConfianca) && (
              <div className="mt-1 flex flex-wrap items-center gap-1 pl-7">
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
              </div>
            )}
            {d.justificativa && (
              <p
                data-testid="tema-justificativa"
                className="mt-1 text-xs leading-relaxed text-gray-400"
              >
                {d.justificativa}
              </p>
            )}
          </div>
        ))}
      </div>

      {ordered.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="px-3 py-2 text-sm text-highlight underline"
        >
          {showAll ? 'Mostrar menos' : `Ver os ${ordered.length} temas`}
        </button>
      )}
    </div>
  )
}
