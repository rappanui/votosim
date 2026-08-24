import type { Dossie, Espectro } from '@/lib/types'

const ESPECTRO_LABELS: Record<Espectro, string> = {
  esquerda:          'esquerda',
  centro_esquerda:   'centro-esquerda',
  centro:            'centro',
  centro_direita:    'centro-direita',
  direita:           'direita',
  sem_classificacao: 'sem classificação',
}

interface CandidatoResumoProps {
  dossie: Dossie
}

/** "Quem é": plain-language profile, political spectrum and coherence index.
 *  Render only when a dossier exists — the card omits this block otherwise. */
export function CandidatoResumo({ dossie }: CandidatoResumoProps) {
  const temEspectro = dossie.espectroDeclarado !== null || dossie.espectroInferido !== null

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Quem é</p>
      <p className="text-sm leading-relaxed text-gray-700">{dossie.resumoPerfil}</p>

      {temEspectro && (
        <p className="mt-3 text-sm text-gray-700">
          <span className="text-gray-400">Espectro</span>{' '}
          {dossie.espectroDeclarado && <>declarado <strong>{ESPECTRO_LABELS[dossie.espectroDeclarado]}</strong></>}
          {dossie.espectroDeclarado && dossie.espectroInferido && ' · '}
          {dossie.espectroInferido && <>inferido <strong>{ESPECTRO_LABELS[dossie.espectroInferido]}</strong></>}
        </p>
      )}

      {/* A null index means no track record — never render it as zero, which
          would read as "measured and completely incoherent". */}
      <p className="mt-3 text-sm text-gray-700">
        {dossie.coerenciaIndice === null
          ? <span className="text-gray-500">Coerência: sem histórico para medir.</span>
          : <>Coerência <strong>{dossie.coerenciaIndice}</strong> <span className="text-gray-400">de 100</span></>}
      </p>
      {dossie.coerenciaBase && (
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{dossie.coerenciaBase}</p>
      )}
    </div>
  )
}
