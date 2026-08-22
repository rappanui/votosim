# VotoSim — Candidate Research Runbook

**Context:** This is the operator's step-by-step for running the per-candidate
research pipeline end to end — from picking the next candidate off the queue
to a confirmed write into the database. Read this when you are actually
running the pipeline. Read `docs/candidate-research-procedure.md` instead when
you need the content rules the research agent follows (the five stages, the
source layers, the framing trap, the output contract) — this document assumes
that one and does not repeat it.

All commands below run from `scripts/`.

---

## 1. Pick the next candidate

```
npm run next-candidates -- --limit=10
```

Lists candidacies with outstanding enrichment work, in `v_enrichment_queue`
order (presidents first, then by state, then by tier and viability). A row
marked `NEVER SEEDED` has no `enrichment_ledger` rows at all — run
`npm run bootstrap-ledger` before researching it, or `ingest-research` will
reject the run at the end with "no ledger rows" (see step 4).

Add `--cargo=presidente` (or another office) to filter.

Pick a `tse_sequencial` from the list.

## 2. Build the brief

```
npm run build-brief -- <tse_sequencial>
```

Reads the candidate's official material (government plan PDF, when filed;
declared social accounts; the 14 questionnaire themes with both their
affirmation and their disambiguating context) from Supabase and the TSE data
extracts, and writes:

```
data/briefs/<tse_sequencial>.md
```

This is the entire input the research agent gets. It contains nothing the
agent needs to look up elsewhere and nothing it doesn't need.

## 3. Run the research agent

Dispatch the research agent — following the five stages (E1–E5) in
`docs/candidate-research-procedure.md` — with `data/briefs/<tse_sequencial>.md`
as its input. The agent writes its output document to:

```
data/research/<tse_sequencial>.json
```

The document must match the shape `scripts/lib/research-contract.ts` defines
exactly: all 14 themes, every position and alert sourced, `tseSequencial` set
to the candidate you just built the brief for.

The agent dispatch also returns two numbers you will need in step 4:
- **tokens** — total tokens consumed by the run
- **duration** — wall-clock time in milliseconds

These feed the instrumented pilot's cost-per-candidate measurement. The agent
itself has no way to know either number — only the dispatch layer does — so
they are supplied by the operator, not by the agent's own output.

## 4. Ingest

```
npm run ingest-research -- data/research/<tse_sequencial>.json --confirm --tokens=<N> --duracao-ms=<N>
```

`--tokens` and `--duracao-ms` are the two numbers from step 3. Both are
optional — omit either if the dispatch layer didn't report it — but include
them whenever available; they're the only source of that data for the pilot's
cost measurement, and once omitted they cannot be reconstructed after the
fact.

### The confirmation step

`ingest-research` first validates the document, then resolves
`tseSequencial` against `candidacies` and prints the resolved identity
prominently, before writing anything:

```
================================================================
[ingest-research] RESOLVED CANDIDATE: <nome_urna>
[ingest-research] CARGO: <cargo>   ESTADO: <estado>
[ingest-research] tseSequencial <sequencial> -> candidacy <uuid>
================================================================
```

**Stop and check this line against the dossier you produced before
confirming.** `tseSequencial` is hand-copied by the agent into the JSON; one
transposed digit resolves to a different real politician, and everything
after this point — including a `ficha_suja` alert — gets attributed to
whoever it resolves to. This is the only point a human actually verifies the
match; there is no downstream check.

Run the command **without** `--confirm` first if you want to see this
resolution and the would-write counts (sources / positions / alerts) without
touching the database at all — it prints the same identity banner, then exits
0 having written nothing. Once the printed candidate matches the dossier's
subject, re-run with `--confirm` to actually write.

### If ingestion fails validation

`ingest-research` runs `validateResearch()` before resolving the candidacy or
touching the database. On failure it prints every problem found — not just
the first — and exits non-zero:

```
[ingest-research] N validation error(s) — nothing was written:
  - posicoes: missing themes autonomia_individual, laicidade_valores
  - alertas[0] (T).severidade: invalid
  ...
```

**Nothing was written.** Fix the JSON at `data/research/<tse_sequencial>.json`
— usually by sending the errors back to the research agent so it can correct
its own output — and re-run the same `ingest-research` command. There is no
partial state to clean up: validation happens before any database call.

### If ingestion fails after `--confirm`

A failure after this point (a database error, a crashed process) leaves the
candidacy's `enrichment_ledger` rows at `em_progresso` rather than reverting
to whatever they were before — this is deliberate, so the candidate stays
visible in `v_enrichment_queue` instead of silently dropping out. Re-running
`ingest-research` with the same JSON (once the underlying problem is fixed)
picks it back up; re-running is always safe, since each run replaces the
candidate's own prior research rather than duplicating it.

## 5. Verify

```
npm run next-candidates -- --limit=10
```

The candidate you just ingested should no longer appear (unless a stage was
`nao_aplicavel` and stayed that way, which is correct — see
`docs/sp0-schema-additions.md`).
