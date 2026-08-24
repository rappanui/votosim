# VotoSim — Data Ingestion Pipeline

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-08-20
> **Motivo:** Já se autodeclarava superado desde 2026-08-20 pela virada de estratégia (IA na ingestão). Ainda assim cita `extract-positions.ts`, `enrich-positions-groq.ts` e `ingest-party-programs.ts`, todos apagados na Fase A, e Groq/Gemini como provedores.
> **Substituído por:** `docs/referencia/pipeline-de-pesquisa.md`


> **Superseded for 2026 (2026-08-20).** The tiered pipeline below describes the
> 2022 approach. The current design moves AI cost to ingestion and loads 2026 data
> deliberately — see `docs/superpowers/specs/2026-08-20-candidate-data-pipeline-design.md`.
> For TSE sources and their traps, read `docs/tse-2026-data-sources.md`, which
> corrects several statements in this file. This document remains accurate as the
> record of the 2022 seed.

**Context:** Overview of how the Supabase database is populated with candidates, positions, and alerts. Read before running scripts or planning new data sources. For hands-on commands, see `docs/legado/11_pipeline_scripts.md`. For AI extraction details, see `docs/12_ai_extraction.md`. For deputies/senators strategy, see `docs/legado/13_legislative_votes.md`.

---

## Architecture

```
TSE CSV (consulta_cand)      → ingest-tse.ts             → politicians + candidacies + parties
TSE ZIP (proposta_governo)   → extract-positions.ts       → politician_positions [DEPRECATED — see note]
Câmara API (nominal votes)   → ingest-camara-votes.ts    → politician_positions (federal deputies)
Senado API (nominal votes)   → ingest-senado-votes.ts    → politician_positions (senators)
TSE PDF (party programs)     → ingest-party-programs.ts  → party_positions + politician_positions (proxy)
text/PDF (per candidate)     → enrich-positions-groq.ts  → politician_positions (executives + gaps)
TSE CSV (motivo_cassacao)    → ingest-alerts.ts           → politician_alerts
coverage report              → check-coverage.ts          → stdout (audit tool, no DB writes)
```

All scripts are idempotent (upsert) — safe to re-run without duplicating data.

> **`extract-positions.ts` is deprecated for position enrichment.** The TSE government plan PDFs are propaganda documents: they produce `posicao: "favoravel"` on every theme for every candidate, covering only 5–8 of 14 themes. This makes the match algorithm meaningless. Use the tiered pipeline described in `docs/candidate-enrichment-strategy.md` instead. The script remains in the codebase for reference but should not be used to populate `politician_positions` for candidates that matter.

---

## Data Sources

### Candidates (TSE CSV)

```
https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{year}.zip
```

National CSV with all registered candidates. One row per candidacy. Contains: name, CPF, party, office, state, ballot number. Encoding: ISO-8859-1. Delimiter: `;`.

CPF is stored as SHA-256 hash (`cpf_hash`) — raw CPF is never written to any table.

### Government Plans (TSE CDN ZIPs)

```
https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_{year}_{UF}.zip
```

One ZIP per state, containing PDF files. Filename pattern: `{year}{UF}{SQ_CANDIDATO}.pdf`. Only GOVERNADOR and PRESIDENTE candidates submit these. Extracted using `pdf2json` (not `pdf-parse` v2, which is ESM-incompatible).

> DivulgaCandContas REST API (`divulgacandcontas.tse.jus.br`) was evaluated and abandoned: it returns 404 for 2022 data. **Re-checked 2026-08-20: the API is dead outright, not just for closed elections** — every v1 endpoint 404s or 400s for 2026 as well. The canonical index is now the TSE CKAN portal (`dadosabertos.tse.jus.br`). See `docs/tse-2026-data-sources.md`.

### Criminal Records (TSE CSV)

```
https://cdn.tse.jus.br/estatistica/sead/odsele/motivo_cassacao/motivo_cassacao_{year}.zip
```

Contains candidates with electoral disqualifications. Has `SQ_CANDIDATO` but no CPF — the script builds a `SQ → cpf_hash` map from the candidates CSV at runtime.

> ~~Available only after TSE rulings (typically August–September of election year).~~ **Corrected 2026-08-20:** `motivo_cassacao_2026.zip` is already published and listed in the TSE CKAN package.

### Legislative Votes (planned for MVP)

See `docs/legado/13_legislative_votes.md` for the Câmara and Senado API strategy.

---

## Running the Pipeline

See `docs/legado/11_pipeline_scripts.md` for exact commands, flags, and download URLs.

