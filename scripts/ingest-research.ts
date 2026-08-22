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

/** Entry point. Usage: npm run ingest-research -- <path-to-research.json> [--tokens=N] [--duracao-ms=N] */
async function main(): Promise<void> {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: npm run ingest-research -- <path-to-research.json> [--tokens=N] [--duracao-ms=N]')
    process.exit(1)
  }

  // The agent does not know its own token usage or wall-clock duration —
  // the caller does. Both are optional and, when absent, omitted from
  // metricas entirely rather than written as null.
  const tokens = parseNumericFlag(process.argv.slice(3), 'tokens')
  const duracaoMs = parseNumericFlag(process.argv.slice(3), 'duracao-ms')

  const research = JSON.parse(readFileSync(path, 'utf-8')) as CandidateResearch

  const errors = validateResearch(research)
  if (errors.length > 0) {
    console.error(`[ingest-research] ${errors.length} validation error(s) — nothing was written:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  const { data: cand, error: cErr } = await supabase
    .from('candidacies')
    .select('id, politician_id')
    .eq('tse_sequencial', research.tseSequencial)
    .single()

  if (cErr || !cand) throw new Error(`Candidacy ${research.tseSequencial} not found: ${cErr?.message}`)

  const candidacyId = cand.id as string
  const politicianId = cand.politician_id as string

  const { data: themes, error: tErr } = await supabase.from('themes_catalog').select('id, slug')
  if (tErr) throw new Error(`Failed to read themes: ${tErr.message}`)
  const themeIdBySlug = new Map((themes ?? []).map(t => [t.slug as string, t.id as string]))

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

  const { error: csErr } = await supabase.from('candidate_sources').delete().eq('candidacy_id', candidacyId)
  if (csErr) throw new Error(`Failed to delete candidate_sources: ${csErr.message}`)

  const { error: cdErr } = await supabase.from('candidate_dossiers').delete().eq('candidacy_id', candidacyId)
  if (cdErr) throw new Error(`Failed to delete candidate_dossiers: ${cdErr.message}`)

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
    versao: 1,
  })
  if (dErr) throw new Error(`Failed to write dossier: ${dErr.message}`)

  // Only stages that were actually pending (or already done, so a re-run
  // still records fresh metrics) become concluido. nao_aplicavel stays
  // excluded — that is load-bearing: a senate candidate's government-plan
  // stage was never "pending" work and must not read as completed.
  const eligibleStatuses = ['pendente', 'em_progresso', 'falhou', 'concluido']
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
  const { error: lErrPos } = await supabase
    .from('enrichment_ledger')
    .update({ status: 'concluido', concluido_em: nowIso, atualizado_em: nowIso, metricas })
    .eq('candidacy_id', candidacyId)
    .eq('etapa', 'posicoes')
    .in('status', eligibleStatuses)
  if (lErrPos) throw new Error(`Failed to update ledger (posicoes): ${lErrPos.message}`)

  const { error: lErrOther } = await supabase
    .from('enrichment_ledger')
    .update({ status: 'concluido', concluido_em: nowIso, atualizado_em: nowIso })
    .eq('candidacy_id', candidacyId)
    .neq('etapa', 'posicoes')
    .in('status', eligibleStatuses)
  if (lErrOther) throw new Error(`Failed to update ledger (other stages): ${lErrOther.message}`)

  console.log(`[ingest-research] ${research.tseSequencial}: ${research.fontes.length} sources, ${positionRows.length} positions, ${alertRows.length} alerts`)
}

if (process.argv[1]?.endsWith('ingest-research.ts')) {
  main().catch(err => { console.error(err); process.exit(1) })
}
