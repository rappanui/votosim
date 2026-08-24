import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { supabase } from './lib/supabase.js'
import { extractPdfText } from './lib/pdf.js'
import { FILES_GOVERNMENT_PLAN } from './lib/ledger.js'

const EXTRACTED_DIR = 'data/tse-2026/extracted'
const ARCHIVE_DIR = 'data/tse-2026'
const PLANS_DIR = `${EXTRACTED_DIR}/planos`
const SOCIAL_DIR = `${EXTRACTED_DIR}/rede_social_candidato_2026`
const OUT_DIR = 'data/briefs'

/**
 * Why "no plan found" happened. Reporting all four as NONE FILED is what made
 * F11 dangerous: a misconfigured extraction produced briefs stating the
 * candidate filed no plan, which an agent then wrote into a voter-facing
 * dossier as a fact about a candidate who had in fact filed one.
 */
export type PlanDiagnosis =
  /** A plan (or every part of one) was located for this candidate. */
  | { kind: 'found' }
  /** Legislative office — the TSE does not require a plan. Expected, not a defect. */
  | { kind: 'not_expected' }
  /** Executive office, this UF's plans are on disk, this candidate has none (see F9). */
  | { kind: 'genuinely_absent' }
  /** Executive office, plans exist but none for this UF — that archive was never downloaded. */
  | { kind: 'uf_not_downloaded' }
  /** Executive office and PLANS_DIR holds no plans at all — almost certainly the wrong folder. */
  | { kind: 'misconfigured' }

/**
 * Decides what a missing plan actually means. Pure so the four branches are
 * testable without staging directory trees.
 */
export function diagnosePlanAvailability(input: {
  cargo: string
  estado: string
  planPathsForCandidate: string[]
  allPlanFiles: string[]
}): PlanDiagnosis {
  const { cargo, estado, planPathsForCandidate, allPlanFiles } = input

  if (planPathsForCandidate.length > 0) return { kind: 'found' }
  // Checked before the misconfiguration branches on purpose: a senate or
  // deputy brief must not error out just because no executive plans were
  // downloaded — those candidates never file one.
  if (!FILES_GOVERNMENT_PLAN.has(cargo)) return { kind: 'not_expected' }
  if (allPlanFiles.length === 0) return { kind: 'misconfigured' }

  const ufHasPlans = allPlanFiles.some(f => f.includes(`/${estado.toUpperCase()}/`))
  return ufHasPlans ? { kind: 'genuinely_absent' } : { kind: 'uf_not_downloaded' }
}

export interface BriefInput {
  nomeUrna: string
  nomeCompleto: string
  cargo: string
  estado: string
  partido: string
  coligacao: string | null
  federacao: string | null
  numeroUrna: string
  tseSequencial: string
  planoTexto: string | null
  redesSociais: string[]
  temas: { slug: string; afirmacao: string; contexto: string | null }[]
}

/**
 * TSE names plan files {year}{UF}{SQ_CANDIDATO}_{NN}.pdf, inside a {UF}/ folder,
 * alongside a leiame.pdf that is not a plan. A plan split across multiple
 * files (_01, _02, _03...) is one document, not several — every part must be
 * read, or the brief silently drops most of what the candidate actually
 * filed (see docs/sp0-findings-log.md F10).
 */
export function findPlanPaths(sequencial: string, files: string[]): string[] {
  const pattern = new RegExp(`\\d{4}[A-Z]{2}${sequencial}(_(\\d+))?\\.pdf$`, 'i')
  return files
    .filter(f => pattern.test(f))
    .sort((a, b) => {
      const partOf = (f: string): number => Number(pattern.exec(f)?.[2] ?? '0')
      return partOf(a) - partOf(b)
    })
}

/** Convenience wrapper for callers that only care about a single-file plan. */
export function findPlanPath(sequencial: string, files: string[]): string | null {
  return findPlanPaths(sequencial, files)[0] ?? null
}

