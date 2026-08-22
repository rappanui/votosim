import { readFileSync } from 'fs'
import { supabase } from './lib/supabase.js'
import { validateResearch, type CandidateResearch, type ResearchSource } from './lib/research-contract.js'

/** Same vocabulary as research-contract.ts's VISIBLE_DESTINOS: a voter can
 * actually reach these, `interno` cannot be shown as an alert's public source. */
const VISIBLE_DESTINOS = new Set(['card_candidato', 'pagina_sobre'])

export function buildSourceRows(
  research: CandidateResearch,
  candidacyId: string,
  politicianId: string,
): Record<string, unknown>[] {
  return research.fontes.map(f => ({
    candidacy_id: candidacyId,
    politician_id: politicianId,
    tipo: f.tipo,
    camada: f.camada,
    titulo: f.titulo,
    veiculo: f.veiculo,
    url: f.url,
    data_publicacao: f.dataPublicacao,
    destino_exibicao: f.destinoExibicao,
  }))
}

export function buildPositionRows(
  research: CandidateResearch,
  politicianId: string,
  themeIdBySlug: Map<string, string>,
  sourceIdByRef: Map<string, string>,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []

  for (const p of research.posicoes) {
    const themeId = themeIdBySlug.get(p.temaSlug)
    // A missing theme id means the catalogue and the contract disagree. Skip
    // rather than write a null foreign key; validateResearch already rejects
    // unknown slugs, so this only fires on a genuine catalogue mismatch — but
    // it must not fire silently: it drops a theme from the candidate's card.
    if (!themeId) {
      console.warn(`[ingest-research] [SKIPPED] ${research.tseSequencial}: theme "${p.temaSlug}" has no catalogue id`)
      continue
    }

    rows.push({
      politician_id: politicianId,
      theme_id: themeId,
      posicao: p.posicao,
      intensidade: p.intensidade,
      justificativa: p.justificativa,
      coerencia_tema: p.coerenciaTema,
      confianca_ia: p.confiancaIa,
      source_ids: p.fonteRefs.map(r => sourceIdByRef.get(r)).filter(Boolean),
      fontes: [],
      gerado_por_ia: true,
      validado: false,
    })
  }

  return rows
}

/**
 * Picks which cited source an alert shows to voters. `fonteRefs[0]` is not
 * safe: validateResearch only guarantees that *some* cited ref is
 * voter-visible (D8), not that the first one is — an alert can legitimately
 * cite an `interno` source before a `card_candidato` one. Prefers the
 * lowest-camada voter-visible source; falls back to the first ref only if
 * none qualifies (should not happen given D8, but never leave source blank).
 */
function chooseAlertSource(fonteRefs: string[], byRef: Map<string, ResearchSource>): ResearchSource | undefined {
  const visible = fonteRefs
    .map(ref => byRef.get(ref))
    .filter((s): s is ResearchSource => s !== undefined && VISIBLE_DESTINOS.has(s.destinoExibicao))
    .sort((a, b) => a.camada - b.camada)

  if (visible.length > 0) return visible[0]
  return byRef.get(fonteRefs[0])
}

/**
 * Rule B of docs/base/04_schema_alerts.md authorises auto-publishing only
 * ficha_suja and investigacao, and only "com fonte do TSE/STF" — a layer-1
 * source. polemica is explicitly the subjective type needing curation, and
 * incoerencia / divergencia_espectro are AI inferences about a real person
 * that Rule B never covers, so both stay unvalidated regardless of source.
 */
function isAutoValidated(tipo: string, source: ResearchSource | undefined): boolean {
  if (tipo !== 'ficha_suja' && tipo !== 'investigacao') return false
  return source?.camada === 1
}

export function buildAlertRows(
  research: CandidateResearch,
  politicianId: string,
  sourceIdByRef: Map<string, string>,
  sources: ResearchSource[] = research.fontes,
): Record<string, unknown>[] {
  const byRef = new Map(sources.map(s => [s.ref, s]))

  return research.alertas.map(a => {
    const source = chooseAlertSource(a.fonteRefs, byRef)

    return {
      politician_id: politicianId,
      tipo: a.tipo,
      severidade: a.severidade,
      titulo: a.titulo,
      descricao: a.descricao,
      data_ocorrencia: a.dataOcorrencia,
      source_id: source ? sourceIdByRef.get(source.ref) ?? null : null,
      // politician_alerts predates the catalogue and still has these NOT NULL.
      fonte_url: source?.url ?? '',
      fonte_nome: source?.veiculo ?? source?.titulo ?? 'fonte',
      gerado_por_ia: true,
      validado: isAutoValidated(a.tipo, source),
      ativo: true,
    }
  })
}

