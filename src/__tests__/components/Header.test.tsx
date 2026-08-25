import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Header } from '@/components/Header'

let pathname = '/quiz'

jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

const ITENS: [string, string][] = [
  ['Início', '/inicio'],
  ['Bússola', '/quiz'],
  ['Wiki', '/wiki'],
  ['Raio-X', '/raio-x'],
  ['Fale conosco', '/contato'],
  ['Sobre', '/sobre'],
]

const menuPrincipal = () => within(screen.getByRole('navigation', { name: /principal/i }))

const painelMobile = () => screen.queryByRole('navigation', { name: /mobile/i })

const abrir = () => screen.getByRole('button', { name: /abrir menu/i })

describe('Header', () => {
  beforeEach(() => {
    pathname = '/quiz'
  })

  it.each(ITENS)('links %s to %s', (rotulo, href) => {
    render(<Header />)
    expect(menuPrincipal().getByRole('link', { name: rotulo })).toHaveAttribute('href', href)
  })

  it('points the brand at the presentation page, like the Início item', () => {
    render(<Header />)
    expect(screen.getByRole('link', { name: 'VotoSim' })).toHaveAttribute('href', '/inicio')
  })

  it('marks the item of the current route with aria-current', () => {
    pathname = '/raio-x'
    render(<Header />)
    expect(menuPrincipal().getByRole('link', { name: 'Raio-X' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(menuPrincipal().getByRole('link', { name: 'Wiki' })).not.toHaveAttribute('aria-current')
  })

  it('keeps Bússola marked on /resultados, which belongs to that flow', () => {
    pathname = '/resultados'
    render(<Header />)
    expect(menuPrincipal().getByRole('link', { name: 'Bússola' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('does not mark any item on a route outside the menu', () => {
    pathname = '/rota-desconhecida'
    render(<Header />)
    for (const [rotulo] of ITENS) {
      expect(menuPrincipal().getByRole('link', { name: rotulo })).not.toHaveAttribute('aria-current')
    }
  })

  it('starts with the mobile panel closed', () => {
    render(<Header />)
    expect(painelMobile()).not.toBeInTheDocument()
    expect(abrir()).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the mobile panel with every destination in it', async () => {
    const user = userEvent.setup()
    render(<Header />)
    await user.click(abrir())
    expect(within(painelMobile()!).getAllByRole('link')).toHaveLength(ITENS.length)
  })

  it('closes the mobile panel on Escape', async () => {
    const user = userEvent.setup()
    render(<Header />)
    await user.click(abrir())
    await user.keyboard('{Escape}')
    expect(painelMobile()).not.toBeInTheDocument()
  })

  it('closes the mobile panel once the route has changed', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Header />)
    await user.click(abrir())
    expect(painelMobile()).toBeInTheDocument()

    pathname = '/wiki'
    rerender(<Header />)

    expect(painelMobile()).not.toBeInTheDocument()
  })
})
