import { render, screen } from '@testing-library/react'
import { PaginaEmConstrucao } from '@/components/PaginaEmConstrucao'

const props = {
  titulo: 'Raio-X',
  descricao: 'Consulte um candidato e veja o que apuramos sobre ele.',
}

describe('PaginaEmConstrucao', () => {
  it('renders the page name as the main heading', () => {
    render(<PaginaEmConstrucao {...props} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Raio-X' })).toBeInTheDocument()
  })

  it('renders the description of what the page will do', () => {
    render(<PaginaEmConstrucao {...props} />)
    expect(screen.getByText(props.descricao)).toBeInTheDocument()
  })

  it('states the page is not ready yet', () => {
    render(<PaginaEmConstrucao {...props} />)
    expect(screen.getByText(/em construção/i)).toBeInTheDocument()
  })

  it('offers a way out to the part of the site that already works', () => {
    render(<PaginaEmConstrucao {...props} />)
    expect(screen.getByRole('link', { name: /bússola/i })).toHaveAttribute('href', '/quiz')
  })
})