/** Renders the agent's input document. Everything it needs, nothing it does not. */
export function renderBrief(input: BriefInput): string {
  const lines: string[] = []

  lines.push(`# Candidate research brief — ${input.nomeUrna}`)
  lines.push('')
  lines.push('## Identity')
  lines.push(`- Ballot name: ${input.nomeUrna}`)
  lines.push(`- Full name: ${input.nomeCompleto}`)
  lines.push(`- Office: ${input.cargo}`)
  lines.push(`- State: ${input.estado}`)
  lines.push(`- Party: ${input.partido}`)
  lines.push(`- Coalition: ${input.coligacao ?? 'none (ran alone or federation only)'}`)
  lines.push(`- Federation: ${input.federacao ?? 'none'}`)
  lines.push(`- Ballot number: ${input.numeroUrna}`)
  lines.push(`- TSE sequencial: ${input.tseSequencial}`)
  lines.push('')

  lines.push('## Officially declared social accounts')
  if (input.redesSociais.length === 0) {
    lines.push('none declared to the TSE')
  } else {
    for (const url of input.redesSociais) lines.push(`- ${url}`)
  }
  lines.push('')

  lines.push('## Questionnaire themes')
  lines.push('')
  lines.push('Judge the candidate against the affirmation **exactly as worded**. `favoravel`')
  lines.push('means they agree with the affirmation as written, `contrario` that they')
  lines.push('disagree with it. `neutro` covers three distinct cases, and the output must')
  lines.push('say which one with `neutroMotivo`: `nao_encontrado` (nothing found on this')
  lines.push('theme), `nao_responde` (a documented stance exists but does not answer this')
  lines.push('affirmation — e.g. the affirmation asks about EXPANDING a programme and the')
  lines.push('candidate promises only to MAINTAIN it), or `ambivalente` (contradictory or')
  lines.push('explicitly conditional). See docs/candidate-research-procedure.md section E5')
  lines.push('for the full rule — getting `nao_encontrado` and `nao_responde` confused costs')
  lines.push('a real candidate 0.40 of alignment on that theme.')
  lines.push('')
  for (const t of input.temas) {
    lines.push(`### ${t.slug}`)
    lines.push(t.afirmacao)
    lines.push('')
    // I8: contexto_questionario is the disambiguating paragraph — the direct
    // antidote to the framing trap (see docs/candidate-research-procedure.md
    // section 4). It is context for judging the affirmation above, not part
    // of the affirmation itself, so it is labelled and kept visually
    // separate rather than appended to it.
    if (t.contexto) {
      lines.push(`**Context for judging this affirmation:** ${t.contexto}`)
      lines.push('')
    }
  }

  lines.push('## Government plan')
  lines.push('')
  if (input.planoTexto === null) {
    lines.push('This candidate filed **no government plan** with the TSE. Senate and')
    lines.push('legislative candidates are not required to; an executive candidate without')
    lines.push('one means the document is genuinely absent and other sources must carry')
    lines.push('the weight.')
  } else {
    lines.push(input.planoTexto)
  }
  lines.push('')

  return lines.join('\n')
}

/** Parses one social-accounts CSV and returns the URLs declared by `sequencial`. */
function readSocialCsv(path: string, sequencial: string): string[] {
  const content = readFileSync(path, 'latin1')
  const rows: Record<string, string>[] = parse(content, { delimiter: ';', columns: true, skip_empty_lines: true })
  const urls: string[] = []
  for (const row of rows) {
    if (row['SQ_CANDIDATO']?.trim() === sequencial) urls.push(row['DS_URL']?.trim() ?? '')
  }
  return urls.filter(Boolean)
}

/**
 * Reads the declared social accounts for one candidate from the TSE CSVs.
 *
 * `rede_social_candidato_2026_${estado}.csv` holds exactly the rows for that
 * election unit — presidential candidates carry `estado = 'BR'`, which maps to
 * `_BR.csv`, the file holding the federal offices. `_BRASIL.csv` is the union
 * of every per-unit file; reading it alongside the per-state files would read
 * each candidate's rows twice, so it is read only as a fallback, alone, when
 * the per-state file is missing.
 */
export function loadSocialAccounts(sequencial: string, estado: string): string[] {
  if (!existsSync(SOCIAL_DIR)) return []

  const perStatePath = `${SOCIAL_DIR}/rede_social_candidato_2026_${estado}.csv`
  if (existsSync(perStatePath)) return readSocialCsv(perStatePath, sequencial)

  console.warn(`[build-brief] no rede_social_candidato_2026_${estado}.csv, falling back to _BRASIL.csv`)
  const fallbackPath = `${SOCIAL_DIR}/rede_social_candidato_2026_BRASIL.csv`
  if (!existsSync(fallbackPath)) return []
  return readSocialCsv(fallbackPath, sequencial)
}

/** Recursively lists PDF paths under the plans directory. */
function listPlanFiles(): string[] {
  if (!existsSync(PLANS_DIR)) return []
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(full)
      else if (entry.name.toLowerCase().endsWith('.pdf')) out.push(full)
    }
  }
  walk(PLANS_DIR)
  return out
}

/**
 * Prints an actionable diagnosis instead of a bare "NONE FILED". Impure by
 * design — it probes the filesystem to tell the operator *where* the plans
 * actually are, which is the part that turns a confusing result into a fix.
 */
