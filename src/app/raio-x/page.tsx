import type { Metadata } from 'next'
import { PaginaEmConstrucao } from '@/components/PaginaEmConstrucao'

export const metadata: Metadata = { title: 'Raio-X | VotoSim' }

export default function RaioXPage() {
  return (
    <PaginaEmConstrucao
      titulo="Raio-X"
      descricao="Consulte um candidato e veja o que apuramos sobre ele - posições, fontes e alertas - e de onde saiu cada informação."
    />
  )
}
