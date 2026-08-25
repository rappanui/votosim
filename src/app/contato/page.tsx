import type { Metadata } from 'next'
import { PaginaEmConstrucao } from '@/components/PaginaEmConstrucao'

export const metadata: Metadata = { title: 'Fale conosco | VotoSim' }

export default function ContatoPage() {
  return (
    <PaginaEmConstrucao
      titulo="Fale conosco"
      descricao="Canal para correções, dúvidas e contestação de dados de candidatos."
    />
  )
}
