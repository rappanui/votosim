import { render, screen, fireEvent } from '@testing-library/react'
import { CandidatoCard } from '@/components/CandidatoCard'
import type { CandidatoResultado, TemaCandidatoDetalhe } from '@/lib/types'

const makeDetalhe = (overrides: Partial<TemaCandidatoDetalhe> = {}): TemaCandidatoDetalhe => ({
  temaSlug: 'sus_saude_publica',
  voterResposta: 5,
  voterImportancia: 3,
  candidatePosicao: 5,
  candidateImportancia: 5,
  alignment: 1.0,
  contouNoScore: true,
  ...overrides,
})

const makeCandidate = (overrides: Partial<CandidatoResultado> = {}): CandidatoResultado => ({
  politicianId: 'uuid-1',
  nomeUrna: 'Candidato Teste',
  partido: 'PT',
  alinhamento: 80,
  cobertura: 75,
  detalhesTemas: [makeDetalhe()],
  temAlertas: false,
  alertas: [],
  ...overrides,
})

describe('CandidatoCard', () => {
  it('renders candidate name, party, and alinhamento', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.getByText('Candidato Teste')).toBeInTheDocument()
    expect(screen.getByText('PT')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('renders cobertura alongside alinhamento', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.getByText(/cobertura 75%/)).toBeInTheDocument()
  })

  it('applies green bar for alinhamento >= 75', () => {
    const { container } = render(<CandidatoCard candidato={makeCandidate({ alinhamento: 80 })} />)
    expect(container.querySelector('[data-testid="alinhamento-bar"]')?.className).toContain('bg-success')
  })

  it('applies amber bar for alinhamento 50-74', () => {
    const { container } = render(<CandidatoCard candidato={makeCandidate({ alinhamento: 60 })} />)
    expect(container.querySelector('[data-testid="alinhamento-bar"]')?.className).toContain('bg-amber-500')
  })

  it('does not render alert badges when temAlertas is false', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.queryByText('Ficha suja')).not.toBeInTheDocument()
  })

  it('renders alert badges when candidate has alerts', () => {
    const candidato = makeCandidate({
      temAlertas: true,
      alertas: [{
        tipo: 'ficha_suja', severidade: 'critica', titulo: 'Condenado por improbidade',
        descricao: 'Condenação transitada em julgado.', fonteUrl: 'https://tse.jus.br', badgeCor: 'vermelho',
      }],
    })
    render(<CandidatoCard candidato={candidato} />)
    expect(screen.getByText('Condenado por improbidade')).toBeInTheDocument()
  })

  it('shows transparency panel on click', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    fireEvent.click(screen.getByText(/Ver detalhes por tema/))
    expect(screen.getByText('sus saude publica')).toBeInTheDocument()
  })

  it('shows ✓ icon for aligned theme (alignment >= 0.75)', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ alignment: 1.0, contouNoScore: true })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes por tema/))
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('shows ✗ icon for divergent theme (alignment <= 0.25)', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ alignment: 0.0, contouNoScore: true })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes por tema/))
    expect(screen.getByText('✗')).toBeInTheDocument()
  })

  it('shows ○ icon when candidate has no data', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ candidatePosicao: null, alignment: null, contouNoScore: false })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes por tema/))
    expect(screen.getByText('○')).toBeInTheDocument()
  })

  it('shows ● icon for curious theme (voter neutral + importancia >= 2)', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ voterResposta: 3, voterImportancia: 2, alignment: null, contouNoScore: false })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes por tema/))
    expect(screen.getByText('●')).toBeInTheDocument()
  })
})
