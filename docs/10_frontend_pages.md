# VotoSim — Frontend Pages Specification

**Context:** Implementation guide for all 6 MVP pages and shared components. Read alongside `09_nextjs_setup.md`. Every page is a client component (`'use client'`) and accesses quiz state via `useQuiz()`. Root layout wraps all pages with `Header`, `Footer`, and `QuizProvider`.

---

## Visual Identity

```
Primary blue:    #1A3A5C   header background, logo
Highlight blue:  #1A56A0   buttons, progress bar, links
Background:      #FFFFFF / #F4F4F4 (sections)
Text:            #222222
Success green:   #3B6D11   concordo, high alignment (80–100%)
Warning orange:  #854F0B   medium alert badge, mid alignment (40–59%)
Danger red:      #A32D2D   discordo, critical alert, ficha suja
Font:            Inter (Google Fonts)
```

Mobile-first — every layout must work correctly at 375px width.

---

## Shared Components

### `Header.tsx`
- Fixed top bar, full width, primary blue background
- Logo "VotoSim" in white on the left
- Shows `<ProgressBar current={n} total={14} />` only on `/questionario`
- No navigation links — avoids distraction during quiz flow

### `Footer.tsx`
- Present on all pages
- Text: *"O VotoSim é uma ferramenta informativa. Não somos filiados a partidos políticos. A decisão de voto é exclusivamente do eleitor."*
- Link to `/sobre`

### `ProgressBar.tsx`
- Props: `current: number`, `total: number`
- Shows "Pergunta {current} de {total}"
- Visual fill bar in highlight blue proportional to `current / total`

### `CandidatoCard.tsx`
- Props: `candidato: CandidatoResultado`, `temas: Record<string, string>` (slug → name map)
- Score bar color: green (80–100), blue (60–79), yellow (40–59), gray (<40)
- Collapsible "Ver detalhes" section with aligned themes (✓ green) and divergent themes (✗ red)
- Alert badges rendered via `<AlertaBadge />`

### `AlertaBadge.tsx`
- Props: `alerta: Alerta`
- `ficha_suja` → red badge "Ficha suja"
- `investigacao` → orange badge "Em investigação"
- `polemica` → gray badge "Atenção"
- Click expands: shows `titulo`, `descricao`, and link to `fonteUrl`

---

## /inicio

**Data:** None — static content only.

**Layout:**
- Badge "Eleições Gerais 2026" top-right
- Headline: *"Descubra quais candidatos pensam como você"*
- Subtitle: *"Responda 14 perguntas sobre temas que importam para você e veja quais candidatos têm propostas alinhadas com seus valores — sem indicação de voto."*
- 3 feature cards side by side (stacked on mobile):
  - 📋 "Responda o questionário — 14 perguntas sobre temas políticos reais"
  - 📊 "Veja o alinhamento — candidatos do seu estado por percentual de alinhamento"
  - 🛡 "Sem recomendação de voto — a decisão é sempre sua"
- CTA button "Começar" → `/perfil`
- Caption below button: *"Não coletamos dados pessoais. Suas respostas não são salvas."*

---

## /perfil

**Data:** None from DB — static form.

**State written:** `setPerfil({ estado, municipio, faixaEtaria })`.

**Layout:**
- Title: "Onde você vota?"
- Subtitle: "Essas informações definem quais candidatos aparecem no seu resultado."
- Select: Estado (27 UFs in format "SP — São Paulo")
- Input: Município (free text, placeholder "Digite seu município")
- Select: Faixa etária
  - "16 a 17 anos (voto facultativo)"
  - "18 a 24 anos" / "25 a 34 anos" / "35 a 44 anos" / "45 a 59 anos" / "60 anos ou mais"
- "Continuar" button — **disabled until all 3 fields are filled** → `/questionario`
- "Voltar" button → `/inicio`

---

## /questionario

**Data from Supabase** (load once on mount, then cache locally):
```typescript
const { data: themes } = await supabase
  .from('themes_catalog')
  .select('id, slug, nome, afirmacao_questionario, contexto_questionario, nota_educativa')
  .eq('exibir_no_quiz', true)
  .order('ordem_exibicao')
```

**State read:** `respostas` (to pre-fill slider when navigating back).  
**State written:** `setResposta({ temaSlug, resposta, concordancia, intensidade })`.

