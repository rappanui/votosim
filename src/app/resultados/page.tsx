'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuiz } from '@/context/QuizContext'
import { CandidatoCard } from '@/components/CandidatoCard'
import { LegendaIcones } from '@/components/LegendaIcones'
import type { MatchResult, CargoResultado, PerfilUsuario } from '@/lib/types'

const EDGE_FUNCTION_PATH = '/functions/v1/match-candidatos'

const CARGO_LABELS: Record<string, string> = {
  presidente:        'Presidente',
  governador:        'Governador',
  senador:           'Senador',
  deputado_federal:  'Deputado Federal',
  deputado_estadual: 'Deputado Estadual',
}

function buildPayload(estado: string, respostas: PerfilUsuario['respostas']): PerfilUsuario {
  return {
    estado,
    respostas,
    sessionToken: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }
}

async function callMatchFunction(payload: PerfilUsuario): Promise<MatchResult> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}${EDGE_FUNCTION_PATH}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`Match function returned ${response.status}`)
  return response.json() as Promise<MatchResult>
}

/** Displays candidate match results with dual metric and per-theme transparency panel. */
export default function ResultadosPage() {
  const router = useRouter()
  const { estado, respostas } = useQuiz()

  const [resultado, setResultado] = useState<MatchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!estado) { router.push('/quiz'); return }
    callMatchFunction(buildPayload(estado, respostas))
      .then(data => { setResultado(data); setLoading(false) })
      .catch(err => { setError((err as Error).message); setLoading(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-gray-500">Analisando candidatos…</p>
      </div>
    )
  }

  if (error || !resultado) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="text-red-600">Erro ao carregar os resultados. Verifique sua conexão e tente novamente.</p>
        <button onClick={() => router.push('/quiz')} className="rounded-lg bg-blue-600 px-6 py-3 text-white">
          Voltar ao questionário
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold text-primary">Seu resultado</h1>
      <p className="mb-8 text-sm text-gray-500">
        {resultado.totalCandidatosAnalisados} candidato
        {resultado.totalCandidatosAnalisados !== 1 ? 's' : ''} analisado
        {resultado.totalCandidatosAnalisados !== 1 ? 's' : ''} em {resultado.estado}.
        Alinhamento e cobertura temática — não é uma recomendação de voto.
      </p>

      <LegendaIcones />

      <div className="flex flex-col gap-10">
        {resultado.cargos.map((grupo: CargoResultado) => (
          <section key={grupo.cargo}>
            <h2 className="mb-4 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-700">
              {CARGO_LABELS[grupo.cargo] ?? grupo.cargo}
            </h2>
            <div className="flex flex-col gap-4">
              {grupo.candidatos.map(candidato => (
                <CandidatoCard key={candidato.politicianId} candidato={candidato} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <button
        onClick={() => router.push('/quiz')}
        className="mt-10 w-full rounded-lg border border-gray-300 px-6 py-3 text-sm text-gray-600 hover:bg-gray-50"
      >
        Refazer o questionário
      </button>
    </div>
  )
}
