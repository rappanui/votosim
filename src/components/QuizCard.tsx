'use client'

import { useState, useId } from 'react'
import type { TemaQuestionario, Resposta, Importancia } from '@/lib/types'

interface QuizCardProps {
  tema: TemaQuestionario
  initialResposta?: Resposta
  initialImportancia?: Importancia
  onChange: (resposta: Resposta, importancia: Importancia) => void
}

const IMPORTANCIA_LABELS: Record<number, string> = { 1: 'Baixa', 2: 'Média', 3: 'Alta' }

export function QuizCard({ tema, initialResposta, initialImportancia, onChange }: QuizCardProps) {
  const sliderId = useId()
  const [resposta, setResposta] = useState<Resposta>(initialResposta ?? 3)
  const [importancia, setImportancia] = useState<Importancia>(initialImportancia ?? 2)
  const [touched, setTouched] = useState(initialResposta !== undefined)
  const [showInfo, setShowInfo] = useState(false)

  function handleSliderChange(value: number) {
    const r = value as Resposta
    setResposta(r)
    if (!touched) setTouched(true)
    onChange(r, importancia)
  }

  function handleImportanciaChange(imp: Importancia) {
    setImportancia(imp)
    onChange(resposta, imp)
  }

  return (
    <div
      data-testid="quiz-card"
      className={`rounded-xl border p-4 shadow-sm transition-all ${
        touched ? 'border-highlight bg-white' : 'border-gray-200 bg-gray-50'
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

      <div className="mb-3 flex flex-col gap-1">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Discordo</span>
          <span>Concordo</span>
        </div>
        <input
          id={sliderId}
          type="range"
          role="slider"
          min={1}
          max={5}
          step={1}
          value={resposta}
          onChange={e => handleSliderChange(Number(e.target.value))}
          aria-label={`Concordância: ${tema.nome}`}
          className="h-2 w-full cursor-pointer accent-highlight"
        />
      </div>

      {touched && (
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
      )}
    </div>
  )
}
