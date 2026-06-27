'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuiz } from '@/context/QuizContext'
import { createClient } from '@/lib/supabase'
import { derivarConcordancia, type TemaQuestionario, type Resposta } from '@/lib/types'

const DEFAULT_SLIDER_VALUE: Resposta = 3
const TOTAL_QUESTIONS = 14

const SCALE_LABELS: Record<number, string> = {
  1: 'Discordo totalmente',
  2: 'Discordo parcialmente',
  3: 'Não tenho opinião',
  4: 'Concordo parcialmente',
  5: 'Concordo totalmente',
}

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

/** Renders one question at a time from themes_catalog. Manages slider interaction state. */
export default function QuestionarioPage() {
  const router = useRouter()
  const { respostas, setResposta, setQuestionarioIndex, questionarioIndex } = useQuiz()

  const [temas, setTemas] = useState<TemaQuestionario[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sliderValue, setSliderValue] = useState<Resposta>(DEFAULT_SLIDER_VALUE)
  const [touched, setTouched] = useState(false)
  const [expandedInfo, setExpandedInfo] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    fetchTemas(supabase)
      .then(data => { setTemas(data); setLoading(false) })
      .catch(err => { setLoadError(err.message); setLoading(false) })
  }, [])

  // Restore previous answer when navigating back to a question
  useEffect(() => {
    const existing = respostas.find(r => r.temaSlug === temas[questionarioIndex]?.slug)
    if (existing) {
      setSliderValue(existing.resposta)
      setTouched(true)
    } else {
      setSliderValue(DEFAULT_SLIDER_VALUE)
      setTouched(false)
    }
    setExpandedInfo(false)
  }, [questionarioIndex, temas, respostas])

  function navigateNext() {
    const nextIndex = questionarioIndex + 1
    if (nextIndex >= temas.length) {
      router.push('/revisao')
    } else {
      setQuestionarioIndex(nextIndex)
    }
  }

  function handleProxima() {
    if (!touched) return
    const tema = temas[questionarioIndex]
    setResposta({
      temaSlug: tema.slug,
      resposta: sliderValue,
      concordancia: derivarConcordancia(sliderValue),
      intensidade: sliderValue,
    })
    navigateNext()
  }

  function handlePular() {
    const tema = temas[questionarioIndex]
    setResposta({
      temaSlug: tema.slug,
      resposta: DEFAULT_SLIDER_VALUE,
      concordancia: 'neutro',
      intensidade: DEFAULT_SLIDER_VALUE,
    })
    navigateNext()
  }

  function handleVoltar() {
    if (questionarioIndex > 0) setQuestionarioIndex(questionarioIndex - 1)
  }

  function handleSliderChange(value: number) {
    setSliderValue(value as Resposta)
    setTouched(true)
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Carregando perguntas…</p>
      </div>
    )
  }

  if (loadError || temas.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-danger">Erro ao carregar perguntas. Recarregue a página.</p>
      </div>
    )
  }

  const tema = temas[questionarioIndex]
  const isLastQuestion = questionarioIndex >= TOTAL_QUESTIONS - 1

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">
      <div>
        <p className="mb-3 text-lg font-semibold leading-snug text-primary">
          {tema.afirmacaoQuestionario}
        </p>

        <button
          onClick={() => setExpandedInfo(prev => !prev)}
          className="flex items-center gap-1 text-sm text-highlight underline"
        >
          {expandedInfo ? 'Fechar' : 'Saiba mais'}
        </button>

        {expandedInfo && (
          <p className="mt-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 leading-relaxed">
            {tema.contextoQuestionario}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <input
          type="range"
          role="slider"
          min={1}
          max={5}
          step={1}
          value={sliderValue}
          onChange={e => handleSliderChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-highlight"
          aria-label="Nível de concordância"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>Discordo</span>
          <span className="font-medium text-highlight">
            {touched ? SCALE_LABELS[sliderValue] : 'Mova o controle para responder'}
          </span>
          <span>Concordo</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={handleProxima}
          disabled={!touched}
          className="rounded-lg bg-highlight px-6 py-3 font-semibold text-white shadow transition-all hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLastQuestion ? 'Revisar respostas' : 'Próxima'}
        </button>

        <button
          onClick={handlePular}
          className="rounded-lg border border-gray-300 px-6 py-3 text-sm text-gray-600 hover:bg-gray-50"
        >
          Pular esta pergunta
        </button>

        {questionarioIndex > 0 && (
          <button
            onClick={handleVoltar}
            className="text-sm text-gray-400 underline hover:text-gray-600"
          >
            Voltar
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">ⓘ {tema.notaEducativa}</p>
    </div>
  )
}
