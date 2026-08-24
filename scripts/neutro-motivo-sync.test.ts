// scripts/neutro-motivo-sync.test.ts
//
// `lib/neutro-motivo.ts` is legitimately duplicated: the root keeps its own
// copy, and `modules/ingest-candidates/src/lib/neutro-motivo.ts` keeps a
// second one so the module stays self-contained inside the exported ZIP
// (an external developer running the package has no access to `scripts/`).
// That duplication is only safe as long as both copies stay in sync — a
// silent fork here is exactly the class of bug this test exists to catch
// (see docs/superpowers/plans/2026-08-24-modularizar-ingestao-de-candidatos.md).
//
// The two files intentionally differ on line 1 (a self-referential path
// comment: `// scripts/lib/neutro-motivo.ts` vs `// src/lib/neutro-motivo.ts`)
// — that's cosmetic, not drift. Everything else must be byte-identical.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT_PATH = join(import.meta.dirname, 'lib', 'neutro-motivo.ts')
const MODULE_PATH = join(
  import.meta.dirname,
  '..',
  'modules',
  'ingest-candidates',
  'src',
  'lib',
  'neutro-motivo.ts',
)

function bodyWithoutHeaderComment(path: string): string {
  const lines = readFileSync(path, 'utf8').split('\n')
  return lines.slice(1).join('\n')
}

test('lib/neutro-motivo.ts stays in sync with the module copy', () => {
  const rootBody = bodyWithoutHeaderComment(ROOT_PATH)
  const moduleBody = bodyWithoutHeaderComment(MODULE_PATH)

  assert.equal(
    rootBody,
    moduleBody,
    `scripts/lib/neutro-motivo.ts and modules/ingest-candidates/src/lib/neutro-motivo.ts have diverged.\n\n` +
      `Both copies exist because modules/ingest-candidates/ has to work standalone inside its exported ZIP, ` +
      `with no access to the root repository — so it carries its own copy of this pure ~100-line function ` +
      `instead of importing across the module boundary.\n\n` +
      `Fix: whichever copy you just changed, copy the same change to the other one ` +
      `(the first line of each file is allowed to differ — it's a self-referential path comment).`,
  )
})
