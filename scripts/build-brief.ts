import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { supabase } from './lib/supabase.js'
import { extractPdfText } from './lib/pdf.js'

const PLANS_DIR = 'data/tse-2026/extracted/planos'
const SOCIAL_DIR = 'data/tse-2026/extracted/rede_social_candidato_2026'
const OUT_DIR = 'data/briefs'

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
 * alongside a leiame.pdf that is not a plan.
 */
export function findPlanPath(sequencial: string, files: string[]): string | null {
  const pattern = new RegExp(`\\d{4}[A-Z]{2}${sequencial}(_\\d+)?\\.pdf$`, 'i')
  return files.find(f => pattern.test(f)) ?? null
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
  lines.push('disagree with it, `neutro` that they have no clear or consistent position.')
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

  const planPath = findPlanPath(sequencial, listPlanFiles())
  const planoTexto = planPath ? await extractPdfText(planPath) : null
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
  console.log(`[build-brief] plan: ${planPath ?? 'NONE FILED'}`)
  console.log(`[build-brief] wrote ${dest} (${brief.length} chars, ~${Math.round(brief.length / 4 / 1000)}k tokens)`)
}

if (process.argv[1]?.endsWith('build-brief.ts')) {
  main().catch(err => { console.error(err); process.exit(1) })
}
