'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GRUPOS } from '@/lib/sobre/secoes'

/**
 * Index of the Sobre section, built from the registry so it can never list a
 * page that does not exist. Every group starts open: with 22 short items, a
 * reader scanning for a subject is better served seeing all of them than
 * hunting through closed drawers. Collapsing is there for whoever wants it.
 */
export function SidebarSobre() {
  const pathname = usePathname()
  const [fechados, setFechados] = useState<string[]>([])

  const alternar = (slug: string) =>
    setFechados((atuais) =>
      atuais.includes(slug) ? atuais.filter((s) => s !== slug) : [...atuais, slug],
    )

  return (
    <nav aria-label="Seções do Sobre" className="text-sm">
      {GRUPOS.map((grupo) => {
        const aberto = !fechados.includes(grupo.slug)
        return (
          <div key={grupo.slug} className="mb-5">
            <button
              type="button"
              onClick={() => alternar(grupo.slug)}
              aria-expanded={aberto}
              className="flex w-full items-center justify-between gap-2 text-left font-semibold text-primary"
            >
              {grupo.titulo}
              <span aria-hidden="true" className="text-xs text-gray-400">
                {aberto ? '−' : '+'}
              </span>
            </button>

            {aberto && (
              <ul className="mt-2 space-y-1 border-l border-gray-200 pl-3">
                {grupo.secoes.map((secao) => {
                  const atual = pathname === `/sobre/${secao.slug}`
                  return (
                    <li key={secao.slug}>
                      <Link
                        href={`/sobre/${secao.slug}`}
                        aria-current={atual ? 'page' : undefined}
                        className={
                          atual
                            ? 'block py-1 font-medium text-highlight'
                            : 'block py-1 text-gray-600 hover:text-primary'
                        }
                      >
                        {secao.titulo}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}
