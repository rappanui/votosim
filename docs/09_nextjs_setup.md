# VotoSim — Next.js 15 Project Setup

**Context:** How to scaffold and configure the VotoSim frontend. Read this before writing any frontend code. Covers project creation, dependencies, environment variables, Supabase client, TypeScript interfaces, state management, and folder structure.

---

## Project Creation

Run in WSL2 terminal inside the workspace directory:

```bash
npx create-next-app@latest votosim \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-turbopack
```

---

## Dependencies

```bash
cd votosim
npm install @supabase/supabase-js @supabase/ssr
```

- `@supabase/supabase-js` — Supabase query client
- `@supabase/ssr` — proper Next.js App Router integration (avoids hydration mismatches)

---

## Environment Variables

Create `.env.local` at project root (never commit this file):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Get values from: Supabase Dashboard → Project Settings → API.

> `NEXT_PUBLIC_` prefix exposes the variable to the browser bundle. Only anon key and URL get this prefix. `SERVICE_ROLE_KEY` and `GEMINI_API_KEY` never go in `.env.local` — they live only as Supabase Edge Function secrets.

---

## Supabase Browser Client

Create `src/lib/supabase.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Usage in any client component:

```typescript
'use client'
import { createClient } from '@/lib/supabase'

const supabase = createClient()
const { data } = await supabase
  .from('themes_catalog')
  .select('id, slug, nome, afirmacao_questionario, contexto_questionario, nota_educativa')
  .eq('exibir_no_quiz', true)
  .order('ordem_exibicao')
```

---

## TypeScript Interfaces

Create `src/lib/types.ts`:

```typescript
export interface RespostaUsuario {
  temaSlug: string
  resposta: 1 | 2 | 3 | 4 | 5
  concordancia: 'concordo' | 'neutro' | 'discordo'
  intensidade: 1 | 2 | 3 | 4 | 5
}

export function derivarConcordancia(resposta: number): RespostaUsuario['concordancia'] {
  if (resposta <= 2) return 'discordo'
  if (resposta === 3) return 'neutro'
  return 'concordo'
}

export interface PerfilUsuario {
  estado: string          // e.g. "SP"
  municipio: string
  faixaEtaria: string
  respostas: RespostaUsuario[]
  sessionToken: string    // crypto.randomUUID() — no user link
  timestamp: string       // ISO 8601
}

export interface Alerta {
  tipo: 'ficha_suja' | 'investigacao' | 'polemica'
  severidade: 'critica' | 'alta' | 'media' | 'baixa'
  titulo: string
  descricao: string
  fonteUrl: string
  badgeCor: 'vermelho' | 'laranja' | 'cinza'
}

export interface CandidatoResultado {
  politicianId: string
  nomeUrna: string
  partido: string
  score: number            // 0–100
  temasAlinhados: string[] // theme slugs
  temasDivergentes: string[]
  temAlertas: boolean
  alertas: Alerta[]
}

export interface CargoResultado {
  cargo: string
  candidatos: CandidatoResultado[]
}

export interface MatchResult {
  cargos: CargoResultado[]
  totalCandidatosAnalisados: number
  estado: string
}
```

---

## Quiz State Management

All quiz pages share state via React Context. Create `src/context/QuizContext.tsx`:

```typescript
'use client'
import { createContext, useContext, useState, ReactNode } from 'react'
import { PerfilUsuario, RespostaUsuario } from '@/lib/types'

interface QuizState {
  perfil: Partial<Omit<PerfilUsuario, 'respostas' | 'sessionToken' | 'timestamp'>>
  respostas: RespostaUsuario[]
  setPerfil: (p: Partial<QuizState['perfil']>) => void
  setResposta: (r: RespostaUsuario) => void
  resetQuiz: () => void
}

const QuizContext = createContext<QuizState | null>(null)

export function QuizProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<QuizState['perfil']>({})
  const [respostas, setRespostas] = useState<RespostaUsuario[]>([])

  function setResposta(nova: RespostaUsuario) {
    setRespostas(prev => [...prev.filter(r => r.temaSlug !== nova.temaSlug), nova])
  }

  function resetQuiz() { setPerfil({}); setRespostas([]) }

  return (
    <QuizContext.Provider value={{ perfil, respostas, setPerfil, setResposta, resetQuiz }}>
      {children}
    </QuizContext.Provider>
  )
}

export function useQuiz() {
  const ctx = useContext(QuizContext)
  if (!ctx) throw new Error('useQuiz must be inside QuizProvider')
  return ctx
}
```

Wrap the root layout: `src/app/layout.tsx` wraps `{children}` with `<QuizProvider>`.

> Because `QuizProvider` uses hooks, it must be a separate `'use client'` file — not inline in `layout.tsx`, which is a server component.

---

## Folder Structure

```
src/
  app/
    layout.tsx              # Root layout: Inter font, QuizProvider, Header, Footer
    page.tsx                # Redirect → /inicio
    globals.css             # Tailwind imports only
    inicio/page.tsx
    perfil/page.tsx
    questionario/page.tsx
    revisao/page.tsx
    resultado/page.tsx
    sobre/page.tsx
  components/
    Header.tsx              # Fixed top bar with logo; shows ProgressBar during quiz
    Footer.tsx              # Disclaimer text + link to /sobre
    ProgressBar.tsx         # "Pergunta X de 14" — prop-driven
    CandidatoCard.tsx       # Score bar, theme breakdown, alert badges
    AlertaBadge.tsx         # Colored badge per alert type
  lib/
    supabase.ts             # Browser client factory
    types.ts                # All TypeScript interfaces (above)
  context/
    QuizContext.tsx         # Shared quiz state across pages
```

---

## Design Tokens (tailwind.config.ts)

```typescript
theme: {
  extend: {
    colors: {
      primary:   '#1A3A5C',   // header, primary text
      highlight: '#1A56A0',   // buttons, links, progress bar
      success:   '#3B6D11',   // concordo, positive alignment
      warning:   '#854F0B',   // medium alert badge
      danger:    '#A32D2D',   // discordo, critical alert badge, ficha suja
    },
    fontFamily: {
      sans: ['Inter', 'sans-serif'],
    },
  },
}
```

Add Inter to `layout.tsx`:
```typescript
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'] })
```

---

## Running Locally

```bash
npm run dev   # http://localhost:3000
```

---

## Deploy to Vercel

1. Push repository to GitHub
2. Import project at vercel.com (New Project → Import Git Repository)
3. Add environment variables in Vercel Dashboard → Settings → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploys automatically on every push to `main`

> The Supabase Edge Function secrets (`SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) are configured in Supabase Dashboard → Edge Functions → Secrets — not in Vercel.
