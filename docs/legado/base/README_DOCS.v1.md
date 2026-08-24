# VotoSim — Documentação técnica

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-27
> **Motivo:** Mesmo conteúdo de `README_DOCS.md` — índice citando pgvector/embeddings e Next.js 15 como arquitetura vigente.
> **Substituído por:** `docs/README.md`


> Índice de todos os documentos do projeto.  
> Leia este arquivo primeiro para entender a ordem correta de implementação.

---

## O que é o VotoSim

Ferramenta de informação eleitoral para eleitores brasileiros. O usuário informa candidatos de referência ou descreve seus valores, e o sistema retorna candidatos locais com percentual de alinhamento temático. Não recomenda voto — informa e compara.

**Eleição-alvo:** Eleições Gerais 2026 — 1º turno: 4 out/2026  
**Stack:** Next.js 15 + Supabase (PostgreSQL + pgvector) + Claude API + Voyage AI  
**Custo operacional:** ~R$0/mês até 10k usuários (free tiers) + ~R$30 por pipeline de dados

---

## Documentos disponíveis

| # | Arquivo | Conteúdo | Status |
|---|---------|----------|--------|
| PRD | `VotoSim_PRD_v1.0.docx` | Requisitos completos do produto, personas, fluxos, monetização | ✅ Completo |
| 01 | `01_schema_politicians.md` | Tabelas `politicians`, `candidacies`, `parties` + RLS + seed | ✅ Completo |
| 02 | `02_schema_themes.md` | Tabelas `themes_catalog`, `politician_positions`, `position_history` + seed de 10 temas | ✅ Completo |
| 03 | `03_schema_embeddings.md` | Tabelas `politician_embeddings`, `similarity_cache`, `session_embeddings` + funções pgvector | ✅ Completo |
| 04 | `04_schema_alerts.md` | Tabela `politician_alerts` + regras editoriais + RLS | ✅ Completo |
| 05 | `05_schema_match_algorithm.md` | Algoritmo de match completo em SQL + API Route Next.js + formato de resposta | ✅ Completo |
| 06 | `06_data_pipeline.md` | Scripts de ingestão TSE, extração de temas (Claude), embeddings (Voyage AI), agendamento | ✅ Completo |

---

## Ordem de implementação recomendada

```
1. Criar projeto no Supabase
2. Executar DDL do arquivo 01 (extensões, enums, tabelas base)
3. Executar DDL do arquivo 02 (temas + seed dos 10 temas principais)
4. Executar DDL do arquivo 03 (embeddings + funções pgvector)
5. Executar DDL do arquivo 04 (alertas)
6. Executar DDL do arquivo 05 (função calculate_match_scores)
7. Criar projeto Next.js e implementar API Route /api/match (arquivo 05)
8. Executar pipeline de dados (arquivo 06) com candidatos de teste
9. Implementar frontend
```

---

## Dependências externas

| Serviço | Uso | Custo | Link |
|---|---|---|---|
| Supabase | Banco de dados, auth, hosting de Edge Functions | Free tier | supabase.com |
| Vercel | Hosting do Next.js | Free tier | vercel.com |
| Anthropic (Claude Haiku) | Extração de temas dos candidatos | ~R$15/ciclo eleitoral | console.anthropic.com |
| Voyage AI | Geração de embeddings | Free tier (200M tokens/mês) | voyageai.com |
| Google AdSense | Monetização por anúncios | % da receita | adsense.google.com |
| TSE Dados Abertos | Dados de candidaturas | Gratuito | dadosabertos.tse.jus.br |
| Câmara Dados Abertos | Votações e parlamentares | Gratuito | dadosabertos.camara.leg.br |

---

## Variáveis de ambiente necessárias

```bash
# .env.local (Next.js)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...          # chave pública (segura para o browser)
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # chave privada (NUNCA expor no browser)
ANTHROPIC_API_KEY=sk-ant-...
VOYAGE_API_KEY=pa-...
NEXT_PUBLIC_SITE_URL=https://votosim.com.br
```

---

## Decisões de design relevantes

**Por que separar `politicians` de `candidacies`?**  
Um político pode concorrer a cargos diferentes em eleições diferentes. O histórico de votações parlamentares de um deputado federal vale para o match mesmo que ele concorra ao Senado em 2026.

**Por que 70% temático e 30% semântico no score final?**  
Posições documentadas (70%) são mais confiáveis e explicáveis. O embedding semântico (30%) funciona como desempate e captura nuances que os temas não cobrem, mas não domina o resultado.

**Por que `ficha_suja` não exclui o candidato do resultado?**  
Decisão editorial deliberada. Mostrar e informar é mais honesto do que filtrar silenciosamente. O usuário pode ter razões para querer ver todos os candidatos, e a exclusão silenciosa poderia ser considerada interferência eleitoral.

**Por que intensidade < 3 não gera penalidade para `discordo`?**  
Penalizar um candidato por uma menção casual a um tema evitaria candidatos que apenas citaram o assunto sem ter posição real. A penalidade só faz sentido quando a posição é documentada e forte.

---

## Convenções de código

- **Banco:** snake_case para tudo (tabelas, colunas, funções)
- **TypeScript:** camelCase para variáveis e funções, PascalCase para tipos e interfaces
- **API Routes:** `/api/[recurso]` em Next.js App Router
- **Supabase client:** `service_role` key apenas no servidor; `anon` key no browser
- **IDs:** sempre UUID v4, nunca inteiros sequenciais expostos na URL

---

## Próximos documentos a criar (backlog)

- `07_api_routes.md` — documentação completa de todas as rotas da API Next.js
- `08_frontend_flows.md` — fluxos de UI e estados do frontend
- `09_education_module.md` — conteúdo do módulo educativo sobre cargos
- `10_monitoring.md` — métricas, alertas e observabilidade

---

*Documentação gerada em maio/2026. Atualizar conforme o produto evolui.*