function parseNumericFlag(argv: string[], name: string): number | undefined {
  const prefix = `--${name}=`
  const arg = argv.find(a => a.startsWith(prefix))
  if (!arg) return undefined
  const value = Number(arg.slice(prefix.length))
  return Number.isFinite(value) ? value : undefined
}

/** I11: a bare flag, present or absent — no value to parse. */
export function hasConfirmFlag(argv: string[]): boolean {
  return argv.includes('--confirm')
}

/**
 * MINOR: JSON.parse throws a raw, unhelpful stack on malformed input. A
 * research document is hand-assembled by an agent and routinely truncated
 * or malformed; name the offending file so the operator does not have to
 * guess which of several pending runs broke.
 */
export function parseResearchJson(raw: string, path: string): CandidateResearch {
  try {
    return JSON.parse(raw) as CandidateResearch
  } catch {
    throw new Error(`${path} is not valid JSON`)
  }
}

/**
 * I3: candidate_dossiers is UNIQUE (candidacy_id, versao) specifically so a
 * regeneration can be inserted as a new version instead of overwriting the
 * previous take. `null` (no prior dossier) starts the sequence at 1.
 */
export function nextDossierVersion(maxVersao: number | null): number {
  return maxVersao === null ? 1 : maxVersao + 1
}

/** Ledger statuses a re-run is allowed to move through. Excludes
 * `nao_aplicavel` deliberately: a stage that never applied to this
 * candidacy (e.g. a senate candidate's documentos_oficiais) must not be
 * dragged into em_progresso/concluido by a research re-run. */
const eligibleStatuses = ['pendente', 'em_progresso', 'falhou', 'concluido']

