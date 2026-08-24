'use client'

import { useState } from 'react'

interface AcordeaoProps {
  titulo: string
  /** Omit to render no counter at all — zero and absent are different states. */
  contador?: number
  contadorClassName?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

/** Collapsible block used by the candidate card's right-hand panel. */
export function Acordeao({
  titulo,
  contador,
  contadorClassName = 'text-gray-500',
  defaultOpen = false,
  children,
}: AcordeaoProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-gray-100">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-700"
      >
        <span className="text-gray-400">{open ? '▾' : '▸'}</span>
        <span className="flex-1 font-semibold">{titulo}</span>
        {contador !== undefined && (
          <span data-testid="acordeao-contador" className={`text-sm font-semibold ${contadorClassName}`}>
            {contador}
          </span>
        )}
      </button>
      {open && <div className="border-t border-gray-100 px-4 py-3">{children}</div>}
    </div>
  )
}
