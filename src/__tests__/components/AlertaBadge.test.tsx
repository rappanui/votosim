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
})
