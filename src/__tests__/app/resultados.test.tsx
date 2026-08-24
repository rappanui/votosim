import { render, screen } from '@testing-library/react'
import ResultadosPage from '@/app/resultados/page'

const pushMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

jest.mock('@/context/QuizContext', () => ({
  useQuiz: () => ({
    estado: 'SP',
    respostas: [],
    setEstado: jest.fn(),
    setResposta: jest.fn(),
    resetQuiz: jest.fn(),
  }),
}))

/** The exact shape the stale deployment returned on 2026-08-24. */
const respostaPreV3 = {
  cargos: [{
    cargo: 'presidente',
    candidatos: [{
      politicianId: 'p1', nomeUrna: 'VETERINÁRIO WILSON GRASSI', partido: 'DEMOCRATA',
      alinhamento: 90, cobertura: 36,
      detalhesTemas: [], temAlertas: false, alertas: [],
    }],
  }],
  totalCandidatosAnalisados: 1,
  estado: 'SP',
}

function mockFetchJson(body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  }) as unknown as typeof fetch
}

let consoleErrorSpy: jest.SpyInstance

beforeEach(() => {
  pushMock.mockClear()
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
  jest.restoreAllMocks()
})

describe('ResultadosPage — stale contract', () => {
  it('refuses to render and explains why when the response predates this build', async () => {
    mockFetchJson(respostaPreV3)

    render(<ResultadosPage />)

    expect(await screen.findByText(/formato antigo/)).toBeInTheDocument()
    expect(screen.getByText(/publique a Edge Function antes do app/)).toBeInTheDocument()
  })

  it('renders no percentage and no candidate at all in the stale state', async () => {
    mockFetchJson(respostaPreV3)

    const { container } = render(<ResultadosPage />)
    await screen.findByText(/formato antigo/)

    // A partial render is exactly how a wrong 90% reaches a voter.
    expect(container.textContent).not.toMatch(/\d+\s*%/)
    expect(screen.queryByText(/WILSON GRASSI/)).not.toBeInTheDocument()
  })

  it('logs the missing field name for the operator', async () => {
    mockFetchJson(respostaPreV3)

    render(<ResultadosPage />)
    await screen.findByText(/formato antigo/)

    // The voter reads pt-BR prose; the operator gets the field that was absent.
    // alinhamentoApurado is the first field the pre-v3 shape does not carry.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('contrato desatualizado'),
      'alinhamentoApurado',
    )
  })

  it('does not show the connection error for a stale contract', async () => {
    mockFetchJson(respostaPreV3)

    render(<ResultadosPage />)
    await screen.findByText(/formato antigo/)

    expect(screen.queryByText(/Verifique sua conexão/)).not.toBeInTheDocument()
  })
})

describe('ResultadosPage — request failure', () => {
  it('keeps the connection message when the request itself fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

    render(<ResultadosPage />)

    expect(await screen.findByText(/Verifique sua conexão/)).toBeInTheDocument()
    expect(screen.queryByText(/formato antigo/)).not.toBeInTheDocument()
  })
})

describe('ResultadosPage — legitimate empty result', () => {
  it('renders the results page when the state has no ingested candidates', async () => {
    mockFetchJson({ cargos: [], totalCandidatosAnalisados: 0, estado: 'SP' })

    render(<ResultadosPage />)

    expect(await screen.findByText('Seu resultado')).toBeInTheDocument()
    expect(screen.queryByText(/formato antigo/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Verifique sua conexão/)).not.toBeInTheDocument()
  })
})

describe('ResultadosPage — group heading', () => {
  it('renders the cargo label for the group heading, not the raw slug', async () => {
    mockFetchJson({
      cargos: [{
        cargo: 'deputado_distrital',
        candidatos: [{
          politicianId: 'p1', nomeUrna: 'CANDIDATA TESTE', partido: 'PT', numeroUrna: '5010',
          cargo: 'deputado_distrital',
          alinhamento: 80, alinhamentoApurado: 90, cobertura: 75, confiancaResultado: 75,
          detalhesTemas: [], temAlertas: false, alertas: [], dossie: null, fontes: [],
          observacoes: [], coerenciaPorTema: {},
        }],
      }],
      totalCandidatosAnalisados: 1,
      estado: 'DF',
    })

    render(<ResultadosPage />)

    expect(await screen.findByText('Deputado Distrital')).toBeInTheDocument()
    expect(screen.queryByText('deputado_distrital')).not.toBeInTheDocument()
  })
})
