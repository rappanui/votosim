# VotoSim — Runbook de pesquisa de candidato

> **Status:** válido · **Atualizado em:** 2026-08-24 20:45
> **Contexto:** este é o passo a passo do operador para rodar o pipeline de
> pesquisa por candidato de ponta a ponta — de escolher o próximo candidato
> da fila até uma gravação confirmada no banco. Leitor: uma pessoa (o
> operador que dispara e acompanha o pipeline). Leia isto quando estiver de
> fato rodando o pipeline. Leia `docs/procedimentos/pesquisa-de-candidato.md`
> em vez deste quando precisar das regras de conteúdo que o agente de
> pesquisa segue (os cinco estágios, as camadas de fonte, a armadilha de
> enquadramento, o contrato de saída) — este documento pressupõe aquele e não
> o repete.

Todos os comandos abaixo rodam a partir de `scripts/`.

---

## 1. Escolha o próximo candidato

```
npm run next-candidates -- --limit=10
```

Lista candidaturas com trabalho de enriquecimento pendente, na ordem de
`v_enrichment_queue` (presidentes primeiro, depois por estado, depois por
tier e viabilidade). Uma linha marcada `NEVER SEEDED` não tem nenhuma linha
em `enrichment_ledger` — rode `npm run bootstrap-ledger` antes de pesquisá-la,
ou `ingest-research` vai rejeitar a execução no final com "no ledger rows"
(ver passo 4).

Acrescente `--cargo=presidente` (ou outro cargo) para filtrar.

Escolha um `tse_sequencial` da lista.

## 2. Monte o brief

```
npm run build-brief -- <tse_sequencial>
```

Lê o material oficial do candidato (PDF do plano de governo, quando
protocolado; contas sociais declaradas; os 14 temas do questionário, com a
afirmação de cada um e o contexto que a desambigua) do Supabase e dos
extratos de dados do TSE, e grava:

```
data/briefs/<tse_sequencial>.md
```

Este é todo o input que o agente de pesquisa recebe. Não contém nada que o
agente precise procurar em outro lugar, e nada que ele não precise.

## 3. Rode o agente de pesquisa

Dispare o agente de pesquisa — seguindo os cinco estágios (E1–E5) de
`docs/procedimentos/pesquisa-de-candidato.md` — com `data/briefs/<tse_sequencial>.md`
como input. O agente grava o documento de saída em:

```
data/research/<tse_sequencial>.json
```

O documento precisa bater exatamente com o formato definido em
`modules/ingest-candidates/src/lib/research-contract.ts`: os 14 temas, toda posição e todo alerta
com fonte, `tseSequencial` definido para o candidato para o qual você acabou
de montar o brief.

O disparo do agente também retorna dois números que você vai precisar no
passo 4:
- **tokens** — total de tokens consumidos pela execução
- **duration** — tempo de parede em milissegundos

Esses números alimentam a medição de custo por candidato do piloto
instrumentado. O próprio agente não tem como saber nenhum dos dois números —
só a camada de disparo sabe — então eles são fornecidos pelo operador, não
pela saída do próprio agente.

## 4. Ingira

```
npm run ingest-research -- data/research/<tse_sequencial>.json --confirm --tokens=<N> --duracao-ms=<N>
```

`--tokens` e `--duracao-ms` são os dois números do passo 3. Ambos são
opcionais — omita qualquer um deles se a camada de disparo não o reportou —
mas inclua-os sempre que disponíveis; são a única fonte desse dado para a
medição de custo do piloto, e uma vez omitidos não podem ser reconstruídos
depois.

### O passo de confirmação

`ingest-research` primeiro valida o documento, depois resolve
`tseSequencial` contra `candidacies` e imprime a identidade resolvida com
destaque, antes de gravar qualquer coisa:

```
================================================================
[ingest-research] RESOLVED CANDIDATE: <nome_urna>
[ingest-research] CARGO: <cargo>   ESTADO: <estado>
[ingest-research] tseSequencial <sequencial> -> candidacy <uuid>
================================================================
```

**Pare e confira esta linha contra o dossiê que você produziu antes de
confirmar.** `tseSequencial` é copiado à mão pelo agente para o JSON; um
dígito transposto resolve para um político real diferente, e tudo a partir
daí — inclusive um alerta `ficha_suja` — é atribuído a quem quer que ele
resolva. Este é o único ponto em que um humano de fato verifica a
correspondência; não há checagem a jusante.

Rode o comando **sem** `--confirm` primeiro se quiser ver essa resolução e as
contagens que seriam gravadas (fontes / posições / alertas) sem tocar no
banco de dados de forma alguma — ele imprime o mesmo banner de identidade,
depois sai com código 0 sem ter gravado nada. Assim que o candidato impresso
bater com o assunto do dossiê, rode de novo com `--confirm` para de fato
gravar.

### Se a ingestão falhar na validação

`ingest-research` roda `validateResearch()` antes de resolver a candidatura
ou tocar no banco de dados. Em caso de falha, imprime todo problema
encontrado — não só o primeiro — e sai com código diferente de zero:

```
[ingest-research] N validation error(s) — nothing was written:
  - posicoes: missing themes autonomia_individual, laicidade_valores
  - alertas[0] (T).severidade: invalid
  ...
```

**Nada foi gravado.** Corrija o JSON em
`data/research/<tse_sequencial>.json` — normalmente enviando os erros de
volta ao agente de pesquisa para que ele corrija a própria saída — e rode de
novo o mesmo comando `ingest-research`. Não há estado parcial para limpar: a
validação acontece antes de qualquer chamada ao banco.

### Se a ingestão falhar depois de `--confirm`

Uma falha depois deste ponto (um erro de banco de dados, um processo que
travou) deixa as linhas de `enrichment_ledger` da candidatura em
`em_progresso` em vez de reverter ao que eram antes — isso é deliberado, para
que o candidato continue visível em `v_enrichment_queue` em vez de sumir
silenciosamente. Rodar `ingest-research` de novo com o mesmo JSON (uma vez
corrigido o problema de origem) retoma de onde parou; rodar de novo é sempre
seguro, já que cada execução substitui a pesquisa anterior do próprio
candidato em vez de duplicá-la.

## 5. Verifique

```
npm run next-candidates -- --limit=10
```

O candidato que você acabou de ingerir não deve mais aparecer (a menos que
um estágio estivesse `nao_aplicavel` e tenha permanecido assim, o que é
correto — ver `docs/referencia/schema-adicoes-sp0.md`).
