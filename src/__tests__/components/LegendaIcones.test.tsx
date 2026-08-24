import { render, screen } from '@testing-library/react'
import { LegendaIcones } from '@/components/LegendaIcones'

describe('LegendaIcones', () => {
  it('renders the legend heading', () => {
    render(<LegendaIcones />)
    expect(screen.getByText('O que os ícones significam')).toBeInTheDocument()
  })

  it.each(['✓', '─', '✗', '◐', '○', '●'])('covers the %s glyph CandidatoCard can emit', icone => {
    render(<LegendaIcones />)
    expect(screen.getByText(icone)).toBeInTheDocument()
  })

  it('gives the unaudited glyph an explicit explanation of its cost', () => {
    render(<LegendaIcones />)
    expect(screen.getByText(/Não auditado/)).toBeInTheDocument()
    expect(screen.getByText(/pesa contra ele/)).toBeInTheDocument()
    expect(screen.getByText(/10% de alinhamento/)).toBeInTheDocument()
  })
})
