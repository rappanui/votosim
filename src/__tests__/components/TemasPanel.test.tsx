import { render, screen, fireEvent } from '@testing-library/react'
import { TemasPanel } from '@/components/TemasPanel'
import type { TemaCandidatoDetalhe } from '@/lib/types'

const makeDetalhe = (overrides: Partial<TemaCandidatoDetalhe> = {}): TemaCandidatoDetalhe => ({
  temaSlug: 'saude_sus',
  temaNome: 'Saúde pública',
  voterPosicao: 'favoravel',
  voterImportancia: 3,
  evidencia: 'direta',
  neutroMotivo: null,
  justificativa: null,
  candidatePosicao: 5,
  candidateImportancia: 4,
  alignment: 1.0,
  contouNoScore: true,
  posicaoViaPartido: false,
  baixaConfianca: false,
  ...overrides,
})

describe('TemasPanel', () => {
  it('renders the theme display name, not the slug', () => {
    render(<TemasPanel detalhes={[makeDetalhe()]} />)
    expect(screen.getByText('Saúde pública')).toBeInTheDocument()
    expect(screen.queryByText('saude_sus')).not.toBeInTheDocument()
  })

  it('renders the justification when present', () => {
    render(<TemasPanel detalhes={[makeDetalhe({ justificativa: 'O plano foca na atenção primária.' })]} />)
    expect(screen.getByText('O plano foca na atenção primária.')).toBeInTheDocument()
  })

  it('renders no justification paragraph when it is null', () => {
    const { container } = render(<TemasPanel detalhes={[makeDetalhe()]} />)
    expect(container.querySelector('[data-testid="tema-justificativa"]')).toBeNull()
  })

  it('labels an unaudited theme as não encontrado', () => {
    render(<TemasPanel detalhes={[makeDetalhe({
      evidencia: 'ausente', neutroMotivo: 'nao_encontrado',
      candidatePosicao: null, alignment: null, contouNoScore: false,
    })]} />)
    expect(screen.getByText('não encontrado')).toBeInTheDocument()
  })

  it('labels an audited neutral as não responde à afirmação', () => {
    render(<TemasPanel detalhes={[makeDetalhe({
      evidencia: 'direta', neutroMotivo: 'nao_responde',
      candidatePosicao: 3, alignment: 0.5,
    })]} />)
    expect(screen.getByText('não responde à afirmação')).toBeInTheDocument()
  })

  it('distinguishes the two by icon', () => {
    const { container } = render(<TemasPanel detalhes={[
      makeDetalhe({ temaSlug: 'a', temaNome: 'A', evidencia: 'ausente', neutroMotivo: 'nao_encontrado',
        candidatePosicao: null, alignment: null, contouNoScore: false }),
      makeDetalhe({ temaSlug: 'b', temaNome: 'B', evidencia: 'direta', neutroMotivo: 'nao_responde',
        candidatePosicao: 3, alignment: 0.5 }),
    ]} />)
    const icons = [...container.querySelectorAll('[data-testid="tema-icone"]')].map(n => n.textContent)
    expect(icons).toEqual(['○', '◐'])
  })

  it('shows ● for a theme the voter left neutral but marked as important', () => {
    const { container } = render(<TemasPanel detalhes={[makeDetalhe({
      voterPosicao: 'neutro', voterImportancia: 2,
      alignment: null, contouNoScore: false,
    })]} />)
    const icons = [...container.querySelectorAll('[data-testid="tema-icone"]')].map(n => n.textContent)
    expect(icons).toEqual(['●'])
  })

  it('previews only the first four themes', () => {
    const detalhes = Array.from({ length: 7 }, (_, i) =>
      makeDetalhe({ temaSlug: `t${i}`, temaNome: `Tema ${i}` }))
    render(<TemasPanel detalhes={detalhes} />)
    expect(screen.getByText('Tema 3')).toBeInTheDocument()
    expect(screen.queryByText('Tema 4')).not.toBeInTheDocument()
  })

  it('reveals every theme when the toggle is clicked', () => {
    const detalhes = Array.from({ length: 7 }, (_, i) =>
      makeDetalhe({ temaSlug: `t${i}`, temaNome: `Tema ${i}` }))
    render(<TemasPanel detalhes={detalhes} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver os 7 temas/ }))
    expect(screen.getByText('Tema 6')).toBeInTheDocument()
  })

  it('renders no toggle when there are four themes or fewer', () => {
    const detalhes = Array.from({ length: 3 }, (_, i) =>
      makeDetalhe({ temaSlug: `t${i}`, temaNome: `Tema ${i}` }))
    render(<TemasPanel detalhes={detalhes} />)
    expect(screen.queryByRole('button', { name: /Ver os/ })).not.toBeInTheDocument()
  })

  it('orders themes the voter had an opinion on before neutral ones', () => {
    const detalhes = [
      makeDetalhe({ temaSlug: 'n', temaNome: 'Neutro', voterPosicao: 'neutro', alignment: null, contouNoScore: false }),
      makeDetalhe({ temaSlug: 'o', temaNome: 'Opinado', voterPosicao: 'favoravel' }),
    ]
    const { container } = render(<TemasPanel detalhes={detalhes} />)
    const nomes = [...container.querySelectorAll('[data-testid="tema-nome"]')].map(n => n.textContent)
    expect(nomes).toEqual(['Opinado', 'Neutro'])
  })

  it('counts audited themes in the header', () => {
    render(<TemasPanel detalhes={[
      makeDetalhe({ temaSlug: 'a', evidencia: 'direta' }),
      makeDetalhe({ temaSlug: 'b', evidencia: 'ausente', candidatePosicao: null, alignment: null, contouNoScore: false }),
    ]} />)
    expect(screen.getByText(/1 de 2 com dado/)).toBeInTheDocument()
  })

  it('hides a neutral theme the voter did not mark as important', () => {
    const { container } = render(<TemasPanel detalhes={[
      makeDetalhe({ temaSlug: 'o', temaNome: 'Opinado' }),
      makeDetalhe({ temaSlug: 'n', temaNome: 'Ignorado', voterPosicao: 'neutro', voterImportancia: 1,
        alignment: null, contouNoScore: false }),
    ]} />)
    const nomes = [...container.querySelectorAll('[data-testid="tema-nome"]')].map(n => n.textContent)
    expect(nomes).toEqual(['Opinado'])
  })

  it('counts only visible themes in the header', () => {
    render(<TemasPanel detalhes={[
      makeDetalhe({ temaSlug: 'o', temaNome: 'Opinado' }),
      makeDetalhe({ temaSlug: 'n', temaNome: 'Ignorado', voterPosicao: 'neutro', voterImportancia: 1,
        evidencia: 'ausente', candidatePosicao: null, alignment: null, contouNoScore: false }),
    ]} />)
    expect(screen.getByText(/1 de 1 com dado/)).toBeInTheDocument()
  })

  it('counts the toggle over visible themes only', () => {
    const detalhes = [
      ...Array.from({ length: 5 }, (_, i) => makeDetalhe({ temaSlug: `t${i}`, temaNome: `Tema ${i}` })),
      makeDetalhe({ temaSlug: 'n', temaNome: 'Ignorado', voterPosicao: 'neutro', voterImportancia: 1,
        alignment: null, contouNoScore: false }),
    ]
    render(<TemasPanel detalhes={detalhes} />)
    expect(screen.getByRole('button', { name: /Ver os 5 temas/ })).toBeInTheDocument()
  })

  it('renders nothing when every theme is filtered out', () => {
    const { container } = render(<TemasPanel detalhes={[
      makeDetalhe({ voterPosicao: 'neutro', voterImportancia: 1, alignment: null, contouNoScore: false }),
    ]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
