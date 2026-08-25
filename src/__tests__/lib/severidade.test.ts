import { severidadeMaisAlta, corPorSeveridade, rotuloPorSeveridade, rotuloSeveridade } from '@/lib/severidade'
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

describe('rotuloSeveridade', () => {
  it('reads baixa as leve in both genders, invariant', () => {
    expect(rotuloSeveridade('baixa', 'masc')).toBe('leve')
    expect(rotuloSeveridade('baixa', 'fem')).toBe('leve')
  })

  it('reads alta as grave in both genders, invariant', () => {
    expect(rotuloSeveridade('alta', 'masc')).toBe('grave')
    expect(rotuloSeveridade('alta', 'fem')).toBe('grave')
  })

  it('reads media as moderado, agreeing with gender', () => {
    expect(rotuloSeveridade('media', 'masc')).toBe('moderado')
    expect(rotuloSeveridade('media', 'fem')).toBe('moderada')
  })

  it('reads critica as critico, agreeing with gender', () => {
    expect(rotuloSeveridade('critica', 'masc')).toBe('crítico')
    expect(rotuloSeveridade('critica', 'fem')).toBe('crítica')
  })
})

describe('rotuloPorSeveridade', () => {
  it('states zero in the masculine plural when the list is empty', () => {
    expect(rotuloPorSeveridade([], 'masc')).toBe('0 detectados')
  })

  it('states zero in the feminine plural when the list is empty', () => {
    expect(rotuloPorSeveridade([], 'fem')).toBe('0 detectadas')
  })

  it('states a single masculine item in the singular, severity and verb agreeing', () => {
    expect(rotuloPorSeveridade([item('baixa')], 'masc')).toBe('1 leve detectado')
  })

  it('states a single feminine item in the singular, severity and verb agreeing', () => {
    expect(rotuloPorSeveridade([item('baixa')], 'fem')).toBe('1 leve detectada')
  })

  it('pluralizes a repeated severity in the masculine', () => {
    expect(rotuloPorSeveridade([item('media'), item('media')], 'masc')).toBe('2 moderados detectados')
  })

  it('pluralizes a repeated severity in the feminine', () => {
    expect(rotuloPorSeveridade([item('media'), item('media')], 'fem')).toBe('2 moderadas detectadas')
  })

  it('lists two distinct severities most-severe first, joined by "e"', () => {
    expect(rotuloPorSeveridade([item('baixa'), item('critica')], 'masc')).toBe('1 crítico e 1 leve detectados')
  })

  it('uses Oxford-comma style for three or more groups', () => {
    expect(rotuloPorSeveridade([item('media'), item('critica'), item('alta')], 'masc'))
      .toBe('1 crítico, 1 grave e 1 moderado detectados')
  })

  it('agrees the verb with the total count, not the number of groups', () => {
    expect(rotuloPorSeveridade([item('critica'), item('critica'), item('baixa')], 'masc'))
      .toBe('2 críticos e 1 leve detectados')
  })

  it('keeps the invariant forms unchanged across genders even inside a group', () => {
    expect(rotuloPorSeveridade([item('alta'), item('alta')], 'fem')).toBe('2 graves detectadas')
  })
})
