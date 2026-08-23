# SP-0 Findings Log

**Context:** Running log of anomalies found while executing the SP-0 pipeline against real 2026 TSE data. Entries are recorded as encountered and deliberately NOT investigated at the time — they are parked here so execution stays on the plan. Review at the end of SP-0 to decide which, if any, block later work.

---

## F1 — Party numbers are recycled by the TSE

**Found:** 2026-08-21, during the presidential census run.
**Status:** Resolved, blocking → fixed.

`parties.numero` carries a UNIQUE constraint, on the assumption that a party number identifies a party permanently. The TSE reassigns the numbers of extinct or merged parties to new ones. Four collisions between the preserved 2022 `parties` rows and the 2026 census:

| Number | 2026 holder | 2022 holder in DB |
|---|---|---|
| 14 | MISSÃO | PTB |
| 20 | PODE | PSC |
| 33 | MOBILIZA | PMN |
| 35 | DEMOCRATA | PMB |

`PODE` is the subtler case: it existed in 2022 as number 19 and moved to 20 in 2026, so even an UPDATE-by-sigla collides with PSC still holding 20.

**Resolution:** delete from `parties` the six parties absent from the 2026 census (PTB, PSC, PMN, PMB, PATRIOTA, PROS) before ingesting. Only PMB carried a curated `espectro`, and its value was `sem_classificacao` — no curated data lost.

---

## F2 — PCdoB appeared absent from 2026 until canonicalisation was applied

**Found:** 2026-08-21, while investigating F1.
**Status:** Not a defect. Confirms an existing fix.

A naive set comparison listed `PCdoB` among parties missing from the 2026 census. It is not missing: the TSE writes `PCDOB` uppercase while the database holds `PCdoB`. The `CANONICAL_PARTY_SPELLING` map added to `normalizeParty` in Task 6 resolves this, and the party keeps number 65 in both.

Worth noting because the same class of error would silently delete a live party if any future cleanup compares raw TSE siglas against database siglas without canonicalising first.

---

## F3 — Government plan missing for one presidential candidate

**Found:** 2026-08-20.
**Status:** Parked. Affects SP-1, not SP-0.

12 of 13 presidential candidates filed a government plan. Pablo Marçal (`SQ_CANDIDATO` 280002553884) has none in `proposta_governo_2026_BR.zip`.

The agent's `documentos_oficiais` stage cannot complete from an official plan for him. It needs either a fallback to other sources (campaign site, published proposals, interviews) or a re-check once TSE publishes one. Decide when SP-1 is designed.

---

## F4 — `motivo_cassacao_2026` is published but empty

**Found:** 2026-08-20.
**Status:** Parked. Affects SP-1.

All 29 files carry a header and zero data rows, consistent with `DS_SITUACAO_CANDIDATURA` being `#NE` on every candidacy — the TSE has judged nothing. The agent's `ficha_limpa` stage cannot rely on this dataset yet and must reach primary judicial sources directly. Re-download as rulings land.

---

## F5 — Candidacy status is uniformly unjudged

**Found:** 2026-08-20.
**Status:** Parked. Operational, not a defect.

Every 2026 candidacy carries `DS_SITUACAO_CANDIDATURA = '#NE'`, so every row ingests as `registrado`. Deferral and disqualification rulings land over the coming weeks and require periodic re-ingestion of `consulta_cand_2026.zip` to refresh status. No scheduled job exists for this yet.

---

## F6 — `_BRASIL.csv` is a national consolidation in every TSE dataset

**Found:** 2026-08-21, twice — first in the census, then in the social accounts.
**Status:** Resolved in both places.

Every TSE bulk dataset ships one CSV per election unit **plus** a `_BRASIL.csv` that is the exact union of the others. Verified by row count in two datasets independently:

| Dataset | `_BRASIL.csv` | Sum of the rest |
|---|---|---|
| `consulta_cand_2026` | 20,674 | 20,674 |
| `rede_social_candidato_2026` | 49,302 | 49,302 |

Any code that iterates every `.csv` in one of these directories reads every record twice. In the census this was caught before it ran. In the brief builder it shipped, and generated briefs listed each declared social account twice.

**The trap is that duplication looks like a data quality problem in the source.** Both times, the first diagnosis was "the TSE ships duplicates". It does not — we read the same rows from two files.

**Rule going forward:** either read only `_BRASIL.csv`, or iterate the per-unit files and skip it. Never both. Where the record's election unit is known (a candidate's `estado`), reading the single matching file is strictly better — it is also ~29x less I/O.

---

## F7 — Multi-part government plans are unhandled

**Found:** 2026-08-21, during the Task 3 review.
**Status:** Parked. No occurrence in current data.

TSE plan filenames carry a part suffix (`_01`, `_02`, …). `findPlanPath` returns the first match only, so a plan split across parts would be read partially, silently. All 12 presidential plans in the current archive use `_01` exclusively, so nothing is affected today.

