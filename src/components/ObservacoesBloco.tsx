import { Acordeao } from './Acordeao'
import { capitalizar, corPorSeveridade, rotuloSeveridade } from '@/lib/severidade'
import type { Observacao } from '@/lib/types'

interface ObservacoesBlocoProps {
  observacoes: Observacao[]
}

const SEVERIDADE_TITLE = 'Quão relevante essa observação é para avaliar o candidato.'

function Lista({ titulo, itens }: { titulo: string; itens: Observacao[] }) {
  if (itens.length === 0) return null
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{titulo}</p>
      {itens.map((o, i) => (
        <div key={`${o.titulo}-${i}`} className="mb-3 last:mb-0">
          <p className="text-sm font-semibold text-gray-700">{o.titulo}</p>
          <p title={SEVERIDADE_TITLE} className={`cursor-help text-xs font-medium ${corPorSeveridade([o])}`}>
            Severidade: {capitalizar(rotuloSeveridade(o.severidade, 'fem'))}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{o.descricao}</p>
          {o.fonteUrl && (
            <a
              href={o.fonteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-highlight underline"
            >
              Ver fonte ↗
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

/** Caveats about how this candidate was read — never accusations.
 *  Themes we simply did not find are absent by design: the theme row already
 *  says "não encontrado" and the score already charges for it. */
export function ObservacoesBloco({ observacoes }: ObservacoesBlocoProps) {
  if (observacoes.length === 0) return null

  return (
    <Acordeao titulo="Observações" contador={observacoes.length} contadorClassName="text-warning">
      <Lista titulo="Contradições" itens={observacoes.filter(o => o.categoria === 'contradicao')} />
      <Lista titulo="Ressalvas sobre a evidência" itens={observacoes.filter(o => o.categoria === 'ressalva')} />
    </Acordeao>
  )
}
