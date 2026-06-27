import Link from 'next/link'

const DISCLAIMER =
  'O VotoSim é uma ferramenta informativa. Não somos filiados a partidos políticos nem recomendamos candidatos. A decisão de voto é exclusivamente do eleitor.'

/** Legal disclaimer shown on every page. Links to /sobre for full explanation. */
export function Footer() {
  return (
    <footer className="w-full border-t border-gray-200 bg-white px-6 py-4 text-center text-sm text-gray-500">
      <p>{DISCLAIMER}</p>
      <Link href="/sobre" className="mt-1 inline-block text-highlight underline hover:text-primary">
        Saiba mais sobre o VotoSim
      </Link>
    </footer>
  )
}
