import { P_NAO_INFORMADO_PCT } from '@/lib/types'

/**
 * Meanings mirror getTemaIcon in TemasPanel.tsx exactly — keep the two in
 * sync if that function changes. Rendered once per results page, not once
 * per card: every card uses the same six glyphs.
 */
const ITENS: { icone: string; rotulo: string; descricao: string }[] = [
  {
    icone: '✓',
    rotulo: 'Favorável',
    descricao: 'Posição documentada do candidato, alinhada com o que você respondeu.',
  },
  {
    icone: '─',
    rotulo: 'Parcial',
    descricao: 'Posição documentada do candidato, parcialmente alinhada com o que você respondeu.',
  },
  {
    icone: '✗',
    rotulo: 'Divergente',
    descricao: 'Posição documentada do candidato, contrária ao que você respondeu.',
  },
  {
    icone: '◐',
    rotulo: 'Sem lado',
    descricao: 'O candidato tem posição documentada sobre o tema, mas ela não responde à afirmação — não concorda nem discorda dela.',
  },
  {
    icone: '○',
    rotulo: 'Não auditado',
    descricao: `Não encontramos posição documentada do candidato nesse tema. É o que mais pesa contra ele: em vez de uma nota real, um tema não auditado conta como apenas ${P_NAO_INFORMADO_PCT}% de alinhamento.`,
  },
  {
    icone: '●',
    rotulo: 'Você marcou como importante',
    descricao: 'Você respondeu neutro nesse tema, mas disse que ele importa — por isso ele aparece aqui, mesmo sem entrar na conta do alinhamento.',
  },
]

/** Legend for the six glyphs TemasPanel can show in a theme row. Renders once per results page. */
export function LegendaIcones() {
  return (
    <div className="mb-8 rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-600">
      <p className="mb-2 font-semibold text-gray-700">O que os ícones significam</p>
      <dl className="flex flex-col gap-2">
        {ITENS.map(item => (
          <div key={item.icone} className="flex items-start gap-3">
            <dt aria-hidden="true" className="w-4 shrink-0 text-center text-sm">
              {item.icone}
            </dt>
            <dd>
              <span className="font-medium text-gray-700">{item.rotulo}.</span> {item.descricao}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
