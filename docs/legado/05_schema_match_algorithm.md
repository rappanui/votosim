# VotoSim — Match Algorithm and Edge Function

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-27
> **Motivo:** Descreve o cálculo do match chamando "o Gemini match prompt" — o match atual (`scoreWithoutAI`) é aritmética determinística, sem chamada a IA nenhuma em runtime.
> **Substituído por:** `docs/referencia/calculo-do-match.md`


**Context:** How candidate scores are computed and how the Edge Function (`match-candidatos`) exposes the result to the frontend. Read before implementing or modifying the scoring logic, the Supabase Edge Function, or the Gemini match prompt.

---

## Scoring Formula

```
score_final = (score_tematico × 0.7 + score_semantico × 0.3) × 100

score_tematico  = MAX(0, score_raw / score_max)   — normalized 0.0–1.0
score_semantico = pgvector cosine similarity       — 0.0 when no embedding (MVP default)
```

In MVP: `score_semantico = 0` for all candidates → effective formula is `score_final = score_tematico × 70`.

---

## Thematic Score Rules

For each non-neutral user answer on theme T where the candidate has a position:

| User concordância | Candidate posicao | Contribution |
|---|---|---|
| `concordo` | `favoravel` | `+ peso × relevancia × (intensidade / 5)` |
| `concordo` | `contrario` | `− 0.5 × peso × relevancia × (intensidade / 5)` |
| `discordo` | `contrario` | `+ peso × relevancia × (intensidade / 5)` |
| `discordo` | `favoravel` (intensidade ≥ 3) | `− 0.5 × peso × relevancia × (intensidade / 5)` |
| `discordo` | `favoravel` (intensidade < 2) | `0` — weak position, no penalty |
| any | `neutro` | `0` |
| any | no position recorded | `0` — no penalty, no points |

**score_raw** = sum of all contributions  
**score_max** = sum of `(peso × relevancia)` for all non-neutral answers (theoretical maximum if candidate agreed with everything)

**Penalty cap:** score is clamped to 0 minimum — no negative scores are shown, they only affect ordering.

**peso** (voter priority weight) — v2 feature, in MVP all themes default to `peso = 0.6`:
- prioridade 3 (alta) → 1.0
- prioridade 2 (média) → 0.6
- prioridade 1 (baixa) → 0.3

**relevancia** — per theme per office, from `themes_catalog.relevancia_{cargo}`. Examples:
- `privatizacao_estatais` + `governador` → 0.1 (federal topic)
- `privatizacao_estatais` + `presidente` → 1.0
- `seguranca_publica_estadual` + `governador` → 1.0 (state topic)
- `seguranca_publica_estadual` + `presidente` → 0.6

---

## SQL Function

```sql
-- Signature (see base/05_schema_match_algorithm.md for full implementation)
SELECT * FROM calculate_match_scores(
  p_temas    := '[{"theme_id": "uuid", "concordancia": "concordo", "prioridade": 2}]'::JSONB,
  p_estado   := 'SP',
  p_municipio := NULL,
  p_limit    := 50
);
```

**Returns per candidate:** `politician_id`, `nome_urna`, `partido`, `cargo`, `estado`, `score_final` (0–100), `score_tematico`, `score_semantico`, `temas_alinhados` (count), `tem_dados_suficientes`, `tem_alertas`

`tem_dados_suficientes = temas_alinhados >= 2` — candidates below this threshold display "Dados insuficientes — consultar TSE".

---

## Edge Function: `match-candidatos`

Runtime: Deno (Supabase Edge Function). Deployed via Supabase Dashboard or CLI.

**Endpoint:** `POST /functions/v1/match-candidatos`

**Required secrets** (Supabase Dashboard → Edge Functions → Secrets):
- `SERVICE_ROLE_KEY` — to query Supabase with RLS bypassed
- `GEMINI_API_KEY` — for the match prompt call

**Request body:**
```typescript
{
  estado: string                  // UF e.g. "SP"
  municipio: string
  faixaEtaria: string
  respostas: Array<{
    temaSlug: string
    resposta: 1 | 2 | 3 | 4 | 5
    concordancia: 'concordo' | 'neutro' | 'discordo'
    intensidade: 1 | 2 | 3 | 4 | 5
  }>
  sessionToken: string            // crypto.randomUUID() — no user link
  timestamp: string               // ISO 8601
}
```

**Response body:**
```typescript
{
  cargos: Array<{
    cargo: string
    candidatos: Array<{
      politicianId: string
      nomeUrna: string
      partido: string
      score: number               // integer 0–100
      temasAlinhados: string[]    // slugs
      temasDivergentes: string[]  // slugs
      temAlertas: boolean
      alertas: Array<{
        tipo: string
        severidade: string
        titulo: string
        descricao: string
        fonteUrl: string
        badgeCor: 'vermelho' | 'laranja' | 'cinza'
      }>
    }>
  }>
  totalCandidatosAnalisados: number
  estado: string
}
```

**Cargo display order:** presidente → governador → senador → deputado_federal → deputado_estadual  
**Max candidates per cargo:** 5, sorted by score descending.

---

## Gemini Call Inside the Edge Function

```typescript
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`

// POST body
{
  contents: [{ parts: [{ text: userPrompt }] }],
  systemInstruction: { parts: [{ text: systemPrompt }] },
  generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
}

// Extract text
const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
```

**Constraints on Gemini output:**
- Must return valid JSON only — no prose, no markdown, no backticks
- Must NEVER use "vote em", "recomendo", "escolha", or equivalent
- Timeout: 30s — return 500 with Portuguese error message if exceeded

**Gemini is reasoning only** — no grounding (no web search). It reasons exclusively over candidate data fetched from Supabase and passed in the prompt.

---

## Frontend Call Pattern

```typescript
fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/match-candidatos`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify(payload),
})
```
