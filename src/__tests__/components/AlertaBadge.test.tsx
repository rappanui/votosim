import { render, screen } from '@testing-library/react'
import { AlertaBadge } from '@/components/AlertaBadge'
import type { Alerta } from '@/lib/types'

const makeAlerta = (
  tipo: Alerta['tipo'], badgeCor: Alerta['badgeCor'], overrides: Partial<Alerta> = {},
): Alerta => ({
  tipo,
  severidade: 'alta',
  titulo: `Título ${tipo}`,
  descricao: `Descrição do alerta ${tipo}`,
  fonteUrl: 'https://example.com',
  badgeCor,
  ativo: true,
  resolucao: null,
  ...overrides,
})

describe('AlertaBadge', () => {
  it('renders Ficha suja label for ficha_suja type', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho')} />)
    expect(screen.getByText('Ficha suja')).toBeInTheDocument()
  })

  it('renders Em investigação label for investigacao type', () => {
    render(<AlertaBadge alerta={makeAlerta('investigacao', 'laranja')} />)
    expect(screen.getByText('Em investigação')).toBeInTheDocument()
  })

  it('renders Atenção label for polemica type', () => {
    render(<AlertaBadge alerta={makeAlerta('polemica', 'cinza')} />)
    expect(screen.getByText('Atenção')).toBeInTheDocument()
  })

  it('applies red styling for badgeCor vermelho', () => {
    const { container } = render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho')} />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-danger')
  })

  it('applies orange styling for badgeCor laranja', () => {
    const { container } = render(<AlertaBadge alerta={makeAlerta('investigacao', 'laranja')} />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-warning')
  })

  it('applies gray styling for badgeCor cinza', () => {
    const { container } = render(<AlertaBadge alerta={makeAlerta('polemica', 'cinza')} />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-gray-400')
  })

  it('renders Incoerência label for incoerencia type', () => {
    render(<AlertaBadge alerta={makeAlerta('incoerencia', 'roxo')} />)
    expect(screen.getByText('Incoerência')).toBeInTheDocument()
  })

  it('renders Divergência de espectro label for divergencia_espectro type', () => {
    render(<AlertaBadge alerta={makeAlerta('divergencia_espectro', 'azul')} />)
    expect(screen.getByText('Divergência de espectro')).toBeInTheDocument()
  })

  it('renders Ressalva label for ressalva_evidencias type', () => {
    render(<AlertaBadge alerta={makeAlerta('ressalva_evidencias', 'amarelo')} />)
    expect(screen.getByText('Ressalva')).toBeInTheDocument()
  })

  it('applies purple styling for badgeCor roxo', () => {
    const { container } = render(<AlertaBadge alerta={makeAlerta('incoerencia', 'roxo')} />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-purple-600')
  })

  it('applies blue styling for badgeCor azul', () => {
    const { container } = render(<AlertaBadge alerta={makeAlerta('divergencia_espectro', 'azul')} />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-highlight')
  })

  it('applies amber styling for badgeCor amarelo', () => {
    const { container } = render(<AlertaBadge alerta={makeAlerta('ressalva_evidencias', 'amarelo')} />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-amber-100')
  })

  it('suffixes the label with "— resolvido" when the alert is no longer active', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'cinza', { ativo: false })} />)
    expect(screen.getByText('Ficha suja — resolvido')).toBeInTheDocument()
  })

  it('does not suffix the label for an active alert', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho')} />)
    expect(screen.getByText('Ficha suja')).toBeInTheDocument()
    expect(screen.queryByText(/resolvido/)).not.toBeInTheDocument()
  })

  it('shows the severidade in Portuguese alongside the badge', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho', { severidade: 'critica' })} />)
    expect(screen.getByText(/Crítica/)).toBeInTheDocument()
  })

  it('colors the severidade text red for critica', () => {
    render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho', { severidade: 'critica' })} />)
    expect(screen.getByText(/Crítica/).className).toContain('text-danger')
  })

  it('colors the severidade text gray for baixa', () => {
    render(<AlertaBadge alerta={makeAlerta('polemica', 'cinza', { severidade: 'baixa' })} />)
    expect(screen.getByText(/Baixa/).className).toContain('text-gray-500')
  })

  it('keeps the pill itself as the first rendered element, unaffected by the severidade text', () => {
    const { container } = render(<AlertaBadge alerta={makeAlerta('ficha_suja', 'vermelho')} />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-danger')
  })
})
