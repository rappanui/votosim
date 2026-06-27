# VotoSim — Documentação técnica

> **Versão:** 2.0  
> **Anterior:** `README_DOCS.v1.md`  
> **O que mudou:** adição de temas ao schema, criação do documento de questionário, definição da arquitetura de pipeline sem grounding por sessão

---

## Convenção de versionamento

Documentos com sufixo `.vN.md` são versões anteriores — preservadas para consulta e recuperação de decisões. O arquivo sem sufixo (ex: `02_schema_themes.md`) é sempre a versão original. A versão mais recente de cada documento é a de maior N.

**Nunca deletar versões anteriores.** Se uma decisão precisar ser revertida, a versão anterior serve como referência.

---

## Índice de documentos

| Arquivo | Versão ativa | Conteúdo | Status |
|---|---|---|---|
| `README_DOCS.md` | v1 (original) | Índice inicial | Preservado |
| `README_DOCS.v1.md` | — | Backup do README original | Preservado |
| `01_schema_politicians.md` | v1 | Tabelas `politicians`, `candidacies`, `parties` | ✅ Sem alterações |
| `02_schema_themes.md` | v1 (original) | 10 temas, sem campos de questionário | Preservado |
| `02_schema_themes.v1.md` | — | Backup da v1 original | Preservado |
| `02_schema_themes.v2.md` | **v2 ativa** | 14 temas + campos `afirmacao_questionario`, `contexto_questionario`, `exibir_no_quiz` | ✅ Aplicar este |
| `03_schema_embeddings.md` | v1 | Embeddings e similaridade semântica | ✅ Sem alterações |
| `04_schema_alerts.md` | v1 | Alertas de ficha suja, investigações, polêmicas | ✅ Sem alterações |
| `05_schema_match_algorithm.md` | v1 | Algoritmo de match e API Route | ✅ Sem alterações |
| `06_data_pipeline.md` | v1 | Pipeline de ingestão TSE + Gemini + embeddings | ✅ Sem alterações |
| `07_questionnaire.md` | **v1 nova** | 14 perguntas completas, formato JSON, regras de UX | ✅ Novo |

---

## Ordem de aplicação no Supabase

```
1. 01_schema_politicians.md     — tabelas base (sem dependências)
2. 02_schema_themes.v2.md       — temas + campos de questionário (depende de 01)
3. 03_schema_embeddings.md      — embeddings (depende de 01 e 02)
4. 04_schema_alerts.md          — alertas (depende de 01)
5. 05_schema_match_algorithm.md — função de match (depende de 01, 02, 03, 04)
```

`06_data_pipeline.md` e `07_questionnaire.md` são implementados no código, não no banco.

---

## Arquitetura de dados — decisões tomadas

### Fonte de dados de candidatos
- **CSV bulk:** dados estruturados (candidatos, partidos, certidões) via Portal de Dados Abertos do TSE (`dadosabertos.tse.jus.br`) — gratuito, oficial, sem scraping
- **API DivulgaCandContas:** plano de governo por candidato (não disponível em CSV) — com rate limiting gentil entre requisições
- **API Câmara/Senado:** histórico de votações nominais para parlamentares em exercício
- **Nenhum webcrawler** — tudo via APIs e downloads oficiais

### Quando rodar o pipeline
- **Semanal** para dados estruturados (candidatos, partidos)
- **Uma vez por candidato** para plano de governo e antecedentes (cacheado no banco após primeira ingestão)
- **Sob demanda assíncrona** para antecedentes de candidatos novos que aparecem no resultado

### Agente de IA (Gemini Flash)
- **Pipeline:** Gemini lê plano de governo (texto) e extrai posições em JSON estruturado — sem grounding, sem custo de search
- **Sessão do usuário:** Gemini recebe perfil JSON do usuário + JSON dos candidatos do estado — raciocínio puro, sem grounding, ilimitado em usuários no free tier

### Questionário
- **14 temas** (10 originais + 4 novos: corrupção, política econômica, política externa, pauta moral)
- **Escala 1–5** universal: Discordo totalmente → Concordo totalmente
- **Afirmações neutras:** descrevem políticas concretas, sem carga emocional
- **Stateless:** nenhuma resposta é salva no banco — perfil gerado no frontend e enviado direto ao agente
- **Mínimo 3 respostas** não-neutras para habilitar a busca

---

## Temas do questionário (14 no total)

| # | Slug | Nome | Categoria | Novo? |
|---|---|---|---|---|
| 1 | `reforma_tributaria` | Reforma tributária | economia | — |
| 2 | `sus_saude_publica` | Saúde pública (SUS) | saude | — |
| 3 | `privatizacao_estatais` | Privatização × estatização | economia | — |
| 4 | `seguranca_publica_estadual` | Segurança pública | seguranca | — |
| 5 | `educacao_basica` | Educação básica e ensino público | educacao | — |
| 6 | `meio_ambiente_desmatamento` | Meio ambiente e desmatamento | meio_ambiente | — |
| 7 | `reforma_previdencia` | Previdência social e aposentadoria | economia | — |
| 8 | `direitos_lgbtqia` | Direitos LGBTQIA+ | direitos_sociais | — |
| 9 | `porte_armas` | Porte e posse de armas | seguranca | — |
| 10 | `bolsa_familia_transferencia` | Transferência de renda e assistência social | direitos_sociais | — |
| 11 | `corrupcao_transparencia` | Combate à corrupção | reforma_politica | ✅ v2 |
| 12 | `politica_economica` | Política econômica e papel do Estado | economia | ✅ v2 |
| 13 | `politica_externa` | Política externa e relações internacionais | politica_externa | ✅ v2 |
| 14 | `pauta_moral_costumes` | Valores morais e costumes na legislação | religiao_costumes | ✅ v2 |

---

## Variáveis de ambiente necessárias

```bash
# .env.local (Next.js / Lovable)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...           # chave pública (segura para o browser)
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # chave privada (NUNCA expor no browser)
GEMINI_API_KEY=AIza...             # Google AI Studio (free tier)
NEXT_PUBLIC_SITE_URL=https://votosim.com.br
```

---

## Próximos passos

- [ ] Passo a passo de configuração do Supabase (`08_supabase_setup.md`)
- [ ] Briefing completo para o Lovable (`09_lovable_briefing.md`)
- [ ] Prompt do agente Gemini para extração de posições do plano de governo
- [ ] Prompt do agente Gemini para match por sessão de usuário

---

*Documentação iniciada em maio/2026. Versão 2.0 em junho/2026.*
