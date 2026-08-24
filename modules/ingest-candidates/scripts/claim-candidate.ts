import { supabase } from './lib/supabase.js'

/** Same two stages this research pipeline covers — see lib/ledger.ts's
 * ALL_STAGES for the full five-stage list this project tracks overall. */
const RESEARCH_STAGES = ['dossie', 'posicoes'] as const

/** A claim is only allowed to move a stage out of these statuses. Never
 * reclaims a stage another run already finished (concluido) or explicitly
 * marked out of scope (nao_aplicavel). */
const CLAIMABLE_STATUSES = ['pendente', 'falhou']

/**
 * Marks a candidacy's research stages em_progresso *before* any research
 * happens, so a second developer running `next-candidates` sees it drop out
 * of the pendente count instead of picking up the same name. This is a
 * courtesy signal, not a lock — two people can still race it — but it is
 * enough for a small team coordinating over chat/a shared sheet.
 *
 * Usage: npm run claim-candidate -- <tse_sequencial>
 */
async function main(): Promise<void> {
  const sequencial = process.argv[2]
  if (!sequencial) {
    console.error('Usage: npm run claim-candidate -- <tse_sequencial>')
    process.exit(1)
  }

  const { data: cand, error: cErr } = await supabase
    .from('candidacies')
    .select('id, cargo, estado, politicians(nome_urna)')
    .eq('tse_sequencial', sequencial)
    .single()

  if (cErr || !cand) throw new Error(`Candidacy ${sequencial} not found: ${cErr?.message}`)

  const candidacyId = cand.id as string
  const politician = (cand as Record<string, unknown>).politicians as Record<string, string> | null
  const nomeUrna = politician?.nome_urna ?? '(nome_urna indisponível)'

  console.log('='.repeat(64))
  console.log(`[claim-candidate] RESOLVED CANDIDATE: ${nomeUrna}`)
  console.log(`[claim-candidate] CARGO: ${cand.cargo}   ESTADO: ${cand.estado}`)
  console.log(`[claim-candidate] tseSequencial ${sequencial} -> candidacy ${candidacyId}`)
  console.log('='.repeat(64))

  const { data: before, error: beforeErr } = await supabase
    .from('enrichment_ledger')
    .select('etapa, status')
    .eq('candidacy_id', candidacyId)
    .in('etapa', RESEARCH_STAGES)

  if (beforeErr) throw new Error(`Failed to read ledger: ${beforeErr.message}`)

  if (!before || before.length === 0) {
    console.log('[claim-candidate] No ledger rows for this candidacy — run bootstrap-ledger first.')
    process.exit(1)
  }

  const already = before.filter(r => r.status === 'em_progresso')
  const done = before.filter(r => r.status === 'concluido')
  if (already.length === before.length) {
    console.log('[claim-candidate] Already claimed (em_progresso) — someone may already be working on this one.')
    process.exit(0)
  }
  if (done.length === before.length) {
    console.log('[claim-candidate] Already concluido on every stage — nothing to claim.')
    process.exit(0)
  }

  const { data: updated, error: upErr } = await supabase
    .from('enrichment_ledger')
    .update({ status: 'em_progresso', atualizado_em: new Date().toISOString() })
    .eq('candidacy_id', candidacyId)
    .in('etapa', RESEARCH_STAGES)
    .in('status', CLAIMABLE_STATUSES)
    .select('etapa')

  if (upErr) throw new Error(`Failed to claim: ${upErr.message}`)

  console.log(`[claim-candidate] Claimed ${updated?.length ?? 0} stage(s): ${(updated ?? []).map(r => r.etapa).join(', ')}`)
  console.log('[claim-candidate] This candidate will still appear in next-candidates (em_progresso stays visible by')
  console.log('[claim-candidate] design, in case a run crashes) — but its etapas_pendentes count just dropped, so')
  console.log('[claim-candidate] check etapas_em_progresso before picking a name someone else may have already claimed.')
}

main().catch(err => { console.error(err); process.exit(1) })
