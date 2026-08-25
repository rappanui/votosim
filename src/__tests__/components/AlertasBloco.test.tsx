import { render, screen, fireEvent } from '@testing-library/react'
import { AlertasBloco } from '@/components/AlertasBloco'
import type { Alerta } from '@/lib/types'

const alerta: Alerta = {
  tipo: 'ficha_suja',
  severidade: 'critica',
  titulo: 'Inelegível até 2032 por condenação do TRE-SP',
  descricao: 'Condenado por uso indevido dos meios de comunicação em 2024.',
  fonteUrl: 'https://tre-sp.example',
  badgeCor: 'vermelho',
  ativo: true,
  resolucao: null,
}

describe('AlertasBloco', () => {
  it('renders nothing when there are no alerts', () => {
    const { container } = render(<AlertasBloco alertas={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the count in the collapsed header', () => {
    render(<AlertasBloco alertas={[alerta]} />)
    expect(screen.getByText('Alertas')).toBeInTheDocument()
    expect(screen.getByTestId('acordeao-contador')).toHaveTextContent('1')
  })

  it('reveals title, description and source link when expanded', () => {
    render(<AlertasBloco alertas={[alerta]} />)
    fireEvent.click(screen.getByRole('button', { name: /Alertas/ }))
    expect(screen.getByText(/Inelegível até 2032/)).toBeInTheDocument()
    expect(screen.getByText(/uso indevido dos meios/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /fonte/i })).toHaveAttribute('href', 'https://tre-sp.example')
  })

  it('shows the resolucao text for a resolved alert', () => {
    const resolvido: Alerta = {
      ...alerta,
      ativo: false,
      resolucao: 'Condenação anulada pelo STF por incompetência de foro em 2021.',
    }
    render(<AlertasBloco alertas={[resolvido]} />)
    fireEvent.click(screen.getByRole('button', { name: /Alertas/ }))
    expect(screen.getByText(/Condenação anulada pelo STF/)).toBeInTheDocument()
  })

  it('does not show a resolucao block for an active alert', () => {
    render(<AlertasBloco alertas={[alerta]} />)
    fireEvent.click(screen.getByRole('button', { name: /Alertas/ }))
    expect(screen.queryByText(/^Resolvido:/)).not.toBeInTheDocument()
  })
})
