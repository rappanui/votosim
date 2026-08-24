# VotoSim — Pipeline Scripts Reference

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-30
> **Motivo:** Guia de uso de `extract-positions.ts` e `ingest-party-programs.ts`, apagados na Fase A: o primeiro nunca escreveu `source_ids` no banco, e o segundo tinha como alvo `party_positions`, que tem 0 linhas.
> **Substituído por:** `docs/referencia/pipeline-de-pesquisa.md`


**Context:** Practical guide for the three Node.js scripts in `scripts/` that populate the Supabase database. Read before running or modifying pipeline scripts. For AI extraction details, see `docs/12_ai_extraction.md`. For deputies/senators strategy, see `docs/legado/13_legislative_votes.md`.

---

## Environment Setup

```bash
# scripts/.env  (never commit — listed in scripts/.gitignore)
SUPABASE_URL=https://xxxx.supabase.co
SERVICE_ROLE_KEY=eyJ...          # Supabase Dashboard → Settings → API → service_role
GROQ_API_KEY=gsk_xxxxxxxxxxxx    # console.groq.com → API Keys (free, no credit card)
```

> `GEMINI_API_KEY` is only used by the Supabase Edge Function — not needed in `scripts/.env`.

```bash
cd scripts && npm install
```

---

## `ingest-tse` — Candidates + Parties

Parses TSE's national candidate CSV into `politicians`, `candidacies`, and `parties`.

```bash
npm run ingest-tse -- <path-to-csv> [--estado=SP]
```

**Download data:**
```bash
# 2022 seed
curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip" \
  -o data/consulta_cand_2022_BRASIL.zip && unzip -p data/consulta_cand_2022_BRASIL.zip > data/consulta_cand_2022_BRASIL.csv
```

**Key behaviors:**
- Encoding: `latin1` / delimiter: `;`
- Skips offices outside scope (keeps: presidente, governador, senador, deputado_federal, deputado_estadual, deputado_distrital)
- Stores CPF as SHA-256 hash (`cpf_hash`) — raw CPF never written to DB
- Upserts: `parties` on `sigla`, `politicians` on `cpf_hash`, `candidacies` on `(politician_id, ano_eleicao, turno, cargo, estado)`
- Logs failures without crashing — skips candidate on error and continues
- `ELECTION_YEAR` constant inside the file controls `ano_eleicao` written (default: 2022)

**Expected output:**
```
[ingest-tse] Parsed 29270 rows from CSV (filtering: SP)
[ingest-tse] Done. Inserted/updated: 3622, skipped: 25700
```

---

## `extract-positions` — AI Position Extraction

Downloads government plan PDFs from TSE CDN ZIPs, extracts text via `pdf2json`, and calls Groq (Llama 3.3 70B) to classify positions into the 14 political themes.

```bash
npm run extract-positions -- <propostas-dir> <consulta_cand.csv> [--estado=SP]
```

**Download data (one ZIP per state):**
```bash
curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2022_SP.zip" \
  -o data/proposta_governo_2022_SP.zip
unzip data/proposta_governo_2022_SP.zip -d data/propostas_2022/SP/
```

**What it does:**
1. Loads `themes_catalog` from DB → `slug → UUID` map
2. Builds `SQ_CANDIDATO → cpf_hash` from candidates CSV
3. For each PDF in `<propostas-dir>/<UF>/`:
   - Extracts `SQ_CANDIDATO` from filename (`{ano}{UF}{SQ}.pdf` pattern)
   - Finds politician in DB by `cpf_hash`
   - Skips if politician already has positions (idempotent)
   - Parses PDF text with `pdf2json`
   - Calls Groq with first 8,000 chars of extracted text
   - Saves positions to `politician_positions` using `theme_id` UUID

**DB columns written:** `politician_id`, `theme_id`, `posicao`, `intensidade`, `fontes` (JSONB), `gerado_por_ia: true`, `validado`, `confianca_ia`

**Coverage:** Only GOVERNADOR and PRESIDENTE candidates submit PDFs to TSE. For deputies and senators, see `docs/17_legislative_ingestion_scripts.md`.

