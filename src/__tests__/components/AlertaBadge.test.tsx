import { render, screen } from '@testing-library/react'
import { AlertaBadge } from '@/components/AlertaBadge'
import type { Alerta } from '@/lib/types'

const makeAlerta = (tipo: Alerta['tipo'], badgeCor: Alerta['badgeCor']): Alerta => ({
  tipo,
  severidade: 'alta',
  titulo: `Título ${tipo}`,
  descricao: `Descrição do alerta ${tipo}`,
  fonteUrl: 'https://example.com',
  badgeCor,
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
})
