'use client'

import { useState } from 'react'
import { SidebarSobre } from './SidebarSobre'

/**
 * Wraps the section index so it can collapse on narrow screens. The index is
 * rendered once and hidden with CSS rather than mounted twice, so a screen
 * reader never meets two copies of the same navigation.
 */
export function IndiceSobre() {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto((estava) => !estava)}
        aria-expanded={aberto}
        className="mb-4 flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold text-primary md:hidden"
      >
        Seções do Sobre
        <span aria-hidden="true" className="text-gray-400">
          {aberto ? '−' : '+'}
        </span>
      </button>

      <div className={aberto ? 'block' : 'hidden md:block'}>
        <SidebarSobre />
      </div>
    </>
  )
}
