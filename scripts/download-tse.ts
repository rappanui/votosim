import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { basename } from 'path'
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

  console.log(`\nUnzip with: unzip -o '${OUT_DIR}/*.zip' -d ${OUT_DIR}/extracted`)
}

main().catch(err => { console.error(err); process.exit(1) })
