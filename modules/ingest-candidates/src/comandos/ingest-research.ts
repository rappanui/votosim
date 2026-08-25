import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { supabase } from '../lib/supabase.js'
import { validateResearch, type CandidateResearch, type ResearchSource } from '../lib/research-contract.js'

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
    // unknown slugs, so this only fires on a genuine catalogue mismatch, but
    // it must not fire silently: it drops a theme from the candidate's card.
    if (!themeId) {
      console.warn(`[ingest-research] [SKIPPED] ${research.tseSequencial}: theme "${p.temaSlug}" has no catalogue id`)
      continue
    }

    rows.push({
      politician_id: politicianId,
      theme_id: themeId,
      posicao: p.posicao,
      neutro_motivo: p.posicao === 'neutro' ? (p.neutroMotivo ?? null) : null,
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
 * voter-visible (D8), not that the first one is: an alert can legitimately
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
 * Rule B of docs/referencia/alertas.md authorises auto-publishing only
 * ficha_suja and investigacao, and only "com fonte do TSE/STF", a layer-1
 * source. polemica is explicitly the subjective type needing curation, and
 * incoerencia / divergencia_espectro are AI inferences about a real person
 * that Rule B never covers, so both stay unvalidated regardless of source.
 *
 * Resolved status does not lower the bar below what an unresolved case of
 * the same type/source already clears. It used to (a 2026-08-22 stopgap,
 * before v_candidate_alerts could render ativo=false any differently from
 * an active one, see git blame): a resolved layer-1 ficha_suja was blocked
 * outright, because showing it with the same red "current disqualification"
 * badge as an active one would misrepresent it. That risk is gone now that
 * the view renders ativo=false with a distinct ", resolvido" badge and
 * surfaces the resolucao text, so this function no longer treats resolved
 * as a reason to withhold: same trust bar as unresolved, nothing more.
 */
function isAutoValidated(tipo: string, source: ResearchSource | undefined, _resolved: boolean): boolean {
  // A factual note about the evidence base itself, never a disqualification
  // claim, so it does not need a TSE/STF-grade source to back it, and hiding it
  // pending curation would defeat the point of warning the reader.
  if (tipo === 'ressalva_evidencias') return true
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
    const resolved = a.resolucao !== null

    return {
      politician_id: politicianId,
      tipo: a.tipo,
      severidade: a.severidade,
      // NULL unless the research explicitly reassessed a resolved alert's
      // present-day weight. validateResearch already enforces: only set on
      // a resolved alert, never graver than severidade, motivo required.
      severidade_atual: a.severidadeAtual ?? null,
      severidade_atual_motivo: a.severidadeAtualMotivo ?? null,
      titulo: a.titulo,
      descricao: a.descricao,
      data_ocorrencia: a.dataOcorrencia,
      source_id: source ? sourceIdByRef.get(source.ref) ?? null : null,
      // politician_alerts predates the catalogue and still has these NOT NULL.
      fonte_url: source?.url ?? '',
      fonte_nome: source?.veiculo ?? source?.titulo ?? 'fonte',
      gerado_por_ia: true,
      validado: isAutoValidated(a.tipo, source, resolved),
      // Rule D of docs/legado/base/04_schema_alerts.md: a resolved matter is never
      // deleted, only marked inactive with the resolution on record.
      ativo: !resolved,
      resolucao: a.resolucao,
      data_resolucao: a.dataResolucao,
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

/** I11: a bare flag, present or absent, with no value to parse. */
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

/**
 * Códigos do PostgREST para "essa função não existe no banco". Só eles
 * autorizam o caminho antigo; qualquer outro erro é erro de verdade e sobe.
 */
const RPC_AUSENTE = new Set(['PGRST202', 'PGRST203', '42883'])

/**
 * Distingue "a migração 13 ainda não foi aplicada neste banco", que autoriza o
 * caminho antigo, de qualquer outra falha, que não autoriza nada. Errar para o
 * lado permissivo aqui significaria cair no caminho sem transação diante de um
 * erro real e destruir o dossiê justamente quando algo já está errado.
 */
export function isMissingFunctionError(code: string | undefined | null): boolean {
  return code !== undefined && code !== null && RPC_AUSENTE.has(code)
}

/**
 * Resolve ref de fonte para o id gerado no cliente, cruzando pela url, que é a
 * chave que o contrato garante única (validateResearch rejeita url repetida).
 * Existe separado de main() para ser testável: um mapeamento errado aqui
 * gravaria a fonte de um alerta apontando para outra fonte.
 */
export function buildSourceIdByRef(
  fontes: { ref: string; url: string }[],
  sourceRows: Record<string, unknown>[],
): Map<string, string> {
  const idByUrl = new Map(sourceRows.map(r => [r.url as string, r.id as string]))
  return new Map(fontes.map(f => [f.ref, idByUrl.get(f.url) as string]))
}

interface WriteInput {
  candidacyId: string
  politicianId: string
  sourceRows: Record<string, unknown>[]
  positionRows: Record<string, unknown>[]
  alertRows: Record<string, unknown>[]
  dossierRow: Record<string, unknown>
  metricas: Record<string, unknown>
}

/**
 * Grava a pesquisa inteira numa transação só, via a função
 * ingest_research_write (docs/migracoes/13_ingest_research_atomico.sql).
 *
 * Por que uma função no banco: o cliente Supabase não tem transação, cada
 * chamada é commitada sozinha. A sequência antiga apagava posições, alertas e
 * fontes e só depois inseria as novas, então um erro no meio deixava o
 * candidato com zero temas no ar. Aconteceu em produção em 2026-08-25 com dois
 * candidatos reais (ver docs/registros/ingestao-dos-senadores-do-rj.md).
 */
async function writeAtomic(input: WriteInput): Promise<boolean> {
  const { error } = await supabase.rpc('ingest_research_write', {
    p_candidacy_id: input.candidacyId,
    p_politician_id: input.politicianId,
    p_sources: input.sourceRows,
    p_positions: input.positionRows,
    p_alerts: input.alertRows,
    p_dossier: input.dossierRow,
    p_metricas: input.metricas,
    p_eligible_statuses: eligibleStatuses,
  })

  if (!error) return true
  if (isMissingFunctionError(error.code)) return false
  throw new Error(`Failed to write research: ${error.message}`)
}

/**
 * TEMPORÁRIO. O caminho antigo, chamada a chamada, sem transação: um erro
 * depois do primeiro delete destrói o dossiê do candidato. Existe apenas para
 * que o pacote em ZIP continue funcionando em uma base onde a migração 13
 * ainda não foi aplicada. Remova quando ela estiver aplicada em todo lugar.
 */
async function writeSequential(input: WriteInput): Promise<void> {
  const { candidacyId, politicianId, sourceRows, positionRows, alertRows, dossierRow, metricas } = input

  console.warn('[ingest-research] AVISO: a função ingest_research_write não existe neste banco.')
  console.warn('[ingest-research] Gravando pelo caminho antigo, SEM transação: uma falha no meio')
  console.warn('[ingest-research] apaga o dossiê deste candidato. Aplique docs/migracoes/13_ingest_research_atomico.sql.')

  const { error: ppErr } = await supabase.from('politician_positions').delete().eq('politician_id', politicianId)
  if (ppErr) throw new Error(`Failed to delete politician_positions: ${ppErr.message}`)

  // Regra D de docs/referencia/alertas.md: alerta resolvido nunca é apagado, e
  // a aprovação de um curador (validado_por preenchido) também sobrevive a uma
  // regravação. Só se substitui o que este pipeline gerou e ninguém tocou.
  const { error: paErr } = await supabase
    .from('politician_alerts')
    .delete()
    .eq('politician_id', politicianId)
    .eq('gerado_por_ia', true)
    .is('validado_por', null)
    .eq('ativo', true)
  if (paErr) throw new Error(`Failed to delete politician_alerts: ${paErr.message}`)

  // I2: politician_alerts.source_id é ON DELETE SET NULL. Apagar fonte sem
  // filtro zeraria o source_id justamente dos alertas preservados acima, que é
  // a quebra de D8 que o catálogo existe para impedir.
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

  const { error: sErr } = await supabase.from('candidate_sources').insert(sourceRows)
  if (sErr) throw new Error(`Failed to write sources: ${sErr.message}`)

  if (positionRows.length > 0) {
    const { error } = await supabase.from('politician_positions').insert(positionRows)
    if (error) throw new Error(`Failed to write positions: ${error.message}`)
  }

  if (alertRows.length > 0) {
    const { error } = await supabase.from('politician_alerts').insert(alertRows)
    if (error) throw new Error(`Failed to write alerts: ${error.message}`)
  }

  // I3: candidate_dossiers é UNIQUE (candidacy_id, versao) de propósito, para
  // que uma regravação entre como versão nova em vez de sobrescrever a take
  // anterior.
  const { data: maxDossier, error: maxDossierErr } = await supabase
    .from('candidate_dossiers')
    .select('versao')
    .eq('candidacy_id', candidacyId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxDossierErr) throw new Error(`Failed to read current dossier version: ${maxDossierErr.message}`)

  const { error: dErr } = await supabase.from('candidate_dossiers').insert({
    candidacy_id: candidacyId,
    ...dossierRow,
    versao: nextDossierVersion((maxDossier?.versao as number | undefined) ?? null),
  })
  if (dErr) throw new Error(`Failed to write dossier: ${dErr.message}`)

  const nowIso = new Date().toISOString()

  // metricas só na etapa posicoes: escrever o mesmo blob nas cinco etapas
  // multiplicaria por cinco qualquer soma entre etapas.
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

  // I1: um update do PostgREST que não casa nenhuma linha não é erro. Uma
  // candidatura nunca semeada no ledger reportaria sucesso e continuaria
  // pendente para sempre.
  if ((updatedPos?.length ?? 0) + (updatedOther?.length ?? 0) === 0) {
    throw new Error(`Candidacy ${candidacyId} has no ledger rows, run bootstrap-ledger before ingesting research`)
  }
}

async function writeResearch(input: WriteInput): Promise<void> {
  const gravou = await writeAtomic(input)
  if (!gravou) await writeSequential(input)
}

/** Entry point. Usage: npm run ingest-research -- <path-to-research.json> --confirm [--tokens=N] [--duracao-ms=N] */
async function main(): Promise<void> {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: npm run ingest-research -- <path-to-research.json> --confirm [--tokens=N] [--duracao-ms=N]')
    process.exit(1)
  }

  const flagArgv = process.argv.slice(3)
  const confirm = hasConfirmFlag(flagArgv)
  // The agent does not know its own token usage or wall-clock duration, but
  // the caller does. Both are optional and, when absent, omitted from
  // metricas entirely rather than written as null.
  const tokens = parseNumericFlag(flagArgv, 'tokens')
  const duracaoMs = parseNumericFlag(flagArgv, 'duracao-ms')

  const research = parseResearchJson(readFileSync(path, 'utf-8'), path)

  const errors = validateResearch(research)
  if (errors.length > 0) {
    console.error(`[ingest-research] ${errors.length} validation error(s), nothing was written:`)
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
  // this check the run silently attributes one candidate's research,
  // including ficha_suja / investigacao alerts, to someone else. Printing
  // the resolved identity is the only check a human can actually perform;
  // require it to be looked at before anything is written.
  console.log('='.repeat(64))
  console.log(`[ingest-research] RESOLVED CANDIDATE: ${nomeUrna}`)
  console.log(`[ingest-research] CARGO: ${cand.cargo}   ESTADO: ${cand.estado}`)
  console.log(`[ingest-research] tseSequencial ${research.tseSequencial} -> candidacy ${candidacyId}`)
  console.log('='.repeat(64))

  if (!confirm) {
    console.log('[ingest-research] DRY RUN: no --confirm flag, nothing was written.')
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
  // docs/referencia/schema-adicoes-sp0.md), so the candidate stays visible and gets
  // picked up again instead of vanishing with zero positions and a stale
  // status=concluido from a prior successful run.
  const { error: guardErr } = await supabase
    .from('enrichment_ledger')
    .update({ status: 'em_progresso', atualizado_em: new Date().toISOString() })
    .eq('candidacy_id', candidacyId)
    .in('status', eligibleStatuses)
  if (guardErr) throw new Error(`Failed to mark ledger em_progresso before re-ingest: ${guardErr.message}`)

  // As linhas saem prontas daqui, com o id de cada fonte gerado no cliente,
  // para que posições e alertas já possam referenciá-lo antes de qualquer
  // escrita. É isso que permite gravar tudo numa chamada só.
  const sourceRows: Record<string, unknown>[] = buildSourceRows(research, candidacyId, politicianId)
    .map(row => ({ ...row, id: randomUUID() }))

  const sourceIdByRef = buildSourceIdByRef(research.fontes, sourceRows)

  // D8 (docs/legado/base/04_schema_alerts.md): todo fato exibido tem origem
  // rastreável. Uma ref que não resolve viraria um source_id nulo num alerta
  // cuja fonte_url ainda mostra um link. O validador já rejeita ref não
  // declarada, então isto só dispara em defeito nosso; ainda assim, falhe
  // alto em vez de gravar.
  const refsSemId = research.fontes.filter(f => !sourceIdByRef.get(f.ref)).map(f => f.ref)
  if (refsSemId.length > 0) {
    throw new Error(`Failed to resolve source ids for refs: ${refsSemId.join(', ')}`)
  }

  const positionRows = buildPositionRows(research, politicianId, themeIdBySlug, sourceIdByRef)
  const alertRows = buildAlertRows(research, politicianId, sourceIdByRef)

  // confianca_media é calculada sobre positionRows, as posições realmente
  // escritas, e não sobre research.posicoes, para que um tema descartado por
  // falta de id no catálogo (ver buildPositionRows) saia do numerador e do
  // denominador de forma consistente.
  const metricas = {
    fontes_encontradas: research.fontes.length,
    temas_cobertos: positionRows.length,
    alertas: alertRows.length,
    confianca_media: positionRows.length > 0
      ? positionRows.reduce((acc, p) => acc + (p.confianca_ia as number), 0) / positionRows.length
      : null,
    ...(tokens !== undefined ? { tokens } : {}),
    ...(duracaoMs !== undefined ? { duracao_ms: duracaoMs } : {}),
  }

  const dossierRow = {
    resumo_perfil: research.dossie.resumoPerfil,
    espectro_declarado: research.dossie.espectroDeclarado,
    espectro_inferido: research.dossie.espectroInferido,
    coerencia_indice: research.dossie.coerenciaIndice,
    coerencia_base: research.dossie.coerenciaBase,
  }

  await writeResearch({
    candidacyId, politicianId, sourceRows, positionRows, alertRows, dossierRow, metricas,
  })

  console.log(`[ingest-research] ${research.tseSequencial}: ${research.fontes.length} sources, ${positionRows.length} positions, ${alertRows.length} alerts`)
}

if (process.argv[1]?.endsWith('ingest-research.ts')) {
  main().catch(err => { console.error(err); process.exit(1) })
}
