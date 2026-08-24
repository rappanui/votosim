'use client'

import Link from 'next/link'

export function Header() {
  return (
    <header className="fixed top-0 z-10 w-full bg-primary px-6 py-3 shadow-md">
      <div className="mx-auto flex max-w-2xl items-center justify-center">
        <Link
          href="/quiz"
          className="text-xl font-bold tracking-tight text-white hover:text-white/90"
        >
          VotoSim
        </Link>
      </div>
    </header>
  )
}
