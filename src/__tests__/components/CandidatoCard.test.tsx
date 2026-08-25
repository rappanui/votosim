import { render, screen, fireEvent, within } from '@testing-library/react'
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

  it('explains cobertura and confiança via a hover tooltip on each element', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.getByTitle(/quantos conseguimos apurar/i)).toBeInTheDocument()
    expect(screen.getByTitle(/você marcou como importantes/i)).toBeInTheDocument()
  })

  it('explains alertas via a hover tooltip on the counter itself', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    const tip = screen.getByTitle(/curadoria humana/i)
    expect(tip).toBeInTheDocument()
    expect(tip).toHaveTextContent('Alertas: 0 detectados')
  })

  it('explains observações via a hover tooltip on the counter itself', () => {
    const candidato = makeCandidate({
      observacoes: [{
        categoria: 'ressalva', titulo: 'Saúde', descricao: 'Via partido.',
        temaSlug: 'saude_sus', fonteUrl: null, severidade: 'baixa',
      }],
    })
    render(<CandidatoCard candidato={candidato} />)
    const tip = screen.getByTitle(/nunca são acusações/i)
    expect(tip).toBeInTheDocument()
    expect(tip).toHaveTextContent('Observações: 1 leve detectada')
  })

  it('flags low cobertura visually instead of treating it the same as high cobertura', () => {
    const { container: lowContainer } = render(
      <CandidatoCard candidato={makeCandidate({ cobertura: 20 })} />,
    )
    const lowSpan = within(lowContainer).getByText(/cobertura 20%/)
    expect(lowSpan.className).toContain('text-warning')
  })

  it('does not flag cobertura when it is high', () => {
    const { container: highContainer } = render(
      <CandidatoCard candidato={makeCandidate({ cobertura: 90 })} />,
    )
    const highSpan = within(highContainer).getByText(/cobertura 90%/)
    expect(highSpan.className).not.toContain('text-warning')
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

  it('renders the cargo label and ballot number next to the party', () => {
    render(<CandidatoCard candidato={makeCandidate({ numeroUrna: '5010', cargo: 'deputado_distrital' })} />)
    expect(screen.getByText(/nº 5010/)).toBeInTheDocument()
    expect(screen.getByText(/Deputado Distrital/)).toBeInTheDocument()
  })

  it('falls back to the raw cargo when it is not in the label map', () => {
    render(<CandidatoCard candidato={makeCandidate({ cargo: 'vereador' })} />)
    expect(screen.getByText(/vereador/)).toBeInTheDocument()
  })

  it('omits the ballot number when there is none', () => {
    render(<CandidatoCard candidato={makeCandidate({ numeroUrna: null })} />)
    expect(screen.queryByText(/nº/)).not.toBeInTheDocument()
  })

  it('shows the alert counter in the collapsed card, severity-labeled', () => {
    const candidato = makeCandidate({
      temAlertas: true,
      alertas: [{
        tipo: 'ficha_suja', severidade: 'critica', titulo: 'T', descricao: 'D',
        fonteUrl: 'https://x.example', badgeCor: 'vermelho', ativo: true, resolucao: null,
      }],
    })
    render(<CandidatoCard candidato={candidato} />)
    expect(screen.getByText('Alertas: 1 crítico detectado')).toBeInTheDocument()
  })

  it('pluralizes the alert counter', () => {
    const alerta = {
      tipo: 'ficha_suja' as const, severidade: 'critica' as const, titulo: 'T', descricao: 'D',
      fonteUrl: 'https://x.example', badgeCor: 'vermelho' as const, ativo: true, resolucao: null,
    }
    render(<CandidatoCard candidato={makeCandidate({ temAlertas: true, alertas: [alerta, alerta] })} />)
    expect(screen.getByText('Alertas: 2 críticos detectados')).toBeInTheDocument()
  })

  it('says there is no alert when the list is empty', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.getByText('Alertas: 0 detectados')).toBeInTheDocument()
  })

  it('colors the zero-alert counter green', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.getByText('Alertas: 0 detectados').closest('[title]')?.className).toContain('text-success')
  })

  it('colors the alert counter red when the most severe alert present is critica', () => {
    const candidato = makeCandidate({
      temAlertas: true,
      alertas: [
        { tipo: 'ficha_suja', severidade: 'critica', titulo: 'T1', descricao: 'D', fonteUrl: 'https://x.example', badgeCor: 'vermelho', ativo: true, resolucao: null },
        { tipo: 'polemica', severidade: 'baixa', titulo: 'T2', descricao: 'D', fonteUrl: 'https://x.example', badgeCor: 'cinza', ativo: true, resolucao: null },
      ],
    })
    render(<CandidatoCard candidato={candidato} />)
    const label = screen.getByText('Alertas: 1 crítico e 1 leve detectados')
    expect(label.closest('[title]')?.className).toContain('text-danger')
  })

  it('colors the alert counter amber when the most severe alert present is media', () => {
    const media = { tipo: 'polemica' as const, severidade: 'media' as const, titulo: 'T', descricao: 'D', fonteUrl: 'https://x.example', badgeCor: 'cinza' as const, ativo: true, resolucao: null }
    render(<CandidatoCard candidato={makeCandidate({ temAlertas: true, alertas: [media, media] })} />)
    const label = screen.getByText('Alertas: 2 moderados detectados')
    expect(label.closest('[title]')?.className).toContain('text-amber-700')
  })

  it('colors the alert counter gray when the most severe alert present is baixa', () => {
    const candidato = makeCandidate({
      temAlertas: true,
      alertas: [{ tipo: 'polemica', severidade: 'baixa', titulo: 'T', descricao: 'D', fonteUrl: 'https://x.example', badgeCor: 'cinza', ativo: true, resolucao: null }],
    })
    render(<CandidatoCard candidato={candidato} />)
    const label = screen.getByText('Alertas: 1 leve detectado')
    expect(label.closest('[title]')?.className).toContain('text-gray-500')
  })

  it('shows the observation counter in the collapsed card, severity-labeled', () => {
    const candidato = makeCandidate({
      observacoes: [{
        categoria: 'ressalva', titulo: 'Saúde', descricao: 'Via partido.',
        temaSlug: 'saude_sus', fonteUrl: null, severidade: 'baixa',
      }],
    })
    render(<CandidatoCard candidato={candidato} />)
    expect(screen.getByText('Observações: 1 leve detectada')).toBeInTheDocument()
  })

  it('colors the observation counter following its own most severe item, independent of alertas', () => {
    const candidato = makeCandidate({
      observacoes: [{
        categoria: 'contradicao', titulo: 'Tema', descricao: 'D',
        temaSlug: 'tema_x', fonteUrl: null, severidade: 'alta',
      }],
    })
    render(<CandidatoCard candidato={candidato} />)
    const label = screen.getByText('Observações: 1 grave detectada')
    expect(label.closest('[title]')?.className).toContain('text-warning')
  })

  it('omits the observation counter when there are none', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    expect(screen.queryByText(/Observações:/)).not.toBeInTheDocument()
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

  // The one candidate shape that broke before correction 2: a voter who left
  // every theme neutral and unimportant filters the whole panel away, yet still
  // gets a headline score that needs explaining.
  it('still explains the score when no theme survives the filter', () => {
    const candidato = makeCandidate({
      detalhesTemas: [makeDetalhe({ voterPosicao: 'neutro', voterImportancia: 1 })],
    })
    render(<CandidatoCard candidato={candidato} />)
    fireEvent.click(screen.getByText(/Ver detalhes/))
    expect(screen.getByTestId('audit-line')).toBeInTheDocument()
    expect(screen.queryByText(/Seus temas/)).not.toBeInTheDocument()
  })

  it('keeps the audit line above the two-column split', () => {
    render(<CandidatoCard candidato={makeCandidate()} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))
    const audit = screen.getByTestId('audit-line')
    const panel = screen.getByTestId('detalhe-colunas')
    expect(audit.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // An expanded card runs well past a screen, so the header that identifies it
  // and the control that closes it both scroll away. Rather than copying them
  // into a second bar — which duplicated name, party and score on screen — the
  // card's own header sticks while the panel is open.
  describe('sticky header while expanded', () => {
    beforeAll(() => {
      // jsdom does not implement scrollIntoView.
      window.HTMLElement.prototype.scrollIntoView = jest.fn()
    })

    beforeEach(() => {
      ;(window.HTMLElement.prototype.scrollIntoView as jest.Mock).mockClear()
    })

    it('does not stick while the card is collapsed', () => {
      render(<CandidatoCard candidato={makeCandidate()} />)
      expect(screen.getByTestId('card-cabecalho').className).not.toContain('sticky')
    })

    it('sticks once the card is expanded', () => {
      render(<CandidatoCard candidato={makeCandidate()} />)
      fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))
      expect(screen.getByTestId('card-cabecalho').className).toContain('sticky')
    })

    // The bar this replaced showed the candidate a second time, so an expanded
    // card carried "LULA · PT · 70%" twice on screen at once.
    it('shows the candidate identity exactly once when expanded', () => {
      render(<CandidatoCard candidato={makeCandidate({ nomeUrna: 'FULANA' })} />)
      fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))
      expect(screen.getAllByText('FULANA')).toHaveLength(1)
    })

    it('keeps the identity and score inside the sticky region', () => {
      render(<CandidatoCard candidato={makeCandidate({ nomeUrna: 'FULANA', alinhamento: 64 })} />)
      fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))

      const cabecalho = screen.getByTestId('card-cabecalho')
      expect(cabecalho).toHaveTextContent('FULANA')
      expect(cabecalho).toHaveTextContent('64%')
      expect(within(cabecalho).getByRole('button', { name: /Ocultar detalhes/ })).toBeInTheDocument()
    })

    // Without this the viewport lands wherever the removed content left it,
    // usually inside the next candidate.
    it('brings the card back into view when collapsed', () => {
      render(<CandidatoCard candidato={makeCandidate()} />)
      fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))
      fireEvent.click(screen.getByRole('button', { name: /Ocultar detalhes/ }))

      expect(screen.queryByTestId('detalhe-colunas')).not.toBeInTheDocument()
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('does not scroll when merely expanding', () => {
      render(<CandidatoCard candidato={makeCandidate()} />)
      fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }))
      expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
    })
  })
})
