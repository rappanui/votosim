import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QuizProvider, useQuiz } from '@/context/QuizContext'
import type { RespostaUsuario, VoterPosicao } from '@/lib/types'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QuizProvider>{children}</QuizProvider>
)

const makeResposta = (slug: string, posicao: VoterPosicao, importancia: 1 | 2 | 3 = 2): RespostaUsuario => ({
  temaSlug: slug,
  posicao,
  importancia,
})

describe('QuizContext', () => {
  it('starts with empty estado and no respostas', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    expect(result.current.estado).toBe('')
    expect(result.current.respostas).toHaveLength(0)
  })

  it('setEstado updates estado', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    act(() => { result.current.setEstado('SP') })
    expect(result.current.estado).toBe('SP')
  })

  it('setResposta adds a new answer', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    act(() => { result.current.setResposta(makeResposta('sus_saude_publica', 'favoravel')) })
    expect(result.current.respostas).toHaveLength(1)
    expect(result.current.respostas[0].importancia).toBe(2)
  })

  it('setResposta replaces existing answer for same slug', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    act(() => { result.current.setResposta(makeResposta('sus_saude_publica', 'favoravel', 3)) })
    act(() => { result.current.setResposta(makeResposta('sus_saude_publica', 'contrario', 1)) })
    expect(result.current.respostas).toHaveLength(1)
    expect(result.current.respostas[0].posicao).toBe('contrario')
    expect(result.current.respostas[0].importancia).toBe(1)
  })

  it('resetQuiz clears estado and respostas', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    act(() => { result.current.setEstado('RJ') })
    act(() => { result.current.setResposta(makeResposta('sus_saude_publica', 'favoravel')) })
    act(() => { result.current.resetQuiz() })
    expect(result.current.estado).toBe('')
    expect(result.current.respostas).toHaveLength(0)
  })

  it('throws when useQuiz is called outside QuizProvider', () => {
    expect(() => renderHook(() => useQuiz())).toThrow('useQuiz must be called inside <QuizProvider>')
  })

  it('does not have questionarioIndex or setPerfil', () => {
    const { result } = renderHook(() => useQuiz(), { wrapper })
    expect('questionarioIndex' in result.current).toBe(false)
    expect('setPerfil' in result.current).toBe(false)
  })
})
