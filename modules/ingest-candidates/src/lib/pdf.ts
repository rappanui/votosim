import PDFParser from 'pdf2json'
import { accessSync, constants } from 'fs'

/**
 * pdf2json's raw text output carries page-break markers and erratic whitespace.
 * Both are noise for an LLM reading the document.
 */
export function cleanPdfText(raw: string): string {
  return raw
    .replace(/-{5,}Page \(\d+\) Break-{5,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extracts text from a PDF. Rejects rather than resolving empty, so a scanned
 * or corrupt document surfaces as a failure instead of a silently blank plan.
 *
 * Embedded JPEGs emit "Unable to decode image" warnings on stderr; they are
 * harmless and do not affect text extraction.
 */
export function extractPdfText(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      accessSync(path, constants.R_OK)
    } catch (err) {
      reject(err)
      return
    }

    // The `1` enables raw text accumulation, which getRawTextContent reads.
    const parser = new (PDFParser as unknown as new (ctx: null, mode: number) => {
      on(event: string, cb: (arg: { parserError?: unknown }) => void): void
      getRawTextContent(): string
      loadPDF(p: string): void
    })(null, 1)

    parser.on('pdfParser_dataError', err => {
      reject(new Error(`Failed to parse ${path}: ${String(err.parserError ?? err)}`))
    })

    parser.on('pdfParser_dataReady', () => {
      const text = cleanPdfText(parser.getRawTextContent())
      if (text.length === 0) {
        reject(new Error(`PDF yielded no extractable text: ${path}. Likely cause: document is scanned or image-only.`))
      } else {
        resolve(text)
      }
    })

    parser.loadPDF(path)
  })
}
