import { extractPdfText } from './lib/pdf.js'
async function main() {
  const text = await extractPdfText(process.argv[2])
  console.log(text)
}
main().catch((e: any) => { console.error(e.message); process.exit(1) })
