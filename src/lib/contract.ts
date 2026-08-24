import type { MatchResult, CandidatoResultado } from './types'

/**
 * The app and the Edge Function are two runtimes with no shared module, and
 * src/lib/types.ts mirrors ai-providers.ts by hand. Nothing couples them at
 * build time, and they deploy separately to a remote Supabase project.
 *
 * On 2026-08-24 the app ran against an Edge Function that predated match v3
 * and rendered a confident 90% affinity for a candidate documented on 5 of 14
 * themes — the exact defect v3 exists to prevent. Nothing detected it.
 *
 * This checks presence, not full shape: a field that is absent means the
 * deployed function is not the one this build expects, and no number it
 * returned can be trusted. Deep validation of every value would be a
 * different, larger job with a much worse cost/benefit.
 */
export class ContractMismatchError extends Error {
  readonly campoAusente: string

  constructor(campoAusente: string) {
    super(`Match response is missing the field "${campoAusente}" — the deployed Edge Function does not match this build.`)
    this.name = 'ContractMismatchError'
    this.campoAusente = campoAusente
  }
}

/** Fields whose absence means the response predates this build. */
const CAMPOS_OBRIGATORIOS: Array<keyof CandidatoResultado> = [
  'alinhamento',
  'alinhamentoApurado',
  'cobertura',
  'confiancaResultado',
  'cargo',
  'alertas',
  'observacoes',
  'fontes',
  'coerenciaPorTema',
]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Checks the first candidate of the first cargo. The Edge Function builds every
 * candidate through the same code path, so one is representative — and an empty
 * result (no state data yet) is a legitimate response, not a stale one.
 */
export function assertMatchResult(data: unknown): MatchResult {
  if (!isRecord(data)) throw new ContractMismatchError('(resposta não é um objeto)')
  if (!Array.isArray(data.cargos)) throw new ContractMismatchError('cargos')

  const primeiroGrupo = data.cargos.find(g => isRecord(g) && Array.isArray(g.candidatos) && g.candidatos.length > 0)
  if (primeiroGrupo === undefined) return data as unknown as MatchResult

  const candidatos = (primeiroGrupo as Record<string, unknown>).candidatos as unknown[]
  const primeiro = candidatos[0]
  if (!isRecord(primeiro)) throw new ContractMismatchError('(candidato não é um objeto)')

  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (primeiro[campo] === undefined) throw new ContractMismatchError(campo)
  }

  return data as unknown as MatchResult
}
