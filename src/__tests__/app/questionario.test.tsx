import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuizProvider } from '@/context/QuizContext'
import QuestionarioPage from '@/app/questionario/page'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const MOCK_TEMAS = [
  {
    slug: 'reforma_tributaria',
    nome: 'Reforma Tributária',
    afirmacao_questionario: 'O sistema tributário deve ser reformado.',
    contexto_questionario: 'Contexto da reforma tributária.',
    nota_educativa: 'Competência do Congresso Nacional.',
  },
  {
    slug: 'sus_saude_publica',
    nome: 'Saúde Pública',
    afirmacao_questionario: 'O governo deve investir no SUS.',
    contexto_questionario: 'Contexto do SUS.',
    nota_educativa: 'Competência do governo federal e estados.',
  },
]

jest.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({ data: MOCK_TEMAS, error: null }),
        }),
      }),
    }),
  }),
}))

const renderWithProvider = () =>
  render(<QuizProvider><QuestionarioPage /></QuizProvider>)

describe('/questionario page', () => {
  beforeEach(() => { mockPush.mockClear() })

  it('renders the first question after loading', async () => {
    renderWithProvider()
    await waitFor(() => {
      expect(screen.getByText('O sistema tributário deve ser reformado.')).toBeInTheDocument()
    })
  })

  it('Próxima button is disabled before slider is moved', async () => {
    renderWithProvider()
    await waitFor(() => {
      expect(screen.getByText('O sistema tributário deve ser reformado.')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /próxima/i })).toBeDisabled()
  })

  it('Próxima button enables after slider is moved', async () => {
    renderWithProvider()
    await waitFor(() => {
      expect(screen.getByText('O sistema tributário deve ser reformado.')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } })
    expect(screen.getByRole('button', { name: /próxima/i })).toBeEnabled()
  })

  it('Pular advances to next question without requiring slider touch', async () => {
    renderWithProvider()
    await waitFor(() => {
      expect(screen.getByText('O sistema tributário deve ser reformado.')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /pular/i }))
    await waitFor(() => {
      expect(screen.getByText('O governo deve investir no SUS.')).toBeInTheDocument()
    })
  })
})
