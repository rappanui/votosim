import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarSobre } from '@/components/sobre/SidebarSobre'
import { GRUPOS, SECOES } from '@/lib/sobre/secoes'

let pathname = '/sobre'

jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

const indice = () => within(screen.getByRole('navigation', { name: /seções do sobre/i }))

describe('SidebarSobre', () => {
  beforeEach(() => {
    pathname = '/sobre'
  })

  it('lists every group title', () => {
    render(<SidebarSobre />)
    for (const grupo of GRUPOS) {
      expect(indice().getByRole('button', { name: grupo.titulo })).toBeInTheDocument()
    }
  })

  it('links every section to its own route', () => {
    render(<SidebarSobre />)
    for (const secao of SECOES) {
      expect(indice().getByRole('link', { name: secao.titulo })).toHaveAttribute(
        'href',
        `/sobre/${secao.slug}`,
      )
    }
  })

  it('marks the section being read', () => {
    const alvo = SECOES[3]
    pathname = `/sobre/${alvo.slug}`
    render(<SidebarSobre />)
    expect(indice().getByRole('link', { name: alvo.titulo })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('marks nothing on the index itself', () => {
    render(<SidebarSobre />)
    for (const secao of SECOES) {
      expect(indice().getByRole('link', { name: secao.titulo })).not.toHaveAttribute(
        'aria-current',
      )
    }
  })

  it('collapses a group when its header is clicked', async () => {
    const user = userEvent.setup()
    const grupo = GRUPOS[0]
    render(<SidebarSobre />)

    await user.click(indice().getByRole('button', { name: grupo.titulo }))

    expect(indice().queryByRole('link', { name: grupo.secoes[0].titulo })).not.toBeInTheDocument()
    expect(indice().getByRole('button', { name: grupo.titulo })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('keeps the other groups open when one collapses', async () => {
    const user = userEvent.setup()
    render(<SidebarSobre />)

    await user.click(indice().getByRole('button', { name: GRUPOS[0].titulo }))

    expect(indice().getByRole('link', { name: GRUPOS[1].secoes[0].titulo })).toBeInTheDocument()
  })
})
