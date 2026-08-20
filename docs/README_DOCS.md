# VotoSim — Master Reference Document

> **Version:** 4.0 — Next.js + Vercel  
> **Previous:** `base/README_DOCS.v3.md` (Lovable/Vite era)  
> **What changed:** Frontend replaced from Lovable/Vite to Next.js 15 App Router. Deploy target is Vercel. AI extraction pipeline corrected to Gemini Flash throughout (removed inconsistent Claude Haiku references in old docs).

---

## 1. What is VotoSim

Electoral information tool for Brazilian voters. The user answers a 14-theme political questionnaire and receives a list of candidates with a thematic alignment percentage, grouped by office. It never recommends a candidate — it informs and compares.

**Core concept:** "Spotify for politicians" — similarity search between the voter's values and candidates' documented positions.

**Legal alignment:** TSE Resolution 23.755/2026. The system never uses "vote for", "I recommend", or equivalent. Results are always presented as an informational alignment percentage whose interpretation belongs exclusively to the voter.

**Target election:** 2026 General Elections — Round 1: October 4, 2026.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind CSS | All MVP pages run client-side (`"use client"`) |
| Backend | Supabase Edge Functions (Deno/TypeScript) | Match logic + Gemini call |
| Database | Supabase (PostgreSQL 15 + pgvector) | All data lives here |
| Auth | None in MVP — stateless product | Supabase Auth available for future use |
| Deploy | Vercel | Best-in-class Next.js integration; no platform lock-in |
| AI — match (session) | Deterministic math only | Edge Function; no AI calls; reproducible, auditable; see `docs/14_edge_function_ai.md` |
| AI — pipeline (extraction) | Groq — Llama 3.3 70B → 8B fallback | Extracts positions from gov plan PDFs; free tier; see `docs/12_ai_extraction.md` |
| Electoral data | Official TSE, Câmara and Senado public APIs | No scraping |
| Monetization | Google AdSense + premium report (v2) | |

**Why Next.js over Vite:** v2 (September 2026) requires per-candidate static pages for SEO. Starting with Next.js avoids a mid-election migration. For MVP all pages run client-side — no behavioral difference from Vite.

**Why not Lovable:** Free tier too limited for this project's complexity. Code is owned directly and deployed to Vercel with no vendor lock-in.

---

## 3. Business Model

| Channel | Details | When |
|---|---|---|
| Google AdSense | Slots in results and between candidate groups. Estimated CPM R$3–8 in election period. Request approval early — Google takes 2–4 weeks. | MVP |
| Premium report | "My electoral cheat sheet" — PDF with all candidates by office, match % and sources. R$9.90. Stripe + server-side PDF. | v2 |
| Editorial partnership | Data license for media outlets, universities, NGOs. | v3+ |

---

## 4. Product Flow

```
/inicio → /perfil (state/city/age) → /questionario (14 themes, 1 per screen)
       → /revisao (review answers) → /resultado (candidates by alignment %)
/sobre — standalone, always accessible from footer
```

**Voter profile (required before questions):**
- State (select, 27 UFs), Municipality (text), Age range (select, 6 options)
- Stored in React Context only — never saved to the database

**Questionnaire rules:**
- 14 statements, one per screen, scale 1–5
- Slider starts with no value selected (not centered)
- "Skip" button registers neutral (value 3)
- Allow going back to change previous answers
- Review screen before submitting
- Minimum 3 non-neutral answers to enable "See candidates"

**Edge Function match flow:**
1. Receive user JSON profile
2. Fetch state candidates via `v_candidates_2026_matchable` + positions + alerts
3. Call Gemini Flash with structured match prompt (no grounding — reasons over DB data only)
4. Gemini returns ordered list by score per office
5. Return structured JSON to frontend

**Results display:** Candidates grouped by office (presidente → governador → senador → deputado_federal → deputado_estadual). Alerts load asynchronously — cards appear first, badges update in background.

---

## 5. Data Architecture

### Sources (all official, no scraping)

| Source | What it provides | Format |
|---|---|---|
| TSE CDN (`cdn.tse.jus.br/estatistica/sead/odsele/`) | Candidates CSV, government plan PDFs (governors only), cassation records | ZIP bulk |
| Câmara (`dadosabertos.camara.leg.br`) | Nominal votes, proposition themes, deputies in office | CSV bulk + REST |
| Senado (`legis.senado.leg.br/dadosabertos`) | Votes, senators in office | REST API |
| TSE Partidos (`tse.jus.br/partidos/`) | Party programs (PDF) — proxy for deputies/senators without voting record | PDF |

> DivulgaCandContas API was evaluated and abandoned — returns 404 for 2022 data and is unreliable for historical elections. Government plans are fetched from TSE CDN ZIPs instead.

### Database tables (all created — see `base/08_supabase_setup.md`)

| Table | Content |
|---|---|
| `politicians` | Physical person — one record per person |
| `candidacies` | Candidacy per election/office/state |
| `themes_catalog` | 14 political themes with questionnaire statements |
| `politician_positions` | Position per politician per theme (AI-extracted or party proxy) |
| `party_positions` | Position per party per theme (from official party programs) |
| `politician_alerts` | Dirty record, investigations, controversies |
| `parties` | Political parties with spectrum metadata |

### Ready views

- `v_candidates_2026` — active candidates in 2026
- `v_candidates_2026_matchable` — candidates with data coverage for match
- `v_candidate_alerts` — validated alerts ready for display
- `v_politician_theme_coverage` — thematic coverage per candidate

---

## 6. Document Index

### Active documents (this folder)

