import { render } from '@testing-library/react'
import { TEXTOS } from '@/components/sobre/Textos'
import { SECOES } from '@/lib/sobre/secoes'

const prontas = SECOES.filter((secao) => secao.pronta)
const cascas = SECOES.filter((secao) => !secao.pronta)

describe('textos do Sobre', () => {
  it('has at least one written section and one shell, so both paths are covered', () => {
    expect(prontas.length).toBeGreaterThan(0)
    expect(cascas.length).toBeGreaterThan(0)
  })

  it.each(prontas.map((secao) => [secao.slug]))('has a text for %s', (slug) => {
    expect(TEXTOS[slug]).toBeDefined()
  })

  it.each(cascas.map((secao) => [secao.slug]))('has no text for the shell %s', (slug) => {
    expect(TEXTOS[slug]).toBeUndefined()
  })

  it('exposes no text whose slug is missing from the registry', () => {
    const conhecidos = new Set(SECOES.map((secao) => secao.slug))
    for (const slug of Object.keys(TEXTOS)) {
      expect(conhecidos.has(slug)).toBe(true)
    }
  })

  it.each(prontas.map((secao) => [secao.slug]))('renders readable prose for %s', (slug) => {
    const Texto = TEXTOS[slug]!
    const { container } = render(<Texto />)
    expect(container.textContent!.trim().length).toBeGreaterThan(120)
  })

  it.each(prontas.map((secao) => [secao.slug]))('writes %s without em dashes', (slug) => {
    const Texto = TEXTOS[slug]!
    const { container } = render(<Texto />)
    expect(container.textContent).not.toContain('—')
  })

  it('never promises a vote recommendation', () => {
    for (const slug of Object.keys(TEXTOS)) {
      const Texto = TEXTOS[slug]!
      const { container } = render(<Texto />)
      expect(container.textContent!.toLowerCase()).not.toMatch(
        /recomendamos (o )?voto|melhor candidato para voc/,
      )
    }
  })
})
