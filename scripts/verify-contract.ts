import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Credentials for this check come from the APP's .env.local (the same
// NEXT_PUBLIC_ vars src/app/resultados/page.tsx uses to call the Edge
// Function), not from scripts/.env — this script talks to the deployed
// function over HTTP, not to the database directly.
const ROOT_ENV = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env.local')
config({ path: ROOT_ENV })

/**
 * Verifies that the DEPLOYED Edge Function matches the contract this build
 * expects. Unit tests cover the local scorer; nothing covered the deployed one,
 * and on 2026-08-24 a stale deployment rendered a confident 90% affinity for a
 * candidate documented on 5 of 14 themes.
 *
 * Run after deploying the Edge Function and before deploying the app.
 *
 * Usage: npm run verify-contract   (from scripts/)
 */

interface RespostaUsuario {
  temaSlug: string
  posicao: 'favoravel' | 'contrario' | 'neutro'
  importancia: 1 | 2 | 3
}

interface PerfilUsuario {
  estado: string
  respostas: RespostaUsuario[]
  sessionToken: string
  timestamp: string
}

// Mirrors CAMPOS_OBRIGATORIOS in src/lib/contract.ts — the two runtimes
// share no module, so this list is kept in sync by hand.
const CAMPOS_OBRIGATORIOS = [
  'alinhamento',
  'alinhamentoApurado',
  'cobertura',
  'confiancaResultado',
  'cargo',
  'alertas',
  'observacoes',
  'fontes',
  'coerenciaPorTema',
] as const

const CAMPOS_DETALHE_TEMA = ['temaNome', 'evidencia', 'neutroMotivo', 'justificativa'] as const

export const P_NAO_INFORMADO_PCT = 10
export const ROUNDING_TOLERANCE = 1

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function buildPayload(): PerfilUsuario {
  // At least 3 non-neutral answers, for a state the pipeline has processed
  // (SP, per the 2026-08-24 incident this verifier exists to catch).
  return {
    estado: 'SP',
    respostas: [
      { temaSlug: 'reforma_tributaria', posicao: 'favoravel', importancia: 3 },
      { temaSlug: 'sus_saude_publica', posicao: 'contrario', importancia: 2 },
      { temaSlug: 'seguranca_publica_estadual', posicao: 'favoravel', importancia: 3 },
      { temaSlug: 'educacao_basica', posicao: 'contrario', importancia: 1 },
    ],
    sessionToken: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }
}

async function callMatchFunction(url: string, anonKey: string, payload: PerfilUsuario): Promise<unknown> {
  const endpoint = `${url}/functions/v1/match-candidatos`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)')
    throw new Error(`Edge Function returned ${response.status} ${response.statusText}: ${body}`)
  }
  return response.json()
}

/** Flattens every candidate across every cargo group in the response. */
function collectCandidatos(data: unknown): Array<Record<string, unknown>> {
  if (!isRecord(data) || !Array.isArray(data.cargos)) {
    throw new Error(`Response shape mismatch: expected "cargos" array, got: ${JSON.stringify(data).slice(0, 200)}`)
  }
  const candidatos: Array<Record<string, unknown>> = []
  for (const grupo of data.cargos) {
    if (!isRecord(grupo) || !Array.isArray(grupo.candidatos)) {
      throw new Error('Response shape mismatch: a cargo group is missing its "candidatos" array.')
    }
    for (const c of grupo.candidatos) {
      if (isRecord(c)) candidatos.push(c)
    }
  }
  return candidatos
}

function nomeCandidato(c: Record<string, unknown>): string {
  return typeof c.nomeUrna === 'string' ? c.nomeUrna : '(nome desconhecido)'
}

/** Assertion 1: shape. Every required field present on the first candidate,
 * plus the per-theme detail fields on its first detalhesTemas entry. */
function assertShape(candidatos: Array<Record<string, unknown>>): void {
  if (candidatos.length === 0) {
    throw new Error(
      'No candidates returned for SP — cannot verify the contract. Pick a state the pipeline has processed.',
    )
  }
  const primeiro = candidatos[0]

  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (primeiro[campo] === undefined) {
      throw new Error(
        `Contract mismatch: candidate "${nomeCandidato(primeiro)}" is missing field "${campo}" — ` +
        'the deployed Edge Function does not match this build.',
      )
    }
  }

  if (!Array.isArray(primeiro.detalhesTemas)) {
    throw new Error(
      `Contract mismatch: candidate "${nomeCandidato(primeiro)}" is missing field "detalhesTemas".`,
    )
  }
  const primeiroTema = primeiro.detalhesTemas[0]
  if (primeiroTema === undefined) {
    throw new Error(
      `Cannot verify per-theme shape: candidate "${nomeCandidato(primeiro)}" has an empty "detalhesTemas".`,
    )
  }
  if (!isRecord(primeiroTema)) {
    throw new Error(
      `Contract mismatch: candidate "${nomeCandidato(primeiro)}" has a non-object detalhesTemas[0].`,
    )
  }
  for (const campo of CAMPOS_DETALHE_TEMA) {
    if (primeiroTema[campo] === undefined) {
      throw new Error(
        `Contract mismatch: candidate "${nomeCandidato(primeiro)}" detalhesTemas[0] is missing field "${campo}" — ` +
        'the deployed Edge Function does not match this build.',
      )
    }
  }
}

