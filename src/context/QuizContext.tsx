'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { RespostaUsuario } from '@/lib/types'

interface Perfil {
  estado?: string
  municipio?: string
  faixaEtaria?: string
}

export interface QuizState {
  perfil: Perfil
  respostas: RespostaUsuario[]
  questionarioIndex: number
  setPerfil: (partial: Partial<Perfil>) => void
  setResposta: (resposta: RespostaUsuario) => void
  setQuestionarioIndex: (index: number) => void
  resetQuiz: () => void
}

const QuizContext = createContext<QuizState | null>(null)

/** Provides quiz state to all children. Must wrap the root layout. */
export function QuizProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil>({})
  const [respostas, setRespostas] = useState<RespostaUsuario[]>([])
  const [questionarioIndex, setQuestionarioIndex] = useState(0)

  function updatePerfil(partial: Partial<Perfil>) {
    setPerfil(prev => ({ ...prev, ...partial }))
  }

  function setResposta(nova: RespostaUsuario) {
    setRespostas(prev => [
      ...prev.filter(r => r.temaSlug !== nova.temaSlug),
      nova,
    ])
  }

  function resetQuiz() {
    setPerfil({})
    setRespostas([])
    setQuestionarioIndex(0)
  }

  return (
    <QuizContext.Provider value={{
      perfil,
      respostas,
      questionarioIndex,
      setPerfil: updatePerfil,
      setResposta,
      setQuestionarioIndex,
      resetQuiz,
    }}>
      {children}
    </QuizContext.Provider>
  )
}

/**
 * Access quiz state from any client component inside QuizProvider.
 * Throws if called outside the provider — catches wiring errors at development time.
 */
export function useQuiz(): QuizState {
  const ctx = useContext(QuizContext)
  if (!ctx) throw new Error('useQuiz must be called inside <QuizProvider>')
  return ctx
}
