import type { Alerta, BadgeCor } from '@/lib/types'

const BADGE_LABELS: Record<Alerta['tipo'], string> = {
  ficha_suja:   'Ficha suja',
  investigacao: 'Em investigação',
  polemica:     'Atenção',
}

const BADGE_COLORS: Record<BadgeCor, string> = {
  vermelho: 'bg-danger text-white',
  laranja:  'bg-warning text-white',
  cinza:    'bg-gray-400 text-white',
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
