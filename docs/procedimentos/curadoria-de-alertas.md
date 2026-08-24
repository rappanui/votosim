# Curadoria de alertas

> **Status:** válido · **Atualizado em:** 2026-08-24 18:30
> **Contexto:** como um agente de IA e o desenvolvedor revisam, juntos, os
> alertas que o pipeline de pesquisa deixou pendentes de curadoria humana.
> Leia quando `ingest-research` gravar alertas com `validado = false`, ou
> quando quiser destravar alertas presos na fila. O que cada tipo de alerta
> significa e quais fontes cada um aceita está em
> `docs/referencia/alertas.md` — este procedimento assume aquele documento e
> não o repete.

---

## Por que este procedimento existe

Um alerta pendente **não é um alerta visível sem selo de revisão. Ele é
invisível.**

`v_candidate_alerts` — a única fonte de alertas que a Edge Function lê
(`supabase/functions/match-candidatos/index.ts:145`) — termina com:

```sql
WHERE pa.ativo = true
  AND pa.validado = true
```

(`docs/migracoes/11_sp0_foundation.sql:339-340`, e igual na definição
original preservada em `docs/legado/base/04_schema_alerts.md`.)

Então um alerta com `validado = false` não chega ao frontend, não aparece no
card do candidato, e não existe para o eleitor. Não há nada na tela para
rotular de "em revisão" — não há tela.

**O que isso esconde hoje.** Snapshot de 2026-08-24 18:30 — **48 alertas
pendentes**, e **nenhum** com `validado_por` preenchido: a curadoria nunca
aconteceu uma única vez desde que o pipeline existe.

| tipo | pendentes |
|---|---|
| `polemica` | 28 |
| `investigacao` | 11 |
| `incoerencia` | 6 |
| `divergencia_espectro` | 3 |

**Estes números envelhecem rápido** — subiram de 47 para 48 durante a escrita
deste documento, porque outra ingestão rodava em paralelo. Não confie na
tabela acima: rode o Passo 1 para saber o número de agora. Ela está aqui só
para mostrar a ordem de grandeza e o fato que não muda — a fila nunca foi
trabalhada.

Um exemplo concreto do custo: DR. DANIEL (PODE, governador/PA) tem 6 alertas,
4 deles invisíveis — incluindo ser réu em ação penal por corrupção, lavagem
de dinheiro e organização criminosa (Operação Hades). O eleitor vê dois chips
amarelos de "Ressalva" e mais nada.

## Quem executa, e quando

Dois papéis, na mesma conversa:

- **O agente de IA** monta a fila, apresenta cada alerta com o que é preciso
  para decidir, e aplica a decisão no banco. Nunca decide sozinho.
- **O desenvolvedor** decide aprovar ou rejeitar, e diz por quê. A frase
  dele vira `notas_curador` e fica no registro.

Rode isto depois de uma leva de ingestão (ver
`docs/procedimentos/pesquisa-de-candidato-runbook.md`), ou sempre que a fila
acumular.

## Os três estados

Não existe coluna "rejeitado". O estado é a combinação de dois campos:

| Estado | `validado` | `validado_por` | Efeito |
|---|---|---|---|
| **Pendente** | `false` | `NULL` | Invisível ao eleitor. Sai da base se o candidato for re-ingerido. |
| **Aprovado** | `true` | preenchido | Aparece no card do candidato. Sobrevive à re-ingestão. |
| **Rejeitado** | `false` | preenchido | Continua invisível, mas **permanente**: nunca volta para a fila. |

O que faz a decisão sobreviver é `validado_por`, não `validado`:
`ingest-research.ts:274` só apaga alertas onde `validado_por IS NULL`. Por
isso rejeitar preenchendo `validado_por` é diferente de deixar pendente — o
pendente é recriado do zero na próxima pesquisa, o rejeitado não.

**Não use `ativo = false` para rejeitar.** Esse campo significa "o caso foi
resolvido na vida real" (absolvição, prescrição, anulação) e vem acompanhado
de `resolucao`. Sobrecarregá-lo corromperia a leitura de todos os alertas
resolvidos já gravados — ver a Regra D em `docs/referencia/alertas.md`.

