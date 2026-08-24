import { extractPdfText } from './lib/pdf.js'
import { writeFileSync } from 'fs'
async function main() {
  const bio = await extractPdfText('/home/rappa/.claude/projects/-home-rappa-workspaces-rappaTECH-votosim/79efa7b7-1a7d-4751-8a61-4d854ae133e9/tool-results/webfetch-1787503839844-t9nkv6.pdf')
  const cart = await extractPdfText('/home/rappa/.claude/projects/-home-rappa-workspaces-rappaTECH-votosim/79efa7b7-1a7d-4751-8a61-4d854ae133e9/tool-results/webfetch-1787503841151-47kwqf.pdf')
  writeFileSync('data/tmp-bio-rufino.txt', bio, 'utf-8')
  writeFileSync('data/tmp-cartilha-pode.txt', cart, 'utf-8')
  console.log('bio chars:', bio.length)
  console.log('cartilha chars:', cart.length)
}
main().catch((e: Error) => { console.error(e.message); process.exit(1) })
