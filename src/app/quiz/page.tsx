'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuiz } from '@/context/QuizContext'
import { QuizCard } from '@/components/QuizCard'
import { createClient } from '@/lib/supabase'
import type { TemaQuestionario, VoterPosicao, Importancia } from '@/lib/types'

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

/** Non-neutral answers required before the voter can see results. */
const MIN_RESPOSTAS = 3

const mapDbRowToTema = (row: Record<string, string>): TemaQuestionario => ({
  slug: row.slug,
  nome: row.nome,
  afirmacaoQuestionario: row.afirmacao_questionario,
  contextoQuestionario: row.contexto_questionario,
  notaEducativa: row.nota_educativa,
})

async function fetchTemas(supabase: ReturnType<typeof createClient>): Promise<TemaQuestionario[]> {
  const { data, error } = await supabase
    .from('themes_catalog')
    .select('slug, nome, afirmacao_questionario, contexto_questionario, nota_educativa')
    .eq('exibir_no_quiz', true)
    .order('ordem_exibicao')
  if (error) throw new Error(`Failed to load questions: ${error.message}`)
  return (data as Record<string, string>[]).map(mapDbRowToTema)
}

/** Single-page quiz: estado selector + question cards in a responsive grid. */
export default function QuizPage() {
  const router = useRouter()
  const { estado, respostas, setEstado, setResposta } = useQuiz()

  const [temas, setTemas] = useState<TemaQuestionario[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetchTemas(createClient())
      .then(data => { setTemas(data); setLoading(false) })
      .catch(err => { setLoadError((err as Error).message); setLoading(false) })
  }, [])

  // Neutral answers are excluded on purpose. Match v3 keeps a voter-neutral
  // theme out of both score denominators, so three neutrals would clear the
  // gate and produce a results page where every candidate scores zero and the
  // MIN_SCORE_THRESHOLD filter then removes all of them — an empty screen with
  // no error to explain it.
  const respostasQueContam = respostas.filter(r => r.posicao !== 'neutro').length
  const canSubmit = Boolean(estado) && respostasQueContam >= MIN_RESPOSTAS

  function handleCardChange(slug: string, posicao: VoterPosicao, importancia: Importancia) {
    setResposta({ temaSlug: slug, posicao, importancia })
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Carregando perguntas…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-red-600">Erro ao carregar perguntas. Recarregue a página.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-16 z-10 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            Estado:
            <select
              value={estado}
              onChange={e => setEstado(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">Selecione…</option>
              {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </label>
          <span className="ml-auto text-sm text-gray-500">
            {respostas.length}/{temas.length} respondidas
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {temas.map(tema => {
            const existing = respostas.find(r => r.temaSlug === tema.slug)
            return (
              <QuizCard
                key={tema.slug}
                tema={tema}
                initialPosicao={existing?.posicao}
                initialImportancia={existing?.importancia}
                onChange={(p, imp) => handleCardChange(tema.slug, p, imp)}
              />
            )
          })}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-4">
          {/* Spans the row up to the button so the two read as one control:
              this is what is blocking, that is what it unblocks. The sentence
              stays fixed and the counter carries the progress — a countdown
              ("responda ao menos 1 pergunta") reads as the whole requirement
              rather than what is left of it. */}
          {!canSubmit && (
            <p
              data-testid="quiz-gate"
              className="flex flex-1 items-baseline gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900"
            >
              {!estado ? (
                'Selecione seu estado para continuar.'
              ) : (
                <>
                  <span className="text-sm font-bold tabular-nums">
                    ({respostasQueContam}/{MIN_RESPOSTAS})
                  </span>
                  <span>
                    Responda ao menos {MIN_RESPOSTAS} perguntas para continuar.
                    Respostas neutras não contam.
                  </span>
                </>
              )}
            </p>
          )}
          <button
            onClick={() => canSubmit && router.push('/resultados')}
            disabled={!canSubmit}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Ver candidatos →
          </button>
        </div>
      </div>
    </div>
  )
}
