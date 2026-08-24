import type { RespostaUsuario, CandidatoResultado, TemaCandidatoDetalhe, PerfilUsuario, Dossie, Fonte, Observacao } from '@/lib/types'

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
      cargo: 'presidente',
      numeroUrna: '13',
      alinhamento: 80,
      alinhamentoApurado: 90,
      cobertura: 75,
      confiancaResultado: 75,
      detalhesTemas: [],
      temAlertas: false,
      alertas: [],
      dossie: null,
      fontes: [],
      observacoes: [],
      coerenciaPorTema: {},
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
      temaNome: 'SUS e saúde pública',
      voterPosicao: 'favoravel',
      voterImportancia: 3,
      candidatePosicao: 4.6,
      candidateImportancia: 5,
      alignment: 0.9,
      contouNoScore: true,
      evidencia: 'direta',
      neutroMotivo: null,
      justificativa: null,
      posicaoViaPartido: false,
      baixaConfianca: false,
    }
    expect(typeof d.candidatePosicao).toBe('number')
  })

  it('accepts null candidatePosicao when no data', () => {
    const d: TemaCandidatoDetalhe = {
      temaSlug: 'sus_saude_publica',
      temaNome: 'SUS e saúde pública',
      voterPosicao: 'favoravel',
      voterImportancia: 2,
      candidatePosicao: null,
      candidateImportancia: null,
      alignment: null,
      contouNoScore: false,
      evidencia: 'ausente',
      neutroMotivo: null,
      justificativa: null,
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

describe('enriched candidate contract on match v3', () => {
  it('accepts a fully enriched candidate', () => {
    const dossie: Dossie = {
      resumoPerfil: 'Advogada de Cuiabá, primeira candidatura a cargo eletivo.',
      espectroDeclarado: 'centro',
      espectroInferido: 'centro',
      coerenciaIndice: null,
      coerenciaBase: 'Sem histórico para comparar.',
      geradoEm: '2026-08-22T14:58:56.730052+00:00',
    }
    const fonte: Fonte = {
      id: 's1', tipo: 'noticia', camada: 2, titulo: 'DC oficializa candidatura',
      veiculo: 'CNN Brasil', url: 'https://cnn.example',
      dataPublicacao: '2026-08-05', acessadoEm: '2026-08-22T14:58:56Z',
    }
    const observacao: Observacao = {
      categoria: 'ressalva',
      titulo: 'Saúde pública',
      descricao: 'Posição lida no programa do partido.',
      temaSlug: 'saude_sus',
      fonteUrl: null,
    }
    const candidato: CandidatoResultado = {
      politicianId: 'uuid-1', nomeUrna: 'CLARIANA BARÃO', partido: 'DC',
      cargo: 'presidente', numeroUrna: '27',
      alinhamento: 39, alinhamentoApurado: 90, cobertura: 36, confiancaResultado: 36,
      detalhesTemas: [{
        temaSlug: 'saude_sus', temaNome: 'Saúde pública',
        voterPosicao: 'favoravel', voterImportancia: 3,
        evidencia: 'partido', neutroMotivo: null,
        justificativa: 'O eixo de saúde do plano foca na atenção primária.',
        candidatePosicao: 4, candidateImportancia: 2, alignment: 0.75,
        contouNoScore: true, posicaoViaPartido: true, baixaConfianca: false,
      }],
      temAlertas: false, alertas: [],
      dossie, fontes: [fonte], observacoes: [observacao],
      coerenciaPorTema: { saude_sus: 'sem_historico' },
    }
    expect(candidato.dossie?.coerenciaIndice).toBeNull()
    expect(candidato.fontes[0].camada).toBe(2)
    expect(candidato.observacoes[0].categoria).toBe('ressalva')
    expect(candidato.coerenciaPorTema.saude_sus).toBe('sem_historico')
  })
})
