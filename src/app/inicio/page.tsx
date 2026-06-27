'use client'

import Link from 'next/link'

const HERO_TITLE = 'Descubra quais candidatos pensam como você'
const HERO_SUBTITLE =
  'Responda 14 perguntas sobre temas políticos e veja o percentual de alinhamento com os candidatos das eleições 2026 no seu estado.'
const DISCLAIMER =
  'O VotoSim é uma ferramenta de informação, não faz recomendações de voto. Desenvolvido de forma independente, sem vínculo com partidos ou candidatos.'

/** Welcome screen — entry point of the voter journey. */
export default function InicioPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mx-auto max-w-md">
        <h1 className="mb-4 text-3xl font-bold text-primary leading-tight">
          {HERO_TITLE}
        </h1>

        <p className="mb-8 text-gray-600 leading-relaxed">{HERO_SUBTITLE}</p>

        <Link
          href="/perfil"
          className="inline-block rounded-lg bg-highlight px-8 py-4 text-lg font-semibold text-white shadow hover:bg-primary active:scale-95 transition-all"
        >
          Começar agora
        </Link>

        <p className="mt-8 text-xs text-gray-400 leading-relaxed">{DISCLAIMER}</p>
      </div>
    </div>
  )
}
