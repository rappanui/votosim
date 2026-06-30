# VotoSim — Data Ingestion Pipeline

**Context:** Overview of how the Supabase database is populated with candidates, positions, and alerts. Read before running scripts or planning new data sources. For hands-on commands, see `docs/11_pipeline_scripts.md`. For AI extraction details, see `docs/12_ai_extraction.md`. For deputies/senators strategy, see `docs/13_legislative_votes.md`.

---

## Architecture

```
TSE CSV (consulta_cand)      → ingest-tse.ts         → politicians + candidacies + parties
TSE ZIP (proposta_governo)   → extract-positions.ts   → politician_positions (governors/president)
Câmara API (nominal votes)   → ingest-camara-votes.ts → politician_positions (federal deputies) [planned]
Senado API (nominal votes)   → ingest-senado-votes.ts → politician_positions (senators) [planned]
TSE PDF (party programs)     → ingest-party-programs.ts → politician_positions (proxy) [planned]
TSE CSV (motivo_cassacao)    → ingest-alerts.ts       → politician_alerts
```

All scripts are idempotent (upsert) — safe to re-run without duplicating data.

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

> DivulgaCandContas REST API (`divulgacandcontas.tse.jus.br`) was evaluated and abandoned: it returns 404 for 2022 data. The TSE CDN ZIPs approach is more reliable.

### Criminal Records (TSE CSV)

```
https://cdn.tse.jus.br/estatistica/sead/odsele/motivo_cassacao/motivo_cassacao_{year}.zip
```

Contains candidates with electoral disqualifications. Has `SQ_CANDIDATO` but no CPF — the script builds a `SQ → cpf_hash` map from the candidates CSV at runtime.

> Available only after TSE rulings (typically August–September of election year). Use 2022 file for development.

### Legislative Votes (planned for MVP)

See `docs/13_legislative_votes.md` for the Câmara and Senado API strategy.

---

## Running the Pipeline

See `docs/11_pipeline_scripts.md` for exact commands, flags, and download URLs.

**Execution order:**
1. `ingest-tse` — must run first (creates `politicians` records needed by all other scripts)
2. `extract-positions` — depends on politicians in DB + PDF ZIPs downloaded locally
3. `ingest-alerts` — depends on politicians in DB + `motivo_cassacao` CSV downloaded

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

## 2022 Seed Status (as of 2026-06-29)

| Step | Status | Notes |
|------|--------|-------|
| `ingest-tse` national | ✅ Complete | 28,486 inserted; ~836 skipped (WSL2 connection timeouts) |
| `ingest-tse --estado=SP` | ✅ Complete | 3,622 SP candidates fully re-ingested |
| `extract-positions --estado=SP` | ✅ Complete | 13/15 PDFs processed; 1 unreadable (scanned image), 1 error recovered |
| `extract-positions --estado=BR` | ✅ Complete | 12/13 presidential PDFs processed; 1 unreadable (scanned image) |
| `ingest-alerts` | ✅ Complete | 1,012 alerts from `motivo_cassacao_2022` |
| Other states (governors) | 🔜 Pending | Requires downloading individual state ZIPs |
| Deputies/senators | 🔜 Planned | See `docs/13_legislative_votes.md` |
