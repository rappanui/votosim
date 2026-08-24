import { render, screen, fireEvent } from '@testing-library/react'
import { FontesBloco } from '@/components/FontesBloco'
import type { Fonte } from '@/lib/types'

const oficial: Fonte = {
  id: 's1', tipo: 'judicial', camada: 1, titulo: 'TRE-SP mantém inelegibilidade',
  veiculo: 'Tribunal Regional Eleitoral de São Paulo', url: 'https://tre-sp.example',
  dataPublicacao: '2025-12-01', acessadoEm: '2026-08-22T00:00:00Z',
}

const imprensa: Fonte = {
  id: 's2', tipo: 'noticia', camada: 2, titulo: 'DC oficializa candidatura',
  veiculo: 'CNN Brasil', url: 'https://cnn.example',
  dataPublicacao: null, acessadoEm: '2026-08-22T00:00:00Z',
}

describe('FontesBloco', () => {
  it('renders nothing when there are no sources', () => {
    const { container } = render(<FontesBloco fontes={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('counts the sources in the header', () => {
    render(<FontesBloco fontes={[oficial, imprensa]} />)
    expect(screen.getByTestId('acordeao-contador')).toHaveTextContent('2')
  })

  it('labels each source by its camada', () => {
    render(<FontesBloco fontes={[oficial, imprensa]} />)
    fireEvent.click(screen.getByRole('button', { name: /Fontes/ }))
    expect(screen.getByText('oficial')).toBeInTheDocument()
    expect(screen.getByText('imprensa')).toBeInTheDocument()
  })

  it('links each source to its url in a new tab', () => {
    render(<FontesBloco fontes={[oficial]} />)
    fireEvent.click(screen.getByRole('button', { name: /Fontes/ }))
    const link = screen.getByRole('link', { name: /TRE-SP mantém inelegibilidade/ })
    expect(link).toHaveAttribute('href', 'https://tre-sp.example')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('falls back to the veiculo when the source has no title', () => {
    render(<FontesBloco fontes={[{ ...imprensa, titulo: null }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Fontes/ }))
    expect(screen.getByRole('link', { name: /CNN Brasil/ })).toBeInTheDocument()
  })

  it('states when the sources were accessed', () => {
    render(<FontesBloco fontes={[oficial]} />)
    fireEvent.click(screen.getByRole('button', { name: /Fontes/ }))
    expect(screen.getByText(/Consultadas em 22\/08\/2026/)).toBeInTheDocument()
  })
})
