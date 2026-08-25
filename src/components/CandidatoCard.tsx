'use client'

import { useRef, useState } from 'react'
import { AlertasBloco } from './AlertasBloco'
import { CandidatoResumo } from './CandidatoResumo'
import { FontesBloco } from './FontesBloco'
import { ObservacoesBloco } from './ObservacoesBloco'
import { TemasPanel, selectVisibleTemas } from './TemasPanel'
import { P_NAO_INFORMADO_PCT, CARGO_LABELS } from '@/lib/types'
import type { CandidatoResultado } from '@/lib/types'
import { corPorSeveridade, rotuloPorSeveridade } from '@/lib/severidade'

// Penalised scores concentrate in the 20–60% range, so the thresholds are
// recalibrated relative to the pre-v3 bar (which used 75/50/25) to avoid
// painting nearly every card red.
function getBarColor(alinhamento: number): string {
  if (alinhamento >= 55) return 'bg-success'
  if (alinhamento >= 35) return 'bg-amber-500'
  if (alinhamento >= 20) return 'bg-warning'
  return 'bg-danger'
}

// Below this, most of what the card knows about the candidate is absence,
// not moderation. nao_encontrado positions score P_NAO_INFORMADO but read
// to a voter as "took no side." Flagging low cobertura the same way alerts
// and observations are already flagged (color, not just a number) makes that
// gap visible instead of leaving it the same passive gray at every value.
const COBERTURA_BAIXA = 40

const COBERTURA_TITLE =
  'Entre os temas em que você tomou posição, quantos conseguimos apurar sobre este candidato.'
const CONFIANCA_TITLE =
  'Quanto da cobertura é sobre os temas que você marcou como importantes. É isso que entra no ' +
  'cálculo do percentual de afinidade.'
const ALERTAS_TITLE =
  'Alertas são acusações documentadas sobre conduta: ficha suja, investigações ou controvérsias ' +
  'curadas. "Ficha suja" é gerado automaticamente a partir de certidões do TSE; os demais passam ' +
  'por curadoria humana antes de aparecer aqui. Nenhum alerta exclui o candidato do resultado. ' +
  'Um alerta resolvido continua contando: a cor aqui reflete o quanto ele ainda deveria pesar hoje, ' +
  'não a gravidade histórica do que aconteceu. Veja os detalhes de cada alerta abaixo.'
const OBSERVACOES_TITLE =
  'Observações são ressalvas sobre como avaliamos o candidato: contradições entre discurso e ' +
  'conduta, ou avisos sobre a qualidade da evidência usada. Nunca são acusações.'

interface CandidatoCardProps {
  candidato: CandidatoResultado
}

/** One candidate result. Collapsed it states the penalised score, both coverage
 *  metrics, and how many alerts and observations exist. Expanded it opens the
 *  audit line across the full width, then a two-column panel: themes with their
 *  justifications on the left, profile and evidence on the right. */
