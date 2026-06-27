import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QuizProvider, useQuiz } from '@/context/QuizContext'
import ResultadoPage from '@/app/resultado/page'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const MOCK_RESULT = {
  cargos: [{
    cargo: 'governador',
    candidatos: [{
      politicianId: 'uuid-1',
      nomeUrna: 'João Silva',
      partido: 'PT',
      score: 85,
      temasAlinhados: ['sus_saude_publica'],
      temasDivergentes: [],
      temAlertas: false,
      alertas: [],
    }],
  }],
  totalCandidatosAnalisados: 1,
  estado: 'SP',
}

// Renders ResultadoPage with a pre-populated perfil so the fetch path is exercised.
// Empty dep array prevents infinite loop caused by setPerfil being recreated on each render.
function renderWithPerfil() {
  function Loader({ children }: { children: React.ReactNode }) {
    const { setPerfil } = useQuiz()
    const [ready, setReady] = React.useState(false)
    React.useEffect(() => {
      setPerfil({ estado: 'SP', municipio: 'São Paulo', faixaEtaria: '25 a 34 anos' })
      setReady(true)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
    return ready ? <>{children}</> : null
  }
  return render(
    <QuizProvider>
      <Loader><ResultadoPage /></Loader>
    </QuizProvider>,
  )
}

beforeEach(() => {
  global.fetch = jest.fn()
  mockPush.mockClear()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('/resultado page', () => {
  it('shows loading spinner while fetching', () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}))
    render(<QuizProvider><ResultadoPage /></QuizProvider>)
    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
  })

  it('shows candidate name after successful fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESULT,
    })

    await act(async () => { renderWithPerfil() })
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
    })

    await act(async () => { renderWithPerfil() })
    await waitFor(() => {
      expect(screen.getByText(/erro/i)).toBeInTheDocument()
    })
  })
})
