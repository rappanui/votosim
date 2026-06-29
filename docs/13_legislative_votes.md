# VotoSim — Data Strategy for Deputies and Senators

**Context:** Government plan PDFs (proposta de governo) only exist for executive candidates. Deputies and senators have no equivalent. Read this before implementing `ingest-camara-votes.ts` or `ingest-senado-votes.ts`, and before adjusting match quality expectations for legislative offices.

---

## Why There Are No PDFs for Deputies/Senators

TSE's `proposta_governo` upload is required **only** for PRESIDENTE, GOVERNADOR, and PREFEITO (municipalities above 200,000 inhabitants). Legislators (SENADOR, DEPUTADO FEDERAL, ESTADUAL, DISTRITAL) are not required to submit government plans. No such files exist on the TSE CDN for these candidates — the gap is structural, not a data availability delay.

---

## Two-Tier Strategy

### Tier 1 — Voting Record (incumbents with a mandate)

Actual voting behavior is **higher quality** than campaign promises — it's what the politician actually did in office. Both the Chamber and Senate expose their full nominal voting history via free public APIs.

#### Câmara dos Deputados — Federal Deputies

Base URL: `dadosabertos.camara.leg.br`

| Bulk CSV | URL pattern | Content |
|----------|-------------|---------|
| Votes | `/arquivos/votacoesVotos/csv/votacoesVotos-{ano}.csv` | Deputy ID + vote per nominal vote |
| Propositions voted | `/arquivos/votacoesProposicoes/csv/votacoesProposicoes-{ano}.csv` | Proposition per vote session |
| Proposition themes | `/arquivos/proposicoesTemas/csv/proposicoesTemas-{ano}.csv` | Official Câmara thematic categories per proposition |

**Join to our politicians table:** The Câmara API's `/deputados/{id}` endpoint exposes CPF. Hash it → match to `politicians.cpf_hash`.

**Coverage:** All 513 federal deputies of the current term (57th legislature, 2023–2027). For 2022 seed: deputies from the 56th legislature (2019–2023) who appear in our `politicians` table from the TSE CSV.

**Theme classification:** Câmara already classifies each proposition in `proposicoesTemas` using its official thesaurus (~80 categories). These map to VotoSim's 14 slugs via a static mapping table (draft below). No per-vote AI classification needed.

#### Senado Federal — Senators

Base URL: `legis.senado.leg.br/dadosabertos`

Senators serve 8-year terms — any active senator has a long voting record. The Senado REST API provides nominal votes per senator per session.

**Coverage:** All 81 senators. For 2026: the 27 senators in the class up for re-election, plus any senator seeking the presidency or governorship.

#### Planned Scripts

```
ingest-camara-votes.ts:
  proposicoesTemas-{ano}.csv  → slug mapping
  votacoesVotos-{ano}.csv     → per-deputy votes
  aggregate: (cpf_hash, voto_sim_slug) → posicao + intensidade
  upsert politician_positions

ingest-senado-votes.ts:
  Senado REST API calls per senator
  same aggregation and upsert logic
```

---

### Tier 2 — Party Program (proxy for new candidates)

For candidates with no voting record (first-time legislators, candidates switching offices), the political party's registered program is used as a positional proxy.

**Source:** All party programs available from TSE in PDF: `tse.jus.br/partidos/partidos-registrados-no-tse`

**Pipeline:** Same Groq extraction as `extract-positions.ts` — PDF → text → Groq → `politician_positions`. Positions derived this way use lower confidence (`confianca_ia: 0.5–0.65`) so they appear as lower-confidence data in the match.

#### Planned Script: `ingest-party-programs.ts`

---

## Coverage Matrix

| Office | Data source | Tier | Script | Status |
|--------|-------------|------|--------|--------|
| Presidente | TSE PDF | — | `extract-positions.ts` | ✅ Done |
| Governador | TSE PDF | — | `extract-positions.ts` | ✅ Done |
| Senador (incumbent) | Senado API (votes) | 1 | `ingest-senado-votes.ts` | 🔜 Planned |
| Deputado Federal (incumbent) | Câmara API (votes) | 1 | `ingest-camara-votes.ts` | 🔜 Planned |
| Deputado Federal (new) | Party program | 2 | `ingest-party-programs.ts` | 🔜 Planned |
| Deputado Estadual | Party program (only viable source) | 2 | `ingest-party-programs.ts` | 🔜 Planned |
| Deputado Distrital | Party program (only viable source) | 2 | `ingest-party-programs.ts` | 🔜 Planned |
| Senador (new) | Party program | 2 | `ingest-party-programs.ts` | 🔜 Planned |

State assemblies (for deputados estaduais) have no unified national API — individual state systems are heterogeneous and out of scope for MVP.

---

## Câmara Theme → VotoSim Theme Mapping (draft)

Translate Câmara's official thematic areas to VotoSim's 14 slugs. Multiple Câmara categories can map to the same VotoSim slug; propositions with no match are skipped.

| Câmara category | VotoSim slug |
|----------------|--------------|
| Tributação / Finanças e Orçamento | `reforma_tributaria`, `politica_economica` |
| Saúde | `sus_saude_publica` |
| Previdência e Assistência Social | `reforma_previdencia`, `bolsa_familia_transferencia` |
| Segurança Pública e Penitenciária | `seguranca_publica_estadual` |
| Educação | `educacao_basica` |
| Meio Ambiente e Desenvolvimento Sustentável | `meio_ambiente_desmatamento` |
| Direitos Humanos e Minorias | `direitos_lgbtqia`, `pauta_moral_costumes` |
| Defesa / Armas / Segurança Nacional | `porte_armas` |
| Ética / Anticorrupção / Transparência | `corrupcao_transparencia` |
| Relações Exteriores / Comércio Internacional | `politica_externa` |
| Privatização / Concessões / Estatais | `privatizacao_estatais` |

This mapping is a static table in `ingest-camara-votes.ts`. Ambiguous cases (propositions assigned to multiple VotoSim slugs) produce one `politician_positions` row per matched slug.
