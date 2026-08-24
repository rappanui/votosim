# Índice de referência

> **Status:** válido · **Atualizado em:** 2026-08-24 19:10
> **Contexto:** um documento por conceito, uma linha cada, com o gancho do
> que ele responde. Convenção da pasta: teto de **200 linhas** por arquivo,
> conteúdo consultado pulando pra dentro — não é para ler em sequência.

---

| Documento | Responde |
|---|---|
| `visao-geral.md` | O que o VotoSim é, o princípio de IA-na-ingestão/aritmética-em-runtime, e o estado real de cobertura de pesquisa. |
| `modelo-de-dados.md` | Quais tabelas existem no Postgres e o que cada coluna guarda. |
| `calculo-do-match.md` | A fórmula de match, os níveis de evidência, as duas métricas de cobertura, e `neutro_motivo`. |
| `questionario.md` | Os 14 temas do quiz, o modelo de resposta e como cada resposta vira peso. |
| `alertas.md` | Os seis `alert_type`, e por que alertas e observações nunca aparecem no mesmo lugar. |
| `pipeline-de-pesquisa.md` | O fluxo `next-candidates → build-brief → agente → ingest-research`, e por que uma re-ingestão apaga classificações manuais anteriores. |
| `frontend.md` | As páginas, o quiz, o card de candidato recomposto e os seis componentes, e a fronteira de contrato (`assertMatchResult`). |
| `variaveis-de-ambiente.md` | Quais variáveis de ambiente o código lê hoje, e em qual arquivo `.env` cada uma vive. |
| `achados-sp0.md` | Log de anomalias encontradas rodando o pipeline SP-0 contra dados reais do TSE 2026. |
| `schema-adicoes-sp0.md` | As tabelas e colunas que a migração SP-0 (`docs/migracoes/11_sp0_foundation.sql`) adicionou. |
| `fontes-de-dados-tse.md` | Onde obter dados oficiais do TSE 2026 e as armadilhas de fontes mortas/incompletas. |

Os três últimos (`achados-sp0`, `schema-adicoes-sp0`, `fontes-de-dados-tse`)
foram movidos como estavam — ainda em inglês, sem o bloco `**Status:**` no
formato padrão desta pasta. Ver concerns do relatório de fechamento da Fase
B4/B5 antes de tratá-los como modelo para um documento novo.
