import type { Metadata } from 'next'
import { PaginaEmConstrucao } from '@/components/PaginaEmConstrucao'

export const metadata: Metadata = { title: 'Wiki | VotoSim' }

export default function WikiPage() {
  return (
    <PaginaEmConstrucao
      titulo="Wiki"
      descricao="Como funciona a política brasileira: o que cada cargo decide e o que está em jogo em 2026."
    />
  )
}
