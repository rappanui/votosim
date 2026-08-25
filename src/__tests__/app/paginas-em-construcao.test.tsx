import { render, screen } from '@testing-library/react'
import WikiPage, { metadata as wikiMetadata } from '@/app/wiki/page'
import RaioXPage, { metadata as raioXMetadata } from '@/app/raio-x/page'
import ContatoPage, { metadata as contatoMetadata } from '@/app/contato/page'

const PAGINAS = [
  ['Wiki', WikiPage, wikiMetadata],
  ['Raio-X', RaioXPage, raioXMetadata],
  ['Fale conosco', ContatoPage, contatoMetadata],
] as const

/**
 * The three menu destinations that have no content yet. Each must announce
 * itself with the same name the menu uses — a mismatch between the menu label
 * and the page heading is the failure this guards against.
 */
describe('pages under construction', () => {
  it.each(PAGINAS)('renders %s as the heading', (titulo, Page) => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument()
  })

  it.each(PAGINAS)('titles the browser tab of %s with its own name', (titulo, _Page, metadata) => {
    expect(metadata.title).toContain(titulo)
  })

  it.each(PAGINAS)('sends the visitor of %s back to the working flow', (_titulo, Page) => {
    render(<Page />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/quiz')
  })
})
