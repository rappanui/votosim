import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { QuizProvider, useQuiz } from '@/context/QuizContext'
import RevisaoPage from '@/app/revisao/page'
import type { RespostaUsuario } from '@/lib/types'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

function renderWithRespostas(respostas: RespostaUsuario[]) {
  function Loader({ children }: { children: React.ReactNode }) {
    const { setResposta } = useQuiz()
    const [loaded, setLoaded] = React.useState(false)
    React.useEffect(() => {
      if (!loaded) {
        respostas.forEach(r => setResposta(r))
        setLoaded(true)
      }
    }, [loaded, setResposta])
    return <>{children}</>
  }
  return render(
    <QuizProvider>
      <Loader><RevisaoPage /></Loader>
    </QuizProvider>,
  )
}

describe('/revisao page', () => {
  beforeEach(() => { mockPush.mockClear() })

  it('disables Ver candidatos with 0 answers', () => {
    render(<QuizProvider><RevisaoPage /></QuizProvider>)
    expect(screen.getByRole('button', { name: /ver candidatos/i })).toBeDisabled()
  })

  it('disables Ver candidatos with 2 non-neutral answers', async () => {
    await act(async () => {
      renderWithRespostas([
        { temaSlug: 'reforma_tributaria', resposta: 5, concordancia: 'concordo', intensidade: 5 },
        { temaSlug: 'sus_saude_publica', resposta: 1, concordancia: 'discordo', intensidade: 1 },
        { temaSlug: 'privatizacao_estatais', resposta: 3, concordancia: 'neutro', intensidade: 3 },
      ])
    })
    expect(screen.getByRole('button', { name: /ver candidatos/i })).toBeDisabled()
  })

  it('enables Ver candidatos with 3 non-neutral answers', async () => {
    await act(async () => {
      renderWithRespostas([
        { temaSlug: 'reforma_tributaria', resposta: 5, concordancia: 'concordo', intensidade: 5 },
        { temaSlug: 'sus_saude_publica', resposta: 1, concordancia: 'discordo', intensidade: 1 },
        { temaSlug: 'privatizacao_estatais', resposta: 4, concordancia: 'concordo', intensidade: 4 },
      ])
    })
    expect(screen.getByRole('button', { name: /ver candidatos/i })).toBeEnabled()
  })
})
