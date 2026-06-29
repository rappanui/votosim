import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const mod = require('pdf-parse')
const pdfParse = mod.default ?? mod
const buf = readFileSync('data/propostas_2022/SP/2022SP250001612465.pdf')
try {
  const result = await pdfParse(buf)
  console.log('Pages:', result.numpages)
  console.log('Text length:', result.text?.length)
  console.log('First 300 chars:', result.text?.substring(0, 300))
} catch (e) {
  console.error('Error:', (e as Error).message)
}
