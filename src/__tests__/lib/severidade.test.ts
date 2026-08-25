import { severidadeMaisAlta, corPorSeveridade, rotuloPorSeveridade } from '@/lib/severidade'
import type { AlertSeverity } from '@/lib/types'

const item = (severidade: AlertSeverity) => ({ severidade })

describe('severidadeMaisAlta', () => {
  it('returns null for an empty list', () => {
    expect(severidadeMaisAlta([])).toBeNull()
  })

  it('returns the only severity present', () => {
    expect(severidadeMaisAlta([item('media')])).toBe('media')
  })

  it('picks critica over alta, media and baixa, regardless of order', () => {
    expect(severidadeMaisAlta([item('baixa'), item('critica'), item('media')])).toBe('critica')
  })

  it('picks alta over media and baixa when no critica is present', () => {
    expect(severidadeMaisAlta([item('baixa'), item('alta'), item('media')])).toBe('alta')
  })

  it('picks media over baixa when neither critica nor alta is present', () => {
    expect(severidadeMaisAlta([item('baixa'), item('media')])).toBe('media')
  })
})

describe('corPorSeveridade', () => {
  it('is green when there is nothing to report', () => {
    expect(corPorSeveridade([])).toBe('text-success')
  })

  it('is red when the highest severity present is critica', () => {
    expect(corPorSeveridade([item('baixa'), item('critica')])).toBe('text-danger')
  })

  it('is orange when the highest severity present is alta', () => {
    expect(corPorSeveridade([item('alta'), item('baixa')])).toBe('text-warning')
  })

  it('is amber when the highest severity present is media', () => {
    expect(corPorSeveridade([item('media'), item('baixa')])).toBe('text-amber-700')
  })

  it('is gray when only baixa is present', () => {
    expect(corPorSeveridade([item('baixa'), item('baixa')])).toBe('text-gray-500')
  })
})

describe('rotuloPorSeveridade', () => {
  it('states a single item in the singular, severity and verb agreeing', () => {
    expect(rotuloPorSeveridade([item('baixa')])).toBe('1 baixo detectado')
  })

  it('pluralizes a repeated severity', () => {
    expect(rotuloPorSeveridade([item('media'), item('media')])).toBe('2 médios detectados')
  })

  it('lists two distinct severities most-severe first, joined by "e"', () => {
    expect(rotuloPorSeveridade([item('baixa'), item('critica')])).toBe('1 crítico e 1 baixo detectados')
  })

  it('uses Oxford-comma style for three or more groups', () => {
    expect(rotuloPorSeveridade([item('media'), item('critica'), item('alta')]))
      .toBe('1 crítico, 1 alto e 1 médio detectados')
  })

  it('agrees the verb with the total count, not the number of groups', () => {
    expect(rotuloPorSeveridade([item('critica'), item('critica'), item('baixa')]))
      .toBe('2 críticos e 1 baixo detectados')
  })
})