---

## Passo 1 — O agente monta a fila

Grave o script abaixo num arquivo temporário e rode com `tsx`. **Não tente
usar `npx tsx -e`**: este projeto compila para CJS e um `await` de topo falha
com `Top-level await is currently not supported with the "cjs" output
format`. Precisa ser arquivo.

```bash
cd scripts
cat > /tmp/fila-curadoria.ts <<'EOF'
import { supabase } from '/home/rappa/workspaces/rappaTECH/votosim/scripts/lib/supabase.js'

const estado = process.argv.find(a => a.startsWith('--estado='))?.split('=')[1]

async function main() {
  const { data, error } = await supabase
    .from('politician_alerts')
    .select(`id, tipo, severidade, titulo, descricao, fonte_url, fonte_nome,
             politician_id, source_id,
             politicians(nome_urna, candidacies(cargo, estado, partido_eleicao, ano_eleicao))`)
    .eq('validado', false).eq('ativo', true).is('validado_por', null)
  if (error) { console.error(error); return }

  const rows = (data as any[]).map(a => {
    const c = (a.politicians?.candidacies ?? []).find((x: any) => x.ano_eleicao === 2026)
    return { ...a, nome: a.politicians?.nome_urna, cargo: c?.cargo, estado: c?.estado }
  }).filter(r => !estado || r.estado === estado)

  const ids = [...new Set(rows.map(r => r.source_id).filter(Boolean))]
  const camadaById = new Map<string, number>()
  if (ids.length) {
    const { data: srcs } = await supabase.from('candidate_sources').select('id, camada').in('id', ids)
    for (const s of (srcs ?? []) as any[]) camadaById.set(s.id, s.camada)
  }

  console.log(`${rows.length} alerta(s) pendente(s)${estado ? ` em ${estado}` : ''}\n`)
  for (const r of rows) {
    const cam = r.source_id ? camadaById.get(r.source_id) : undefined
    console.log(`${r.id}`)
    console.log(`  ${r.nome} (${r.cargo}/${r.estado})  ${r.tipo} / ${r.severidade}  camada=${cam ?? '-'}`)
    console.log(`  ${r.titulo}`)
    console.log(`  ${r.descricao}`)
    console.log(`  fonte: ${r.fonte_nome ?? '-'} — ${r.fonte_url}\n`)
  }
}
main().catch(e => console.error(e))
EOF
npx tsx /tmp/fila-curadoria.ts --estado=PA   # --estado é opcional
```

Verificado em 2026-08-24: com `--estado=PA` retorna os 5 pendentes do Pará.

## Passo 2 — O agente apresenta cada alerta

Para cada alerta, mostre ao desenvolvedor **tudo isto**, porque sem qualquer
um destes itens ele não tem como decidir:

1. **Candidato, cargo e estado** — para quem esta acusação será atribuída.
2. **`tipo` e `severidade`** — o peso do que se está publicando.
3. **`titulo` e `descricao` inteiros** — nunca resuma. O texto exato é o que
   o eleitor vai ler.
4. **A fonte, com a camada** — `camada=1` é domínio oficial
   (`.gov.br`/`.jus.br`/`.leg.br`/`.mp.br`); `camada=2` é imprensa. Diga qual
   é, e o veículo.
5. **Por que caiu em curadoria** — qual regra o barrou. As causas possíveis
   estão em `isAutoValidated()` (`scripts/ingest-research.ts:90-101`):
   - `polemica`, `incoerencia` e `divergencia_espectro` **nunca** auto-validam,
     seja qual for a fonte;
   - `ficha_suja` e `investigacao` auto-validam **só** com fonte camada 1 e
     matéria não resolvida;
   - matéria resolvida (`resolucao` preenchida) nunca auto-valida, mesmo com
     camada 1 — porque o selo significa "a inelegibilidade é atual".

**O agente não deve recomendar aprovar ou rejeitar.** Ele apresenta os fatos
e a fonte. Se tiver dúvida sobre a fonte, diga a dúvida — não a resolva
sozinho.

