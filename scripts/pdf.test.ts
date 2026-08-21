import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanPdfText, extractPdfText } from './lib/pdf.ts'

test('cleanPdfText: strips pdf2json page break markers', () => {
  const raw = 'PROGRAMA----------------Page (1) Break----------------DE GOVERNO'
  assert.equal(cleanPdfText(raw), 'PROGRAMA DE GOVERNO')
})

test('cleanPdfText: collapses runs of whitespace into single spaces', () => {
  assert.equal(cleanPdfText('a\n\n\tb   c'), 'a b c')
})

test('cleanPdfText: trims leading and trailing whitespace', () => {
  assert.equal(cleanPdfText('  texto  '), 'texto')
})

test('cleanPdfText: returns empty string for whitespace-only input', () => {
  assert.equal(cleanPdfText('   \n\t  '), '')
})

test('extractPdfText: reads a real government plan as text', async () => {
  // Lula's 2026 plan. Measured at 166,345 characters after cleaning.
  const path = 'data/tse-2026/extracted/planos/BR/2026BR280002542548_01.pdf'
  const text = await extractPdfText(path)
  assert.ok(text.length > 100_000, `expected a large document, got ${text.length} chars`)
  assert.match(text, /PROGRAMA DE GOVERNO/i)
})

test('extractPdfText: rejects a missing file rather than returning empty', async () => {
  await assert.rejects(() => extractPdfText('data/tse-2026/does-not-exist.pdf'))
})