**Layout (one question at a time, smooth transition between questions):**
- Current theme name + "Pergunta X de 14" (also reflected in Header ProgressBar)
- `afirmacao_questionario` as large statement (font-size large, font-weight medium)
- Collapsible "Saiba mais" → expands `contexto_questionario` (closed by default)
- ⓘ icon → tooltip with `nota_educativa` (which office is responsible for this theme)
- Slider 1–5 with labeled ticks:
  - 1 — Discordo totalmente · 2 — Discordo parcialmente · 3 — Não tenho opinião formada
  - 4 — Concordo parcialmente · 5 — Concordo totalmente
  - **Starts with no value selected** (thumb not visible until user interacts)
- "Pular esta pergunta" → registers `{ resposta: 3, concordancia: 'neutro' }` and advances
- "Próxima" → **enabled only after slider moved** → advances to next question
- "Voltar" → returns to previous question (state preserved)
- After question 14 → navigate to `/revisao`

**concordancia derivation:**
```typescript
// from src/lib/types.ts
resposta <= 2 → 'discordo'
resposta === 3 → 'neutro'
resposta >= 4  → 'concordo'
```

---

## /revisao

**Data:** None from DB — uses `respostas` and `themes` from context/cache.

**State read:** `respostas` (all 14, including neutro).

**Layout:**
- Title: "Revise suas respostas"
- Subtitle: "Você pode alterar qualquer resposta antes de ver os candidatos."
- List of all 14 themes, each row shows:
  - Theme name + answer text ("Concordo totalmente", "Pulei", etc.)
  - Row background: light red (discordo), light gray (neutro), light green (concordo)
  - "Alterar" button → navigates to `/questionario` at that specific question index
- Counter: "X de 14 temas respondidos, Y pulados"
- Warning if fewer than 3 non-neutral: *"Responda pelo menos mais X pergunta(s) para uma análise mais precisa"*
- "Ver candidatos alinhados" — **disabled if fewer than 3 non-neutral answers** → `/resultado`
- "Voltar ao questionário" → `/questionario` (last answered question)

---

## /resultado

**Data:** POST to Supabase Edge Function on page load.

**Edge Function call:**
```typescript
'use client'
import { useEffect, useState } from 'react'
import { useQuiz } from '@/context/QuizContext'
import { MatchResult, PerfilUsuario } from '@/lib/types'

export default function ResultadoPage() {
  const { perfil, respostas } = useQuiz()
  const [result, setResult] = useState<MatchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const payload: PerfilUsuario = {
      estado: perfil.estado!, municipio: perfil.municipio!, faixaEtaria: perfil.faixaEtaria!,
      respostas: respostas.filter(r => r.concordancia !== 'neutro'),
      sessionToken: crypto.randomUUID(), timestamp: new Date().toISOString(),
    }

    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/match-candidatos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setResult)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])
  // ...
}
```

**Layout:**
- Loading: spinner + *"Analisando candidatos do seu estado..."*
- Header: *"Candidatos mais alinhados com você em [Estado]"*
- Subheader: *"Resultado baseado nas suas X respostas — percentual indica alinhamento temático, não é recomendação de voto."*
- Candidates grouped by office, displayed in this order: presidente → governador → senador → deputado_federal → deputado_estadual
- Each office section: title + one-line description of the office's responsibilities + up to 5 `<CandidatoCard>` items
- "Compartilhar resultado" button:
  - Mobile: Web Share API
  - Desktop: copies URL with message *"Fiz o questionário do VotoSim e descobri meu perfil político. Faça o seu também: [URL]"*
- Error state: *"Não foi possível carregar os candidatos. Tente novamente."* + retry button
- Empty state: *"Ainda não temos candidatos cadastrados para este estado. Volte em breve."*

**Alert badge colors (from `v_candidate_alerts`):**
- `ficha_suja` → red — "Ficha suja"
- `investigacao` → orange — "Em investigação"
- `polemica` → gray — "Atenção"

---

## /sobre

**Data:** None — static content.

**Layout:**
- Title: "Sobre o VotoSim"
- Section "O que é": free informational tool, no vote recommendation
- Section "Como funciona": questionnaire + thematic alignment calculation description
- Section "De onde vêm os dados": clickable links to:
  - dadosabertos.tse.jus.br
  - divulgacandcontas.tse.jus.br
  - dadosabertos.camara.gov.br
  - dadosabertos.senado.leg.br
- Section "Privacidade": no personal data collected, no saved answers

**Legal disclaimer block** (bordered in highlight blue):
> *"O VotoSim é uma ferramenta de informação. Não somos filiados a partidos políticos, candidatos ou organizações político-partidárias. O percentual de alinhamento é um indicador informativo baseado em dados públicos — não constitui recomendação, sugestão ou indução de voto. A decisão de voto é exclusivamente do eleitor. Esta ferramenta está alinhada à Resolução TSE nº 23.755/2026."*

- CTA button "Começar o questionário" → `/inicio`
