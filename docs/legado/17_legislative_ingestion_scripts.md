# VotoSim — Legislative Position Ingestion Scripts

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-30
> **Motivo:** Guia de uso de `ingest-party-programs.ts`, apagado na Fase A por ter como alvo `party_positions`, que tem 0 linhas.
> **Substituído por:** `docs/referencia/pipeline-de-pesquisa.md`


**Context:** Practical guide for the three scripts that populate `politician_positions` for senators and deputies — offices that have no government plan PDFs. Read before running `ingest-party-programs`, `ingest-camara-votes`, or `ingest-senado-votes`. For why these scripts exist, see `docs/legado/13_legislative_votes.md`. For the existing executive-branch scripts, see `docs/legado/11_pipeline_scripts.md`.

---

## Why Three Scripts

TSE only requires government plan PDFs from executive candidates (presidente, governador, prefeito). Senators and deputies have no equivalent. Three scripts cover them in tiers:

| Script | Source | Quality | Covers |
|--------|--------|---------|--------|
| `ingest-party-programs` | Party program PDF (TSE) | Proxy — `confianca_ia: 0.55` | All legislative candidates |
| `ingest-camara-votes` | Câmara nominal vote CSVs | High — `confianca_ia: 0.80` | Federal deputies (incumbents) |
| `ingest-senado-votes` | Senado REST API | High — `confianca_ia: 0.75` | Senators (incumbents) |

**Run order matters:** `ingest-party-programs` uses INSERT IGNORE (never overwrites). Run it first to fill gaps; the vote-based scripts run after and overwrite with higher-quality data.

```
ingest-party-programs  →  ingest-senado-votes  →  ingest-camara-votes
(proxy, fills all gaps)   (overwrites senators)    (overwrites deputies)
```

---

## `ingest-party-programs` — Proxy via Party PDFs

Reads party program PDFs placed in `scripts/data/party-programs/`, extracts positions via Groq, and INSERTs (with `ignoreDuplicates: true`) for all politicians of that party who have no existing positions.

```bash
npm run ingest-party-programs -- [data/party-programs]
# Default dir: data/party-programs
```

**Pre-requisite: download party PDFs manually.**

1. Go to `https://www.tse.jus.br/partidos/partidos-registrados-no-tse`
2. For each major party, find and download its "Programa Partidário" PDF
3. Save as `scripts/data/party-programs/{SIGLA}.pdf` (e.g., `PT.pdf`, `PL.pdf`)

```bash
mkdir -p scripts/data/party-programs
# then download manually for each party
```

**Key behaviors:**
- PDF filename determines party sigla: `PT.pdf` → looks up politicians with `partido_atual = 'PT'`
- Skips politicians who already have ANY position (INSERT IGNORE per theme)
- `confianca_ia: 0.55`, `validado: false`, `fontes[0].tipo: 'programa_partidario'`
- 1-second rate limit between Groq calls
- Idempotent: re-running skips politicians who already have data from prior run

**Expected output:**
```
[ingest-party-programs] Found 3 party PDFs: PT, PL, MDB
[ingest-party-programs] Processing PT...
[ingest-party-programs] PT: 9 positions extracted
[ingest-party-programs] PT: 1247 politicians, 1180 without positions
[ingest-party-programs] Done. Positions inserted: 9440, politicians skipped: 67
```

---

## `ingest-camara-votes` — Federal Deputies via Câmara Votes

Downloads three bulk CSVs from the Câmara Open Data portal, maps Câmara thematic categories to VotoSim's 14 slugs via a static table, resolves each deputy's CPF via the Câmara REST API, aggregates votes per (deputy, theme), and UPSERTs into `politician_positions`.

```bash
npm run ingest-camara-votes -- data/camara_2022
```

**Pre-requisite: download the three Câmara CSVs.**

