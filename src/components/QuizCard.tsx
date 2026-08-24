'use client'

import { useState } from 'react'
import type { TemaQuestionario, VoterPosicao, Importancia } from '@/lib/types'

interface QuizCardProps {
  tema: TemaQuestionario
  initialPosicao?: VoterPosicao | null
  initialImportancia?: Importancia
  onChange: (posicao: VoterPosicao, importancia: Importancia) => void
}

const POSICAO_BUTTONS: Array<{ value: VoterPosicao; label: string }> = [
  { value: 'contrario', label: 'Discordo' },
  { value: 'neutro',    label: 'Neutro'   },
  { value: 'favoravel', label: 'Concordo' },
]

const IMPORTANCIA_LABELS: Record<number, string> = { 1: 'Baixa', 2: 'Média', 3: 'Alta' }

export function QuizCard({ tema, initialPosicao, initialImportancia, onChange }: QuizCardProps) {
  const [posicao, setPosicao] = useState<VoterPosicao | null>(initialPosicao ?? null)
  const [importancia, setImportancia] = useState<Importancia>(initialImportancia ?? 2)
  const [showInfo, setShowInfo] = useState(false)

  function handlePosicaoChange(p: VoterPosicao) {
    setPosicao(p)
    onChange(p, importancia)
  }

  function handleImportanciaChange(imp: Importancia) {
    setImportancia(imp)
    if (posicao !== null) onChange(posicao, imp)
  }

  return (
    <div
      data-testid="quiz-card"
      className={`rounded-xl border p-4 shadow-sm transition-all ${
        posicao !== null ? 'border-highlight bg-white' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-primary leading-snug">{tema.nome}</p>
        <button
          type="button"
          aria-label="Informações sobre este tema"
          onClick={() => setShowInfo(v => !v)}
          className="shrink-0 text-gray-400 hover:text-highlight"
        >
          ⓘ
        </button>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-gray-700">{tema.afirmacaoQuestionario}</p>

      {showInfo && (
        <div className="mb-4 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600 leading-relaxed">
          <p className="mb-1 font-medium">{tema.notaEducativa}</p>
          <p>{tema.contextoQuestionario}</p>
        </div>
      )}

      <div className="mb-3 flex gap-2">
        {POSICAO_BUTTONS.map(btn => (
          <button
            key={btn.value}
            type="button"
            onClick={() => handlePosicaoChange(btn.value)}
            aria-pressed={posicao === btn.value}
            className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-all ${
              posicao === btn.value
                ? 'border-highlight bg-highlight text-white'
                : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {posicao !== null && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-gray-500">Quão importante é este tema para você?</p>
          <div className="flex gap-2">
            {([1, 2, 3] as Importancia[]).map(imp => (
              <button
                key={imp}
                type="button"
                onClick={() => handleImportanciaChange(imp)}
                aria-pressed={importancia === imp}
                className={`flex-1 rounded-lg border py-1 text-xs font-medium transition-all ${
                  importancia === imp
                    ? 'border-highlight bg-highlight text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-400'
                }`}
              >
                {IMPORTANCIA_LABELS[imp]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
