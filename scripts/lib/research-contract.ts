import { NEUTRO_MOTIVOS, type NeutroMotivo } from './neutro-motivo.ts'

/** The 14 questionnaire themes. A position on anything else is a defect. */
export const THEME_SLUGS = [
  'reforma_tributaria', 'sus_saude_publica', 'privatizacao_estatais',
  'seguranca_publica_estadual', 'educacao_basica', 'meio_ambiente_desmatamento',
  'reforma_previdencia', 'protecao_minorias', 'autonomia_individual',
  'bolsa_familia_transferencia', 'corrupcao_transparencia', 'politica_economica',
  'politica_externa', 'laicidade_valores',
] as const

/** Same vocabulary as parties.espectro and the candidate_dossiers CHECK. */
export const SPECTRUM_VALUES = [
  'esquerda', 'centro_esquerda', 'centro', 'centro_direita', 'direita', 'sem_classificacao',
] as const

/**
 * Domains that qualify a source as camada 1 (primary/official). Without this
 * check, camada is a bare integer the agent asserts about itself — a source
 * self-declared as camada 1 on an arbitrary site would satisfy D9 with a
 * single "official" reference and, per ingest-research.ts's auto-validation
 * rule, publish a ficha_suja or investigacao badge to voters with no human
 * review. Requiring an actual .jus.br/.gov.br/.leg.br/.mp.br domain is what
 * makes camada 1 mean something.
 */
const OFFICIAL_DOMAIN_SUFFIXES = ['.jus.br', '.gov.br', '.leg.br', '.mp.br'] as const

function isOfficialDomain(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase()
  return OFFICIAL_DOMAIN_SUFFIXES.some(
    suffix => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  )
}

const STANCES = ['favoravel', 'contrario', 'neutro'] as const
const COHERENCE = ['coerente', 'incoerente', 'sem_historico'] as const
const SOURCE_TIPOS = [
  'plano_governo', 'coligacao', 'bens_declarados', 'votacao',
  'tse_oficial', 'noticia', 'checagem', 'judicial',
  // Added 2026-08-23 (docs/referencia/schema-adicoes-sp0.md): the E1 evidence base for
  // legislative candidates, who file no plano_governo — party platform and
  // biographical profile documents.
  'plataforma_partidaria', 'biografia',
  // E4b: attendance, votes cast, authored bills and CEAP spending for a
  // candidate with a legislative mandate. No pre-existing tipo fits —
  // bens_declarados is declared personal assets, votacao is a single
  // roll-call. Every E4b figure must cite the exact endpoint queried.
  'desempenho_mandato',
] as const
const DESTINOS = ['card_candidato', 'pagina_sobre', 'interno'] as const
const ALERT_TIPOS = [
  'ficha_suja', 'investigacao', 'polemica', 'incoerencia', 'divergencia_espectro',
  // Added 2026-08-23: a methodological caveat about the evidence base itself
  // (degraded extraction, party-inferred positions) — a transparency flag,
  // never an accusation. Auto-validated on ingest (see ingest-research.ts's
  // isAutoValidated).
  'ressalva_evidencias',
] as const
const SEVERIDADES = ['critica', 'alta', 'media', 'baixa'] as const

export interface ResearchSource {
  ref: string
  tipo: string
  camada: 1 | 2 | 3
  titulo: string | null
  veiculo: string | null
  url: string
  dataPublicacao: string | null
  destinoExibicao: string
}

export interface ResearchPosition {
  temaSlug: string
  posicao: string
  /**
   * Which flavor of "neutro" this is — only meaningful when posicao is
   * 'neutro'. A missing value on a neutro position is read as
   * 'nao_encontrado' for backward compatibility with payloads written before
   * this field existed. See scripts/lib/neutro-motivo.ts.
   */
  neutroMotivo?: string | null
  intensidade: number
  justificativa: string
  confiancaIa: number
  coerenciaTema: string | null
  fonteRefs: string[]
}

