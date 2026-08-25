import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TEXTOS } from '@/components/sobre/Textos'
import { SECOES, encontrarSecao } from '@/lib/sobre/secoes'

type Props = { params: Promise<{ secao: string }> }

export function generateStaticParams() {
  return SECOES.map((secao) => ({ secao: secao.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { secao: slug } = await params
  const secao = encontrarSecao(slug)
  return { title: secao ? `${secao.titulo} | Sobre o VotoSim` : 'Sobre o VotoSim' }
}

export default async function SecaoPage({ params }: Props) {
  const { secao: slug } = await params
  const secao = encontrarSecao(slug)
  if (!secao) notFound()

  const Texto = TEXTOS[secao.slug]

  return (
    <article className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold text-primary">{secao.titulo}</h1>
      <p className="mb-8 text-gray-500">{secao.resumo}</p>

      {Texto ? (
        <Texto />
      ) : (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-gray-500">
          Ainda não escrevemos esta parte. Ela está listada aqui porque vai existir, e
          preferimos dizer isso a deixar você procurando por uma página que não abre.
        </p>
      )}
    </article>
  )
}