Check before scaling to the 197 governor plans: if any carry `_02` or higher, the parts must be concatenated in order rather than the first one taken.

---

## F8 — Some government plans extract with character-level word scrambling, not emptiness

**Found:** 2026-08-22, researching Edmilson Costa (PCB, 280002551975).
**Status:** Parked. Worked around per-candidate via external search; not fixed in code.

`extractPdfText`'s emptiness guard (added after the SP-1 review found it silently
resolved `""` for image-only PDFs) catches a blank result, but not a **non-empty,
wrong-order** one. Edmilson Costa's plan extracts as continuous garbled text —
word and even character order scrambled throughout the entire document, e.g.
`"posooscdpieerrodbapldoeepmuablasurdrgeausdemesmaa"` — sampled at five points
across the file, uniformly corrupted, not a partial defect. Lula's and Clariana
Barão's plans extracted cleanly from the same pipeline, so this is specific to
how this PDF encodes its text stream (likely a different generator/layout),
not a systemic pdf2json failure — but nothing currently detects it.

**Consequence:** a naive agent reading this brief would either fabricate
positions from misread fragments, or silently skip real content. Neither is
acceptable per the honesty rules.

**Workaround used:** treated as equivalent to an absent plan for E1 purposes —
stated explicitly in the dossier that the filed plan could not be read, and
used external reporting on the party's platform instead, same posture as
`docs/candidate-research-procedure.md`'s rule for a missing plan.

**Not fixed:** detecting scrambled-but-non-empty extraction (e.g. a dictionary-
word-ratio heuristic on the cleaned text) is a real gap worth closing before
scaling to the 197 governor plans, but is out of scope for the pilot itself.

**Update 2026-08-23:** the same F8-class scrambling appeared in the Podemos
cartilha *Podemos Pensar Diferente* (Fundação Podemos, 2021), read for GERALDO
RUFINO (250002544673). The pilot-level answer was not auto-detection but
**honesty**: the position data was read from preserved vocabulary with moderate
confidence, and that caveat is now a first-class citizen of the schema. `source_tipo`
gained `plataforma_partidaria` and `biografia` (a party platform is not a
`plano_governo`, and neither is a news item), and `alert_type` gained
`ressalva_evidencias` — a transparency flag the agent attaches to the candidate
so the reader sees that positions were inferred from a party platform and/or a
degraded extraction. It auto-publishes (Rule B is extended for it) and renders
with the `amarelo` badge. See docs/sp0-schema-additions.md.

**Update 2026-08-23:** `pdftotext -layout` (Poppler, already installed) reliably
recovers this class of scrambling where `pdf2json` (what `extractPdfText` uses)
does not. Confirmed directly on Douglas Ruas's plan (280002542887... governador
RJ, sequencial 190002542887): `pdftotext -layout` on the same source PDF
extracted cleanly, sentence order intact, while the brief built from
`extractPdfText` was scrambled throughout. Five more RJ governor plans in the
same batch (Cyro Garcia, Juliete, Luan Monteiro, Coronel Busnello, William Siri)
showed the milder block-reordering variant of the same defect — vocabulary
intact, paragraph/line order not — and were still readable by working around
the reordering rather than needing the Poppler fallback. `extractPdfText`
itself was not changed; each research agent read the affected plan by section
headings or, in Douglas Ruas's case, by re-extracting with `pdftotext -layout`
directly, and recorded a `ressalva_evidencias` alert only where the milder
variant left real ambiguity. Swapping `extractPdfText` to try `pdftotext
-layout` before `pdf2json`, or as a fallback when the emptiness/scramble guard
trips, is worth doing before scaling past the RJ pilot — not done here because
it touches the shared extraction path all in-flight candidates depend on.

---

## F9 — A plan filed close to the deadline can be absent from the local TSE export

**Found:** 2026-08-22, researching Pablo Marçal (PRTB, 280002553884).
**Status:** Parked. Worked around via press coverage of the filed plan; not fixed in code.

`build-brief.ts` reported `plan: NONE FILED` for this candidate, sourced from
the locally cached `proposta_governo_2026_BR.zip` snapshot. Press coverage
(SBT News, dated 2026-08-18, independently fetched and read in full) reports
Marçal protocolled a 28-page, seven-"missões" government plan with the TSE on
2026-08-18 — after whatever date the local zip snapshot was pulled. So "NONE
FILED" in the brief means "none in this snapshot," not "candidate genuinely
filed nothing," and the two are not distinguishable from the brief alone.

**Consequence:** for a candidate who filed late, an agent trusting the brief's
"NONE FILED" at face value understates the evidence available and may skip a
real, citable plano_governo source in favor of weaker general press coverage.

