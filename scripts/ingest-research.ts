import { readFileSync } from 'fs'
import { supabase } from './lib/supabase.js'
import { validateResearch, type CandidateResearch, type ResearchSource } from './lib/research-contract.js'

/** Alert types that may be shown without human curation. */
const AUTO_VALIDATED_ALERTS = new Set(['ficha_suja', 'investigacao', 'incoerencia', 'divergencia_espectro'])

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
    // unknown slugs, so this only fires on a genuine catalogue mismatch.
    if (!themeId) continue

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

export function buildAlertRows(
  research: CandidateResearch,
  politicianId: string,
  sourceIdByRef: Map<string, string>,
  sources: ResearchSource[] = research.fontes,
): Record<string, unknown>[] {
  const byRef = new Map(sources.map(s => [s.ref, s]))

  return research.alertas.map(a => {
    const primaryRef = a.fonteRefs[0]
    const source = byRef.get(primaryRef)

    return {
      politician_id: politicianId,
      tipo: a.tipo,
      severidade: a.severidade,
      titulo: a.titulo,
      descricao: a.descricao,
      data_ocorrencia: a.dataOcorrencia,
      source_id: sourceIdByRef.get(primaryRef) ?? null,
      // politician_alerts predates the catalogue and still has these NOT NULL.
      fonte_url: source?.url ?? '',
      fonte_nome: source?.veiculo ?? source?.titulo ?? 'fonte',
      gerado_por_ia: true,
      validado: AUTO_VALIDATED_ALERTS.has(a.tipo),
      ativo: true,
    }
  })
}

/** Entry point. Usage: npm run ingest-research -- <path-to-research.json> */
async function main(): Promise<void> {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: npm run ingest-research -- <path-to-research.json>')
    process.exit(1)
  }

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
  await supabase.from('politician_positions').delete().eq('politician_id', politicianId)
  await supabase.from('politician_alerts').delete().eq('politician_id', politicianId)
  await supabase.from('candidate_sources').delete().eq('candidacy_id', candidacyId)
  await supabase.from('candidate_dossiers').delete().eq('candidacy_id', candidacyId)

  const { data: insertedSources, error: sErr } = await supabase
    .from('candidate_sources')
    .insert(buildSourceRows(research, candidacyId, politicianId))
    .select('id, url')
  if (sErr) throw new Error(`Failed to write sources: ${sErr.message}`)

  const idByUrl = new Map((insertedSources ?? []).map(s => [s.url as string, s.id as string]))
  const sourceIdByRef = new Map(research.fontes.map(f => [f.ref, idByUrl.get(f.url)!]))

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

  // Only stages that were actually pending become concluido. Without the
  // status filter this would also overwrite nao_aplicavel rows — claiming a
  // senate candidate's government-plan stage was completed when no such
  // document exists.
  const { error: lErr } = await supabase
    .from('enrichment_ledger')
    .update({
      status: 'concluido',
      concluido_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      metricas: {
        fontes_encontradas: research.fontes.length,
        temas_cobertos: positionRows.length,
        alertas: alertRows.length,
        confianca_media: positionRows.length > 0
          ? research.posicoes.reduce((s, p) => s + p.confiancaIa, 0) / research.posicoes.length
          : null,
      },
    })
    .eq('candidacy_id', candidacyId)
    .in('status', ['pendente', 'em_progresso', 'falhou'])
  if (lErr) throw new Error(`Failed to update ledger: ${lErr.message}`)

  console.log(`[ingest-research] ${research.tseSequencial}: ${research.fontes.length} sources, ${positionRows.length} positions, ${alertRows.length} alerts`)
}

if (process.argv[1]?.endsWith('ingest-research.ts')) {
  main().catch(err => { console.error(err); process.exit(1) })
}