export interface ResearchAlert {
  tipo: string
  severidade: string
  titulo: string
  descricao: string
  dataOcorrencia: string | null
  fonteRefs: string[]
  /**
   * Rule D of docs/legado/base/04_schema_alerts.md: a resolved matter (charges
   * dropped, conviction overturned, absolved) is never deleted or omitted —
   * only marked inactive with the resolution on record, for transparency.
   * null means the matter is still open. Non-null maps to ativo=false and
   * this text becomes politician_alerts.resolucao.
   */
  resolucao: string | null
  /** ISO date the resolution became final, or null if unknown even though resolved. */
  dataResolucao: string | null
}

export interface ResearchDossier {
  resumoPerfil: string
  espectroDeclarado: string | null
  espectroInferido: string | null
  coerenciaIndice: number | null
  coerenciaBase: string | null
}

export interface CandidateResearch {
  tseSequencial: string
  dossie: ResearchDossier
  fontes: ResearchSource[]
  posicoes: ResearchPosition[]
  alertas: ResearchAlert[]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function checkSpectrum(value: unknown, field: string, errors: string[]): void {
  if (value === null || value === undefined) return
  if (!SPECTRUM_VALUES.includes(value as typeof SPECTRUM_VALUES[number])) {
    errors.push(`${field}: invalid spectrum value ${JSON.stringify(value)}`)
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** PostgreSQL's default DateStyle parses ambiguous DD/MM vs MM/DD formats
 * silently and wrong. ISO YYYY-MM-DD is the only format with no reading. */
function checkIsoDate(value: unknown, field: string, errors: string[]): void {
  if (value === null || value === undefined) return
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    errors.push(`${field}: must be an ISO date (YYYY-MM-DD)`)
  }
}

function checkNullableString(value: unknown, field: string, errors: string[]): void {
  if (value === null || value === undefined) return
  if (typeof value !== 'string') {
    errors.push(`${field}: must be a string or null`)
  }
}

const VISIBLE_DESTINOS = new Set(['card_candidato', 'pagina_sobre'])

/**
 * Validates an agent's research document. Returns every problem found, not just
 * the first — a partial report would send the agent back repeatedly.
 *
 * The two rules that exist for editorial reasons rather than type safety:
 *  - D8: every position and alert must reference declared sources, so no fact
 *    reaches a voter without a traceable origin.
 *  - D9: a `polemica` needs two independent layer-2 sources or one layer-1
 *    source. This is the subjective alert type and the one most prone to bias.
 */
export function validateResearch(input: unknown): string[] {
  const errors: string[] = []

  if (!isObject(input)) return ['research must be an object']

  const doc = input as unknown as CandidateResearch

  if (typeof doc.tseSequencial !== 'string' || !doc.tseSequencial.trim()) {
    errors.push('tseSequencial: required non-empty string')
  }

  // ─── Sources ───────────────────────────────────────────────────────────────
  const refs = new Set<string>()
  const urls = new Set<string>()
  const camadaByRef = new Map<string, number>()
  const destinoByRef = new Map<string, string>()

  if (!Array.isArray(doc.fontes) || doc.fontes.length === 0) {
    errors.push('fontes: at least one source is required')
  } else {
    for (const [i, f] of doc.fontes.entries()) {
      if (!isObject(f)) { errors.push(`fontes[${i}]: must be an object`); continue }
      if (typeof f.ref !== 'string' || !f.ref) errors.push(`fontes[${i}].ref: required`)
      else if (refs.has(f.ref)) errors.push(`fontes[${i}]: duplicate source ref ${f.ref}`)
      else {
        refs.add(f.ref)
        camadaByRef.set(f.ref, f.camada as number)
        destinoByRef.set(f.ref, f.destinoExibicao as string)
      }

      if (![1, 2, 3].includes(f.camada as number)) errors.push(`fontes[${i}].camada: must be 1, 2 or 3`)
      if (!SOURCE_TIPOS.includes(f.tipo as typeof SOURCE_TIPOS[number])) errors.push(`fontes[${i}].tipo: invalid ${JSON.stringify(f.tipo)}`)
      if (!DESTINOS.includes(f.destinoExibicao as typeof DESTINOS[number])) errors.push(`fontes[${i}].destinoExibicao: invalid`)
      if (typeof f.url !== 'string' || !/^https?:\/\//i.test(f.url)) {
        errors.push(`fontes[${i}].url: must be an http(s) url`)
      } else if (urls.has(f.url)) {
        // candidate_sources has UNIQUE (politician_id, url), and the ingester
        // resolves ref -> id by url. A repeat would fail the insert and silently
        // collapse two refs onto one id.
        errors.push(`fontes[${i}]: duplicate source url ${f.url}`)
      } else {
        urls.add(f.url)
        if (f.camada === 1 && !isOfficialDomain(f.url)) {
          errors.push(
            `fontes[${i}]: camada 1 requires an official domain (.jus.br, .gov.br, .leg.br, .mp.br) — got ${new URL(f.url).hostname}`,
          )
        }
      }
      checkNullableString(f.titulo, `fontes[${i}].titulo`, errors)
      checkNullableString(f.veiculo, `fontes[${i}].veiculo`, errors)
      checkIsoDate(f.dataPublicacao, `fontes[${i}].dataPublicacao`, errors)
    }
  }

  // Dedupes by ref (declaration order) so a repeated ref cannot inflate a
  // source count — D9's "two independent sources" must mean two distinct
  // sources, not one source cited twice. Also stops duplicate source_ids
  // from reaching the database downstream.
  //
  // Also enforces D8's voter-reachability half: a claim resolved entirely to
  // `interno` sources is untraceable for a reader, so at least one resolved
  // ref must be visible (card_candidato or pagina_sobre).
  const checkRefs = (list: unknown, label: string): string[] => {
    if (!Array.isArray(list) || list.length === 0) {
      errors.push(`${label}: at least one source reference is required`)
      return []
    }
    const resolved: string[] = []
    const seen = new Set<string>()
    for (const r of list) {
      if (typeof r !== 'string' || !refs.has(r)) {
        errors.push(`${label}: undeclared source ref ${JSON.stringify(r)}`)
      } else if (!seen.has(r)) {
        seen.add(r)
        resolved.push(r)
      }
    }
    if (resolved.length > 0 && !resolved.some(r => VISIBLE_DESTINOS.has(destinoByRef.get(r) ?? ''))) {
      errors.push(`${label}: must cite at least one voter-visible source (card_candidato or pagina_sobre)`)
    }
    return resolved
  }

  // ─── Dossier ───────────────────────────────────────────────────────────────
  if (!isObject(doc.dossie)) {
    errors.push('dossie: required object')
  } else {
    if (typeof doc.dossie.resumoPerfil !== 'string' || !doc.dossie.resumoPerfil.trim()) {
      errors.push('dossie.resumoPerfil: required non-empty string')
    }
    checkSpectrum(doc.dossie.espectroDeclarado, 'dossie.espectroDeclarado', errors)
    checkSpectrum(doc.dossie.espectroInferido, 'dossie.espectroInferido', errors)
    checkNullableString(doc.dossie.coerenciaBase, 'dossie.coerenciaBase', errors)

    const ci = doc.dossie.coerenciaIndice
    if (ci !== null && ci !== undefined
        && (typeof ci !== 'number' || !Number.isFinite(ci) || ci < 0 || ci > 100)) {
      errors.push('dossie.coerenciaIndice: must be null or a number between 0 and 100')
    }
  }

  // ─── Positions ─────────────────────────────────────────────────────────────
  const seenThemes = new Set<string>()
  if (!Array.isArray(doc.posicoes)) {
    errors.push('posicoes: required array')
  } else {
    for (const [i, p] of doc.posicoes.entries()) {
      if (!isObject(p)) { errors.push(`posicoes[${i}]: must be an object`); continue }
      const label = `posicoes[${i}] (${String(p.temaSlug)})`

      if (!THEME_SLUGS.includes(p.temaSlug as typeof THEME_SLUGS[number])) {
        errors.push(`${label}: unknown theme slug`)
      } else if (seenThemes.has(p.temaSlug as string)) {
        errors.push(`${label}: duplicate theme`)
      } else {
        seenThemes.add(p.temaSlug as string)
      }

      if (!STANCES.includes(p.posicao as typeof STANCES[number])) errors.push(`${label}.posicao: invalid`)
      if (p.neutroMotivo !== null && p.neutroMotivo !== undefined) {
        if (!NEUTRO_MOTIVOS.includes(p.neutroMotivo as NeutroMotivo)) {
          errors.push(`${label}.neutroMotivo: invalid`)
        }
        if (p.posicao !== 'neutro') {
          errors.push(`${label}.neutroMotivo: only allowed when posicao is 'neutro'`)
        }
      }
      if (!Number.isInteger(p.intensidade) || !Number.isFinite(p.intensidade as number)
          || (p.intensidade as number) < 1 || (p.intensidade as number) > 5) {
        errors.push(`${label}.intensidade: must be an integer 1-5`)
      }
      if (typeof p.confiancaIa !== 'number' || !Number.isFinite(p.confiancaIa)
          || p.confiancaIa < 0 || p.confiancaIa > 1) {
        errors.push(`${label}.confiancaIa: must be a number between 0 and 1`)
      }
      if (typeof p.justificativa !== 'string' || !p.justificativa.trim()) {
        errors.push(`${label}.justificativa: required non-empty string`)
      }
      if (p.coerenciaTema !== null && p.coerenciaTema !== undefined
          && !COHERENCE.includes(p.coerenciaTema as typeof COHERENCE[number])) {
        errors.push(`${label}.coerenciaTema: invalid`)
      }
      checkRefs(p.fonteRefs, label)
    }

    // C2: a document with zero positions — or a partial subset — validates
    // and marks the candidate concluido with real coverage gaps. Every one
    // of the 14 questionnaire themes must appear exactly once; name the
    // missing slugs so an agent (typically one whose response got truncated)
    // can fix its output directly instead of re-deriving what is missing.
    const missingThemes = THEME_SLUGS.filter(slug => !seenThemes.has(slug))
    if (missingThemes.length > 0) {
      errors.push(`posicoes: missing themes ${missingThemes.join(', ')}`)
    }
  }

  // ─── Alerts, including D9 ──────────────────────────────────────────────────
  if (!Array.isArray(doc.alertas)) {
    errors.push('alertas: required array')
  } else {
    for (const [i, a] of doc.alertas.entries()) {
      if (!isObject(a)) { errors.push(`alertas[${i}]: must be an object`); continue }
      const label = `alertas[${i}] (${String(a.titulo)})`

      if (!ALERT_TIPOS.includes(a.tipo as typeof ALERT_TIPOS[number])) errors.push(`${label}.tipo: invalid`)
      if (!SEVERIDADES.includes(a.severidade as typeof SEVERIDADES[number])) errors.push(`${label}.severidade: invalid`)
      if (typeof a.titulo !== 'string' || !a.titulo.trim()) errors.push(`${label}.titulo: required`)
      if (typeof a.descricao !== 'string' || !a.descricao.trim()) errors.push(`${label}.descricao: required`)
      checkIsoDate(a.dataOcorrencia, `${label}.dataOcorrencia`, errors)
      checkNullableString(a.resolucao, `${label}.resolucao`, errors)
      checkIsoDate(a.dataResolucao, `${label}.dataResolucao`, errors)
      if ((a.dataResolucao !== null && a.dataResolucao !== undefined) && !a.resolucao) {
        errors.push(`${label}: dataResolucao present without resolucao — resolucao is required to record a resolution`)
      }

      const resolved = checkRefs(a.fonteRefs, label)

      if (a.tipo === 'polemica' && resolved.length > 0) {
        const layers = resolved.map(r => camadaByRef.get(r))
        const hasPrimary = layers.some(c => c === 1)
        const layerTwoCount = layers.filter(c => c === 2).length
        if (!hasPrimary && layerTwoCount < 2) {
          errors.push(`${label}: D9 requires two independent layer-2 sources or one layer-1 source`)
        }
      }
    }
  }

  return errors
}
