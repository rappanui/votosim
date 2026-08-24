'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { RespostaUsuario } from '@/lib/types'

export interface QuizState {
  estado: string
  respostas: RespostaUsuario[]  // only themes the voter actively answered
  setEstado: (estado: string) => void
  setResposta: (resposta: RespostaUsuario) => void
  resetQuiz: () => void
}

const QuizContext = createContext<QuizState | null>(null)

export function QuizProvider({ children }: { children: ReactNode }) {
  const [estado, setEstadoState] = useState('')
  const [respostas, setRespostas] = useState<RespostaUsuario[]>([])

  function setEstado(e: string) {
    setEstadoState(e)
  }

  function setResposta(nova: RespostaUsuario) {
    setRespostas(prev => [
      ...prev.filter(r => r.temaSlug !== nova.temaSlug),
      nova,
    ])
  }

  function resetQuiz() {
    setEstadoState('')
    setRespostas([])
  }

  return (
    <QuizContext.Provider value={{ estado, respostas, setEstado, setResposta, resetQuiz }}>
      {children}
    </QuizContext.Provider>
  )
}

export function useQuiz(): QuizState {
  const ctx = useContext(QuizContext)
  if (!ctx) throw new Error('useQuiz must be called inside <QuizProvider>')
  return ctx
}