**Workaround used:** treated the plan as absent for this candidate's E1, per
the standing rule for missing plans, and built positions from separately
verified press coverage of the actual 2026 filing instead (with source
office/date checked candidate-by-candidate, since this same search surfaced
proposals from Marçal's 2018, 2022, and 2024 campaigns mislabeled as 2026 by
at least one AI-summarized search result — caught only by fetching the
underlying article directly).

**Not fixed:** re-pulling `proposta_governo_2026_BR.zip` on a cadence that
tracks the TSE's own filing deadline (or re-checking per-candidate before
concluding "no plan") is worth doing before scaling past the presidential
pilot, but is out of scope here.

---

## F10 — `findPlanPath` only read the first file of a multi-part plan

**Found:** 2026-08-22, researching Vivian Mendes (UP, governador/SP, 250002544912).
**Status:** Fixed — `findPlanPath` (build-brief.ts) now reads every part.

The TSE splits a government plan across multiple files when it's large enough
(`{year}{UF}{SQ_CANDIDATO}_{NN}.pdf`, `_01`, `_02`, `_03`...). `findPlanPath`
used `Array.find()` against a pattern that matched any part number, so it
always returned the first regex match in directory order — for this
candidate, `_01.pdf` (2.0 MB) while silently ignoring `_02.pdf` (305 KB) and
`_03.pdf` (2.0 MB), i.e. roughly two-thirds of the actual filed document.

**Consequence:** every candidate whose plan was split across multiple parts
(not just this one — any large plan the TSE splits) had a brief built from a
fraction of what they actually filed, with no signal that anything was
missing — the brief looked complete because a plan was found.

**Fixed:** added `findPlanPaths` (plural), which matches and returns every
part sorted by part number; `findPlanPath` is now a thin wrapper returning
the first for callers that only need one. `build-brief.ts`'s `main()` now
extracts text from every part and joins them, and the console log prints
every matched path instead of one. Covered by the existing
`build-brief.test.ts` suite (all 12 tests still pass) — no new test was
added for the multi-part join specifically, since the fix is a small,
directly-inspectable change and the existing single-part tests already
pin `findPlanPath`'s backward-compatible behavior.

**Scope note:** candidates already ingested earlier in this pilot were
single-part plans (verified: none of their `findPlanPath` resolutions hit a
`_02` or higher) — this bug did not silently corrupt already-published
research. Re-verify this assumption before trusting it for the governor
pilot at large, rather than re-deriving it from memory later.

---

## F11 — The documented `unzip` command puts TSE data where nothing reads it

**Found:** 2026-08-22, preparing the collaboration package for legislative offices.
**Status:** Fixed — `download-tse.ts` now prints the correct commands; README corrected.

Both `download-tse.ts`'s closing hint and the handoff README instructed:

```
unzip -o 'data/tse-2026/*.zip' -d data/tse-2026/extracted
```

That is wrong for **both** archive shapes the TSE publishes:

| Archive | Contains | Lands at | `build-brief.ts` reads |
|---|---|---|---|
| `proposta_governo_2026_{UF}.zip` | `{UF}/*.pdf` | `extracted/{UF}/` | `extracted/planos/{UF}/` |
| `rede_social_candidato_2026.zip` | flat `*.csv` | `extracted/*.csv` | `extracted/rede_social_candidato_2026/` |

**Consequence — and this is the dangerous part — both failures are silent.**
With plans in the wrong folder, `build-brief` reports `NONE FILED` for every
single candidate and renders the "this candidate filed no government plan"
paragraph, which reads as a fact about the candidate rather than a
misconfiguration. An agent following the honesty rules correctly would then
write "não protocolou plano de governo" into a real voter-facing dossier for
someone who did file one. With the social CSVs in the wrong folder,
`loadSocialAccounts` returns `[]` and the brief says "none declared to the
TSE" — same class of false statement.

I hit this myself extracting the SP archive and fixed it by hand at the time
without realising the documented command was the source, which is exactly how
a silent-failure bug survives: the person who trips over it patches the
symptom locally and the instruction stays broken for everyone else.

**Fixed:** `download-tse.ts` now prints two distinct commands (plans into
`extracted/planos`, each national dataset into its own named folder) plus an
explicit line naming the two directories `build-brief.ts` actually reads, so
the operator can verify rather than assume. The handoff README carries the
same corrected commands and a verification step.

**Also fixed (same session):** `build-brief.ts` now distinguishes the four
causes of "no plan found" instead of collapsing them into `NONE FILED`, via a
pure `diagnosePlanAvailability()`:

| Diagnosis | When | Behaviour |
|---|---|---|
| `found` | a plan (or every part) located | proceeds |
| `not_expected` | office is senador/deputado_* | proceeds — the TSE requires no plan |
| `genuinely_absent` | executive, this UF's plans on disk, none for this candidate | proceeds (the F9 case) |
| `uf_not_downloaded` | executive, plans exist but none for this UF | **aborts, exit 1** |
| `misconfigured` | executive, `PLANS_DIR` empty or missing | **aborts, exit 1** |

