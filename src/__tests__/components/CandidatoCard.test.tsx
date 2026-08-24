import { render, screen, fireEvent } from '@testing-library/react'
import { CandidatoCard } from '@/components/CandidatoCard'
import type { CandidatoResultado, TemaCandidatoDetalhe } from '@/lib/types'

const makeDetalhe = (overrides: Partial<TemaCandidatoDetalhe> = {}): TemaCandidatoDetalhe => ({
  temaSlug: 'sus_saude_publica',
  temaNome: 'SUS e saúde pública',
  voterPosicao: 'favoravel',
  voterImportancia: 3,
  candidatePosicao: 5,
  candidateImportancia: 5,
  alignment: 1.0,
  contouNoScore: true,
  evidencia: 'direta',
  neutroMotivo: null,
  justificativa: null,
  posicaoViaPartido: false,
  baixaConfianca: false,
  ...overrides,
})

const makeCandidate = (overrides: Partial<CandidatoResultado> = {}): CandidatoResultado => ({
  politicianId: 'uuid-1',
  nomeUrna: 'Candidato Teste',
  partido: 'PT',
  cargo: 'presidente',
  numeroUrna: '13',
  alinhamento: 80,
  alinhamentoApurado: 90,
  cobertura: 75,
  confiancaResultado: 75,
  detalhesTemas: [makeDetalhe()],
  temAlertas: false,
  alertas: [],
  dossie: null,
  fontes: [],
  observacoes: [],
  coerenciaPorTema: {},
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

  it('applies green bar for alinhamento >= 55', () => {
    const { container } = render(<CandidatoCard candidato={makeCandidate({ alinhamento: 80 })} />)
    expect(container.querySelector('[data-testid="alinhamento-bar"]')?.className).toContain('bg-success')
  })

  it('applies amber bar for alinhamento 35-54', () => {
    const { container } = render(<CandidatoCard candidato={makeCandidate({ alinhamento: 40 })} />)
    expect(container.querySelector('[data-testid="alinhamento-bar"]')?.className).toContain('bg-amber-500')
  })

  it('does not render alert badges when temAlertas is false', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.queryByText('Ficha suja')).not.toBeInTheDocument()
  })

  it('shows transparency panel on click', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('SUS e saúde pública')).toBeInTheDocument()
  })

  it('shows ✓ icon for aligned theme (alignment >= 0.75)', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ alignment: 1.0, contouNoScore: true })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('shows ✗ icon for divergent theme (alignment <= 0.25)', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ alignment: 0.0, contouNoScore: true })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('✗')).toBeInTheDocument()
  })

  it('shows ○ icon when candidate has no data', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ candidatePosicao: null, alignment: null, contouNoScore: false })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('○')).toBeInTheDocument()
  })

  it('shows ● icon for curious theme (voter neutral + importancia >= 2)', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ voterPosicao: 'neutro', voterImportancia: 2, alignment: null, contouNoScore: false })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('●')).toBeInTheDocument()
  })

  it('shows voter position as text label in theme breakdown', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ voterPosicao: 'favoravel' })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText(/você: favorável/)).toBeInTheDocument()
  })

  it('shows partido badge when posicaoViaPartido is true', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ posicaoViaPartido: true })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('partido')).toBeInTheDocument()
  })

  it('does not show partido badge when posicaoViaPartido is false', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ posicaoViaPartido: false })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.queryByText('partido')).not.toBeInTheDocument()
  })

  it('shows a low-confidence badge when baixaConfianca is true', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ baixaConfianca: true })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('classificação não revisada')).toBeInTheDocument()
  })

  it('does not show the low-confidence badge when baixaConfianca is false', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ baixaConfianca: false })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.queryByText('classificação não revisada')).not.toBeInTheDocument()
  })

  it('shows both partido and low-confidence badges together when both apply', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ posicaoViaPartido: true, baixaConfianca: true })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('partido')).toBeInTheDocument()
    expect(screen.getByText('classificação não revisada')).toBeInTheDocument()
  })

  it('shows both coverage metrics in the header', () => {
    render(<CandidatoCard candidato={makeCandidate({ cobertura: 36, confiancaResultado: 36 })} />)
    expect(screen.getByText(/cobertura 36%/)).toBeInTheDocument()
    expect(screen.getByText(/confiança 36%/)).toBeInTheDocument()
  })

  it('shows the audit line when expanded', () => {
    render(<CandidatoCard candidato={makeCandidate({
      alinhamento: 39, alinhamentoApurado: 90, cobertura: 36, confiancaResultado: 36,
    })} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByTestId('audit-line')).toHaveTextContent(
      '39% = 36% do que importa pra você × 90% de alinhamento nesses temas + 64% não apurado, contado como 10%',
    )
  })

  it('distinguishes an unaudited theme from an audited neutral', () => {
    const candidato = makeCandidate({
      detalhesTemas: [
        makeDetalhe({
          temaSlug: 'protecao_minorias', temaNome: 'Proteção de minorias',
          evidencia: 'ausente', neutroMotivo: 'nao_encontrado',
          candidatePosicao: null, alignment: null, contouNoScore: false,
        }),
        makeDetalhe({
          temaSlug: 'bolsa_familia_transferencia', temaNome: 'Bolsa Família',
          evidencia: 'direta', neutroMotivo: 'nao_responde',
          candidatePosicao: 3, alignment: 0.5, contouNoScore: true,
        }),
      ],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('não encontrado')).toBeInTheDocument()
    expect(screen.getByText('não responde à afirmação')).toBeInTheDocument()
  })

  it('renders the theme name, not the raw slug', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({
        temaSlug: 'meio_ambiente_desmatamento', temaNome: 'Meio ambiente e desmatamento',
      })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText('Meio ambiente e desmatamento')).toBeInTheDocument()
    expect(screen.queryByText('meio ambiente desmatamento')).not.toBeInTheDocument()
  })

  it('exposes the justification for a theme', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({
        evidencia: 'ausente', neutroMotivo: 'nao_encontrado',
        candidatePosicao: null, alignment: null, contouNoScore: false,
        justificativa: 'Buscas no plano de governo não retornaram nenhuma ocorrência.',
      })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByText(/não retornaram nenhuma ocorrência/)).toBeInTheDocument()
  })

  it('renders the cargo and ballot number next to the party', () => {
    render(<CandidatoCard candidato={makeCandidate({ numeroUrna: '13', cargo: 'presidente' })} />)
    expect(screen.getByText(/nº 13/)).toBeInTheDocument()
  })

  it('omits the ballot number when there is none', () => {
    render(<CandidatoCard candidato={makeCandidate({ numeroUrna: null })} />)
    expect(screen.queryByText(/nº/)).not.toBeInTheDocument()
  })

  it('shows the alert counter in the collapsed card', () => {
    const candidato = makeCandidate({
      temAlertas: true,
      alertas: [{
        tipo: 'ficha_suja', severidade: 'critica', titulo: 'T', descricao: 'D',
        fonteUrl: 'https://x.example', badgeCor: 'vermelho',
      }],
    })
    render(<CandidatoCard candidato={candidato} />)
    expect(screen.getByText('1 alerta encontrado')).toBeInTheDocument()
  })

  it('pluralizes the alert counter', () => {
    const alerta = {
      tipo: 'ficha_suja' as const, severidade: 'critica' as const, titulo: 'T', descricao: 'D',
      fonteUrl: 'https://x.example', badgeCor: 'vermelho' as const,
    }
    render(<CandidatoCard candidato={makeCandidate({ temAlertas: true, alertas: [alerta, alerta] })} />)
    expect(screen.getByText('2 alertas encontrados')).toBeInTheDocument()
  })

  it('says there is no alert when the list is empty', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.getByText('Nenhum alerta')).toBeInTheDocument()
  })

  it('shows the observation counter in the collapsed card', () => {
    const candidato = makeCandidate({
      observacoes: [{
        categoria: 'ressalva', titulo: 'Saúde', descricao: 'Via partido.',
        temaSlug: 'saude_sus', fonteUrl: null,
      }],
    })
    render(<CandidatoCard candidato={candidato} />)
    expect(screen.getByText('1 observação encontrada')).toBeInTheDocument()
  })

  it('omits the observation counter when there are none', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.queryByText(/observaç/)).not.toBeInTheDocument()
  })

  it('does not render the panel until expanded', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.queryByText(/Seus temas/)).not.toBeInTheDocument()
  })

  it('renders the theme panel when expanded', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))
    expect(screen.getByText(/Seus temas/)).toBeInTheDocument()
  })

  it('renders the profile block when a dossier exists', () => {
    const candidato = makeCandidate({
      dossie: {
        resumoPerfil: 'Advogada de Cuiabá.', espectroDeclarado: 'centro',
        espectroInferido: 'centro', coerenciaIndice: null,
        coerenciaBase: null, geradoEm: '2026-08-22T00:00:00Z',
      },
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))
    expect(screen.getByText('Advogada de Cuiabá.')).toBeInTheDocument()
  })

  it('omits the profile block when there is no dossier', () => {
    render(<CandidatoCard candidato={makeCandidate({ dossie: null })} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))
    expect(screen.queryByText('Quem é')).not.toBeInTheDocument()
  })

  it('keeps the audit line above the two-column split', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))
    const audit = screen.getByTestId('audit-line')
    const panel = screen.getByTestId('detalhe-colunas')
    expect(audit.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
