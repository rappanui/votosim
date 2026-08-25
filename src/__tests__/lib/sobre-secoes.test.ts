import { GRUPOS, SECOES, encontrarSecao, grupoDaSecao } from '@/lib/sobre/secoes'

/**
 * The registry is the single source for both the sidebar and the routes. Every
 * invariant here exists so the two can never disagree: a menu item without a
 * page, or a page nobody can reach from the menu.
 */
describe('registro de secoes do Sobre', () => {
  it('has at least one section in every group', () => {
    for (const grupo of GRUPOS) {
      expect(grupo.secoes.length).toBeGreaterThan(0)
    }
  })

  it('flattens every group section into SECOES', () => {
    const total = GRUPOS.reduce((soma, grupo) => soma + grupo.secoes.length, 0)
    expect(SECOES).toHaveLength(total)
  })

  it('never repeats a section slug', () => {
    const slugs = SECOES.map((secao) => secao.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('never repeats a group slug', () => {
    const slugs = GRUPOS.map((grupo) => grupo.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('keeps every slug safe to put in a URL', () => {
    for (const secao of SECOES) {
      expect(secao.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
    for (const grupo of GRUPOS) {
      expect(grupo.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('gives every section a title and a one-line summary', () => {
    for (const secao of SECOES) {
      expect(secao.titulo.trim().length).toBeGreaterThan(0)
      expect(secao.resumo.trim().length).toBeGreaterThan(0)
    }
  })

  it('finds a section by its slug', () => {
    const alvo = SECOES[0]
    expect(encontrarSecao(alvo.slug)).toBe(alvo)
  })

  it('returns undefined for a slug that is not in the registry', () => {
    expect(encontrarSecao('nao-existe')).toBeUndefined()
  })

  it('reports the group a section belongs to', () => {
    const grupo = GRUPOS[1]
    const secao = grupo.secoes[0]
    expect(grupoDaSecao(secao.slug)).toBe(grupo)
  })

  it('returns undefined asking for the group of an unknown section', () => {
    expect(grupoDaSecao('nao-existe')).toBeUndefined()
  })
})
