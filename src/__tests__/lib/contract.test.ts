import { assertMatchResult, ContractMismatchError } from '@/lib/contract'

const candidatoValido = {
  politicianId: 'p1', nomeUrna: 'FULANO', partido: 'PT',
  cargo: 'presidente', numeroUrna: '13',
  alinhamento: 39, alinhamentoApurado: 90, cobertura: 36, confiancaResultado: 36,
  detalhesTemas: [], temAlertas: false, alertas: [],
  dossie: null, fontes: [], observacoes: [], coerenciaPorTema: {},
}

const respostaValida = {
  cargos: [{ cargo: 'presidente', candidatos: [candidatoValido] }],
  totalCandidatosAnalisados: 1,
  estado: 'SP',
}

describe('assertMatchResult', () => {
  it('accepts a complete v3 response', () => {
    expect(() => assertMatchResult(respostaValida)).not.toThrow()
  })

  it('accepts a response with no candidates at all', () => {
    expect(() => assertMatchResult({ cargos: [], totalCandidatosAnalisados: 0, estado: 'SP' })).not.toThrow()
  })

  it('rejects a response missing confiancaResultado and names the field', () => {
    const { confiancaResultado, ...semCampo } = candidatoValido
    const stale = { ...respostaValida, cargos: [{ cargo: 'presidente', candidatos: [semCampo] }] }
    expect(() => assertMatchResult(stale)).toThrow(ContractMismatchError)
    try {
      assertMatchResult(stale)
    } catch (e) {
      expect((e as ContractMismatchError).campoAusente).toBe('confiancaResultado')
    }
  })

  it.each([
    'alinhamentoApurado', 'cargo', 'alertas', 'observacoes', 'fontes', 'coerenciaPorTema',
  ])('rejects a response missing %s', campo => {
    const semCampo: Record<string, unknown> = { ...candidatoValido }
    delete semCampo[campo]
    const stale = { ...respostaValida, cargos: [{ cargo: 'presidente', candidatos: [semCampo] }] }
    expect(() => assertMatchResult(stale)).toThrow(ContractMismatchError)
  })

  it('rejects a response that is not an object', () => {
    expect(() => assertMatchResult(null)).toThrow(ContractMismatchError)
    expect(() => assertMatchResult('erro')).toThrow(ContractMismatchError)
  })

  it('rejects a response with no cargos array', () => {
    expect(() => assertMatchResult({ totalCandidatosAnalisados: 0, estado: 'SP' })).toThrow(ContractMismatchError)
  })

  // The exact shape the stale deployment produced on 2026-08-24.
  it('rejects the pre-v3 response shape', () => {
    const preV3 = {
      cargos: [{ cargo: 'presidente', candidatos: [{
        politicianId: 'p1', nomeUrna: 'VETERINÁRIO WILSON GRASSI', partido: 'DEMOCRATA',
        alinhamento: 90, cobertura: 36,
        detalhesTemas: [], temAlertas: false, alertas: [],
      }] }],
      totalCandidatosAnalisados: 1, estado: 'SP',
    }
    expect(() => assertMatchResult(preV3)).toThrow(ContractMismatchError)
  })
})
