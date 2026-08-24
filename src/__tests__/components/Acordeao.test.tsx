import { render, screen, fireEvent } from '@testing-library/react'
import { Acordeao } from '@/components/Acordeao'

describe('Acordeao', () => {
  it('renders the title and hides the children by default', () => {
    render(<Acordeao titulo="Fontes"><p>conteúdo</p></Acordeao>)
    expect(screen.getByText('Fontes')).toBeInTheDocument()
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument()
  })

  it('reveals the children when the header is clicked', () => {
    render(<Acordeao titulo="Fontes"><p>conteúdo</p></Acordeao>)
    fireEvent.click(screen.getByRole('button', { name: /Fontes/ }))
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  it('hides the children again on a second click', () => {
    render(<Acordeao titulo="Fontes"><p>conteúdo</p></Acordeao>)
    const header = screen.getByRole('button', { name: /Fontes/ })
    fireEvent.click(header)
    fireEvent.click(header)
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument()
  })

  it('starts open when defaultOpen is set', () => {
    render(<Acordeao titulo="Quem é" defaultOpen><p>conteúdo</p></Acordeao>)
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  it('renders the counter when provided', () => {
    render(<Acordeao titulo="Alertas" contador={2}><p>x</p></Acordeao>)
    expect(screen.getByTestId('acordeao-contador')).toHaveTextContent('2')
  })

  it('omits the counter when it is undefined', () => {
    const { container } = render(<Acordeao titulo="Alertas"><p>x</p></Acordeao>)
    expect(container.querySelector('[data-testid="acordeao-contador"]')).toBeNull()
  })

  it('reflects open state in aria-expanded', () => {
    render(<Acordeao titulo="Fontes"><p>conteúdo</p></Acordeao>)
    const header = screen.getByRole('button', { name: /Fontes/ })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
  })
})
