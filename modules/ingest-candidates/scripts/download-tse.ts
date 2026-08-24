import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { basename } from 'path'
import 'dotenv/config'
import { planArchiveUrl, bulkArchiveUrl, type BulkDataset } from './lib/gov-plans.js'

const OUT_DIR = 'data/tse-2026'

const ALL_BULK: BulkDataset[] = ['coligacao', 'bens', 'redes_sociais', 'cassacao', 'complementar']

/** Downloads one archive, skipping if already on disk. GET only — the CDN 403s on HEAD. */
async function download(url: string, label: string): Promise<void> {
  const dest = `${OUT_DIR}/${basename(url)}`

  if (existsSync(dest)) {
    console.log(`[skip] ${label} — already downloaded`)
    return
  }

  console.log(`[get ] ${url}`)
  const res = await fetch(url)

  if (!res.ok) {
    console.error(`[fail] ${label} — HTTP ${res.status}. The archive may not be published yet.`)
    return
  }

  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log(`[ok  ] ${dest}`)
}

/** Entry point. Usage: npm run download-tse -- --uf=BR [--uf=SP ...] [--bulk] */
async function main(): Promise<void> {
  const electionYear = Number(process.env.ELECTION_YEAR)
  if (!electionYear) throw new Error('Missing ELECTION_YEAR in scripts/.env')

  const args = process.argv.slice(2)
  const ufs = args.filter(a => a.startsWith('--uf=')).map(a => a.split('=')[1].toUpperCase())
  const wantBulk = args.includes('--bulk')

  if (ufs.length === 0 && !wantBulk) {
    console.error('Usage: npm run download-tse -- --uf=BR [--uf=SP ...] [--bulk]')
    console.error('  --uf=XX   government plan archive for that UF (BR = presidential)')
    console.error('  --bulk    national datasets: coalitions, assets, social accounts, disqualifications, complementary')
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })

  for (const uf of ufs) {
    await download(planArchiveUrl(electionYear, uf), `plano ${uf}`)
  }

  if (wantBulk) {
    for (const dataset of ALL_BULK) {
      await download(bulkArchiveUrl(dataset, electionYear), dataset)
    }
  }

  // The two archive shapes need two different destinations, and getting this
  // wrong fails silently: build-brief reports "NONE FILED" for every candidate
  // and loads zero social accounts, with nothing indicating the data is simply
  // in the wrong folder. See docs/referencia/achados-sp0.md F11.
  console.log('\nUnzip with:')
  console.log(`  # plans — the archive already contains a {UF}/ folder, so extract INTO planos/`)
  console.log(`  unzip -o '${OUT_DIR}/proposta_governo_*.zip' -d ${OUT_DIR}/extracted/planos`)
  console.log(`  # national datasets — each into its own folder named after the archive`)
  console.log(`  for z in ${OUT_DIR}/rede_social_candidato_*.zip ${OUT_DIR}/consulta_coligacao_*.zip ${OUT_DIR}/motivo_cassacao_*.zip; do`)
  console.log(`    [ -e "$z" ] && unzip -o "$z" -d "${OUT_DIR}/extracted/$(basename "$z" .zip)"`)
  console.log('  done')
  console.log(`\nbuild-brief.ts reads ${OUT_DIR}/extracted/planos/{UF}/ and`)
  console.log(`${OUT_DIR}/extracted/rede_social_candidato_${electionYear}/ — verify those exist before researching.`)
}

main().catch(err => { console.error(err); process.exit(1) })
