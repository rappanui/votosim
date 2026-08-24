import { render, screen } from '@testing-library/react'
import { CandidatoResumo } from '@/components/CandidatoResumo'
import type { Dossie } from '@/lib/types'

const makeDossie = (overrides: Partial<Dossie> = {}): Dossie => ({
  resumoPerfil: 'Advogada natural de Cuiabá, primeira candidatura a cargo eletivo.',
  espectroDeclarado: 'centro',
  espectroInferido: 'centro',
  coerenciaIndice: null,
  coerenciaBase: 'Não há base de comparação: primeira candidatura.',
  geradoEm: '2026-08-22T14:58:56Z',
  ...overrides,
})

describe('CandidatoResumo', () => {
  it('renders the profile summary', () => {
    render(<CandidatoResumo dossie={makeDossie()} />)
    expect(screen.getByText(/Advogada natural de Cuiabá/)).toBeInTheDocument()
  })

  it('renders both spectra with Portuguese labels', () => {
    render(<CandidatoResumo dossie={makeDossie({ espectroDeclarado: 'centro_esquerda', espectroInferido: 'esquerda' })} />)
    expect(screen.getByText(/centro-esquerda/)).toBeInTheDocument()
  })

  it('omits the spectrum line when both spectra are null', () => {
    render(<CandidatoResumo dossie={makeDossie({ espectroDeclarado: null, espectroInferido: null })} />)
    expect(screen.queryByText(/Espectro/)).not.toBeInTheDocument()
  })

  it('renders the coherence index with its basis when measured', () => {
    render(<CandidatoResumo dossie={makeDossie({ coerenciaIndice: 78, coerenciaBase: 'Plano de 2026 comparado ao governo 2023-2026.' })} />)
    expect(screen.getByText(/78/)).toBeInTheDocument()
    expect(screen.getByText(/Plano de 2026 comparado/)).toBeInTheDocument()
  })

  it('states there is no track record instead of showing a number when null', () => {
    render(<CandidatoResumo dossie={makeDossie({ coerenciaIndice: null })} />)
    expect(screen.getByText(/sem histórico para medir/i)).toBeInTheDocument()
  })
})