/** Entry point. Usage: npm run ingest-research -- <path-to-research.json> --confirm [--tokens=N] [--duracao-ms=N] */
async function main(): Promise<void> {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: npm run ingest-research -- <path-to-research.json> --confirm [--tokens=N] [--duracao-ms=N]')
    process.exit(1)
  }

  const flagArgv = process.argv.slice(3)
  const confirm = hasConfirmFlag(flagArgv)
  // The agent does not know its own token usage or wall-clock duration —
  // the caller does. Both are optional and, when absent, omitted from
  // metricas entirely rather than written as null.
  const tokens = parseNumericFlag(flagArgv, 'tokens')
  const duracaoMs = parseNumericFlag(flagArgv, 'duracao-ms')

  const research = parseResearchJson(readFileSync(path, 'utf-8'), path)

  const errors = validateResearch(research)
  if (errors.length > 0) {
    console.error(`[ingest-research] ${errors.length} validation error(s) — nothing was written:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  const { data: cand, error: cErr } = await supabase
    .from('candidacies')
    .select('id, politician_id, cargo, estado, politicians(nome_urna)')
    .eq('tse_sequencial', research.tseSequencial)
    .single()

  if (cErr || !cand) throw new Error(`Candidacy ${research.tseSequencial} not found: ${cErr?.message}`)

  const candidacyId = cand.id as string
  const politicianId = cand.politician_id as string
  const politician = (cand as Record<string, unknown>).politicians as Record<string, string> | null
  const nomeUrna = politician?.nome_urna ?? '(nome_urna indisponível)'

  // I11: the agent hand-copies tseSequencial into the document. One
  // transposed digit resolves to a different real politician, and without
  // this check the run silently attributes one candidate's research —
  // including ficha_suja / investigacao alerts — to someone else. Printing
  // the resolved identity is the only check a human can actually perform;
  // require it to be looked at before anything is written.
  console.log('='.repeat(64))
  console.log(`[ingest-research] RESOLVED CANDIDATE: ${nomeUrna}`)
  console.log(`[ingest-research] CARGO: ${cand.cargo}   ESTADO: ${cand.estado}`)
  console.log(`[ingest-research] tseSequencial ${research.tseSequencial} -> candidacy ${candidacyId}`)
  console.log('='.repeat(64))

  if (!confirm) {
    console.log('[ingest-research] DRY RUN — no --confirm flag, nothing was written.')
    console.log(`[ingest-research] would write: ${research.fontes.length} sources, ${research.posicoes.length} positions, ${research.alertas.length} alerts`)
    console.log('[ingest-research] check the candidate above matches the dossier you produced, then re-run with --confirm.')
    process.exit(0)
    return
  }

  const { data: themes, error: tErr } = await supabase.from('themes_catalog').select('id, slug')
  if (tErr) throw new Error(`Failed to read themes: ${tErr.message}`)
  const themeIdBySlug = new Map((themes ?? []).map(t => [t.slug as string, t.id as string]))

  // C1: a crash between the deletes below and the final inserts must not
  // leave this candidacy silently finished-looking. Moving its eligible
  // ledger rows to em_progresso *before* anything is deleted means a crash
  // anywhere in this run leaves status=em_progresso, and v_enrichment_queue
  // treats em_progresso as outstanding by explicit design (see
  // docs/sp0-schema-additions.md) — so the candidate stays visible and gets
  // picked up again instead of vanishing with zero positions and a stale
  // status=concluido from a prior successful run.
  const { error: guardErr } = await supabase
    .from('enrichment_ledger')
    .update({ status: 'em_progresso', atualizado_em: new Date().toISOString() })
    .eq('candidacy_id', candidacyId)
    .in('status', eligibleStatuses)
  if (guardErr) throw new Error(`Failed to mark ledger em_progresso before re-ingest: ${guardErr.message}`)

  // Replace this candidate's prior research so a re-run never duplicates.
  // Every delete's error must be checked: supabase-js returns errors rather
  // than throwing, and politician_alerts has no unique constraint, so a
  // silently-failed delete followed by the insert below would double every
  // alert on the candidate's card.
  const { error: ppErr } = await supabase.from('politician_positions').delete().eq('politician_id', politicianId)
  if (ppErr) throw new Error(`Failed to delete politician_positions: ${ppErr.message}`)

  const { error: paErr } = await supabase
    .from('politician_alerts')
    .delete()
    .eq('politician_id', politicianId)
    // Rule D of docs/base/04_schema_alerts.md: a resolved alert is never
    // deleted, only ativo=false with resolucao filled, because "o histórico
    // é mantido para transparência". A curator's approval (validado_por set)
    // must also survive a re-run. Only replace what this pipeline generated
    // and nobody has acted on yet.
    .eq('gerado_por_ia', true)
    .is('validado_por', null)
    .eq('ativo', true)
  if (paErr) throw new Error(`Failed to delete politician_alerts: ${paErr.message}`)

  // I2: politician_alerts.source_id is ON DELETE SET NULL. The alert delete
  // above already preserves curator-approved / resolved alerts, but an
  // unfiltered source delete would still null out *their* source_id — the
  // exact D8 breach the catalogue exists to prevent. Read what survived the
  // alert delete first, and never delete a source one of those still cites.
  const { data: survivingAlerts, error: survErr } = await supabase
    .from('politician_alerts')
    .select('source_id')
    .eq('politician_id', politicianId)
    .not('source_id', 'is', null)
  if (survErr) throw new Error(`Failed to read surviving alerts before source cleanup: ${survErr.message}`)

  const preservedSourceIds = [...new Set((survivingAlerts ?? []).map(a => a.source_id as string))]

  let sourceDelete = supabase.from('candidate_sources').delete().eq('candidacy_id', candidacyId)
  if (preservedSourceIds.length > 0) {
    sourceDelete = sourceDelete.not('id', 'in', `(${preservedSourceIds.join(',')})`)
  }
  const { error: csErr } = await sourceDelete
  if (csErr) throw new Error(`Failed to delete candidate_sources: ${csErr.message}`)

  // I3: candidate_dossiers is versioned specifically so regeneration does
  // not lose the previous take (UNIQUE (candidacy_id, versao)). Deleting
  // and rewriting versao=1 every run destroyed that on purpose; read the
  // current max instead and insert the next version below.
  const { data: maxDossier, error: maxDossierErr } = await supabase
    .from('candidate_dossiers')
    .select('versao')
    .eq('candidacy_id', candidacyId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxDossierErr) throw new Error(`Failed to read current dossier version: ${maxDossierErr.message}`)
  const dossierVersao = nextDossierVersion((maxDossier?.versao as number | undefined) ?? null)

  const { data: insertedSources, error: sErr } = await supabase
    .from('candidate_sources')
    .insert(buildSourceRows(research, candidacyId, politicianId))
    .select('id, url')
  if (sErr) throw new Error(`Failed to write sources: ${sErr.message}`)

  const idByUrl = new Map((insertedSources ?? []).map(s => [s.url as string, s.id as string]))

  // D8 (docs/base/04_schema_alerts.md): every displayed fact must trace to a
  // listed source. A url that did not come back from the insert would make
  // ref -> id resolution silently drop that source from source_ids / write a
  // null source_id on an alert whose fonte_url still displays a link — a
  // silent D8 breach. Fail loudly instead of writing anything.
  const missingUrls = research.fontes.map(f => f.url).filter(url => !idByUrl.has(url))
  if (missingUrls.length > 0) {
    throw new Error(`Failed to resolve inserted source ids for: ${missingUrls.join(', ')}`)
  }

  const sourceIdByRef = new Map(research.fontes.map(f => [f.ref, idByUrl.get(f.url) as string]))

  const positionRows = buildPositionRows(research, politicianId, themeIdBySlug, sourceIdByRef)
  if (positionRows.length > 0) {
    const { error } = await supabase.from('politician_positions').insert(positionRows)
    if (error) throw new Error(`Failed to write positions: ${error.message}`)
  }

  const alertRows = buildAlertRows(research, politicianId, sourceIdByRef)
  if (alertRows.length > 0) {
    const { error } = await supabase.from('politician_alerts').insert(alertRows)
    if (error) throw new Error(`Failed to write alerts: ${error.message}`)
  }

  const { error: dErr } = await supabase.from('candidate_dossiers').insert({
    candidacy_id: candidacyId,
    resumo_perfil: research.dossie.resumoPerfil,
    espectro_declarado: research.dossie.espectroDeclarado,
    espectro_inferido: research.dossie.espectroInferido,
    coerencia_indice: research.dossie.coerenciaIndice,
    coerencia_base: research.dossie.coerenciaBase,
    versao: dossierVersao,
  })
  if (dErr) throw new Error(`Failed to write dossier: ${dErr.message}`)

  // Only stages that were actually pending (or already done, so a re-run
  // still records fresh metrics) become concluido. nao_aplicavel stays
  // excluded — that is load-bearing: a senate candidate's government-plan
  // stage was never "pending" work and must not read as completed.
  const nowIso = new Date().toISOString()

  // confianca_media is averaged over positionRows — the positions actually
  // written — not research.posicoes, so a theme skipped for a missing
  // catalogue id (see buildPositionRows) is excluded from both the numerator
  // and the denominator consistently.
  const metricas = {
    fontes_encontradas: research.fontes.length,
    temas_cobertos: positionRows.length,
    alertas: alertRows.length,
    confianca_media: positionRows.length > 0
      ? positionRows.reduce((s, p) => s + (p.confianca_ia as number), 0) / positionRows.length
      : null,
    ...(tokens !== undefined ? { tokens } : {}),
    ...(duracaoMs !== undefined ? { duracao_ms: duracaoMs } : {}),
  }

  // Metrics are written only on the posicoes row: it is the stage the
  // instrumented pilot measures, and writing the same blob to all five stage
  // rows would inflate any cross-stage aggregation (e.g. summing
  // fontes_encontradas) fivefold.
  const { data: updatedPos, error: lErrPos } = await supabase
    .from('enrichment_ledger')
    .update({ status: 'concluido', concluido_em: nowIso, atualizado_em: nowIso, metricas })
    .eq('candidacy_id', candidacyId)
    .eq('etapa', 'posicoes')
    .in('status', eligibleStatuses)
    .select('id')
  if (lErrPos) throw new Error(`Failed to update ledger (posicoes): ${lErrPos.message}`)

  const { data: updatedOther, error: lErrOther } = await supabase
    .from('enrichment_ledger')
    .update({ status: 'concluido', concluido_em: nowIso, atualizado_em: nowIso })
    .eq('candidacy_id', candidacyId)
    .neq('etapa', 'posicoes')
    .in('status', eligibleStatuses)
    .select('id')
  if (lErrOther) throw new Error(`Failed to update ledger (other stages): ${lErrOther.message}`)

  // I1: PostgREST's .update() matches zero rows without erroring. A
  // candidacy never seeded into enrichment_ledger would otherwise report
  // success here despite the queue having nothing to mark done — and it
  // would then read as permanently outstanding with no path to "finished".
  const ledgerRowsAffected = (updatedPos?.length ?? 0) + (updatedOther?.length ?? 0)
  if (ledgerRowsAffected === 0) {
    throw new Error(`Candidacy ${candidacyId} has no ledger rows — run bootstrap-ledger before ingesting research`)
  }

  console.log(`[ingest-research] ${research.tseSequencial}: ${research.fontes.length} sources, ${positionRows.length} positions, ${alertRows.length} alerts`)
}

if (process.argv[1]?.endsWith('ingest-research.ts')) {
  main().catch(err => { console.error(err); process.exit(1) })
}
