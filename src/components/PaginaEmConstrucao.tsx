import Link from 'next/link'

type PaginaEmConstrucaoProps = {
  /** Page name, rendered as the h1 — the same label the menu uses. */
  titulo: string
  /** One sentence on what the page will do once it exists. */
  descricao: string
}

/**
 * Shell for a menu destination whose content is not built yet. Always offers a
 * way back to the part of the site that already works, so the menu never leads
 * into a dead end.
 */
export function PaginaEmConstrucao({ titulo, descricao }: PaginaEmConstrucaoProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mx-auto max-w-md">
        <h1 className="mb-3 text-3xl font-bold leading-tight text-primary">{titulo}</h1>

        <p className="mb-6 leading-relaxed text-gray-600">{descricao}</p>

        <p className="mb-8 text-sm font-medium uppercase tracking-wide text-gray-400">
          Página em construção
        </p>

        <Link
          href="/quiz"
          className="inline-block rounded-lg bg-highlight px-6 py-3 font-semibold text-white shadow transition-all hover:bg-primary active:scale-95"
        >
          Ir para a Bússola
        </Link>
      </div>
    </div>
  )
}