export function CandidatoCard({ candidato }: CandidatoCardProps) {
  const [expanded, setExpanded] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const barColor = getBarColor(candidato.alinhamento)

  /** Collapsing from the sticky bar leaves the viewport wherever the removed
   *  content left it, usually inside the next candidate. Bring this card's top
   *  back so the reader resumes where they were. `scroll-mt-20` on the root
   *  keeps it clear of the fixed site header. */
  function recolher() {
    setExpanded(false)
    cardRef.current?.scrollIntoView({ block: 'start' })
  }

  const visibleTemas = selectVisibleTemas(candidato.detalhesTemas)
  const temTemas = visibleTemas.length > 0

  const nAlertas = candidato.alertas.length
  const nObservacoes = candidato.observacoes.length
  const cargoLabel = CARGO_LABELS[candidato.cargo] ?? candidato.cargo

  // The alert counter always shows, even at zero: "Alertas: 0 detectados" is
  // itself information, colored green like a clean record. Counts break
  // down by severity (corPorSeveridade/rotuloPorSeveridade in
  // src/lib/severidade.ts), so the color and wording reflect the worst
  // finding, not just a count. Alertas takes masculine agreement (alerta),
  // observações takes feminine (observação). The observation counter is
  // omitted entirely at zero: nothing to caveat is the default state, not a
  // finding, unlike alertas.
  //
  // Driven by severidadeAtual, not severidade: severidade is a historical
  // fact that never changes, but a resolved alert's present-day weight can
  // be reassessed calmer (never worse). Coloring the counter by the raw
  // historical value would make a resolved critica alert paint the whole
  // card red, the same "reads as current" failure the ativo/resolucao
  // fix already solved at the badge level. severidadeAtual equals
  // severidade whenever nothing was reassessed, so this changes nothing
  // for the common case. Observações have no such distinction to make.
  const alertasPorSeveridadeAtual = candidato.alertas.map(a => ({ severidade: a.severidadeAtual }))
  const alertaCor = corPorSeveridade(alertasPorSeveridadeAtual)
  const alertaLabel = `Alertas: ${rotuloPorSeveridade(alertasPorSeveridadeAtual, 'masc')}`
  const observacaoCor = corPorSeveridade(candidato.observacoes)
  const observacaoLabel = `Observações: ${rotuloPorSeveridade(candidato.observacoes, 'fem')}`

  return (
    <div
      ref={cardRef}
      className="scroll-mt-20 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5"
    >
      {/* The card's own header sticks while the panel is open, rather than a
          second bar repeating it: an expanded card runs well past a screen, so
          both the identity and the control that closes it would otherwise
          scroll away. Negative margins let it span the card's padding; the
          opaque background keeps panel content from showing through. */}
      <div
        data-testid="card-cabecalho"
        className={
          expanded
            ? 'sticky top-16 z-10 -mx-4 -mt-4 border-b border-gray-200 bg-white px-4 pb-3 pt-4 md:-mx-5 md:-mt-5 md:px-5 md:pt-5'
            : ''
        }
      >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-primary">{candidato.nomeUrna}</p>
          <p className="text-sm text-gray-500">
            <span>{candidato.partido}</span>
            {candidato.numeroUrna && ` · nº ${candidato.numeroUrna}`}
            {` · ${cargoLabel}`}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span
              title={ALERTAS_TITLE}
              aria-label="O que são alertas"
              className={`inline-flex cursor-help items-center gap-1 ${nAlertas > 0 ? `font-semibold ${alertaCor}` : alertaCor
                }`}
            >
              <span aria-hidden="true">⚠</span>
              <span>{alertaLabel}</span>
            </span>
            {nObservacoes > 0 && (
              <span
                title={OBSERVACOES_TITLE}
                aria-label="O que são observações"
                className={`inline-flex cursor-help items-center gap-1 font-semibold ${observacaoCor}`}
              >
                <span aria-hidden="true">ⓘ</span>
                <span>{observacaoLabel}</span>
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xl font-bold leading-tight text-primary">{candidato.alinhamento}%</p>
          <p className="text-xs text-gray-400">
            <span
              title={COBERTURA_TITLE}
              aria-label="O que é cobertura"
              className={`cursor-help ${candidato.cobertura < COBERTURA_BAIXA ? 'font-semibold text-warning' : ''
                }`}
            >
              cobertura {candidato.cobertura}%
            </span>
            {' · '}
            <span title={CONFIANCA_TITLE} aria-label="O que é confiança" className="cursor-help">
              confiança {candidato.confiancaResultado}%
            </span>
          </p>
        </div>
      </div>

      <div className="mb-3 h-2 w-full rounded-full bg-gray-100">
        <div
          data-testid="alinhamento-bar"
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${candidato.alinhamento}%` }}
        />
      </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => (expanded ? recolher() : setExpanded(true))}
            aria-expanded={expanded}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            {expanded ? '▲ Ocultar detalhes' : '▼ Ver detalhes'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4">
          {/* The audit line explains the headline percentage, which exists
              whether or not any theme row survives the filter, so it renders
              on every expand, and above the split rather than inside a column. */}
          <p
            data-testid="audit-line"
            className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500"
          >
            {candidato.alinhamento}% = {candidato.confiancaResultado}% do que importa pra você
            {' × '}{candidato.alinhamentoApurado}% de alinhamento nesses temas
            {' + '}{100 - candidato.confiancaResultado}% não apurado, contado como {P_NAO_INFORMADO_PCT}%
          </p>

          <div
            data-testid="detalhe-colunas"
            className={`grid grid-cols-1 gap-4 ${temTemas ? 'md:grid-cols-[1.35fr_1fr]' : ''}`}
          >
            {/* TemasPanel draws its own border-t but no box, so the card keeps
                supplying the frame it was extracted from. Omitted entirely when
                no theme survives the filter, to avoid an empty bordered box;
                the column split collapses with it. */}
            {temTemas && (
              <div className="rounded-lg border border-gray-100">
                <TemasPanel detalhes={candidato.detalhesTemas} />
              </div>
            )}

            <div className="flex flex-col gap-3">
              {/* CandidatoResumo is always open and draws no frame of its own;
                  the card boxes it so it sits level with the accordions below. */}
              {candidato.dossie && (
                <div className="rounded-lg border border-gray-100 px-4 py-3">
                  <CandidatoResumo dossie={candidato.dossie} />
                </div>
              )}
              <AlertasBloco alertas={candidato.alertas} />
              <ObservacoesBloco observacoes={candidato.observacoes} />
              <FontesBloco fontes={candidato.fontes} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