function reportPlanMisconfiguration(kind: 'misconfigured' | 'uf_not_downloaded', estado: string): void {
  const uf = estado.toUpperCase()
  console.error('='.repeat(72))
  console.error('[build-brief] ABORTADO — os planos de governo não foram encontrados.')
  console.error('='.repeat(72))

  if (kind === 'uf_not_downloaded') {
    console.error(`Há planos extraídos, mas nenhum da UF ${uf}. O arquivo dessa UF`)
    console.error('provavelmente nunca foi baixado. Rode:')
    console.error(`  npm run download-tse -- --uf=${uf}`)
    console.error(`  unzip -o 'data/tse-2026/proposta_governo_*.zip' -d ${PLANS_DIR}`)
  } else {
    console.error(`${PLANS_DIR}/ está vazio ou não existe.`)

    // The F11 signature: the archive contains a {UF}/ folder, so extracting to
    // extracted/ (instead of extracted/planos/) leaves plans one level too high.
    const misplaced = existsSync(`${EXTRACTED_DIR}/${uf}`)
    const unextracted = existsSync(ARCHIVE_DIR)
      && readdirSync(ARCHIVE_DIR).some(f => f.startsWith('proposta_governo_') && f.endsWith('.zip'))

    if (misplaced) {
      console.error('')
      console.error(`ENCONTREI planos em ${EXTRACTED_DIR}/${uf}/ — pasta errada (é o F11).`)
      console.error('Mova para o lugar certo:')
      console.error(`  mkdir -p ${PLANS_DIR} && mv ${EXTRACTED_DIR}/${uf} ${PLANS_DIR}/`)
    } else if (unextracted) {
      console.error('')
      console.error('Os arquivos .zip estão baixados mas não extraídos. Rode:')
      console.error(`  unzip -o 'data/tse-2026/proposta_governo_*.zip' -d ${PLANS_DIR}`)
    } else {
      console.error('')
      console.error('Nada baixado ainda. Rode:')
      console.error(`  npm run download-tse -- --uf=${uf} --bulk`)
      console.error(`  unzip -o 'data/tse-2026/proposta_governo_*.zip' -d ${PLANS_DIR}`)
    }
  }

  console.error('')
  console.error('Por que isto aborta em vez de seguir: sem os planos, o brief diria')
  console.error('"filed no government plan" para um candidato que protocolou um — e essa')
  console.error('frase acabaria no dossiê que o eleitor lê. Ver docs/sp0-findings-log.md, F11.')
  console.error('='.repeat(72))
}

/** Entry point. Usage: npm run build-brief -- <tse_sequencial> */
async function main(): Promise<void> {
  const sequencial = process.argv[2]
  if (!sequencial) {
    console.error('Usage: npm run build-brief -- <tse_sequencial>')
    process.exit(1)
  }

  const { data: cand, error } = await supabase
    .from('candidacies')
    .select('cargo, estado, partido_eleicao, coligacao, federacao, numero_urna, tse_sequencial, politicians(nome_urna, nome_completo)')
    .eq('tse_sequencial', sequencial)
    .single()

  if (error || !cand) throw new Error(`Candidacy ${sequencial} not found: ${error?.message}`)

  const { data: temas, error: tErr } = await supabase
    .from('themes_catalog')
    .select('slug, afirmacao_questionario, contexto_questionario')
    .eq('exibir_no_quiz', true)
    .order('ordem_exibicao')

  if (tErr) throw new Error(`Failed to read themes: ${tErr.message}`)

  const allPlanFiles = listPlanFiles()
  const planPaths = findPlanPaths(sequencial, allPlanFiles)
  const diagnosis = diagnosePlanAvailability({
    cargo: cand.cargo as string,
    estado: cand.estado as string,
    planPathsForCandidate: planPaths,
    allPlanFiles,
  })

  // Refuse to write a brief that would state, as a fact about the candidate,
  // something that is actually a fact about this machine's folder layout.
  if (diagnosis.kind === 'misconfigured' || diagnosis.kind === 'uf_not_downloaded') {
    reportPlanMisconfiguration(diagnosis.kind, cand.estado as string)
    process.exit(1)
  }

  const planoTexto = planPaths.length > 0
    ? (await Promise.all(planPaths.map(p => extractPdfText(p)))).join('\n\n')
    : null
  const politician = (cand as Record<string, unknown>).politicians as Record<string, string>

  const brief = renderBrief({
    nomeUrna: politician.nome_urna,
    nomeCompleto: politician.nome_completo,
    cargo: cand.cargo as string,
    estado: cand.estado as string,
    partido: cand.partido_eleicao as string,
    coligacao: (cand.coligacao as string | null) ?? null,
    federacao: (cand.federacao as string | null) ?? null,
    numeroUrna: cand.numero_urna as string,
    tseSequencial: sequencial,
    planoTexto,
    redesSociais: loadSocialAccounts(sequencial, cand.estado as string),
    temas: (temas ?? []).map(t => ({
      slug: t.slug as string,
      afirmacao: t.afirmacao_questionario as string,
      contexto: (t.contexto_questionario as string | null) ?? null,
    })),
  })

  mkdirSync(OUT_DIR, { recursive: true })
  const dest = `${OUT_DIR}/${sequencial}.md`
  writeFileSync(dest, brief, 'utf-8')

  console.log(`[build-brief] ${politician.nome_urna} (${cand.cargo})`)
  console.log(`[build-brief] plan: ${planPaths.length > 0 ? planPaths.join(', ') : 'NONE FILED'}`)
  console.log(`[build-brief] wrote ${dest} (${brief.length} chars, ~${Math.round(brief.length / 4 / 1000)}k tokens)`)
}

if (process.argv[1]?.endsWith('build-brief.ts')) {
  main().catch(err => { console.error(err); process.exit(1) })
}
