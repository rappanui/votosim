# Ordem de deploy

> **Status:** válido · **Atualizado em:** 2026-08-24 19:10

**Contexto:** A ordem obrigatória para publicar uma mudança que envolve banco,
Edge Function e app — e por que invertê-la quebra de formas diferentes.
Leia isto antes de aplicar uma migração ou publicar `match-candidatos`.
Verificado contra `supabase/functions/match-candidatos/index.ts`,
`scripts/verify-contract.ts` e `scripts/base-invariants.test.ts` em
2026-08-24; o estado "está tudo implantado" abaixo foi confirmado rodando os
comandos desta página nessa mesma data, não copiado de documentação
anterior.

---

## A ordem

```
1. Migração SQL (SQL Editor do Supabase)
2. Deploy da Edge Function (match-candidatos)
3. cd scripts && npm run verify-contract
4. Deploy do app (Next.js)
```

O projeto **não tem diretório de migrations** nem CLI do Supabase no fluxo —
as migrações em `docs/migracoes/*.sql` rodam **à mão, no SQL Editor do
painel do Supabase**. `docs/migracoes/` guarda o que foi aplicado, não
automatiza a aplicação.

## Por que esta ordem, e como cada inversão quebra

**Migração antes da Edge Function.** `index.ts` seleciona `neutro_motivo`
incondicionalmente (`supabase/functions/match-candidatos/index.ts:114`) —
sem a coluna no banco, **toda submissão do quiz retorna 500**. Não é uma
degradação parcial: a função inteira para de responder.

**Edge Function antes do app.** O app valida a resposta em
`src/lib/contract.ts` (`assertMatchResult`, documentado em
`docs/referencia/frontend.md`) antes de renderizar qualquer coisa. Se o app
novo (que espera os campos do contrato v3) rodar contra uma função antiga
(que ainda não os devolve), `assertMatchResult` lança
`ContractMismatchError` e `/resultados` mostra o estado de **contrato
desatualizado** — uma recusa legível, sem percentual nenhum na tela. É
exatamente o comportamento que existe desde que, em 2026-08-24, a ordem
inversa produziu 90% de afinidade para um candidato documentado em 5 de 14
temas, sem nada detectar.

**A app não detecta uma Edge Function desatualizada sozinha em produção** —
só quando um usuário real bate nela e vê o estado de contrato desatualizado.
É para isso que o passo 3 existe.

## O passo 3 não é opcional: `npm run verify-contract`

```bash
cd scripts
npm run verify-contract
```

Dispara um payload de quiz real contra a Edge Function **já implantada** (lê
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` do `.env.local` da
raiz — as mesmas variáveis que o app usa, não `scripts/.env`) e falha se:

- **faltar campo** — qualquer um dos nove campos que `assertMatchResult`
  exige, mais `temaNome`, `evidencia`, `neutroMotivo`, `justificativa` no
  detalhe de tema;
- **a identidade da linha de auditoria não fechar** — `alinhamento` precisa
  bater com `confiança · apurado + (1 − confiança) · 10` dentro de
  tolerância ±1, para todo candidato da resposta;
- **responder o scorer antigo** — nenhum candidato sub-coberto pode ter
  `alinhamento === alinhamentoApurado` (isso só acontece se a penalização por
  tema não auditado não estiver sendo aplicada, ou seja, se a função ainda
  for a pré-v3).

Rode **depois de implantar a Edge Function e antes de implantar o app**. Uma
falha aqui significa não seguir para o passo 4.

## `base-invariants.test.ts` — trava seis invariantes do banco ao vivo

```bash
cd scripts
npx tsx --test base-invariants.test.ts
```

Não é parte da sequência de deploy acima — roda contra o banco de produção a
qualquer momento, não só ao redor de um deploy — mas mora no mesmo grupo de
verificação porque, como `verify-contract`, testa o sistema ao vivo, não uma
mock. Fixa seis invariantes (toda `politician_positions` com
`justificativa` não vazia; todo `neutro` com `confianca_ia <= 0.5`;
`neutro_motivo` válido e nulo apenas em linhas não-neutras; toda `camada` de
`candidate_sources` em {1,2,3}; a versão mais recente de cada
`candidate_dossiers` com `resumo_perfil` não vazio; todo
`v_candidate_alerts` com `fonte_url` não vazio). Uma falha aqui é um achado
sobre os dados (ou uma regressão de ingestão) — nunca afrouxe uma checagem
deste arquivo para fazê-la passar.

## Estado atual (verificado em 2026-08-24, vai desatualizar)

**Migração e Edge Function estão implantadas e em acordo com o app.**
`npm run verify-contract` foi executado nesta data e **passou**: forma
completa presente, identidade da linha de auditoria fechando, penalização
aplicada. `npx tsx --test base-invariants.test.ts` também passou, 6 de 6.
Isto substitui uma afirmação anterior (de mais cedo em 2026-08-24) de que
nada estava implantado e o verificador falhava — o deploy aconteceu no
intervalo. **Confira de novo rodando os dois comandos acima antes de confiar
nesta seção**; ela é sobre um estado operacional, não sobre o código, e
muda sem passar por commit.
