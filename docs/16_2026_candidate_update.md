# VotoSim — 2026 Candidate Data Update Process

**Context:** Step-by-step guide to refresh VotoSim's database for the 2026 general elections. Read before ingesting new candidate data. For pipeline script details, see `docs/11_pipeline_scripts.md`. For the full pipeline architecture, see `docs/06_data_pipeline.md`.

---

## When TSE Releases 2026 Data

| Dataset | Expected release | URL pattern |
|---------|-----------------|-------------|
| Candidate CSV (`consulta_cand`) | August 2026 (after registration deadline) | `cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip` |
| Government plan PDFs (`proposta_governo`) | August 2026 (with candidacy) | `cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_{UF}.zip` |
| Criminal records (`motivo_cassacao`) | September 2026 (after TSE rulings) | `cdn.tse.jus.br/estatistica/sead/odsele/motivo_cassacao/motivo_cassacao_2026.zip` |

---

## Step 1: Download TSE Files

### Candidates CSV

```bash
curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip" \
  -o scripts/data/consulta_cand_2026.zip
unzip scripts/data/consulta_cand_2026.zip -d scripts/data/
# Produces: consulta_cand_2026_BR.csv (national) + one CSV per state UF
```

### Government plan PDFs (per state + BR)

```bash
# Presidential candidates (estado='BR' in DB)
curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_BR.zip" \
  -o scripts/data/proposta_governo_2026_BR.zip
mkdir -p scripts/data/propostas_2026/BR
unzip scripts/data/proposta_governo_2026_BR.zip -d scripts/data/propostas_2026/BR/
# Move any nested subdirectory up if zip extracts to BR/BR/:
# mv scripts/data/propostas_2026/BR/BR/*.pdf scripts/data/propostas_2026/BR/

# Per-state (governors) — repeat for each UF
for UF in SP RJ MG RS BA PR SC GO PE CE; do
  curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${UF}.zip" \
    -o scripts/data/proposta_governo_2026_${UF}.zip
  mkdir -p scripts/data/propostas_2026/${UF}
  unzip scripts/data/proposta_governo_2026_${UF}.zip -d scripts/data/propostas_2026/${UF}/
done
```

### Criminal records

```bash
curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/motivo_cassacao/motivo_cassacao_2026.zip" \
  -o scripts/data/motivo_cassacao_2026.zip
unzip scripts/data/motivo_cassacao_2026.zip -d scripts/data/
```

---

## Step 2: Run `ingest-tse` for 2026

The script constant `ELECTION_YEAR` in `scripts/ingest-tse.ts` must be updated to `2026` before running.

```bash
# Edit scripts/ingest-tse.ts: change ELECTION_YEAR = 2022 → 2026
# Then run (starts with national file, then per-state for priority states):
cd scripts
npm run ingest-tse -- data/consulta_cand_2026_BR.csv
npm run ingest-tse -- data/consulta_cand_2026_SP.csv --estado=SP
# ... repeat for other states
```

`ingest-tse` upserts into `politicians` + `candidacies` with `ano_eleicao = 2026`. The 2022 rows stay untouched.

---

## Step 3: Run `extract-positions` for 2026

The script constant `ELECTION_YEAR` in `scripts/extract-positions.ts` must be updated to `2026`.

```bash
# Edit scripts/extract-positions.ts: change ELECTION_YEAR = 2022 → 2026

# Presidential candidates (required — no other source for their positions)
cd scripts
npm run extract-positions -- data/propostas_2026 data/consulta_cand_2026_BR.csv --estado=BR

# Governors per state
npm run extract-positions -- data/propostas_2026 data/consulta_cand_2026_SP.csv --estado=SP
# ... repeat for other states
```

---

## Step 4: Run `ingest-alerts` for 2026

```bash
cd scripts
npm run ingest-alerts -- data/motivo_cassacao_2026_BRASIL.csv
```

---

## Step 5: Switch Edge Function to 2026

In Supabase Dashboard → Edge Functions → Secrets:

```
ELECTION_YEAR = 2026
```

The Edge Function reads this value at request time to select the view (`v_candidates_2026` vs `v_candidates_2022`). No redeploy needed — changing the secret takes effect immediately.

---

## What Changes vs 2022

| Aspect | 2022 (seed) | 2026 (production) |
|--------|-------------|-------------------|
| `ELECTION_YEAR` constant in scripts | `2022` | `2026` |
| Candidate view used by Edge Function | `v_candidates_2022` | `v_candidates_2026` |
| PDF folder | `data/propostas_2022/` | `data/propostas_2026/` |
| CSV files | `consulta_cand_2022_*.csv` | `consulta_cand_2026_*.csv` |
| Deputies/senators data | Via `ingest-camara-votes` / `ingest-senado-votes` (planned) | Same |

2022 data is not deleted — historical rows coexist in the same tables. The `ano_eleicao` column on `candidacies` is the discriminator.

---

## Deputies and Senators (2026)

Position data for senators and federal deputies does not come from government plan PDFs — those are only submitted by governors and presidents. For 2026:

- **Senators:** Use `ingest-senado-votes.ts` (planned) — Senado Open Data API
- **Federal deputies:** Use `ingest-camara-votes.ts` (planned) — Câmara Open Data API
- **Fallback (proxy):** `ingest-party-programs.ts` (planned) — party program PDFs from TSE, same URL pattern as `proposta_governo` but for party-level documents

See `docs/13_legislative_votes.md` for the implementation strategy.

---

## Checking Coverage Before Going Live

After ingesting all 2026 data, verify coverage in Supabase SQL Editor:

```sql
-- Candidates with at least one position
SELECT c.cargo, COUNT(DISTINCT p.politician_id) AS with_positions
FROM v_candidates_2026 c
LEFT JOIN politician_positions pp ON pp.politician_id = c.politician_id
LEFT JOIN politicians p ON p.id = c.politician_id
GROUP BY c.cargo;

-- Coverage percentage per cargo
SELECT cargo,
  COUNT(*) AS total,
  COUNT(pp.politician_id) AS with_data,
  ROUND(COUNT(pp.politician_id) * 100.0 / COUNT(*), 1) AS pct
FROM v_candidates_2026 c
LEFT JOIN (
  SELECT DISTINCT politician_id FROM politician_positions
) pp ON pp.politician_id = c.politician_id
GROUP BY cargo;
```

The product requires at least 35% alignment score to show a candidate — candidates without position data will score 0% and be filtered out. Verify coverage is acceptable before setting `ELECTION_YEAR=2026`.