The two abort paths print the exact command to fix it, and the misconfigured
path probes for the F11 signature specifically — if plans are sitting at
`extracted/{UF}/`, it says so and prints the `mv`. Aborting rather than warning
is deliberate: a warning scrolls past, and the cost of missing it is a false
statement about a real candidate in a voter-facing dossier.

`not_expected` is evaluated *before* the misconfiguration branches, so a senate
or deputy brief never aborts merely because no executive plans were downloaded —
verified against a real senator (ANDRÉ DO PRADO, exit 0) and by simulating F11
against a real governor (exit 1, correct `mv` emitted). Covered by 7 new tests
in `build-brief.test.ts`; suite is 224/224.

`FILES_GOVERNMENT_PLAN` moved to an export in `lib/ledger.ts` so the ledger's
`nao_aplicavel` rule and the brief's `not_expected` rule cannot drift apart.

---

## F12 — TSE's web/CDN domains are Akamai-blocked from this environment, but the DivulgaCandContas REST API is not

**Found:** 2026-08-23, during the RJ governor batch (all nine agents).
**Status:** Not a defect in the pipeline. Environment constraint, worked around per-agent.

`cdn.tse.jus.br` and `divulgacandcontas.tse.jus.br`'s SPA both return HTTP 403
to every `curl` and `WebFetch` call from this environment (Akamai bot
protection) — no research agent in the batch could open a government-plan URL
directly, or browse a candidate's DivulgaCandContas page as a human would.
Every agent instead cited the ZIP archive URL (`proposta_governo_2026_{UF}.zip`)
as the `plano_governo` source, since that is the actual file `build-brief`
read — this is now the convention across every research JSON produced so far,
governor and presidential alike.

**The REST API is a different story.** The Garotinho and Eduardo Paes agents
both needed to establish, for real, whether an executive candidate had filed a
plan at all (the F9 question) rather than relying on the local ZIP snapshot's
possibly-stale absence. Both queried
`divulgacandcontas.tse.jus.br/divulga/rest/...` directly and got a real JSON
response — Garotinho's record listed three judicial-certificate files and no
`codTipo 5` (proposta de governo), while a control check against other
candidates in the same race confirmed the API does surface `codTipo 5` when a
plan exists. So the API endpoint itself is reachable; only the browser-facing
SPA and the CDN static-file host are blocked.

**Consequence:** an agent that only tries the SPA or the CDN and gives up
after a 403 will treat "I could not check" as equivalent to "no plan was
filed" — the two are not the same, and F9 exists precisely because a real
absence and a snapshot gap are easy to conflate. The REST API is the way to
tell them apart when the local ZIP is inconclusive.

**Not fixed:** nothing to fix in code — this is a network property of the
environment, not a pipeline bug. Worth carrying forward as an instruction to
future research agents: don't stop at a CDN/SPA 403 when the question is
"did this candidate file a plan" — the REST API is the way to actually answer
it.

---

## F13 — A UF's `proposta_governo` archive can hold plans for candidates other than the office being researched

**Found:** 2026-08-23, verifying André Marinho's (governador, RJ) missing
plan before treating "NONE FILED" as fact.

**Status:** Not a defect. Confirms `build-brief`'s existing per-candidate
`SQ_CANDIDATO` matching already handles this correctly; recorded because a
human skimming the extracted folder would draw the wrong conclusion.

`proposta_governo_2026_RJ.zip` extracts to nine PDF files, but RJ has nine
*governor* candidates and, separately, a tenth file's worth of unrelated
content: one of the nine files on disk (`2026RJ190002543534_01.pdf`) belongs
to SILVIA QUEZADO, a **state-deputy** candidate, not to any of the nine
governor candidates. `proposta_governo` is filed per-candidacy for whichever
offices require it in that UF, not scoped to a single office — a state
deputy plan and a governor plan land in the same archive if both were filed
in the same state and election.

**Consequence:** counting files in the extracted folder against a list of
governor candidates will not reconcile 1:1, and picking "the leftover file"
to fill a gap (e.g. assuming it belongs to whichever governor candidate has
no match) would silently attribute one candidate's platform to a different
person. This was specifically checked and ruled out before concluding that
EDUARDO PAES and GAROTINHO had genuinely filed no plan — see F9 and F12.

**Not fixed — nothing to fix:** `build-brief.ts` already matches by
`SQ_CANDIDATO` embedded in the filename via `findPlanPaths`, not by counting
or by folder position, so this never produced a wrong match in the pipeline
itself. The risk is purely at the human/operator level when eyeballing
`ls extracted/planos/{UF}/` and assuming file count == candidate count.
