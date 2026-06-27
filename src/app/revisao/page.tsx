'use client'

import { useRouter } from 'next/navigation'
import { useQuiz } from '@/context/QuizContext'
import type { RespostaUsuario } from '@/lib/types'

const MIN_NON_NEUTRAL = 3

const CONCORDANCIA_LABEL: Record<string, string> = {
  concordo: 'Concordo',
  neutro:   'Pulei / Neutro',
  discordo: 'Discordo',
}

const CONCORDANCIA_COLOR: Record<string, string> = {
  concordo: 'text-success',
  neutro:   'text-gray-400',
  discordo: 'text-danger',
}

const countNonNeutral = (respostas: RespostaUsuario[]): number =>
  respostas.filter(r => r.concordancia !== 'neutro').length

/** Review screen — voter sees all their answers before triggering the match. */
export default function RevisaoPage() {
  const router = useRouter()
  const { respostas, setQuestionarioIndex } = useQuiz()

  const nonNeutralCount = countNonNeutral(respostas)
  const canSeeResults = nonNeutralCount >= MIN_NON_NEUTRAL

  function handleEditAnswer(questionIndex: number) {
    setQuestionarioIndex(questionIndex)
    router.push('/questionario')
  }

  function handleVerCandidatos() {
    if (!canSeeResults) return
    router.push('/resultado')
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold text-primary">Revisão das respostas</h1>

      {respostas.length === 0 ? (
        <p className="text-gray-500">Nenhuma resposta registrada ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {respostas.map((r, index) => (
            <li
              key={r.temaSlug}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {r.temaSlug.replace(/_/g, ' ')}
                </p>
                <p className={`text-xs font-semibold ${CONCORDANCIA_COLOR[r.concordancia]}`}>
                  {CONCORDANCIA_LABEL[r.concordancia]}
                </p>
              </div>
              <button
                onClick={() => handleEditAnswer(index)}
                className="text-xs text-highlight underline hover:text-primary"
              >
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}

      {!canSeeResults && (
        <p className="text-sm text-gray-500">
          Responda pelo menos {MIN_NON_NEUTRAL} perguntas (sem pular) para ver os candidatos.{' '}
          Você tem {nonNeutralCount} resposta{nonNeutralCount !== 1 ? 's' : ''} não-neutra
          {nonNeutralCount !== 1 ? 's' : ''}.
        </p>
      )}

      <button
        onClick={handleVerCandidatos}
        disabled={!canSeeResults}
        className="rounded-lg bg-highlight px-6 py-3 font-semibold text-white shadow transition-all hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        Ver candidatos
      </button>
    </div>
  )
}