/** Assertion 2: the audit identity from
 * docs/superpowers/specs/2026-08-23-match-v3-scoring-design.md §4:
 *   alinhamento == round(confianca * apurado * 100 + (1 - confianca) * 10)
 * within ±1 for rounding. Exact per the spec — no looser tolerance allowed. */
export function checkAuditIdentity(candidatos: Array<Record<string, unknown>>): void {
  for (const c of candidatos) {
    const alinhamento = c.alinhamento
    const alinhamentoApurado = c.alinhamentoApurado
    const confiancaResultado = c.confiancaResultado
    if (
      typeof alinhamento !== 'number' ||
      typeof alinhamentoApurado !== 'number' ||
      typeof confiancaResultado !== 'number'
    ) {
      throw new Error(
        `Cannot check audit identity on candidate "${nomeCandidato(c)}": ` +
        'alinhamento/alinhamentoApurado/confiancaResultado are not all numbers.',
      )
    }

    const expected = Math.round(
      (confiancaResultado / 100) * (alinhamentoApurado / 100) * 100 +
      (1 - confiancaResultado / 100) * P_NAO_INFORMADO_PCT,
    )
    const delta = Math.abs(alinhamento - expected)
    if (delta > ROUNDING_TOLERANCE) {
      throw new Error(
        `Audit identity broken on candidate "${nomeCandidato(c)}": alinhamento=${alinhamento} but ` +
        `round(confianca * apurado + (1 - confianca) * 10) = ${expected} ` +
        `(confiancaResultado=${confiancaResultado}, alinhamentoApurado=${alinhamentoApurado}, ` +
        `delta=${delta}, tolerance=±${ROUNDING_TOLERANCE}).`,
      )
    }
  }
}

/** Assertion 3: the penalty is actually applied. A candidate with
 * cobertura < 100 whose alinhamento equals alinhamentoApurado unpenalized is
 * the signature of the pre-v3 scorer — exactly what shipped on 2026-08-24. */
export function checkPenaltyApplied(candidatos: Array<Record<string, unknown>>): void {
  for (const c of candidatos) {
    const cobertura = c.cobertura
    const alinhamento = c.alinhamento
    const alinhamentoApurado = c.alinhamentoApurado
    if (typeof cobertura !== 'number' || typeof alinhamento !== 'number' || typeof alinhamentoApurado !== 'number') {
      continue // already reported by checkAuditIdentity
    }
    if (cobertura < 100 && alinhamento === alinhamentoApurado) {
      throw new Error(
        `Pre-v3 scorer signature on candidate "${nomeCandidato(c)}": cobertura=${cobertura} (< 100) but ` +
        `alinhamento === alinhamentoApurado === ${alinhamento} — undocumented themes are not costing ` +
        'anything. This is the exact defect that rendered 90% affinity for a candidate documented on 5 of 14 themes.',
      )
    }
  }
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      `Expected them in ${ROOT_ENV}.`,
    )
  }

  console.log(`Firing a quiz payload at ${url}/functions/v1/match-candidatos (estado=SP)...`)
  const data = await callMatchFunction(url, anonKey, buildPayload())
  const candidatos = collectCandidatos(data)
  console.log(`Received ${candidatos.length} candidate(s) across all cargos.`)

  assertShape(candidatos)
  console.log('✓ Shape: all required fields present on the first candidate and its first theme detail.')

  checkAuditIdentity(candidatos)
  console.log(`✓ Audit identity: alinhamento matches confianca·apurado + (1-confianca)·10 within ±${ROUNDING_TOLERANCE} for every candidate.`)

  checkPenaltyApplied(candidatos)
  console.log('✓ Penalty applied: no under-covered candidate has alinhamento === alinhamentoApurado.')

  console.log('\nDeployed contract matches this build.')
}

// Only run when executed directly (`tsx verify-contract.ts`), not when
// imported — verify-contract.test.ts imports checkAuditIdentity and
// checkPenaltyApplied for offline testing and must not trigger a live call.
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => {
    console.error('\n✗ CONTRACT VERIFICATION FAILED')
    console.error((err as Error).message)
    process.exitCode = 1
  })
}
