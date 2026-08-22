import type { RespostaUsuario, CandidatoResultado, TemaCandidatoDetalhe, PerfilUsuario } from '@/lib/types'

describe('RespostaUsuario shape', () => {
  it('accepts posicao and importancia', () => {
    const r: RespostaUsuario = { temaSlug: 'sus_saude_publica', posicao: 'favoravel', importancia: 3 }
    expect(r.posicao).toBe('favoravel')
    expect(r.importancia).toBe(3)
  })

  it('does not have concordancia or intensidade fields', () => {
    const r: RespostaUsuario = { temaSlug: 'sus_saude_publica', posicao: 'favoravel', importancia: 2 }
    expect('concordancia' in r).toBe(false)
    expect('intensidade' in r).toBe(false)
  })
})

describe('CandidatoResultado shape', () => {
  it('has alinhamento and cobertura instead of score', () => {
    const c: CandidatoResultado = {
      politicianId: 'x',
      nomeUrna: 'Test',
      partido: 'PT',
      alinhamento: 80,
      cobertura: 75,
      detalhesTemas: [],
      temAlertas: false,
      alertas: [],
    }
    expect(c.alinhamento).toBe(80)
    expect(c.cobertura).toBe(75)
    expect('score' in c).toBe(false)
    expect('temasAlinhados' in c).toBe(false)
  })
})

describe('TemaCandidatoDetalhe shape', () => {
  it('has candidatePosicao typed as number or null', () => {
    const d: TemaCandidatoDetalhe = {
      temaSlug: 'sus_saude_publica',
      voterPosicao: 'favoravel',
      voterImportancia: 3,
      candidatePosicao: 4.6,
      candidateImportancia: 5,
      alignment: 0.9,
      contouNoScore: true,
      posicaoViaPartido: false,
      baixaConfianca: false,
    }
    expect(typeof d.candidatePosicao).toBe('number')
  })

  it('accepts null candidatePosicao when no data', () => {
    const d: TemaCandidatoDetalhe = {
      temaSlug: 'sus_saude_publica',
      voterPosicao: 'favoravel',
      voterImportancia: 2,
      candidatePosicao: null,
      candidateImportancia: null,
      alignment: null,
      contouNoScore: false,
      posicaoViaPartido: false,
      baixaConfianca: false,
    }
    expect(d.candidatePosicao).toBeNull()
  })
})

describe('PerfilUsuario shape', () => {
  it('has estado and respostas but no municipio or faixaEtaria', () => {
    const p: PerfilUsuario = {
      estado: 'SP',
      respostas: [],
      sessionToken: 'abc',
      timestamp: '2026-01-01T00:00:00Z',
    }
    expect(p.estado).toBe('SP')
    expect('municipio' in p).toBe(false)
    expect('faixaEtaria' in p).toBe(false)
  })
})
