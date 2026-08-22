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
