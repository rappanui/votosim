'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuiz } from '@/context/QuizContext'

const ESTADOS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const FAIXAS_ETARIAS = [
  '16 a 17 anos (voto facultativo)',
  '18 a 24 anos',
  '25 a 34 anos',
  '35 a 44 anos',
  '45 a 59 anos',
  '60 anos ou mais',
]

const isFormComplete = (estado: string, municipio: string, faixaEtaria: string): boolean =>
  estado !== '' && municipio.trim() !== '' && faixaEtaria !== ''

/** Collects voter profile (state, city, age range) before the questionnaire. */
export default function PerfilPage() {
  const router = useRouter()
  const { setPerfil, resetQuiz } = useQuiz()

  const [estado, setEstado] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [faixaEtaria, setFaixaEtaria] = useState('')

  const canContinue = isFormComplete(estado, municipio, faixaEtaria)

  function handleContinuar() {
    if (!canContinue) return
    resetQuiz()
    setPerfil({ estado, municipio, faixaEtaria })
    router.push('/questionario')
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold text-primary">Seu perfil</h1>
      <p className="text-gray-600">
        Essas informações determinam quais candidatos aparecem no seu resultado.
      </p>

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          <span>Estado</span>
          <select
            aria-label="Estado"
            value={estado}
            onChange={e => setEstado(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-highlight focus:outline-none"
          >
            <option value="">Selecione seu estado</option>
            {ESTADOS.map(uf => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          <span>Município</span>
          <input
            aria-label="Município"
            type="text"
            placeholder="Nome da sua cidade"
            value={municipio}
            onChange={e => setMunicipio(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-highlight focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          <span>Faixa etária</span>
          <select
            aria-label="Faixa etária"
            value={faixaEtaria}
            onChange={e => setFaixaEtaria(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-highlight focus:outline-none"
          >
            <option value="">Selecione sua faixa etária</option>
            {FAIXAS_ETARIAS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>

      <button
        onClick={handleContinuar}
        disabled={!canContinue}
        className="mt-2 rounded-lg bg-highlight px-6 py-3 font-semibold text-white shadow transition-all hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continuar
      </button>
    </div>
  )
}
