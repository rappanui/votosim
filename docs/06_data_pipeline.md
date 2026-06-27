# VotoSim — Data Ingestion Pipeline

**Context:** Scripts that populate the Supabase database with candidates, government plan positions, and alerts. Runs locally (Node.js 20) before the MVP launch, then weekly via cron. Read before running or modifying the ingestion scripts.

> **Changed from base version:** extraction step now uses Gemini Flash via `@google/generative-ai` — removed the inconsistent Claude Haiku reference from the Lovable-era docs.

---

## Overview

```
TSE CSV (candidates)         → [ingest_tse.ts]       → politicians + candidacies
DivulgaCandContas (plans)    → [ingest_plans.ts]      → candidacies.plano_governo_texto
Câmara + Senado (votes)      → [ingest_votes.ts]      → politician_positions (votes)
Gemini Flash (extraction)    → [extract_themes.ts]    → politician_positions (all)
TSE CSV (criminal records)   → [ingest_alerts.ts]     → politician_alerts (ficha_suja)
```

All steps are idempotent (upsert) — safe to re-run without duplicating data.

---

## Setup

```bash
npm install papaparse @google/generative-ai @supabase/supabase-js
```

Environment variables (`.env` in scripts folder):
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GEMINI_API_KEY=AIza...
```

---

## Step 1 — TSE CSV Ingestion

TSE releases `consulta_cand_2026_BRASIL.csv` after official registration (July 2026). Before that, use the Câmara API for current deputies.

```typescript
// scripts/ingest_tse.ts
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'
import crypto from 'crypto'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const CARGO_MAP: Record<string, string> = {
  'PRESIDENTE': 'presidente', 'VICE-PRESIDENTE': 'vice_presidente',
  'SENADOR': 'senador', 'GOVERNADOR': 'governador',
  'VICE-GOVERNADOR': 'vice_governador', 'DEPUTADO FEDERAL': 'deputado_federal',
  'DEPUTADO ESTADUAL': 'deputado_estadual', 'DEPUTADO DISTRITAL': 'deputado_distrital',
}

const STATUS_MAP: Record<string, string> = {
  'APTO': 'deferido', 'DEFERIDO': 'deferido',
  'INAPTO': 'indeferido', 'INDEFERIDO': 'indeferido', 'CANCELADO': 'indeferido',
}

async function ingestTSECandidates(csvPath: string) {
  const { data: rows } = Papa.parse(await Bun.file(csvPath).text(), {
    header: true, delimiter: ';', encoding: 'latin1', skipEmptyLines: true,
  })

  for (const row of rows as any[]) {
    const cargo = CARGO_MAP[row.DS_CARGO?.trim()]
    if (!cargo) continue  // skip out-of-scope offices (vereador, prefeito)

    const cpfHash = crypto.createHash('sha256')
      .update(row.NR_CPF_CANDIDATO?.replace(/\D/g, '') ?? '').digest('hex')

    const { data: pol } = await supabase.from('politicians').upsert({
      cpf_hash: cpfHash, tse_id: row.SQ_CANDIDATO,
      nome_completo: row.NM_CANDIDATO?.trim(), nome_urna: row.NM_URNA_CANDIDATO?.trim(),
      partido_atual: row.SG_PARTIDO?.trim(),
      genero: row.DS_GENERO === 'MASCULINO' ? 'M' : row.DS_GENERO === 'FEMININO' ? 'F' : 'O',
      escolaridade: row.DS_GRAU_INSTRUCAO?.trim(), ocupacao: row.DS_OCUPACAO?.trim(),
      ativo: true,
    }, { onConflict: 'cpf_hash' }).select('id').single()

    if (!pol) continue

    await supabase.from('candidacies').upsert({
      politician_id: pol.id, ano_eleicao: 2026, turno: 1,
      cargo, estado: row.SG_UF?.trim(), numero_urna: row.NR_CANDIDATO?.trim(),
      partido_eleicao: row.SG_PARTIDO?.trim(), numero_partido: parseInt(row.NR_PARTIDO) || null,
      status: STATUS_MAP[row.DS_SITUACAO_CANDIDATURA?.trim()] ?? 'pre_candidato',
      tse_sequencial: row.SQ_CANDIDATO,
    }, { onConflict: 'politician_id,ano_eleicao,turno,cargo,estado' })
  }
}
```

> **Encoding:** TSE CSVs are ISO-8859-1 (latin1). Always parse with `encoding: 'latin1'`.  
> **Rate limiting on DivulgaCandContas:** 1 req/s — use `await new Promise(r => setTimeout(r, 1000))` between calls.

---

## Step 2 — Position Extraction via Gemini Flash

Processes candidates without registered positions. Calls Gemini Flash for each one.

```typescript
// scripts/extract_themes.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  systemInstruction: `You are a political analyst specializing in Brazilian politics.
Analyze public information about a politician and identify their positions on specific political themes.
Respond ONLY with valid JSON, no text before or after, no markdown, no backticks.
For each position: use only provided slugs, posicao: "favoravel"|"contrario"|"neutro",
intensidade: 1 (weak) to 5 (signature issue), confianca: 0.0–1.0.
Include ONLY positions with documentable evidence and at least one source.`,
  generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
})

async function extractForCandidate(candidate: any, themeSlugs: string[]) {
  const prompt = `