---

## `ingest-party-programs` — Party Program Positions

Reads party program PDFs from `scripts/data/party-programs/`, extracts political positions via Groq, and writes to both `party_positions` (party-level match) and `politician_positions` (proxy for members without data).

```bash
npm run ingest-party-programs
# Optional: specify a custom PDF directory
npm run ingest-party-programs -- data/party-programs
```

**PDF naming:** each file must be `{SIGLA}.pdf` (e.g., `PT.pdf`, `PL.pdf`). The sigla is extracted from the filename and used as the DB key.

**Prerequisites:**
1. Apply `docs/migracoes/10_party_positions.sql` in Supabase SQL Editor (create `party_positions` table)
2. `GROQ_API_KEY` in `scripts/.env`

**What it does per party:**
1. Parses PDF text via `pdf2json` (skips if no text — scanned image PDFs)
2. Calls Groq 70B with `allowFallback: false` and `minConfidence: 0.6`
3. Upserts to `party_positions` (conflict key: `party_sigla, theme_id`); skips `variavel` posicao
4. Loads all politicians of that party with candidacies in `ELECTION_YEAR`
5. For members without existing positions, inserts proxy rows to `politician_positions` with `confianca_ia = 0.55`

**Idempotent:** safe to re-run — `party_positions` upserts, `politician_positions` uses `ignoreDuplicates: true`.

**`allowFallback: false`:** The 8B fallback is disabled for this script. If the 70B daily quota is exhausted (100K tokens/day), affected parties are skipped entirely — no data is better than hallucinated positions from legal documents. Re-run after midnight UTC when the quota resets.

> **PDF source matters.** The PDFs must be actual party political manifestos, not TSE registration or statute documents. See `docs/18_party_match.md` for details on the data quality issue.

---

## `ingest-alerts` — Criminal Record Alerts

Parses TSE's `motivo_cassacao` CSV and inserts `ficha_suja` type alerts.

```bash
npm run ingest-alerts -- <motivo_cassacao.csv> <consulta_cand.csv>
```

**Download data:**
```bash
curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/motivo_cassacao/motivo_cassacao_2022.zip" \
  -o data/motivo_cassacao_2022.zip && unzip data/motivo_cassacao_2022.zip -d data/
```

**Key behaviors:**
- `motivo_cassacao` has `SQ_CANDIDATO` but no CPF — builds `SQ → cpf_hash` map from the second argument (`consulta_cand.csv`)
- Looks up politician by `cpf_hash`; inserts alert if found
- Alert fields: `tipo: 'ficha_suja'`, `severidade: 'critica'`, `gerado_por_ia: false`, `validado: true`

> `motivo_cassacao_2026` is only published after TSE rulings (August–September of election year). Use the 2022 file for development.

---

## Full Pipeline Run (2022 seed — SP example)

```bash
cd scripts

# Step 1: ingest candidates
npm run ingest-tse -- data/consulta_cand_2022_BRASIL.csv --estado=SP

# Step 2: download and extract SP governor plans
curl -L ".../proposta_governo_2022_SP.zip" -o data/proposta_governo_2022_SP.zip
unzip data/proposta_governo_2022_SP.zip -d data/propostas_2022/SP/
npm run extract-positions -- data/propostas_2022 data/consulta_cand_2022_BRASIL.csv --estado=SP

# Step 3: ingest alerts
npm run ingest-alerts -- data/motivo_cassacao_2022_BRASIL.csv data/consulta_cand_2022_BRASIL.csv
```

## Idempotency

All scripts are safe to re-run without duplicating data:
- `ingest-tse`: upsert with explicit conflict keys
- `extract-positions`: checks `hasPoliticianPositions()` before calling AI — no re-extraction
- `ingest-alerts`: select-before-insert pattern

## Verifying Data in Supabase

```sql
SELECT cargo, COUNT(*) FROM v_candidates_2022 GROUP BY cargo ORDER BY COUNT(*) DESC;
SELECT COUNT(DISTINCT politician_id) FROM politician_positions;
SELECT tipo, COUNT(*) FROM politician_alerts GROUP BY tipo;
```
