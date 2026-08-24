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

  it('omits the "Consultadas em" line when acessadoEm is malformed', () => {
    render(<FontesBloco fontes={[{ ...oficial, acessadoEm: 'não é uma data' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Fontes/ }))
    expect(screen.queryByText(/Consultadas em/)).not.toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })

  it('falls back to "outra" when camada is outside the known range', () => {
    // `camada` is DB-constrained to 1–3 (docs/base/11_sp0_foundation.sql), but the
    // TS union can't enforce that across the JSON boundary from the Edge Function.
    // The cast below deliberately simulates data that violates the DB constraint.
    const foraDoRange = { ...oficial, camada: 9 as unknown as 1 | 2 | 3 }
    render(<FontesBloco fontes={[foraDoRange]} />)
    fireEvent.click(screen.getByRole('button', { name: /Fontes/ }))
    expect(screen.getByText('outra')).toBeInTheDocument()
  })
})
