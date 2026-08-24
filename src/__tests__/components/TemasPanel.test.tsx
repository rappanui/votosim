import { render, screen } from '@testing-library/react'
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

  it('renders every visible theme with no toggle', () => {
    const detalhes = Array.from({ length: 7 }, (_, i) =>
      makeDetalhe({ temaSlug: `t${i}`, temaNome: `Tema ${i}` }))
    render(<TemasPanel detalhes={detalhes} />)
    for (let i = 0; i < 7; i++) {
      expect(screen.getByText(`Tema ${i}`)).toBeInTheDocument()
    }
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a theme the voter answered neutral but marked as important', () => {
    const detalhes = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeDetalhe({ temaSlug: `t${i}`, temaNome: `Tema ${i}` })),
      makeDetalhe({
        temaSlug: 'curioso', temaNome: 'Tema que me importa',
        voterPosicao: 'neutro', voterImportancia: 3,
        alignment: null, contouNoScore: false,
      }),
    ]
    render(<TemasPanel detalhes={detalhes} />)
    expect(screen.getByText('Tema que me importa')).toBeInTheDocument()
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

  it('labels the section without restating coverage as a count', () => {
    render(<TemasPanel detalhes={[
      makeDetalhe({ temaSlug: 'a', evidencia: 'direta' }),
      makeDetalhe({ temaSlug: 'b', evidencia: 'ausente', candidatePosicao: null, alignment: null, contouNoScore: false }),
    ]} />)
    const rotulo = screen.getByText('Seus temas')
    expect(rotulo).toBeInTheDocument()
    expect(rotulo.textContent).not.toMatch(/\d+ de \d+/)
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

  it('renders nothing when every theme is filtered out', () => {
    const { container } = render(<TemasPanel detalhes={[
      makeDetalhe({ voterPosicao: 'neutro', voterImportancia: 1, alignment: null, contouNoScore: false }),
    ]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
