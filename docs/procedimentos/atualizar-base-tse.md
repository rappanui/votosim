# VotoSim — Processo de atualização de dados de candidatos 2026

> **Status:** válido · **Atualizado em:** 2026-08-24
> **Contexto:** guia passo a passo para atualizar a base de dados do VotoSim
> para as eleições gerais de 2026. Leitor: uma pessoa (o operador que roda a
> ingestão). Leia antes de ingerir novos dados de candidatos. Para detalhes
> dos scripts do pipeline, ver `docs/legado/11_pipeline_scripts.md`. Para a
> arquitetura completa do pipeline, ver `docs/legado/06_data_pipeline.md`.

---

## Quando o TSE liberar os dados de 2026

| Dataset | Liberação esperada | Padrão de URL |
|---------|-----------------|-------------|
| CSV de candidatos (`consulta_cand`) | Agosto de 2026 (após o prazo de registro) | `cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip` |
| PDFs de plano de governo (`proposta_governo`) | Agosto de 2026 (junto com a candidatura) | `cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_{UF}.zip` |
| Registros criminais (`motivo_cassacao`) | Setembro de 2026 (após decisões do TSE) | `cdn.tse.jus.br/estatistica/sead/odsele/motivo_cassacao/motivo_cassacao_2026.zip` |

---

## Passo 1: Baixar os arquivos do TSE

### CSV de candidatos

```bash
curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip" \
  -o scripts/data/consulta_cand_2026.zip
unzip scripts/data/consulta_cand_2026.zip -d scripts/data/
# Produz: consulta_cand_2026_BR.csv (nacional) + um CSV por UF
```

### PDFs de plano de governo (por estado + BR)

```bash
# Candidatos a presidente (estado='BR' no banco)
curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_BR.zip" \
  -o scripts/data/proposta_governo_2026_BR.zip
mkdir -p scripts/data/propostas_2026/BR
unzip scripts/data/proposta_governo_2026_BR.zip -d scripts/data/propostas_2026/BR/
# Mova qualquer subdiretório aninhado para fora, se o zip extrair para BR/BR/:
# mv scripts/data/propostas_2026/BR/BR/*.pdf scripts/data/propostas_2026/BR/

# Por estado (governadores) — repita para cada UF
for UF in SP RJ MG RS BA PR SC GO PE CE; do
  curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${UF}.zip" \
    -o scripts/data/proposta_governo_2026_${UF}.zip
  mkdir -p scripts/data/propostas_2026/${UF}
  unzip scripts/data/proposta_governo_2026_${UF}.zip -d scripts/data/propostas_2026/${UF}/
done
```

### Registros criminais

```bash
curl -L "https://cdn.tse.jus.br/estatistica/sead/odsele/motivo_cassacao/motivo_cassacao_2026.zip" \
  -o scripts/data/motivo_cassacao_2026.zip
unzip scripts/data/motivo_cassacao_2026.zip -d scripts/data/
```

---

## Passo 2: Rodar `ingest-tse` para 2026

A constante `ELECTION_YEAR` do script em `scripts/ingest-tse.ts` precisa ser
atualizada para `2026` antes de rodar.

```bash
# Edite scripts/ingest-tse.ts: mude ELECTION_YEAR = 2022 → 2026
# Depois rode (começa pelo arquivo nacional, depois por estado para os estados prioritários):
cd scripts
npm run ingest-tse -- data/consulta_cand_2026_BR.csv
npm run ingest-tse -- data/consulta_cand_2026_SP.csv --estado=SP
# ... repita para os outros estados
```

`ingest-tse` faz upsert em `politicians` + `candidacies` com
`ano_eleicao = 2026`. As linhas de 2022 permanecem intocadas.

---

## Passo 3: Rodar `extract-positions` para 2026

A constante `ELECTION_YEAR` do script em `scripts/extract-positions.ts`
precisa ser atualizada para `2026`.

```bash
# Edite scripts/extract-positions.ts: mude ELECTION_YEAR = 2022 → 2026

# Candidatos a presidente (obrigatório — não há outra fonte para as posições deles)
cd scripts
npm run extract-positions -- data/propostas_2026 data/consulta_cand_2026_BR.csv --estado=BR

# Governadores por estado
npm run extract-positions -- data/propostas_2026 data/consulta_cand_2026_SP.csv --estado=SP
# ... repita para os outros estados
```

---

## Passo 4: Rodar `ingest-alerts` para 2026

```bash
cd scripts
npm run ingest-alerts -- data/motivo_cassacao_2026_BRASIL.csv
```

---

## Passo 5: Trocar a Edge Function para 2026

No Supabase Dashboard → Edge Functions → Secrets:

```
ELECTION_YEAR = 2026
```

A Edge Function lê esse valor no momento da requisição para escolher a view
(`v_candidates_2026` vs `v_candidates_2022`). Não é preciso reimplantar —
mudar o secret tem efeito imediato.

---

## O que muda em relação a 2022

| Aspecto | 2022 (seed) | 2026 (produção) |
|--------|-------------|-------------------|
| Constante `ELECTION_YEAR` nos scripts | `2022` | `2026` |
| View de candidatos usada pela Edge Function | `v_candidates_2022` | `v_candidates_2026` |
| Pasta de PDFs | `data/propostas_2022/` | `data/propostas_2026/` |
| Arquivos CSV | `consulta_cand_2022_*.csv` | `consulta_cand_2026_*.csv` |
| Dados de deputados/senadores | Via `ingest-camara-votes` / `ingest-senado-votes` (planejado) | O mesmo |

Os dados de 2022 não são deletados — as linhas históricas coexistem nas
mesmas tabelas. A coluna `ano_eleicao` em `candidacies` é o discriminador.

---

## Deputados e senadores (2026)

Dados de posição para senadores e deputados federais não vêm de PDFs de
plano de governo — esses só são submetidos por governadores e presidentes.
Para 2026:

- **Senadores:** use `ingest-senado-votes.ts` (planejado) — API de Dados
  Abertos do Senado
- **Deputados federais:** use `ingest-camara-votes.ts` (planejado) — API de
  Dados Abertos da Câmara
- **Fallback (proxy):** `ingest-party-programs.ts` (planejado) — PDFs de
  programa partidário do TSE, mesmo padrão de URL do `proposta_governo`, mas
  para documentos em nível de partido

Ver `docs/legado/13_legislative_votes.md` para a estratégia de implementação.

---

## Conferindo a cobertura antes de ir ao ar

Depois de ingerir todos os dados de 2026, verifique a cobertura no SQL
Editor do Supabase:

```sql
-- Candidatos com pelo menos uma posição
SELECT c.cargo, COUNT(DISTINCT p.politician_id) AS with_positions
FROM v_candidates_2026 c
LEFT JOIN politician_positions pp ON pp.politician_id = c.politician_id
LEFT JOIN politicians p ON p.id = c.politician_id
GROUP BY c.cargo;

-- Percentual de cobertura por cargo
SELECT cargo,
  COUNT(*) AS total,
  COUNT(pp.politician_id) AS with_data,
  ROUND(COUNT(pp.politician_id) * 100.0 / COUNT(*), 1) AS pct
FROM v_candidates_2026 c
LEFT JOIN (
  SELECT DISTINCT politician_id FROM politician_positions
) pp ON pp.politician_id = c.politician_id
GROUP BY cargo;
```

O produto exige pelo menos 35% de score de alinhamento para mostrar um
candidato — candidatos sem dados de posição terão score 0% e serão
filtrados. Verifique se a cobertura está aceitável antes de definir
`ELECTION_YEAR=2026`.
