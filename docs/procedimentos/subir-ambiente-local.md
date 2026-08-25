# Subir o ambiente local

> **Status:** válido · **Atualizado em:** 2026-08-24 19:10

**Contexto:** Passo a passo para colocar o VotoSim rodando na sua máquina —
o app Next.js contra o Supabase remoto, e, quando necessário, a Edge Function
de match localmente. Leia isto para começar a desenvolver; para saber qual
variável cada peça lê, veja `docs/referencia/variaveis-de-ambiente.md`
(fatos daqui que também aparecem lá citam a fonte). Verificado contra
`README.md` da raiz, `package.json` e `tsconfig.app.json` em 2026-08-24.

---

## Pré-requisitos

- Node.js instalado — qualquer versão recente, sem pin de versão no projeto.
- Acesso ao projeto Supabase (URL + chaves), em Project Settings → API no
  painel do Supabase.

Não é preciso ter Supabase local nem a CLI do Supabase instalada para rodar
o app — `npm run dev` conecta direto ao Supabase remoto configurado no
`.env.local`. O diretório `supabase/` só é necessário para trabalhar na Edge
Function de matching.

## 1. Instalar as dependências

```bash
npm install
```

## 2. Configurar o `.env.local`

```bash
cp .env.example .env.local
```

Edite `.env.local` e preencha as duas variáveis `NEXT_PUBLIC_*` com os
valores reais do projeto Supabase. Elas bastam para `npm run dev` — sem elas
o app não conecta ao banco. As outras três variáveis, comentadas no
template, só importam para quem também for mexer na Edge Function
localmente (seção 5).

Nomes exatos de cada variável e qual arquivo `.env` cada uma pertence:
`docs/referencia/variaveis-de-ambiente.md` — inclui a armadilha
`SERVICE_ROLE_KEY` × `SUPABASE_SERVICE_ROLE_KEY`, que já confundiu dois
agentes.

## 3. Subir o servidor de desenvolvimento

```bash
npm run dev
```

Abra **http://localhost:3000** — a home redireciona automaticamente para
`/quiz`. Confirme com:

```bash
curl -sL -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

Um `200` confirma que subiu certo.

### Se `/quiz` carregar mas não mostrar candidatos

A base pode estar vazia, ou sem candidatos pesquisados para o cargo/estado
testado. A cobertura de pesquisa aprofundada é baixa hoje — ver
`docs/referencia/visao-geral.md`. Para pesquisar e ingerir candidatos, siga
`docs/procedimentos/pesquisa-de-candidato-runbook.md`.

## 4. Testes e typecheck

```bash
npm test
```

`npm test` roda **`typecheck && jest`** — não só `jest`. O typecheck
(`npm run typecheck`) usa `tsc --noEmit -p tsconfig.app.json`, e
`tsconfig.app.json` **exclui `supabase/`, `scripts/` e `export/`**
(`"exclude": ["node_modules", "supabase", "scripts", "export"]`). Um `tsc`
rodado sobre o projeto inteiro, sem esse escopo, ainda reporta ~127 erros —
todos vindos dos imports por URL que o Deno usa dentro de
`supabase/functions/` (`import { serve } from "https://deno.land/..."`), que
o compilador do TypeScript do Node não sabe resolver. Não são bugs a
corrigir: são dois mundos de módulo diferentes (Deno vs. Node) que o projeto
não tenta unificar sob um único `tsc`.

Para rodar só o typecheck:

```bash
npm run typecheck
```

Os scripts de pipeline (`scripts/`) e a Edge Function (`supabase/functions/`)
têm suítes próprias — ver seções 5 e 6.

## 5. Subir a Edge Function localmente (opcional)

Só necessário se você for alterar `supabase/functions/match-candidatos/`. O
app em si não depende disto — ele fala com a Edge Function já implantada no
Supabase remoto.

```bash
cd supabase/functions
# não há .env.example neste diretório — crie .env (git-ignored) com as três
# variáveis abaixo (docs/referencia/variaveis-de-ambiente.md tem o detalhe
# de nomes: aqui é SERVICE_ROLE_KEY, não SUPABASE_SERVICE_ROLE_KEY):
#   SUPABASE_URL=...
#   SERVICE_ROLE_KEY=...
#   ELECTION_YEAR=2026
bash dev.sh
```

Isso sobe a função em `http://localhost:8000` via Deno (sem Docker). Em
outro terminal:

```bash
bash supabase/functions/test-match.sh SP
```

Dispara um payload de teste (estado `SP` por padrão) e imprime a resposta
formatada com `jq`. Derrube o servidor (`Ctrl+C` no terminal do `dev.sh`)
quando terminar.

## 6. Rodar as suítes de teste completas

```bash
# App Next.js
npm test && npm run lint

# Scripts de pipeline
cd scripts && npm test

# Edge Function
cd supabase/functions/match-candidatos && deno test --allow-env
```

## 7. Pesquisar candidatos (opcional)

Fora do caminho de requisição do eleitor. Ver
`docs/procedimentos/pesquisa-de-candidato-runbook.md` para o passo a passo
operacional, e `docs/referencia/pipeline-de-pesquisa.md` para a visão de
conjunto do pipeline.