| File | Content |
|---|---|
| `README_DOCS.md` | **This file** — master reference |
| `06_data_pipeline.md` | Pipeline architecture: scripts, data sources, execution order |
| `09_nextjs_setup.md` | Next.js 15 project setup, env vars, Supabase client, folder structure |
| `10_frontend_pages.md` | Page-by-page spec, TypeScript interfaces, state management |
| `11_pipeline_scripts.md` | Practical script usage guide: commands, flags, download URLs, idempotency |
| `12_ai_extraction.md` | AI providers (Gemini vs Groq), models, prompt structure, DB schema mapping |
| `13_legislative_votes.md` | Data strategy for deputies and senators: Câmara/Senado APIs + party proxy |
| `14_edge_function_ai.md` | Edge Function AI: provider chain (Groq→Cerebras→Mistral→score sem IA), error formats, mathematical fallback algorithm |
| `15_local_testing_edge_function.md` | Local testing setup for Edge Functions: Deno-based runner, unit tests, dev.sh, why `import.meta.main` matters |
| `16_2026_candidate_update.md` | Step-by-step guide to refresh data for 2026 elections: TSE file downloads, script order, switching `ELECTION_YEAR` secret |
| `17_legislative_ingestion_scripts.md` | Practical guide for `ingest-party-programs`, `ingest-camara-votes`, `ingest-senado-votes`: pre-requisites, commands, expected output, run order |
| `18_party_match.md` | Party match feature (voto de legenda): `party_positions` table, ingest script, Edge Function integration, how party entries appear in results |
| `candidate-enrichment-strategy.md` | Tiered pipeline for enriching candidate positions: why the TSE PDF pipeline failed, 3-tier architecture, data quality standards, SP pilot plan, source type reference |
| `candidate-enrichment-prompt.md` | LLM prompt (system + few-shot) for Groq/Claude to interpret candidate positions into the 14-theme schema. Includes validated Lula + Bolsonaro examples and Supabase upsert instructions |

### DB docs — unchanged, still valid (in `base/`)

| File | Content | Apply? |
|---|---|---|
| `base/01_schema_politicians.md` | DDL: politicians, candidacies, parties, RLS, seed | ✅ |
| `base/02_schema_themes.v2.md` | DDL: themes + 14-theme seed with statements | ✅ |
| `base/04_schema_alerts.md` | DDL: alerts, editorial rules, RLS | ✅ |
| `base/05_schema_match_algorithm.md` | Match algorithm in SQL + scoring logic | ✅ |
| `base/07_questionnaire.md` | All 14 questions, UX rules, JSON output format | ✅ |
| `base/08_supabase_setup.md` | Step-by-step Supabase setup with full DDL | ✅ |
| `base/03_schema_embeddings.md` | pgvector, embeddings, similarity cache | ⏳ v2 only |

---

## 7. Supabase Application Order

```
Prerequisites — enable in Supabase Dashboard → Database → Extensions:
  uuid-ossp, unaccent, pg_trgm, vector (enable now even though vector is v2)

MVP — apply in this order via SQL Editor:
  1. base/01_schema_politicians.md    enums + parties + politicians + candidacies + RLS
  2. base/02_schema_themes.v2.md     themes_catalog + politician_positions + views + RLS + 14-theme seed
  3. base/04_schema_alerts.md        politician_alerts + view + RLS
  4. base/10_party_positions.sql     party_positions table + indexes + RLS (required for party match)
  5. base/11_sp0_foundation.sql     enrichment_ledger + candidate_sources + candidate_dossiers + column additions

Skip: base/03_schema_embeddings.md and the SQL function in base/05 — those are v2.
```

---

## 8. Environment Variables

```bash
# .env.local (Next.js project root — never commit this file)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # safe to expose in browser
```

Supabase Edge Functions secrets (Supabase Dashboard → Edge Functions → Secrets):
```
SERVICE_ROLE_KEY=eyJ...       # bypasses RLS — NEVER expose in browser or .env.local
ELECTION_YEAR=2022            # controls which view the Edge Function queries (2022 or 2026)
```

> The Edge Function no longer calls any AI provider — scoring is deterministic math. `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `GEMINI_API_KEY` are **not needed** in Edge Function secrets.

Pipeline scripts (`scripts/.env` — never commit):
```
SUPABASE_URL=https://xxxx.supabase.co
SERVICE_ROLE_KEY=eyJ...       # same key as above
GROQ_API_KEY=gsk_...          # console.groq.com — used only by pipeline scripts, not Edge Function
GEMINI_API_KEY=...            # kept in .env but not currently used (free tier quota is 0)
```

> `NEXT_PUBLIC_` prefix = exposed in the browser bundle. Only public keys get this prefix.

---

## 9. Roadmap

### MVP (August 2026)
- 14-theme questionnaire + candidate results by alignment %
- Dirty record alerts from TSE CSV
- AdSense integration
- `/sobre` with legal disclaimer

### v2 (September 2026 — before Round 1)
- Per-candidate static pages (SEO) — primary reason Next.js was chosen
- Candidate reference search (Mode A) and free-text values (Mode B)
- Theme weight adjustment by voter
- Premium PDF report (R$9.90)
- pgvector + embeddings + semantic similarity (hybrid match)

### v3 (post-election)
- Promises vs. votes comparison for elected officials
- Public API for NGOs
- Municipal elections coverage

---

## 10. Legal Compliance

- No screen uses "vote for", "I recommend", or equivalent (TSE Resolution 23.755/2026)
- Disclaimer in footer of all pages
- LGPD: stateless product — no personal data collected or stored
- AdSense: block political candidate ads on result pages (configure in AdSense content policy)
- TSE data: use covered by Open Data Portal ("data may be freely accessed, used, processed and shared by anyone")
