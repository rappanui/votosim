'use client'

import Link from 'next/link'

const SECTIONS = [
  {
    title: 'O que é o VotoSim',
    content:
      'O VotoSim é uma ferramenta de informação eleitoral desenvolvida de forma independente, sem vínculo com partidos, candidatos ou veículos de comunicação. Não somos financiados por qualquer organização política.',
  },
  {
    title: 'Como funciona',
    content:
      'Você responde 14 perguntas sobre temas políticos em uma escala de 1 a 5. O sistema compara suas respostas com as posições documentadas dos candidatos do seu estado e calcula um percentual de alinhamento temático.',
  },
  {
    title: 'O que o percentual significa',
    content:
      'O percentual de alinhamento indica o grau de similaridade entre suas posições e as posições públicas dos candidatos. Um percentual alto significa que vocês concordam nos mesmos temas — não é uma recomendação de voto.',
  },
  {
    title: 'De onde vêm os dados',
    content:
      'Os dados dos candidatos são obtidos de fontes públicas oficiais: TSE Dados Abertos, DivulgaCandContas (planos de governo), Câmara dos Deputados e Senado Federal. Todos os dados são públicos e de acesso livre.',
  },
  {
    title: 'Alertas de candidatos',
    content:
      'Os alertas de "Ficha suja" são gerados automaticamente com base nos dados de certidões criminais do TSE. Os demais alertas passam por curadoria humana antes de serem exibidos. Alertas não excluem candidatos do resultado — o eleitor decide o peso de cada informação.',
  },
  {
    title: 'Privacidade',
    content:
      'Nenhum dado pessoal é coletado ou armazenado. O VotoSim é um produto stateless — suas respostas existem apenas na memória do seu navegador durante a sessão e são descartadas ao fechar a página.',
  },
  {
    title: 'Base legal',
    content:
      'Este produto está alinhado à Resolução TSE nº 23.755/2026. Os dados do TSE são utilizados com base no Portal de Dados Abertos do Tribunal Superior Eleitoral, que autoriza o livre acesso, uso e compartilhamento das informações.',
  },
]

/** Informational page about the product, methodology, and legal compliance. */
export default function SobrePage() {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <h1 className="mb-8 text-2xl font-bold text-primary">Sobre o VotoSim</h1>

      <div className="flex flex-col gap-8">
        {SECTIONS.map(section => (
          <section key={section.title}>
            <h2 className="mb-2 font-semibold text-gray-800">{section.title}</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{section.content}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 border-t border-gray-200 pt-6 text-center">
        <Link
          href="/inicio"
          className="inline-block rounded-lg bg-highlight px-6 py-3 font-semibold text-white hover:bg-primary"
        >
          Fazer o questionário
        </Link>
      </div>
    </div>
  )
}
