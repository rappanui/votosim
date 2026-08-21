# TSE 2026 Data Sources and Pitfalls

**Context:** The canonical way to obtain official 2026 electoral data, and the traps that break naive attempts. Read before writing any script that downloads from the TSE or parses its CSVs. Supersedes the source guidance in `docs/06_data_pipeline.md`, which was written against 2022 data. All findings verified on 2026-08-20.

---

## The canonical source is CKAN, not DivulgaCandContas

**Do not build on the DivulgaCandContas REST API.** It is dead, not merely unavailable for closed elections as `06_data_pipeline.md` previously assumed:

| Endpoint | Result |
|---|---|
| `/divulga/rest/v1/eleicao/listar/2026` | 404 |
| `/divulga/rest/v1/eleicao/listar/2022` | 404 |
| `/divulga/rest/v1/eleicao/buscar/2022/…/BR/candidatos` | 404, HTML body |
| `/divulga/rest/v1/eleicao/eleicao-atual` | 400 |

The `divulgacandcontas.tse.jus.br` site now serves a single-page app with no v1 REST surface.

**Use the TSE CKAN portal instead.** It enumerates every dataset for a cycle with its CDN URL:

```
https://dadosabertos.tse.jus.br/api/3/action/package_show?id=candidatos-2026
```

The 2026 package carried 91 resources when checked. `package_list` also exposes `eleitorado-2026` and `pesquisas-eleitorais-2026`, neither used yet.

## Bulk archives

| Dataset | URL under `https://cdn.tse.jus.br/estatistica/sead/odsele/` |
|---|---|
| Candidates (census) | `consulta_cand/consulta_cand_2026.zip` |
| Complementary candidate data | `consulta_cand_complementar/consulta_cand_complementar_2026.zip` |
| Declared assets | `bem_candidato/bem_candidato_2026.zip` |
| Coalitions | `consulta_coligacao/consulta_coligacao_2026.zip` |
| Official social accounts | `consulta_cand/rede_social_candidato_2026.zip` |
| Disqualifications | `motivo_cassacao/motivo_cassacao_2026.zip` |
| Government plans (per UF) | `proposta_governo/proposta_governo_2026_{UF}.zip` |
| Candidate photos (per UF) | `.../eleicoes/eleicoes2026/fotos/foto_cand2026_{UF}_div.zip` |

`motivo_cassacao_2026.zip` **is already published**. Earlier docs claimed it appears only after TSE rulings in August–September; that is wrong for 2026.

Government plans are filed only by `presidente` and `governador`. The `BR` archive holds presidential plans. Filenames follow `{year}{UF}{SQ_CANDIDATO}.pdf`, and `SQ_CANDIDATO` is the join key to `candidacies.tse_sequencial`.

## Download pitfalls

**`curl` is blocked.** The CDN sits behind Akamai, which returns `403 Access Denied` with an HTML body to `curl` while serving `200 application/zip` to Node's `fetch`. A script that shells out to `curl` silently writes a 462-byte HTML error page named `.zip`.

```
$ curl -O .../consulta_cand_2026.zip   → 403, HTML
Node fetch(url)                        → 200, application/zip
```

**`HEAD` is rejected.** The same URLs return `403` to `HEAD` and `200` to `GET`. Never probe for existence or size with `HEAD` — use a ranged `GET` or just download.

**Archives change daily.** `consulta_cand_2026.zip` was regenerated the same day it was inspected. Registration closed 2026-08-15 and the national total stood at 20,674 candidacies against roughly 29,000 in 2022, so the file is very likely still filling. Re-ingestion is mandatory, not optional.

## CSV parsing quirks

Encoding is **ISO-8859-1** (`latin1`), delimiter is `;`. Reading as UTF-8 mangles every accented name.

The archive contains one CSV per UF, plus `consulta_cand_2026_BR.csv` (national offices) and `consulta_cand_2026_BRASIL.csv`.

### `SG_UF = 'BR'` for national offices

`presidente` and `vice_presidente` carry `SG_UF = 'BR'`. The `brazilian_state` enum in `docs/base/01_schema_politicians.md` originally had no such value, so a schema rebuilt from the docs rejected every presidential candidacy with `invalid input value for enum brazilian_state: "BR"`. The live database had accepted `BR` all along — docs and database had silently diverged. Fixed in `docs/base/11_sp0_foundation.sql` with an idempotent `ALTER TYPE`.

### `DS_SITUACAO_CANDIDATURA` is `#NE` for everyone

All 41,348 national rows carry `#NE` — the TSE has judged no candidacy yet. Any status mapping must treat unrecognised text as "still registered" rather than guessing, and status must be refreshed by periodic re-download.

### Coalition columns carry sentinels, not just nulls

`NM_COLIGACAO` holds literal `PARTIDO ISOLADO` (1,882 rows in SP) and `FEDERACAO` (701 rows in SP) alongside `#NULO`. Filtering only `#NULO` stores `"PARTIDO ISOLADO"` as if it were a coalition name. `DS_COMPOSICAO_COLIGACAO` carries the actual party composition and is the more useful column.

### Federations are distinct from coalitions

`SG_FEDERACAO` / `NM_FEDERACAO` / `DS_COMPOSICAO_FEDERACAO` describe party federations, which in 2026 are permanent alliances rather than per-election ones. Real values: `PT/PC do B/PV`, `PSDB/CIDADANIA`, `PSOL/REDE`, `44-UNIÃO/11-PP`, `25-PRD/77-SOLIDARIEDADE`. Note the inconsistent formatting — some carry party numbers, some do not. Stored in `candidacies.federacao`.

### Senate substitutes are separate rows

`1º SUPLENTE` and `2º SUPLENTE` appear as their own candidacies (649 rows nationally). They are not voted on individually and are deliberately not ingested.

## 2026 census by office

Measured from the archive generated 2026-08-20 19:33.

| Office | Count |
|---|---|
| Presidente | 13 |
| Vice-presidente | 13 |
| Governador | 199 |
| Vice-governador | 201 |
| Senador | 316 |
| 1st / 2nd senate substitute | 649 |
| Deputado federal | 7,691 |
| Deputado estadual | 11,165 |
| Deputado distrital | 427 |
| **National total** | **20,674** |
