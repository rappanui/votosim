import { render, screen } from '@testing-library/react'
import QuizPage from '@/app/quiz/page'
import type { RespostaUsuario, VoterPosicao } from '@/lib/types'

const pushMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

/** Mutable so each test can set the quiz state it needs. */
const quizState = { estado: '', respostas: [] as RespostaUsuario[] }

jest.mock('@/context/QuizContext', () => ({
  useQuiz: () => ({
    estado: quizState.estado,
    respostas: quizState.respostas,
    setEstado: jest.fn(),
    setResposta: jest.fn(),
    resetQuiz: jest.fn(),
  }),
}))

jest.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [{
              slug: 'saude_sus',
              nome: 'Saúde pública',
              afirmacao_questionario: 'O SUS deve receber mais orçamento.',
              contexto_questionario: 'Contexto.',
              nota_educativa: 'Nota.',
            }],
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

function resposta(slug: string, posicao: VoterPosicao): RespostaUsuario {
  return { temaSlug: slug, posicao, importancia: 2 }
}

/** The page loads its questions in an effect, so every assertion waits for it. */
async function renderQuiz() {
  render(<QuizPage />)
  return screen.findByTestId('quiz-gate').catch(() => null)
}

beforeEach(() => {
  quizState.estado = ''
  quizState.respostas = []
  pushMock.mockClear()
})

describe('QuizPage — the submit gate', () => {
  it('asks for the state first, without showing a question counter', async () => {
    quizState.respostas = [resposta('a', 'favoravel'), resposta('b', 'favoravel')]
    await renderQuiz()

    const gate = await screen.findByTestId('quiz-gate')
    expect(gate).toHaveTextContent(/Selecione seu estado/)
    expect(gate.textContent).not.toMatch(/\d+\/\d+/)
  })

  it('states the requirement as a fixed rule with a counter, not a countdown', async () => {
    quizState.estado = 'SP'
    quizState.respostas = [resposta('a', 'favoravel')]
    await renderQuiz()

    const gate = await screen.findByTestId('quiz-gate')
    expect(gate).toHaveTextContent('(1/3)')
    expect(gate).toHaveTextContent(/Responda ao menos 3 perguntas para continuar/)
    // The old copy said "Responda ao menos 2 perguntas" here — a countdown
    // phrased as an absolute, which read as if only 2 were ever required.
    expect(gate.textContent).not.toMatch(/ao menos 2 pergunta/)
  })

  it('tells the voter that neutral answers do not count', async () => {
    quizState.estado = 'SP'
    await renderQuiz()

    expect(await screen.findByTestId('quiz-gate')).toHaveTextContent(/neutras não contam/i)
  })

  // The bug this gate change exists to close: match v3 keeps a voter-neutral
  // theme out of both score denominators, so three neutrals used to clear the
  // gate and produce a results page where every candidate scored zero and the
  // MIN_SCORE_THRESHOLD filter removed all of them.
  it('does not count neutral answers toward the minimum', async () => {
    quizState.estado = 'SP'
    quizState.respostas = [
      resposta('a', 'neutro'),
      resposta('b', 'neutro'),
      resposta('c', 'neutro'),
    ]
    await renderQuiz()

    expect(await screen.findByTestId('quiz-gate')).toHaveTextContent('(0/3)')
    expect(screen.getByRole('button', { name: /Ver candidatos/ })).toBeDisabled()
  })

  it('counts only the non-neutral answers when both kinds are present', async () => {
    quizState.estado = 'SP'
    quizState.respostas = [
      resposta('a', 'favoravel'),
      resposta('b', 'neutro'),
      resposta('c', 'contrario'),
    ]
    await renderQuiz()

    expect(await screen.findByTestId('quiz-gate')).toHaveTextContent('(2/3)')
    expect(screen.getByRole('button', { name: /Ver candidatos/ })).toBeDisabled()
  })

  it('drops the notice and enables the button once three non-neutral answers exist', async () => {
    quizState.estado = 'SP'
    quizState.respostas = [
      resposta('a', 'favoravel'),
      resposta('b', 'contrario'),
      resposta('c', 'favoravel'),
    ]
    render(<QuizPage />)

    const botao = await screen.findByRole('button', { name: /Ver candidatos/ })
    expect(botao).toBeEnabled()
    expect(screen.queryByTestId('quiz-gate')).not.toBeInTheDocument()
  })
})
