import { render, screen } from '@testing-library/react'
import { Footer } from '@/components/Footer'

describe('Footer', () => {
  it('renders the legal disclaimer text', () => {
    render(<Footer />)
    expect(screen.getByText(/ferramenta informativa/i)).toBeInTheDocument()
  })

  it('renders a link pointing to /sobre', () => {
    render(<Footer />)
    const link = screen.getByRole('link', { name: /saiba mais/i })
    expect(link).toHaveAttribute('href', '/sobre')
  })
})