## Passo 3 — O desenvolvedor decide

Para cada alerta, o desenvolvedor responde **aprovar** ou **rejeitar**, e o
motivo em uma frase.

Antes de aprovar, **abra a fonte**. Um alerta aprovado vira uma acusação
pública contra uma pessoa real, com o nome dela, no card que o eleitor lê.
Aprovar sem ler a fonte é o único erro deste procedimento que não tem
desfazer social — o dado sai, mesmo que você reverta depois.

Motivos típicos de rejeição:
- a fonte não sustenta a afirmação do `titulo`;
- a fonte é agregador, blog partidário ou site sem expediente editorial;
- é a mesma matéria de outro alerta já aprovado (duplicata);
- o texto tem juízo de valor em vez de fato.

## Passo 4 — O agente aplica a decisão

Um alerta por vez, com o UUID **completo** — `id` é UUID e não aceita
`LIKE` por prefixo (`operator does not exist: uuid ~~ unknown`). Se você só
tem os 8 primeiros caracteres, resolva o id inteiro lendo a fila de novo.

```bash
cd scripts
cat > /tmp/curar-alerta.ts <<'EOF'
import { supabase } from '/home/rappa/workspaces/rappaTECH/votosim/scripts/lib/supabase.js'

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const id = arg('id'), decisao = arg('decisao'), curador = arg('curador'), notas = arg('notas')

async function main() {
  if (!id || !decisao || !curador || !notas) {
    console.error('uso: --id=<uuid> --decisao=aprovar|rejeitar --curador=<nome> --notas="<motivo>"'); process.exit(1)
  }
  if (decisao !== 'aprovar' && decisao !== 'rejeitar') {
    console.error('--decisao precisa ser aprovar ou rejeitar'); process.exit(1)
  }

  const { data: antes } = await supabase.from('politician_alerts')
    .select('id, tipo, severidade, titulo, validado, validado_por, politicians(nome_urna)')
    .eq('id', id).single()
  if (!antes) { console.error('alerta não encontrado'); process.exit(1) }
  const a = antes as any
  if (a.validado_por) { console.error(`já curado por ${a.validado_por} — abortando`); process.exit(1) }

  console.log('='.repeat(64))
  console.log(`CANDIDATO: ${a.politicians?.nome_urna}`)
  console.log(`ALERTA:    ${a.tipo} / ${a.severidade}`)
  console.log(`TÍTULO:    ${a.titulo}`)
  console.log(`DECISÃO:   ${decisao.toUpperCase()}`)
  console.log('='.repeat(64))

  const { error } = await supabase.from('politician_alerts').update({
    validado: decisao === 'aprovar',
    validado_por: curador,
    validado_em: new Date().toISOString(),
    notas_curador: notas,
  }).eq('id', id)
  if (error) { console.error('falhou:', error.message); process.exit(1) }
  console.log(decisao === 'aprovar' ? 'aprovado — passa a aparecer no card' : 'rejeitado — permanece invisível, e não volta para a fila')
}
main().catch(e => console.error(e))
EOF

npx tsx /tmp/curar-alerta.ts \
  --id=83e42584-ea54-42df-a591-796059482cd6 \
  --decisao=aprovar --curador=rappa \
  --notas="TRE-PA confirmado em 4 veículos independentes"
```

O script **imprime o candidato e o título antes de gravar** e **recusa
sobrescrever uma decisão já tomada** (`validado_por` preenchido) — mesma
lógica do eco de identidade do `ingest-research --confirm`, e pela mesma
razão: um UUID digitado errado atribui a decisão ao político errado.

**Para desfazer**, volte os quatro campos ao estado pendente:

```ts
.update({ validado: false, validado_por: null, validado_em: null, notas_curador: null })
```

Verificado em 2026-08-24 com ida e volta numa linha real: os quatro campos
voltaram exatamente ao valor anterior.

## Passo 5 — Conferir

Rode a fila do Passo 1 de novo. Os alertas decididos devem ter sumido dela
(aprovados e rejeitados saem igual, porque a fila filtra
`validado_por IS NULL`).

Para ver o que ficou visível ao eleitor:

