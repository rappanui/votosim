import type { Alerta } from '@/lib/types'
import { corPorSeveridade, rotuloSeveridade } from '@/lib/severidade'

const BADGE_LABELS: Record<Alerta['tipo'], string> = {
  ficha_suja:           'Ficha suja',
  investigacao:         'Em investigação',
  polemica:             'Atenção',
  incoerencia:          'Incoerência',
  divergencia_espectro: 'Divergência de espectro',
  ressalva_evidencias:  'Ressalva',
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const TIPO_TITLE = 'A categoria do alerta.'
const STATUS_TITLE =
  'Se o caso ainda está em aberto (ativo) ou já foi encerrado (resolvido: absolvição, ' +
  'anulação, prescrição ou decisão semelhante). Continua registrado nos dois casos.'
const SEVERIDADE_TITLE =
  'Quão grave é o que foi documentado, um fato histórico que não muda mesmo se o caso for resolvido depois.'

function avaliacaoAtualTitle(alerta: Alerta): string {
  if (alerta.severidadeAtualMotivo) return `Reavaliado após a resolução: ${alerta.severidadeAtualMotivo}`
  if (alerta.ativo) {
    return 'Quanto isso deveria pesar no seu julgamento hoje. Só muda se o caso for resolvido, e nunca aumenta.'
  }
  return 'Este caso foi resolvido, mas ainda não foi reavaliado. A avaliação atual segue a severidade original até que isso aconteça.'
}

interface AlertaBadgeProps {
  alerta: Alerta
}

/** Header box for a single candidate alert: Tipo, Status, Severidade
 *  original e Avaliação atual, sempre as quatro linhas, mesmo quando
 *  Severidade original e Avaliação atual têm o mesmo valor. Mostrar as duas
 *  sempre, em vez de esconder a segunda quando é redundante, evita que o
 *  eleitor veja dois alertas do mesmo tipo com números finais diferentes e
 *  suspeite de viés sem abrir o hover: a severidade original fica sempre
 *  visível ao lado, provando que a diferença vem de como cada caso foi
 *  resolvido, não de um julgamento escondido. Severidade nunca muda;
 *  Avaliação atual pode ser mais branda quando o caso foi resolvido e
 *  reavaliado (nunca mais grave). O hover de Avaliação atual explica o
 *  porquê com severidadeAtualMotivo quando existe, ou declara honestamente
 *  que ainda não houve reavaliação. */
export function AlertaBadge({ alerta }: AlertaBadgeProps) {
  const statusLabel = alerta.ativo ? 'Ativo' : 'Resolvido'
  const severidadeLabel = capitalizar(rotuloSeveridade(alerta.severidade, 'fem'))
  const atualLabel = capitalizar(rotuloSeveridade(alerta.severidadeAtual, 'fem'))
  const severidadeCor = corPorSeveridade([{ severidade: alerta.severidade }])
  const atualCor = corPorSeveridade([{ severidade: alerta.severidadeAtual }])

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs">
      <span title={TIPO_TITLE} className="cursor-help font-semibold text-gray-500">Tipo:</span>
      <span>{BADGE_LABELS[alerta.tipo]}</span>

      <span title={STATUS_TITLE} className="cursor-help font-semibold text-gray-500">Status:</span>
      <span>{statusLabel}</span>

      <span title={SEVERIDADE_TITLE} className="cursor-help font-semibold text-gray-500">Severidade original:</span>
      <span className={severidadeCor}>{severidadeLabel}</span>

      <span title={avaliacaoAtualTitle(alerta)} className="cursor-help font-semibold text-gray-500">Avaliação atual:</span>
      <span className={atualCor}>{atualLabel}</span>
    </div>
  )
}
