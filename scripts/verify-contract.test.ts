import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkAuditIdentity, checkPenaltyApplied } from './verify-contract.ts'

/**
 * Exercises the two live-deployment assertions from verify-contract.ts with
 * synthetic payloads — no network call, no deploy.
 *
 * These checks currently never run to completion against the real deployment:
 * the deployed Edge Function is stale and fails assertion 1 (shape) before
 * assertion 2 or 3 gets a candidate to look at (see task-6-7-report.md). That
 * means a bug in checkAuditIdentity or checkPenaltyApplied would go unnoticed
 * until after the redeploy, on real traffic. This file is what stands in for
 * that missing coverage until then.
 *
 * Both functions are imported from verify-contract.ts itself — not
 * reimplemented here — so there is one implementation and it cannot drift
 * from what the runner actually calls.
 */

function candidate(overrides: Record<string, unknown>): Record<string, unknown> {
  return { nomeUrna: 'CANDIDATO TESTE', ...overrides }
}

// ─── checkAuditIdentity ─────────────────────────────────────────────────────
// Golden case from docs/superpowers/specs/2026-08-23-match-v3-scoring-design.md
// §4's worked example (Grassi): confianca 36%, apurado 90% ->
//   0.36 * 0.90 * 100 + (1 - 0.36) * 10 = 32.4 + 6.4 = 38.8 -> round -> 39.

test('checkAuditIdentity: passes when alinhamento matches the formula', () => {
  const c = candidate({ alinhamento: 39, alinhamentoApurado: 90, confiancaResultado: 36 })
  assert.doesNotThrow(() => checkAuditIdentity([c]))
})

test('checkAuditIdentity: throws and names the candidate when the identity is broken', () => {
  // Same confianca/apurado as the golden case (expected 39), but alinhamento
  // moved to 50 — a delta of 11, far past the +/-1 rounding tolerance.
  const c = candidate({ nomeUrna: 'FLAVIO BOLSONARO', alinhamento: 50, alinhamentoApurado: 90, confiancaResultado: 36 })
  assert.throws(
    () => checkAuditIdentity([c]),
    (err: Error) => {
      assert.match(err.message, /FLAVIO BOLSONARO/)
      assert.match(err.message, /Audit identity broken/)
      return true
    },
  )
})

test('checkAuditIdentity: +/-1 tolerance accepts a delta of exactly 1 (legitimate rounding)', () => {
  // expected = 39; alinhamento = 40 is a delta of 1, still within tolerance.
  const c = candidate({ alinhamento: 40, alinhamentoApurado: 90, confiancaResultado: 36 })
  assert.doesNotThrow(() => checkAuditIdentity([c]))
})

test('checkAuditIdentity: +/-1 tolerance rejects a delta of 2 (a real break, not rounding)', () => {
  // expected = 39; alinhamento = 41 is a delta of 2, one past what rounding
  // can explain. A tolerance that swallowed this would be worse than none.
  const c = candidate({ nomeUrna: 'CANDIDATO LIMITE', alinhamento: 41, alinhamentoApurado: 90, confiancaResultado: 36 })
  assert.throws(() => checkAuditIdentity([c]), /CANDIDATO LIMITE/)
})

// ─── checkPenaltyApplied ─────────────────────────────────────────────────────

test('checkPenaltyApplied: passes when an under-covered candidate is actually penalized', () => {
  // cobertura < 100, and alinhamento (penalized) differs from alinhamentoApurado
  // (audited-only) — the penalty term did something.
  const c = candidate({ cobertura: 36, alinhamento: 39, alinhamentoApurado: 90 })
  assert.doesNotThrow(() => checkPenaltyApplied([c]))
})

test('checkPenaltyApplied: throws on the pre-v3 scorer signature (cobertura 36, alinhamento === alinhamentoApurado === 90)', () => {
  // This is the exact shape that shipped on 2026-08-24: a candidate documented
  // on a minority of themes still scoring as if every theme had been audited,
  // because the pre-v3 scorer dropped unaudited themes instead of charging
  // for them. cobertura=36 mirrors the real Grassi incident value.
  const c = candidate({ nomeUrna: 'FLAVIO BOLSONARO', cobertura: 36, alinhamento: 90, alinhamentoApurado: 90 })
  assert.throws(
    () => checkPenaltyApplied([c]),
    (err: Error) => {
      assert.match(err.message, /FLAVIO BOLSONARO/)
      assert.match(err.message, /Pre-v3 scorer signature/)
      return true
    },
  )
})
