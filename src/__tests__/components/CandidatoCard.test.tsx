import { render, screen } from '@testing-library/react'
import { CandidatoCard } from '@/components/CandidatoCard'
import type { CandidatoResultado } from '@/lib/types'

const makeCandidate = (overrides: Partial<CandidatoResultado> = {}): CandidatoResultado => ({
  politicianId: 'uuid-1',
  nomeUrna: 'Candidato Teste',
  partido: 'PT',
  score: 80,
  temasAlinhados: ['sus_saude_publica', 'educacao_basica'],
  temasDivergentes: ['privatizacao_estatais'],
  temAlertas: false,
  alertas: [],
  ...overrides,
})

describe('CandidatoCard', () => {
  it('renders candidate name and party', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.getByText('Candidato Teste')).toBeInTheDocument()
    expect(screen.getByText('PT')).toBeInTheDocument()
  })

  it('renders the score as a percentage', () => {
    render(<CandidatoCard candidato={makeCandidate({ score: 80 })} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('applies green bar color for score >= 75', () => {
    const { container } = render(<CandidatoCard candidato={makeCandidate({ score: 80 })} />)
    expect(container.querySelector('[data-testid="score-bar"]')?.className).toContain('bg-success')
  })

  it('applies amber bar color for score 50-74', () => {
    const { container } = render(<CandidatoCard candidato={makeCandidate({ score: 60 })} />)
    expect(container.querySelector('[data-testid="score-bar"]')?.className).toContain('bg-amber-500')
  })

  it('applies orange bar color for score 25-49', () => {
    const { container } = render(<CandidatoCard candidato={makeCandidate({ score: 35 })} />)
    expect(container.querySelector('[data-testid="score-bar"]')?.className).toContain('bg-warning')
  })

  it('applies red bar color for score < 25', () => {
    const { container } = render(<CandidatoCard candidato={makeCandidate({ score: 20 })} />)
    expect(container.querySelector('[data-testid="score-bar"]')?.className).toContain('bg-danger')
  })

  it('does not render alert badges when temAlertas is false', () => {
    render(<CandidatoCard candidato={makeCandidate({ temAlertas: false })} />)
    expect(screen.queryByText('Ficha suja')).not.toBeInTheDocument()
  })

  it('renders alert badges when candidate has alerts', () => {
    const candidato = makeCandidate({
      temAlertas: true,
      alertas: [{
        tipo: 'ficha_suja',
        severidade: 'critica',
        titulo: 'Condenado por improbidade',
        descricao: 'Condenação transitada em julgado.',
        fonteUrl: 'https://tse.jus.br',
        badgeCor: 'vermelho',
      }],
    })
    render(<CandidatoCard candidato={candidato} />)
    expect(screen.getByText('Ficha suja')).toBeInTheDocument()
  })
})
