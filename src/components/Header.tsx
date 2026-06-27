'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuiz } from '@/context/QuizContext'
import { ProgressBar } from './ProgressBar'

const TOTAL_QUESTIONS = 14

/** Top navigation bar. Shows ProgressBar only on /questionario. */
export function Header() {
  const pathname = usePathname()
  const { questionarioIndex } = useQuiz()

  const isOnQuestionario = pathname === '/questionario'

  return (
    <header className="fixed top-0 z-10 w-full bg-primary px-6 py-3 shadow-md">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-2">
        <Link
          href="/inicio"
          className="text-xl font-bold tracking-tight text-white hover:text-white/90"
        >
          VotoSim
        </Link>
        {isOnQuestionario && (
          <ProgressBar
            current={questionarioIndex + 1}
            total={TOTAL_QUESTIONS}
          />
        )}
      </div>
    </header>
  )
}
