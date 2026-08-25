'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type ItemMenu = {
  rotulo: string
  href: string
  /** Extra routes that belong to the same flow and keep this item marked. */
  rotasIrmas?: string[]
}

const ITENS: ItemMenu[] = [
  { rotulo: 'Início', href: '/inicio' },
  { rotulo: 'Bússola', href: '/quiz', rotasIrmas: ['/resultados'] },
  { rotulo: 'Wiki', href: '/wiki' },
  { rotulo: 'Raio-X', href: '/raio-x' },
  { rotulo: 'Fale conosco', href: '/contato' },
  { rotulo: 'Sobre', href: '/sobre' },
]

function ehRotaAtual(item: ItemMenu, pathname: string): boolean {
  return pathname === item.href || (item.rotasIrmas?.includes(pathname) ?? false)
}

function ItemLink({
  item,
  atual,
  className,
}: {
  item: ItemMenu
  atual: boolean
  className: string
}) {
  return (
    <Link
      href={item.href}
      aria-current={atual ? 'page' : undefined}
      className={`${className} ${atual ? 'text-white' : 'text-white/70 hover:text-white'}`}
    >
      {item.rotulo}
    </Link>
  )
}

export function Header() {
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)
  const [rotaRenderizada, setRotaRenderizada] = useState(pathname)

  // Any navigation closes the panel — including the browser's back button,
  // which no click handler would catch. Adjusted during render rather than in
  // an effect: an effect here would paint the stale open panel first.
  if (pathname !== rotaRenderizada) {
    setRotaRenderizada(pathname)
    setAberto(false)
  }

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto])

  return (
    <header className="fixed top-0 z-20 w-full bg-primary shadow-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link
          href="/inicio"
          className="text-xl font-bold tracking-tight text-white hover:text-white/90"
        >
          VotoSim
        </Link>

        <nav aria-label="Navegação principal" className="hidden items-center gap-6 md:flex">
          {ITENS.map((item) => (
            <ItemLink
              key={item.href}
              item={item}
              atual={ehRotaAtual(item, pathname)}
              className="text-sm font-medium transition-colors"
            />
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setAberto((estava) => !estava)}
          aria-expanded={aberto}
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          className="-mr-2 rounded p-2 text-white md:hidden"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            {aberto ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {aberto && (
        <nav
          aria-label="Navegação mobile"
          className="flex flex-col border-t border-white/20 bg-primary pb-2 md:hidden"
        >
          {ITENS.map((item) => (
            <ItemLink
              key={item.href}
              item={item}
              atual={ehRotaAtual(item, pathname)}
              className="px-6 py-3 text-base font-medium"
            />
          ))}
        </nav>
      )}
    </header>
  )
}
