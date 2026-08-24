import { readFileSync } from 'fs'
import { validateResearch } from './lib/research-contract.js'
function main() {
  const doc = JSON.parse(readFileSync('data/research/250002544673.json', 'utf-8'))
  const errors = validateResearch(doc)
  if (errors.length === 0) console.log('VALID: research doc passes validateResearch()')
  else { console.log('ERRORS:'); for (const e of errors) console.log(' -', e) }
}
main()
