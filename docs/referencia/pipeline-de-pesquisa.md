# Pipeline de pesquisa

> **Status:** válido · **Atualizado em:** 2026-08-24 19:10
> **Contexto:** visão de conjunto de como um candidato sai de "só dados do
> TSE" para ter posições, alertas e dossiê no banco — os estágios, os scripts
> que os conectam, e o que a validação recusa. Não é o passo a passo; para
> executar, use `docs/procedimentos/pesquisa-de-candidato-runbook.md`
> (comandos) e `docs/procedimentos/pesquisa-de-candidato.md` (regras de
> conteúdo que o agente de pesquisa segue). Verificado contra
> `scripts/package.json`, `scripts/lib/research-contract.ts`,
> `scripts/lib/ledger.ts` e `scripts/ingest-research.ts` em 2026-08-24.

---

## O fluxo

```
next-candidates → claim-candidate → build-brief → agente Claude Code → ingest-research
```

1. **`next-candidates`** lista candidaturas com trabalho pendente, na ordem
   de `v_enrichment_queue` (presidente primeiro, depois por estado, tier e
   viabilidade).
2. **`claim-candidate`** marca as etapas `dossie` e `posicoes` daquela
   candidatura como `em_progresso` em `enrichment_ledger` — sinal de
   cortesia para quem mais estiver rodando o pipeline, não um lock real.
3. **`build-brief`** lê o material oficial do candidato (plano de governo,
   quando existe; redes declaradas; os 14 temas do questionário com
   afirmação e contexto) e escreve `data/briefs/<tse_sequencial>.md` — é
   **todo** o insumo que o agente recebe.
4. O **agente de pesquisa** (Claude Code, seguindo
   `docs/procedimentos/pesquisa-de-candidato.md`) lê o brief e escreve
   `data/research/<tse_sequencial>.json`, no formato que
   `scripts/lib/research-contract.ts` define.
5. **`ingest-research`** valida esse JSON, resolve o `tseSequencial` contra
   `candidacies`, imprime a identidade resolvida para conferência humana, e
   só então grava.

`scripts/lib/ledger.ts` controla o estado: cinco etapas por candidatura
(`documentos_oficiais`, `ficha_limpa`, `noticias`, `dossie`, `posicoes`),
cada uma `pendente | em_progresso | concluido | falhou | nao_aplicavel`.
`nao_aplicavel` é atribuído na criação — candidaturas fora de escopo
(`tier = 'fora_escopo'`), ou `documentos_oficiais` para cargos que não
arquivam plano de governo (só `presidente` e `governador` o fazem) — para
não aparecerem depois como falha.

## O que `validateResearch` recusa

Roda antes de qualquer resolução de candidato ou escrita no banco, e reporta
**todos** os problemas de uma vez, não só o primeiro — o objetivo é o agente
corrigir tudo em uma rodada:

- Toda fonte precisa de `ref` único, `url` http(s) única, `camada` (1/2/3) e
  `tipo` válidos; `camada 1` exige domínio oficial (`.jus.br`, `.gov.br`,
  `.leg.br`, `.mp.br`) — sem isso, um agente poderia autodeclarar qualquer
  site como fonte oficial.
- As **14 posições são obrigatórias**: falta de qualquer slug do
  questionário é erro (`posicoes: missing themes ...`).
- Toda posição e todo alerta precisa citar pelo menos uma fonte já
  declarada, e pelo menos uma dessas fontes precisa ser visível ao eleitor
  (`destinoExibicao` em `card_candidato` ou `pagina_sobre`) — uma fonte só
  `interno` não sustenta uma afirmação pública (regra D8).
- Um alerta `polemica` exige duas fontes camada 2 independentes ou uma
  camada 1 (regra D9) — é o tipo de alerta mais sujeito a viés.

## `ingest-research`: apaga e reescreve, não faz upsert

Cada re-ingestão de um candidato **substitui** a pesquisa anterior dele, para
que rodar de novo nunca duplique:

- `politician_positions` é **apagada inteira** para aquele `politician_id`
  antes da nova inserção. **Uma re-ingestão descarta qualquer classificação
  manual anterior sobre as posições** — não há filtro que preserve `validado
  = true` aqui, diferente do que acontece com alertas.
- `politician_alerts` é apagada só onde `gerado_por_ia = true AND
  validado_por IS NULL AND ativo = true` — um alerta já aprovado por um
  curador, ou já marcado resolvido, sobrevive à re-ingestão.
- `candidate_sources` é apagada por `candidacy_id`, exceto as fontes ainda
  citadas por um alerta que sobreviveu ao passo anterior (evita deixar
  `politician_alerts.source_id` nulo num alerta preservado).
- `candidate_dossiers` nunca é apagada — cada rodada insere uma nova
  `versao` (`UNIQUE (candidacy_id, versao)`), preservando o histórico.

Antes de qualquer delete, as linhas de `enrichment_ledger` elegíveis voltam
para `em_progresso`: se o processo cair no meio, a candidatura fica visível
de novo em `v_enrichment_queue` em vez de sumir com status `concluido` e
zero posições.

## Autoridade operacional

Este documento não repete comandos, sinalizadores ou o formato exato do
banner de confirmação — isso é `docs/procedimentos/pesquisa-de-candidato-runbook.md`.
As regras de conteúdo que o agente de pesquisa segue (estágios E1–E5, camadas
de fonte, a armadilha de enquadramento) são
`docs/procedimentos/pesquisa-de-candidato.md`.