```bash
mkdir -p scripts/data/camara_2022
curl -L "https://dadosabertos.camara.leg.br/arquivos/votacoesVotos/csv/votacoesVotos-2022.csv" \
     -o scripts/data/camara_2022/votacoesVotos-2022.csv
curl -L "https://dadosabertos.camara.leg.br/arquivos/votacoesProposicoes/csv/votacoesProposicoes-2022.csv" \
     -o scripts/data/camara_2022/votacoesProposicoes-2022.csv
curl -L "https://dadosabertos.camara.leg.br/arquivos/proposicoesTemas/csv/proposicoesTemas-2022.csv" \
     -o scripts/data/camara_2022/proposicoesTemas-2022.csv
```

**CSV column names (actual vs. internal):**

| File | CSV column | Internal name | Notes |
|------|-----------|---------------|-------|
| `proposicoesTemas` | `uriProposicao` | `idProposicao` | URL — script extracts numeric ID from end |
| `proposicoesTemas` | `tema` | `tema` | Theme label matched against `CAMARA_THEME_MAP` |
| `votacoesProposicoes` | `idVotacao` | `idVotacao` | Direct match |
| `votacoesProposicoes` | `proposicao_id` | `idProposicao` | Numeric ID |
| `votacoesVotos` | `idVotacao` | `idVotacao` | Direct match |
| `votacoesVotos` | `deputado_id` | `idDeputado` | Numeric deputy ID |
| `votacoesVotos` | `voto` | `voto` | "Sim" / "Não" / other |

**What it does:**
1. Builds `idVotacao → [VotoSim slugs]` from proposition themes CSV + static mapping
2. Finds all unique deputy IDs that voted on theme-relevant sessions
3. Calls `GET https://dadosabertos.camara.leg.br/api/v2/deputados/{id}` per deputy to get CPF → `cpf_hash` → `politician_id`
4. Aggregates: for each (politician, theme) counts Sim vs Não votes
5. Derives `posicao` (majority wins) and `intensidade` (log₂ of total votes, capped at 5)
6. UPSERTs — overwrites any existing rows including proxy data from `ingest-party-programs`

**Posicao logic:**
- `sim > nao` → `favoravel`
- `nao > sim` → `contrario`
- `sim == nao` or zero → `neutro`

**Data quality:** `confianca_ia: 0.80`, `validado: true`, `fontes[0].tipo: 'votacao_camara'`

**CPF resolution:** 500 ms rate limit per API call. With ~513 unique deputies, expect ~4–5 minutes for the resolution phase.

**Expected output:**
```
[ingest-camara-votes] Loading CSVs...
[ingest-camara-votes] 45000 tema rows, 12000 proposition rows, 850000 vote rows
[ingest-camara-votes] 320 vote sessions mapped to VotoSim themes
[ingest-camara-votes] 487 deputies with relevant votes
[ingest-camara-votes] CPF resolution done: 412 matched, 75 not found
[ingest-camara-votes] Done. Position rows upserted: 2100 for 412 deputies
```

---

## `ingest-senado-votes` — Senators via Senado REST API

Fetches the list of current senators from the Senado Open Data API, matches each senator to the `politicians` table by name, fetches their voting history for the current legislature, classifies each bill's ementa against VotoSim themes via keyword matching, and UPSERTs positions.

```bash
npm run ingest-senado-votes
# No arguments needed — fetches everything from Senado API
```

**No manual downloads required.** The script calls the Senado API directly.

**API endpoints used:**
- `https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json` — senator list (includes name and UF)
- `https://legis.senado.leg.br/dadosabertos/senador/{codigo}/votacoes.json?dataInicio=2023-02-01&dataFim=2026-06-29` — voting history

**Vote date range:** `2023-02-01` to `2026-06-29`. Senators elected in 2022 started voting in February 2023 (start of the 57th legislature). Using the 2019–2022 range produces zero results for these senators.

**Matching strategy:** CPF was removed from the Senado API in 2024. The script matches senators to `politicians` by `NomeParlamentar` (against `nome_urna`) with `NomeCompletoParlamentar` (against `nome_completo`) as fallback.

