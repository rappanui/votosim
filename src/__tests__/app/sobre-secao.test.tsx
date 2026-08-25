import { render, screen } from '@testing-library/react'
import SecaoPage, { generateStaticParams, generateMetadata } from '@/app/sobre/[secao]/page'
import { SECOES } from '@/lib/sobre/secoes'

const notFoundMock = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

jest.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}))

const escrita = SECOES.find((secao) => secao.pronta)!
const casca = SECOES.find((secao) => !secao.pronta)!

const renderizar = async (slug: string) =>
  render(await SecaoPage({ params: Promise.resolve({ secao: slug }) }))

describe('rota /sobre/[secao]', () => {
  it('prerenders one route per section in the registry', async () => {
    const params = await generateStaticParams()
    expect(params.map((p) => p.secao).sort()).toEqual(SECOES.map((s) => s.slug).sort())
  })

  it('titles the browser tab with the section name', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ secao: escrita.slug }) })
    expect(metadata.title).toContain(escrita.titulo)
  })

  it('renders the section title as the heading', async () => {
    await renderizar(escrita.slug)
    expect(screen.getByRole('heading', { level: 1, name: escrita.titulo })).toBeInTheDocument()
  })

  it('renders the written text of a finished section', async () => {
    const { container } = await renderizar(escrita.slug)
    expect(container.textContent!.length).toBeGreaterThan(200)
  })

  it('says plainly that a shell section is not written yet', async () => {
    await renderizar(casca.slug)
    expect(screen.getByText(/ainda não escrevemos/i)).toBeInTheDocument()
  })

  it('still shows the shell section title and summary', async () => {
    await renderizar(casca.slug)
    expect(screen.getByRole('heading', { level: 1, name: casca.titulo })).toBeInTheDocument()
    expect(screen.getByText(casca.resumo)).toBeInTheDocument()
  })

  it('calls notFound for a slug outside the registry', async () => {
    await expect(renderizar('nao-existe')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })
})
