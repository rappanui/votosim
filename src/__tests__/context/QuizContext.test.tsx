import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QuizProvider, useQuiz } from '@/context/QuizContext'
import type { RespostaUsuario } from '@/lib/types'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QuizProvider>{children}</QuizProvider>
)

const makeResposta = (slug: string, resposta: 1 | 2 | 3 | 4 | 5): RespostaUsuario => ({
  temaSlug: slug,
  resposta,
  concordancia: resposta <= 2 ? 'discordo' : resposta === 3 ? 'neutro' : 'concordo',
  intensidade: resposta,
})

describe('QuizContext', () => {
  it('starts with empty respostas and index 0', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    expect(result.current.respostas).toHaveLength(0)
    expect(result.current.questionarioIndex).toBe(0)
  })

  it('adds a new answer', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    act(() => { result.current.setResposta(makeResposta('sus_saude_publica', 5)) })
    expect(result.current.respostas).toHaveLength(1)
  })

  it('replaces existing answer for the same slug', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    act(() => { result.current.setResposta(makeResposta('sus_saude_publica', 5)) })
    act(() => { result.current.setResposta(makeResposta('sus_saude_publica', 2)) })
    expect(result.current.respostas).toHaveLength(1)
    expect(result.current.respostas[0].resposta).toBe(2)
  })

  it('updates questionarioIndex', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    act(() => { result.current.setQuestionarioIndex(5) })
    expect(result.current.questionarioIndex).toBe(5)
  })

  it('resets all state on resetQuiz', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    act(() => { result.current.setPerfil({ estado: 'SP' }) })
    act(() => { result.current.setResposta(makeResposta('sus_saude_publica', 5)) })
    act(() => { result.current.setQuestionarioIndex(3) })
    act(() => { result.current.resetQuiz() })
    expect(result.current.respostas).toHaveLength(0)
    expect(result.current.questionarioIndex).toBe(0)
    expect(result.current.perfil.estado).toBeUndefined()
  })

  it('throws when useQuiz is called outside QuizProvider', () => {
    expect(() => renderHook(() => useQuiz())).toThrow('useQuiz must be called inside <QuizProvider>')
  })
})
