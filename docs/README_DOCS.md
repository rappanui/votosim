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
| AI — match (session) | Gemini Flash (Google AI Studio — free tier) | Called via Edge Function, no grounding |
| AI — pipeline (extraction) | Gemini Flash (same model) | Extracts positions from government plans |
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
| TSE Open Data (`dadosabertos.tse.jus.br`) | Candidates, parties, criminal records | CSV bulk |
| DivulgaCandContas (`divulgacandcontas.tse.jus.br`) | Government plan per candidate | REST API |
| Câmara (`dadosabertos.camara.gov.br`) | Nominal votes, deputies in office | REST API |
| Senado (`dadosabertos.senado.leg.br`) | Votes, senators in office | REST API |

### Database tables (all created — see `base/08_supabase_setup.md`)

| Table | Content |
|---|---|
| `politicians` | Physical person — one record per person |
| `candidacies` | Candidacy per election/office/state |
| `themes_catalog` | 14 political themes with questionnaire statements |
| `politician_positions` | Position per politician per theme (extracted by Gemini) |
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
| `06_data_pipeline.md` | Ingestion pipeline with Gemini Flash for extraction |
| `09_nextjs_setup.md` | Next.js 15 project setup, env vars, Supabase client, folder structure |
| `10_frontend_pages.md` | Page-by-page spec, TypeScript interfaces, state management |

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
SERVICE_ROLE_KEY=eyJ...     # bypasses RLS — NEVER expose in browser or .env.local
GEMINI_API_KEY=AIza...      # Google AI Studio — keep billing OFF to preserve free tier
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