Analyze the political positions of:
Name: ${candidate.nome_urna}
Party: ${candidate.partido_atual}
Office: ${candidate.cargo} — ${candidate.estado}

${candidate.plano_governo_texto
  ? `Government plan (extracted from TSE PDF):\n${candidate.plano_governo_texto.slice(0, 4000)}`
  : 'Government plan: not available'}

Available theme slugs (use only these): ${themeSlugs.join(', ')}

Return JSON: { "posicoes": [{ "slug": "...", "posicao": "favoravel", "intensidade": 4,
"confianca": 0.85, "fontes": [{ "tipo": "plano_governo", "descricao": "...", "confiabilidade": "alta" }] }] }

Include only positions with confianca >= 0.6 and at least one identifiable source.`

  const result = await model.generateContent(prompt)
  try {
    return JSON.parse(result.response.text()).posicoes ?? []
  } catch {
    console.error('Failed to parse Gemini response for', candidate.nome_urna)
    return []
  }
}

async function runExtractionBatch(limit = 50) {
  const { data: candidates } = await supabase
    .from('v_candidates_2026').select('politician_id, nome_urna, partido_atual, cargo, estado, plano_governo_texto')
    .not('politician_id', 'in', supabase.from('politician_positions').select('politician_id'))
    .limit(limit)

  const { data: themes } = await supabase.from('themes_catalog').select('id, slug').eq('ativo', true)
  const themeSlugs = (themes ?? []).map(t => t.slug)
  const themeMap = Object.fromEntries((themes ?? []).map(t => [t.slug, t.id]))

  for (const candidate of candidates ?? []) {
    const posicoes = await extractForCandidate(candidate, themeSlugs)

    for (const pos of posicoes) {
      const themeId = themeMap[pos.slug]
      if (!themeId) continue
      await supabase.from('politician_positions').upsert({
        politician_id: candidate.politician_id, theme_id: themeId,
        posicao: pos.posicao, intensidade: pos.intensidade,
        fontes: pos.fontes, confianca_ia: pos.confianca,
        gerado_por_ia: true, validado: pos.confianca >= 0.85,
      }, { onConflict: 'politician_id,theme_id' })
    }

    await new Promise(r => setTimeout(r, 1000))  // 1 req/s — Gemini free tier: 10 RPM
  }
}
```

---

## Step 3 — Embeddings (v2 only)

Skip in MVP. See `base/06_data_pipeline.md` for the Voyage AI embedding step.

---

## Schedule (weekly cron)

| Step | When | Frequency |
|---|---|---|
| TSE CSV ingest | Sun 03:00 | Weekly (data changes slowly) |
| Government plans (DivulgaCand) | Sun 04:00 | Weekly (new candidates only) |
| Theme extraction (Gemini) | Mon 02:00 | Daily (process new candidates) |
| Alert ingest (TSE CSV) | Mon 03:00 | Weekly |

Configure as Supabase Edge Functions scheduled tasks (Dashboard → Edge Functions → Schedule).

---

## Cost Estimate

| Step | Volume (2026 election) | Cost |
|---|---|---|
| TSE CSV ingestion | ~30,000 candidates | R$0 |
| Government plan extraction (Gemini Flash) | ~30,000 × ~1,000 tokens | ~R$15 total |
| Embeddings (Voyage AI, v2) | ~30,000 × ~300 tokens | R$0 (free tier 200M/mo) |
| **Total per election cycle** | | **~R$15–30** |

> **Critical:** Keep billing OFF in the Google Cloud project used for Gemini. Enabling billing eliminates the free tier (1,500 req/day, 10 RPM) and charges for every call.
