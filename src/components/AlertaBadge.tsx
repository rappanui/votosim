import type { Alerta, BadgeCor } from '@/lib/types'

const BADGE_LABELS: Record<Alerta['tipo'], string> = {
  ficha_suja:           'Ficha suja',
  investigacao:         'Em investigação',
  polemica:             'Atenção',
  incoerencia:          'Incoerência',
  divergencia_espectro: 'Divergência de espectro',
  ressalva_evidencias:  'Ressalva',
}

// ressalva_evidencias is a transparency flag, never an accusation — it is the
// only badge rendered as a light chip rather than a solid, saturated fill.
const BADGE_COLORS: Record<BadgeCor, string> = {
  vermelho: 'bg-danger text-white',
  laranja:  'bg-warning text-white',
  cinza:    'bg-gray-400 text-white',
  roxo:     'bg-purple-600 text-white',
  azul:     'bg-highlight text-white',
  amarelo:  'bg-amber-100 text-amber-900',
}

interface AlertaBadgeProps {
  alerta: Alerta
}

/** Pill badge for a single candidate alert. Color driven by badgeCor from the Edge Function. */
export function AlertaBadge({ alerta }: AlertaBadgeProps) {
  return (
    <span
      title={alerta.descricao}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_COLORS[alerta.badgeCor]}`}
    >
      {BADGE_LABELS[alerta.tipo]}
    </span>
  )
}