**Execution order:**
1. `ingest-tse` — must run first (creates `politicians` records needed by all other scripts)
2. `ingest-camara-votes -- data/camara_2022` — deputados federais (Tier 1)
3. `ingest-senado-votes` — senadores via API (Tier 1)
4. `ingest-party-programs -- data/party-programs` — proxy positions for non-mandataries (Tier 2)
5. `enrich-positions-groq -- --politician-id=UUID --input=file.txt` — executives + gap fill (Tier 3)
6. `check-coverage -- --estado=SP` — verify coverage before releasing to production
7. `ingest-alerts` — criminal records (can run at any time after step 1)

> `extract-positions` (TSE ZIPs) is deprecated. Do not run it for new candidates.

---

## Key Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| CPF storage | SHA-256 hash | LGPD compliance — PII never stored |
| AI provider (scripts) | Groq / Llama 3.3 70B | Gemini REST free tier is 0 RPD; Groq free tier is 14,400 RPD |
| AI provider (Edge Function) | Gemini 2.0 Flash | Deno-compatible via fetch; fast for session-time use |
| PDF parsing | `pdf2json` | `pdf-parse` v2 has no default export in ESM context |
| PDF source | TSE CDN ZIPs | DivulgaCand API returns 404 for 2022; ZIPs are more reliable |
| Criminal records | `motivo_cassacao` CSV | Correct TSE dataset for disqualifications (not `certidao_quitacao`) |

---

## Database Schema (key tables)

**`politician_positions`** — one row per politician × theme:

| Column | Type | Notes |
|--------|------|-------|
| `politician_id` | UUID FK | |
| `theme_id` | UUID FK | References `themes_catalog.id` — never a raw slug |
| `posicao` | enum | `favoravel \| contrario \| neutro \| variavel` |
| `intensidade` | SMALLINT 1–5 | 1=mentioned once, 5=signature issue |
| `fontes` | JSONB | `[{tipo, descricao, url, data, confiabilidade}]` |
| `gerado_por_ia` | BOOLEAN | `true` for Groq/Gemini extractions |
| `validado` | BOOLEAN | Auto-`true` when `confianca_ia >= 0.85` |
| `confianca_ia` | NUMERIC(3,2) | 0.0–1.0 |

Unique constraint: `(politician_id, theme_id)`.

**`politician_alerts`** — `ficha_suja` records from TSE:

| Column | Notes |
|--------|-------|
| `tipo` | `'ficha_suja'` for TSE cassations |
| `severidade` | `'critica'` |
| `gerado_por_ia` | `false` (TSE is official source, not AI) |
| `validado` | `true` (auto-validated for official TSE data) |

---

## Election Year Switching

The Edge Function reads `ELECTION_YEAR` from Supabase secrets to select the correct view:
- `2022` → queries `v_candidates_2022`
- `2026` → queries `v_candidates_2026`

When 2026 data is released:
1. Run `ingest-tse` with 2026 CSV (`ELECTION_YEAR = 2026` in the script constant)
2. Run `extract-positions` for 2026 state ZIPs
3. Change Edge Function secret `ELECTION_YEAR` to `2026`
4. 2022 rows remain as historical data — no cleanup needed

---

## 2022 Seed Status (as of 2026-07-01)

| Step | Status | Notes |
|------|--------|-------|
| `ingest-tse` national | ✅ Complete | 28,486 inserted; ~836 skipped (WSL2 connection timeouts) |
| `ingest-tse --estado=SP` | ✅ Complete | 3,622 SP candidates fully re-ingested |
| `ingest-camara-votes` | ✅ Complete | 3,733 positions for 521 deputies (360 vote sessions mapped) |
| `ingest-senado-votes` | ✅ Complete | 402 positions for 39 senators (42 not matched by name) |
| `ingest-party-programs` | ✅ Complete | 10/28 PDFs produced positions (18 were statute docs); 151,476 proxy rows |
| `enrich-positions-groq` (SP pilot) | ✅ Complete | 13/13 presidentes 14/14; 3/3 main SP governors 13-14/14 |
| `ingest-alerts` | ✅ Complete | 1,012 alerts from `motivo_cassacao_2022` |
| `extract-positions` (TSE ZIPs) | ⚠️ Deprecated | Old data still in DB; will be overwritten by Tier 3 enrichment |
| Other states (governors) | 🔜 Pending | Requires Tier 3 enrichment per governor |
| SP minor governors (7) | 🟡 Partial | 4–11/14; candidates < 5% votes — acceptable for MVP |