**API response structure (as of 2024):**
```json
{
  "VotacaoParlamentar": {
    "Parlamentar": {
      "Votacoes": {
        "Votacao": [
          {
            "Materia": { "Ementa": "..." },
            "SiglaDescricaoVoto": "Sim",
            "DescricaoVotacao": "..."
          }
        ]
      }
    }
  }
}
```
The old structure (`VotacaoSenador`, `SiglaVoto`, `EmentaMateria`) is supported as a fallback for backwards compatibility.

**TLS workaround:** Node.js 24's `fetch` (undici) cannot complete the TLS handshake with `legis.senado.leg.br` in some environments (WSL2). The script uses `child_process.exec` + `curl` for all Senado API calls.

**Theme classification:** The `Materia.Ementa`, `Materia.EmentaMateria`, and `DescricaoVotacao` fields are all concatenated and matched against keyword lists for the 14 VotoSim themes. Bills with no keyword match are skipped.

**Data quality:** `confianca_ia: 0.75`, `validado: true`, `fontes[0].tipo: 'votacao_senado'`

**Rate limit:** 1 second between senator vote-fetch calls. With 81 senators × 1 call each, expect ~2 minutes.

**Expected output:**
```
[ingest-senado-votes] 81 senators found
[ingest-senado-votes] [1/81] Processing Alan Rick (AC)
[ingest-senado-votes] Alan Rick: 413 votes → 8 positions upserted
...
[ingest-senado-votes] Done. Position rows upserted: 402, senators not matched: 42
```

**Coverage note:** ~42 senators are "not matched" because they were elected in 2018 (not 2022) and are not in the 2022 candidates table. Only senators elected in the 2022 election appear in the `politicians` table.

---

## Tests

All three scripts have unit tests covering their pure functions. Run with:

```bash
cd scripts && npm test
# Expected: 40 tests, 40 pass, 0 fail
```

| Test file | Coverage |
|-----------|----------|
| `ingest-party-programs.test.ts` | `filterNeedingPositions`, `buildPositionRows` (6 tests) |
| `ingest-camara-votes.test.ts` | `mapCamaraThemeToSlugs`, `buildProposicaoToSlugsMap`, `categorizeVote`, `derivePosicao` (17 tests) |
| `ingest-senado-votes.test.ts` | `classifyEmenta`, `categorizeSenadoVote`, `deriveSenadoPosicao` (17 tests) |

---

## Data Coverage Caveats

### Senators

The Senado API's `lista/atual.json` returns ~81 senators currently in office. Only those elected in **2022** are in the `politicians` table (the table is seeded from TSE's 2022 candidates CSV). Senators elected in 2018 (still serving their second term) are not matched and show as "not matched" in the output (~42 out of 81).

### Federal Deputies

`ingest-camara-votes` uses CPF matching: it resolves each deputy's CPF from the Câmara REST API and looks it up in `politicians`. The 2022 CSVs contain votes from the **56th legislature (2019–2022)**. These are incumbents who were serving at the time, not the 2022 election candidates. Overlap between the two sets is small: most 2022 candidates were not 56th-legislature incumbents.

**Practical result with 2022 seed data:**
- Senators: ~24 of 243 candidates in DB get positions (~10%)
- Federal deputies: ~6 of 10,000+ candidates in DB get positions (<1%)

For production (2026 data), run `ingest-camara-votes` with 2026 CSVs after ingesting 2026 candidates — the incumbents in 2026 CSVs will be the same people who ran in 2026.

---

## Verifying Results in Supabase

```sql
-- Coverage by cargo after running all three scripts
SELECT c.cargo,
  COUNT(DISTINCT c.politician_id) AS total,
  COUNT(DISTINCT pp.politician_id) AS with_positions,
  ROUND(COUNT(DISTINCT pp.politician_id) * 100.0 / COUNT(DISTINCT c.politician_id), 1) AS pct
FROM candidacies c
LEFT JOIN politician_positions pp ON pp.politician_id = c.politician_id
WHERE c.ano_eleicao = 2022
GROUP BY c.cargo;

-- Data source breakdown
SELECT fontes->0->>'tipo' AS source, COUNT(*) AS rows
FROM politician_positions
GROUP BY source
ORDER BY rows DESC;
```
