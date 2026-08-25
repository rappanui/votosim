# Subir o ambiente local

> **Status:** válido · **Atualizado em:** 2026-08-25 14:10

**Contexto:** Passo a passo para colocar o VotoSim rodando na sua máquina —
o app Next.js contra o Supabase remoto, e, quando necessário, a Edge Function
de match localmente. Leia isto para começar a desenvolver; para saber qual
variável cada peça lê, veja `docs/referencia/variaveis-de-ambiente.md`
(fatos daqui que também aparecem lá citam a fonte). Verificado contra
`README.md` da raiz, `package.json` e `tsconfig.app.json` em 2026-08-24; a
seção de typecheck e build foi reconferida contra `next.config.ts` e uma
execução de `tsc` em 2026-08-25.

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
(`npm run typecheck`) usa `tsc --noEmit -p tsconfig.app.json`, que
**exclui `supabase/`, `scripts/`, `export/` e `modules/`**
(`"exclude": ["node_modules", "supabase", "scripts", "export", "modules"]`).

**O `npm run build` usa o mesmo escopo**, via `typescript.tsconfigPath` no
`next.config.ts`. Sem isso o `next build` cai no `tsconfig.json` da raiz, que
inclui `**/*.ts` excluindo só `node_modules` — e a build quebrava no primeiro
erro de uma pasta que o compilador do Next não governa.

Um `tsc` rodado sobre o projeto inteiro (`npx tsc --noEmit -p tsconfig.json`)
reporta **128 erros**, medidos em 2026-08-25, de três origens — nenhuma delas
um bug a corrigir:

| Origem | Erros | Por quê |
|---|---|---|
| `supabase/functions/` | 104 | Roda em **Deno**: `import ... from "https://deno.land/..."` e o global `Deno`, que o TypeScript do Node não resolve. |
| `scripts/` | 16 | Imports com sufixo `.ts`, além de 2 erros de tipo reais em `ingest-tse.ts`. |
| `modules/ingest-candidates/` | 8 | Também imports com sufixo `.ts`. |

Os sufixos `.ts` **estão corretos onde vivem**: `scripts/` e `modules/` rodam
sob **`tsx`** (`tsx <arquivo>.ts` e `tsx --test *.test.ts`, nos `package.json`
de cada pasta), onde o import precisa do sufixo. Corrigi-los para agradar a
build do Next quebraria a execução real. São mundos de módulo diferentes
(Deno, tsx, bundler do Next) que o projeto deliberadamente não unifica sob um
único `tsc` — daí o escopo, e não uma faxina de imports.

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
