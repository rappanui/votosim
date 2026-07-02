import { supabase } from './lib/supabase.js'

const args = process.argv.slice(2)
const estado   = args.find(a => a.startsWith('--estado='))?.split('=')[1]
const cargo    = args.find(a => a.startsWith('--cargo='))?.split('=')[1]
const belowRaw = args.find(a => a.startsWith('--below='))?.split('=')[1]
const MIN_CONFIDENCE = 0.70
const BELOW = belowRaw ? parseInt(belowRaw, 10) : 10

async function main(): Promise<void> {
  const { data: themes, error: themesErr } = await supabase
    .from('themes_catalog')
    .select('id')
  if (themesErr) throw new Error(themesErr.message)
  const totalThemes = themes!.length

  // Include 'BR' so national offices (presidente, senador) appear in state reports
  let query = supabase
    .from('v_candidates_2022')
    .select('politician_id, nome_urna, partido_eleicao, cargo, estado')
    .limit(10000)

  if (estado) {
    query = query.or(`estado.eq.${estado},estado.eq.BR`)
  }
  if (cargo) {
    query = query.eq('cargo', cargo)
  }

  const { data: candidates, error: candErr } = await query
  if (candErr) throw new Error(candErr.message)
  if (!candidates?.length) { console.log('No candidates found.'); return }

  const politicianIds = [...new Set(candidates.map(c => c.politician_id as string))]

  // Batch .in() to avoid 400 on large sets (PostgREST URL length limit)
  const BATCH = 100
  const coverageMap = new Map<string, number>()
  for (let i = 0; i < politicianIds.length; i += BATCH) {
    const batch = politicianIds.slice(i, i + BATCH)
    const { data: positions, error: posErr } = await supabase
      .from('politician_positions')
      .select('politician_id, confianca_ia')
      .in('politician_id', batch)
      .gte('confianca_ia', MIN_CONFIDENCE)
    if (posErr) throw new Error(posErr.message)
    for (const pos of positions ?? []) {
      const pid = pos.politician_id as string
      coverageMap.set(pid, (coverageMap.get(pid) ?? 0) + 1)
    }
  }

  const rows = candidates
    .map(c => ({
      id:      c.politician_id as string,
      nome:    c.nome_urna as string,
      partido: c.partido_eleicao as string,
      cargo:   c.cargo as string,
      estado:  c.estado as string,
      covered: coverageMap.get(c.politician_id as string) ?? 0,
    }))
    .filter(r => r.covered < BELOW)
    .sort((a, b) => a.covered - b.covered)

  const filters = [estado && `estado=${estado}`, cargo && `cargo=${cargo}`].filter(Boolean).join(', ')
  console.log(`\nCandidates with < ${BELOW} themes covered (confianca_ia ≥ ${MIN_CONFIDENCE})${filters ? ' — ' + filters : ''}`)
  console.log(`Found: ${rows.length} of ${candidates.length} candidates\n`)
  console.log('NOME'.padEnd(35) + 'PARTIDO'.padEnd(10) + 'CARGO'.padEnd(24) + 'UF'.padEnd(5) + 'TEMAS')
  console.log('─'.repeat(82))
  for (const r of rows) {
    console.log(
      r.nome.substring(0, 34).padEnd(35) +
      r.partido.padEnd(10) +
      r.cargo.padEnd(24) +
      r.estado.padEnd(5) +
      `${r.covered}/${totalThemes}`
    )
  }
  console.log()
}

main().catch(err => { console.error(err); process.exit(1) })