```ts
await supabase.from('v_candidate_alerts').select('nome_urna, tipo, severidade, titulo')
  .eq('politician_id', '<uuid>')
```

---

## Armadilha: re-ingerir um candidato curado duplica o alerta

**Mecanismo verificado no código; ainda não observado na prática**, porque
até 2026-08-24 nenhum alerta tinha `validado_por` preenchido. Assim que a
curadoria começar, isto passa a valer.

Quando `ingest-research` roda de novo para um candidato já curado:

1. O delete (`scripts/ingest-research.ts:264-275`) filtra
   `.is('validado_por', null)` e **pula** o alerta curado — correto, é o que
   protege a sua decisão.
2. O insert (`scripts/ingest-research.ts:341`) é incondicional: reinsere
   todos os alertas do JSON, inclusive aquele. Não há upsert, não há
   deduplicação, e a tabela não tem constraint de unicidade — o próprio
   comentário em `:256-258` registra isso.
3. Resultado: **duas linhas para o mesmo alerta** — a sua, curada, e uma
   nova pendente.

Isso não é hipotético para este projeto: re-ingestão acontece de verdade
(HANA GHASSAN e ARACELI foram re-ingeridas em 2026-08-24 depois de uma
segunda rodada de pesquisa, e `docs/referencia/achados-sp0.md` recomenda
refazer outras).

**O que fazer:**

- **Antes de re-ingerir** um candidato, rode a fila e veja se ele tem alerta
  já curado. Se tiver, saiba que vai duplicar.
- **Depois de re-ingerir**, procure duplicatas do mesmo candidato com mesmo
  `tipo` e mesmo `titulo`. A que tem `validado_por` preenchido é a sua; a
  outra é a nova. Decida qual manter — se o texto for idêntico, apague a
  nova; se o texto mudou, a decisão antiga foi sobre outro texto e o alerta
  merece revisão nova.
- Se isso virar rotina, o conserto de verdade é em `ingest-research.ts`:
  antes de inserir, ler os alertas sobreviventes e pular os que já existem.
  Não faça esse conserto no meio de uma curadoria.

## Armadilhas de ferramenta

Duas coisas que já custaram tempo nesta base e vão custar de novo:

- **`npx tsx -e` não funciona aqui.** `await` de topo falha com
  `Top-level await is currently not supported with the "cjs" output format`.
  Escreva um arquivo `.ts` e rode `npx tsx arquivo.ts`.
- **`id` é UUID: `LIKE` por prefixo não funciona.** `.like('id', 'abc%')`
  devolve `operator does not exist: uuid ~~ unknown`. Use sempre o UUID
  inteiro, ou filtre em JavaScript depois de ler a lista.

## Regras que não se quebram

1. **Nunca aprove sem abrir a fonte.** Um alerta aprovado é uma acusação
   pública com o nome de uma pessoa real.
2. **A decisão é do desenvolvedor, não do agente.** O agente apresenta e
   aplica; não recomenda e não decide.
3. **`ficha_suja` e `investigacao` exigem fonte camada 1** para publicar. Se
   a única fonte for imprensa, ou rejeite, ou mantenha pendente até aparecer
   a fonte oficial — não aprove "porque a matéria parece sólida". Foi
   exatamente por isso que os alertas do DR. DANIEL ficaram retidos:
   `.jus.br` estava bloqueado durante a pesquisa (ver
   `docs/referencia/achados-sp0.md`, F15), não porque o fato fosse duvidoso.
4. **Matéria resolvida nunca vira rejeição.** Absolvição, prescrição ou
   anulação se registram com `ativo = false` + `resolucao`, e o alerta fica
   no histórico. Rejeitar apagaria a transparência que a Regra D exige.
5. **`notas_curador` é obrigatório**, nos dois sentidos. A próxima pessoa —
   ou você daqui a três meses — precisa saber por que aquele alerta está
   aprovado ou rejeitado.
6. **Uma decisão por vez, com o UUID completo.** Nada de aprovar em lote por
   `tipo` ou por candidato: o que se está publicando é o texto específico
   daquele alerta.
