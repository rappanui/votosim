import { extractPdfText } from './lib/pdf.js'
async function main() {
  for (const p of process.argv.slice(2)) {
    try {
      const text = await extractPdfText(p)
      console.log(`=== ${p} ===`)
      console.log(text.slice(0, 3000))
      console.log(`\n[length: ${text.length}]`)
    } catch (e: any) {
      console.error(`=== ${p} — ERRO: ${e.message}`)
    }
  }
}
main()
