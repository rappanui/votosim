import type { Alerta, BadgeCor } from '@/lib/types'
import { corPorSeveridade } from '@/lib/severidade'

const BADGE_LABELS: Record<Alerta['tipo'], string> = {
  ficha_suja:           'Ficha suja',
  investigacao:         'Em investigação',
  polemica:             'Atenção',
  incoerencia:          'Incoerência',
  divergencia_espectro: 'Divergência de espectro',
  ressalva_evidencias:  'Ressalva',
}

const SEVERIDADE_LABELS: Record<Alerta['severidade'], string> = {
  critica: 'Crítica',
  alta:    'Alta',
  media:   'Média',
  baixa:   'Baixa',
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

/** Pill badge for a single candidate alert. Color driven by badgeCor from the
 *  Edge Function — already 'cinza' for a resolved alert, so this component's
 *  only job for that case is the "— resolvido" suffix: badge_cor alone reads
 *  as neutral, not as "this used to be active and no longer is." */
export function AlertaBadge({ alerta }: AlertaBadgeProps) {
  const label = alerta.ativo ? BADGE_LABELS[alerta.tipo] : `${BADGE_LABELS[alerta.tipo]} — resolvido`
  return (
    <>
      <span
        title={alerta.descricao}
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_COLORS[alerta.badgeCor]}`}
      >
        {label}
      </span>
      <span className={`ml-2 text-xs font-medium ${corPorSeveridade([alerta])}`}>
        Severidade: {SEVERIDADE_LABELS[alerta.severidade]}
      </span>
    </>
  )
}
