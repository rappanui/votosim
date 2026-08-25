# Variáveis de ambiente

> **Status:** válido · **Atualizado em:** 2026-08-24 19:10
> **Contexto:** toda variável de ambiente que o código lê **hoje**, depois da
> Fase A ter removido a pilha de IA de terceiros. Apurado com
> `grep -rhoE "(process\.env|Deno\.env\.get\()[A-Za-z_.']+"` sobre `src/`,
> `scripts/` e `supabase/functions/`, e confirmado lendo cada arquivo que a
> lê. Nenhuma chave de IA aparece — se aparecer no futuro, a Fase A regrediu.

---

## As cinco variáveis

| Variável | Quem lê | Onde |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | App Next.js (browser) | `src/lib/supabase.ts`, `src/app/resultados/page.tsx` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App Next.js (browser) | `src/lib/supabase.ts`, `src/app/resultados/page.tsx` |
| `SUPABASE_URL` | Edge Function e scripts | `supabase/functions/match-candidatos/index.ts` (`Deno.env.get`), `scripts/lib/supabase.ts` (`process.env`) |
| `SERVICE_ROLE_KEY` | Edge Function e scripts | mesmos dois arquivos acima |
| `ELECTION_YEAR` | Edge Function e a maioria dos scripts de ingestão | `index.ts` (default `'2026'` se ausente); `download-tse.ts`, `ingest-tse.ts`, `ingest-alerts.ts`, `ingest-camara-votes.ts`, `ingest-senado-votes.ts`, `check-coverage.ts`, `bootstrap-ledger.ts`, `verify-sp0.ts` (todos exigem a variável, sem default) |

`NEXT_PUBLIC_*` é exposto ao navegador de propósito — é a chave anônima,
protegida por RLS no banco, não a chave de serviço.

## A armadilha de nome: `SERVICE_ROLE_KEY` × `SUPABASE_SERVICE_ROLE_KEY`

**`scripts/lib/supabase.ts` lê `SERVICE_ROLE_KEY`.** O `.env.local` da raiz do
projeto (usado pelo app e por `scripts/verify-contract.ts`, que carrega esse
arquivo explicitamente) usa `SUPABASE_SERVICE_ROLE_KEY` — mesmo valor, nome
diferente. **Já custou tempo a dois agentes** que assumiram serem a mesma
variável. Não são: são dois arquivos `.env` distintos, cada um com seu próprio
nome para a mesma credencial.

| Arquivo | Variável da chave de serviço |
|---|---|
| `scripts/.env` (lido por `scripts/lib/supabase.ts` via `dotenv/config`) | `SERVICE_ROLE_KEY` |
| `.env.local` na raiz (lido pelo Next.js, e por `scripts/verify-contract.ts` via `dotenv` apontado explicitamente para esse caminho) | `SUPABASE_SERVICE_ROLE_KEY` |
| `supabase/functions/.env` (Edge Function local, `./dev.sh`) | `SERVICE_ROLE_KEY` |

Ao copiar uma chave de um `.env` para outro, **troque o nome da variável**,
não só o valor.

## Onde cada `.env` vive

| Arquivo | Escopo | Runtime |
|---|---|---|
| `.env.local` (raiz, git-ignored) | App Next.js | `npm run dev` |
| `scripts/.env` (git-ignored) | Scripts de pipeline | `tsx` (Node) |
| `supabase/functions/.env` (git-ignored) | Edge Function local | `./dev.sh` (Deno) |

`.env.example`, na raiz e versionado, documenta as duas variáveis
`NEXT_PUBLIC_*` como as únicas necessárias para `npm run dev`, e lista as
outras três (comentadas) só para quem também mexe na Edge Function
localmente.

## O que foi removido

`GROQ_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`,
`AI_PROVIDER_ORDER`, `GROQ_MODEL`, `CEREBRAS_MODEL`, `DEEPSEEK_MODEL` —
lidas pela pilha de provedores de IA apagada na Fase A
(`docs/referencia/visao-geral.md`). Nenhum código hoje as lê; se um `.env`
antigo ainda as tiver, revogue as chaves nos painéis dos provedores em vez de
só apagar a linha — o arquivo é git-ignored e nunca foi a fonte de verdade da
credencial.
