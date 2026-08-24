# VotoSim — Master Reference Document

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-27
> **Motivo:** Última versão do índice pré-Next.js, com extensa cobertura de Gemini, Lovable e pgvector/embeddings como arquitetura vigente.
> **Substituído por:** `docs/README.md`


> **Arquivo:** `README_DOCS.v3.md`  
> **Versão:** 3.0 — Referência consolidada  
> **Anterior:** `README_DOCS.v2.md`  
> **Data:** Junho 2026  
> **O que mudou:** Stack migrada de Next.js para Lovable + Supabase. Todas as decisões de arquitetura, produto, dados, IA e roadmap consolidadas neste documento. Este é o documento de referência principal — leia antes de qualquer outro.

---

## 1. O que é o VotoSim

Ferramenta de informação eleitoral para eleitores brasileiros. O usuário responde um questionário de valores políticos e recebe uma lista de candidatos com percentual de alinhamento temático, agrupada por cargo. Não recomenda voto — informa e compara.

**Conceito central:** "Spotify de políticos" — busca por similaridade entre valores do eleitor e posições documentadas dos candidatos.

**Posicionamento legal:** alinhado à Resolução TSE nº 23.755/2026. O sistema nunca usa a expressão "vote em" ou equivalente. O resultado é sempre apresentado como percentual de alinhamento informativo, cuja interpretação e decisão final cabem exclusivamente ao usuário.

**Eleição-alvo:** Eleições Gerais 2026 — 1º turno: 4 de outubro de 2026.

---

## 2. Stack tecnológico

### Frontend e backend — Lovable

O produto é construído integralmente no **Lovable** (lovable.dev), que gera aplicações React + TypeScript + Tailwind CSS com backend via Supabase Edge Functions.

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend | React + TypeScript + Tailwind (gerado pelo Lovable) | Não é Next.js — o Lovable gera Vite + React |
| Backend | Supabase Edge Functions (Deno/TypeScript) | Geradas pelo Lovable via prompt |
| Banco de dados | Supabase (PostgreSQL 15 + pgvector) | Projeto próprio conectado ao Lovable |
| Autenticação | Não há no MVP — produto stateless | Supabase Auth disponível se necessário no futuro |
| Deploy | Lovable Cloud (built-in) | Domínio customizado configurável |
| IA — match | Gemini Flash (Google AI Studio — free tier) | Chamado via Edge Function |
| IA — pipeline | Gemini Flash (mesmo modelo) | Extração de posições dos planos de governo |
| Dados eleitorais | APIs públicas oficiais do TSE, Câmara e Senado | Sem scraping, sem webcrawler |
| Monetização | Google AdSense + relatório premium (futuro) | AdSense integrado via script no Lovable |

### Por que Lovable e não Next.js

A decisão de usar Lovable foi tomada para acelerar o MVP. O Lovable gera React puro (Vite), não Next.js. Implicações:

- Sem SSR nativo — páginas estáticas ou client-side rendering
- Sem API Routes do Next.js — a lógica de backend vai em Supabase Edge Functions
- Sem SEO por candidato no MVP (páginas estáticas por candidato são v2)
- Código exportável para GitHub — sem lock-in

Quando o produto escalar e precisar de SSR + SEO por candidato, a migração para Next.js é viável porque o Supabase e a lógica de negócio permanecem intactos.

---

## 3. Modelo de negócio e monetização

| Canal | Detalhes | Quando |
|---|---|---|
| Google AdSense | Slots nos resultados e entre grupos de candidatos. CPM estimado R$3–8 em período eleitoral. Solicitar aprovação com antecedência — Google leva 2–4 semanas e exige conteúdo mínimo publicado. | MVP |
| Relatório premium | "Minha colinha eleitoral" — PDF com todos os candidatos do usuário por cargo, com match % e fontes. Preço sugerido: R$9,90. Processamento via Stripe + geração de PDF server-side. | v2 |
| Parceria editorial | Licença de dados para veículos de imprensa, universidades e ONGs. Patrocínio editorial transparente. | v3+ |

---

## 4. Produto — fluxo completo

### Etapa 0 — Identificação do eleitor

Antes de qualquer pergunta, obrigatório:

```
Estado onde vota      → select com 27 UFs
Município onde vota   → select filtrado pelo estado
Faixa etária          → select (16-17 / 18-24 / 25-34 / 35-44 / 45-59 / 60+)
```

Localização define quais candidatos serão buscados. Faixa etária é informativa no MVP — não afeta o algoritmo.

### Etapa 1 — Questionário de valores (MVP)

14 afirmações sobre temas políticos, uma por tela, escala 1–5:

```
1 — Discordo totalmente
2 — Discordo parcialmente
3 — Não tenho opinião formada
4 — Concordo parcialmente
5 — Concordo totalmente
```

Cada afirmação tem:
- **Texto principal:** política concreta, linguagem neutra, sem carga emocional
- **Acordeão "Saiba mais":** contexto educativo ~3 linhas, fechado por padrão
- **Tooltip de cargo:** explica qual cargo tem mais atribuição sobre aquele tema

Regras de UX:
- Botão "Pular" disponível (equivale a resposta 3 — neutro)
- Permitir voltar e alterar respostas anteriores
- Tela de revisão antes de confirmar
- Mínimo 3 respostas não-neutras para habilitar "Ver candidatos"

**Versão futura (v2):** usuário poderá escolher entre "Questionário rápido" (14 perguntas) e "Questionário completo" (perguntas detalhadas por tema, ~3 por tema).

### Etapa 2 — Processamento pelo agente Gemini

A Edge Function recebe o perfil JSON do usuário e:

1. Busca no Supabase os candidatos do estado filtrado, com seus perfis JSON pré-processados
2. Monta o contexto: perfil do usuário + candidatos
3. Chama o Gemini Flash com prompt de match
4. Gemini raciocina sobre o cruzamento e retorna lista ordenada por cargo com score e justificativa
5. Edge Function retorna resultado ao frontend

**Importante:** o Gemini na sessão do usuário **não usa grounding** (sem busca na web). Raciocína exclusivamente sobre os dados do Supabase. Zero custo de grounding por sessão.

### Etapa 3 — Resultado

Lista de candidatos agrupada por cargo, ordenada por % de alinhamento.

Para cada candidato:
- Nome, partido, cargo, estado
- % de alinhamento (score do agente)
- Breakdown: quais temas alinharam e quais divergiram
- Badge de alertas se houver (ficha suja, investigação, polêmica)
- Link para fontes (TSE, Câmara, Senado)
- Botão "Compartilhar resultado" (link com preview OG)

Antecedentes carregam **assincronamente** — cards aparecem primeiro, alertas atualizam progressivamente em background.

---

## 5. Arquitetura de dados

### 5.1 Fontes de dados — todas oficiais, sem scraping

| Fonte | O que fornece | Formato | Frequência de atualização |
|---|---|---|---|
| TSE — Portal de Dados Abertos (`dadosabertos.tse.jus.br`) | Candidatos, partidos, vagas, coligações, certidões criminais, fotos | CSV bulk download | Semanal (após registro oficial em jul/2026) |
| TSE — API DivulgaCandContas (`divulgacandcontas.tse.jus.br`) | Plano de governo por candidato (PDF/texto), dados complementares | REST API (documentação não-oficial: github.com/augusto-herrmann/divulgacandcontas-doc) | Uma vez por candidato + monitoramento de atualização |
| Câmara dos Deputados (`dadosabertos.camara.gov.br`) | Votações nominais, proposições, perfil de deputados em exercício | REST API oficial | Semanal |
| Senado Federal (`dadosabertos.senado.leg.br`) | Votações, matérias, perfil de senadores em exercício | REST API oficial | Semanal |
| TSE — Ficha Limpa / Certidões | Inelegibilidades, condenações transitadas em julgado | Incluído no CSV bulk e na API DivulgaCand | Semanal |

**Regra de uso da API DivulgaCand:** colocar intervalo de tempo entre requisições para não sobrecarregar os servidores do TSE. Usar CSV bulk sempre que o dado estiver disponível — API apenas para o que não está no CSV (principalmente planos de governo).

### 5.2 O que é armazenado no Supabase

O banco **não é uma réplica do TSE**. Armazena o resultado do processamento que só o VotoSim faz:

```
TSE fornece:        plano de governo (PDF bruto, 50 páginas)
VotoSim armazena:   posições extraídas por IA em JSON estruturado por tema
                    → isso não existe em lugar nenhum além do banco VotoSim
```

Tabelas principais:

| Tabela | Conteúdo | Volume estimado |
|---|---|---|
| `politicians` | Pessoa física do político (uma linha por pessoa) | ~5.100 candidatos |
| `candidacies` | Candidatura por eleição/cargo/estado | ~5.100 registros 2026 |
| `politician_positions` | Posição por tema, extraída por Gemini do plano de governo | ~3–8 por candidato |
| `themes_catalog` | Catálogo dos 14 temas com afirmações do questionário | 14 registros fixos |
| `politician_alerts` | Alertas de ficha suja, investigações, polêmicas | Variável |
| `politician_embeddings` | Vetor pgvector do perfil (v2) | ~5.100 |
| `similarity_cache` | Cache de pares similares pré-computados (v2) | Variável |
| `parties` | Partidos com espectro e metadados | ~30 registros |

**Volume total estimado:** ~100–150MB — bem dentro dos 500MB do Supabase free tier.

### 5.3 Pipeline de ingestão

```
PIPELINE SEMANAL (script Node.js — roda localmente ou em cron)
│
├── Etapa 1 — TSE CSV bulk
│   → Baixa consulta_cand_2026_BRASIL.csv
│   → Upsert em politicians e candidacies
│   → Inclui certidões criminais (dados de ficha suja estruturados)
│
├── Etapa 2 — API DivulgaCandContas (apenas candidatos novos/atualizados)
│   → Busca plano de governo em texto para cada candidato sem posições
│   → Rate limiting: 1 req/s para não sobrecarregar o TSE
│
├── Etapa 3 — APIs Câmara e Senado (parlamentares em exercício)
│   → Busca votações nominais relevantes para os 14 temas
│   → Enriquece perfil de deputados e senadores com histórico real
│
├── Etapa 4 — Gemini Flash (extração de posições)
│   → Input: texto do plano de governo + votações
│   → Output: JSON estruturado com posições por tema e intensidade
│   → Sem grounding — raciocínio puro sobre texto fornecido
│   → Uma chamada por candidato, resultado salvo no banco para sempre
│   → Custo estimado total: ~R$15–30 para processar todos os candidatos
│
└── Etapa 5 — Alertas (antecedentes estruturados)
    → Ficha suja: já vem do CSV do TSE (certidões criminais)
    → Investigações: cruza com dados da Câmara e Senado
    → Polêmicas: curadoria manual (não automatizado no MVP)
```

**Antecedentes sob demanda (complementar ao pipeline):**

Quando um candidato aparece no resultado pela primeira vez, o sistema dispara uma busca assíncrona complementar de antecedentes (investigações em curso, histórico adicional). O resultado é salvo no banco — as próximas aparições do candidato nos resultados de qualquer usuário já usam o dado cacheado.

```
Primeiro usuário que recebe "Candidato X" no resultado
  → Edge Function dispara busca assíncrona de antecedentes
  → Card aparece imediatamente (sem esperar)
  → Badge de alerta atualiza progressivamente quando a busca termina
  → Resultado salvo no banco

Todos os próximos usuários que recebem "Candidato X"
  → Alerta já disponível no banco → exibido instantaneamente
```

### 5.4 Gemini Flash — uso e limites

| Uso | Grounding | Custo | Frequência |
|---|---|---|---|
| Extração de posições (pipeline) | Não | ~R$0,01 por candidato | Uma vez por candidato |
| Match por sessão de usuário | Não | Tokens free tier | A cada sessão |
| Antecedentes complementares (futuro) | Sim (Google Search) | 5.000 grounding/mês grátis | Uma vez por candidato |

**Free tier Gemini Flash (Google AI Studio, sem billing):**
- 1.500 requisições por dia
- 10 RPM (requisições por minuto)
- 1.000.000 tokens por minuto
- 5.000 grounding queries por mês (família Gemini 3.x)
- Sem expiração, sem cartão de crédito

**Atenção crítica:** habilitar billing no projeto Google Cloud elimina o free tier completamente — toda chamada passa a ser cobrada. Manter dois projetos separados: um para desenvolvimento (billing off) e um para produção quando necessário.

---

## 6. Convenção de versionamento dos documentos

| Sufixo | Significado |
|---|---|
| Sem sufixo (`02_schema_themes.md`) | Versão original — nunca modificada |
| `.v1.md` | Backup explícito da versão original |
| `.v2.md`, `.v3.md`, ... | Versões subsequentes — o maior N é o mais atual |

**Nunca deletar versões anteriores.** Cada versão representa um estado de raciocínio que pode precisar ser recuperado.

---

## 7. Índice de documentos

| Arquivo | Versão ativa | Conteúdo | Aplicar? |
|---|---|---|---|
| `README_DOCS.md` | v1 original | Índice inicial (Next.js, sem Lovable) | Preservado |
| `README_DOCS.v1.md` | — | Backup v1 | Preservado |
| `README_DOCS.v2.md` | — | Versão intermediária | Preservado |
| `README_DOCS.v3.md` | **✅ ESTE — v3 ativa** | Referência consolidada com Lovable | Leia primeiro |
| `01_schema_politicians.md` | v1 | Tabelas `politicians`, `candidacies`, `parties`, enums, RLS, seed de partidos | ✅ Aplicar |
| `02_schema_themes.md` | v1 original | 10 temas originais, sem campos de questionário | Preservado |
| `02_schema_themes.v1.md` | — | Backup da v1 original | Preservado |
| `02_schema_themes.v2.md` | **✅ v2 ativa** | 14 temas + campos `afirmacao_questionario`, `contexto_questionario`, `exibir_no_quiz` + seed completo | ✅ Aplicar |
| `03_schema_embeddings.md` | v1 | pgvector, `politician_embeddings`, `similarity_cache`, funções ANN | ⏳ v2 — não aplicar no MVP |
| `04_schema_alerts.md` | v1 | `politician_alerts`, regras editoriais, RLS | ✅ Aplicar |
| `05_schema_match_algorithm.md` | v1 | Algoritmo de match em SQL + API Route Next.js | ⚠️ Lógica válida, mas API Route precisa virar Edge Function Supabase para o Lovable |
| `06_data_pipeline.md` | v1 | Scripts Node.js de ingestão TSE + Gemini + Voyage AI embeddings | ⚠️ Etapas 1–4 válidas; embeddings (Voyage AI) são v2 — pular no MVP |
| `07_questionnaire.md` | **✅ v1 ativa** | 14 perguntas completas, formato JSON de perfil, regras de UX | ✅ Referência principal para o Lovable |

---

## 8. Ordem de aplicação no Supabase

```
Pré-requisito: extensões
  CREATE EXTENSION "uuid-ossp";
  CREATE EXTENSION "vector";        ← necessário apenas na v2 (embeddings)
  CREATE EXTENSION "unaccent";
  CREATE EXTENSION "pg_trgm";

MVP — aplicar nesta ordem:
  1. 01_schema_politicians.md       tabelas base
  2. 02_schema_themes.v2.md         ALTER TABLE + seed 14 temas
  3. 04_schema_alerts.md            alertas
  (pular 03 e a função de 05 — são v2)

v2 — adicionar depois:
  4. 03_schema_embeddings.md        pgvector + funções ANN
  5. 05_schema_match_algorithm.md   função calculate_match_scores
     (adaptar de API Route para Edge Function)
```

---

## 9. Roadmap — MVP vs v2

### MVP (lançar até agosto/2026)

**Objetivo:** validar o conceito com usuários reais antes das eleições.

```
Produto:
  ✅ Questionário de 14 temas (escala 1–5, afirmações neutras)
  ✅ Seleção de estado/município/faixa etária
  ✅ Resultado com candidatos por cargo e % de alinhamento
  ✅ Alertas de ficha suja (ficha suja estruturada do CSV do TSE)
  ✅ Breakdown de temas alinhados/divergentes por candidato
  ✅ Compartilhamento de resultado via link
  ✅ Módulo educativo: nota de cargo inline em cada pergunta
  ✅ AdSense integrado (solicitar aprovação imediatamente)

Dados:
  ✅ Candidatos via CSV TSE (disponível após julho/2026)
  ✅ Planos de governo via API DivulgaCandContas
  ✅ Posições extraídas pelo Gemini Flash (sem grounding)
  ✅ Histórico de votações para parlamentares em exercício (Câmara/Senado)
  ✅ Alertas de ficha suja automáticos (do CSV)
  ⏳ Alertas de investigações em curso — curadoria manual no MVP

Técnico:
  ✅ Frontend: Lovable (React + TypeScript + Tailwind)
  ✅ Backend: Supabase Edge Functions
  ✅ IA: Gemini Flash free tier
  ✅ Banco: Supabase free tier
  ✅ Deploy: Lovable Cloud
  ⏳ Pipeline de ingestão: script Node.js local (não automatizado no MVP)
```

### v2 (setembro/2026 — antes do 1º turno)

```
Produto:
  ☐ Busca por candidato de referência (Modo A)
      → usuário informa um político de referência
      → agente extrai temas do perfil do político
      → usuário valida e ajusta pesos
      → resultado com candidatos similares
  ☐ Descrição de valores em texto livre (Modo B)
      → usuário escreve o que valoriza em linguagem natural
      → agente interpreta e extrai temas
      → fluxo converge com o questionário padrão
  ☐ Questionário completo (~3 perguntas por tema, ~40 perguntas)
      → usuário escolhe entre "rápido" (14 perguntas) ou "completo"
  ☐ Ajuste manual de peso por tema (alta/média/baixa prioridade)
  ☐ Comparação lado a lado de dois candidatos
  ☐ Relatório premium "Minha colinha eleitoral" (PDF, R$9,90)
  ☐ Páginas estáticas por candidato (SEO: "quem é parecido com X")
  ☐ Aba "Entenda os cargos" — módulo educativo completo

Dados:
  ☐ Alertas de investigações em curso (curadoria + automação parcial)
  ☐ Alertas de polêmicas (curadoria manual com painel interno)
  ☐ Pipeline automatizado (cron semanal no Supabase)

Técnico:
  ☐ pgvector + embeddings (Voyage AI free tier)
  ☐ Similaridade semântica candidato–candidato (similarity_cache)
  ☐ Algoritmo de match híbrido: 70% temático + 30% semântico
  ☐ Migração para Next.js (se SEO por candidato for prioritário)
```

### v3 (pós-eleição / ciclo 2028)

```
  ☐ Comparação promessas vs votações de parlamentares eleitos
  ☐ API pública para ONGs e educadores
  ☐ Versão em inglês/espanhol para brasileiros no exterior
  ☐ Cobertura de eleições municipais (vereadores, prefeitos)
  ☐ Parceria com veículos de imprensa
```

---

## 10. O que está fora do escopo (qualquer versão)

- Recomendar candidatos diretamente ("vote em X")
- Checagem própria de fake news ou fact-checking
- Cobertura de eleições municipais antes da v3
- Perfis de candidatos não registrados no TSE
- Análise de redes sociais dos candidatos
- Conteúdo patrocinado por candidatos ou partidos

---

## 11. Variáveis de ambiente

```bash
# Supabase (conectar ao Lovable via Settings → Connectors → Supabase)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...            # chave pública — segura no browser
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # chave privada — NUNCA expor no browser
                                    # usar apenas em Edge Functions server-side

# Gemini (Google AI Studio — free tier, sem billing)
GEMINI_API_KEY=AIza...              # obter em aistudio.google.com

# Site
VITE_SITE_URL=https://votosim.com.br   # Vite (não Next.js) usa VITE_ como prefixo público
```

**Atenção Lovable:** variáveis com prefixo `VITE_` são expostas no browser. Nunca colocar `SUPABASE_SERVICE_ROLE_KEY` ou `GEMINI_API_KEY` com prefixo `VITE_`. Essas chaves só devem existir nas Edge Functions do Supabase como secrets.

---

## 12. Compliance legal

```
TSE Resolução nº 23.755/2026:
  ✅ Nenhuma tela usa "vote em" ou equivalente
  ✅ Resultado apresentado como % de alinhamento informativo
  ✅ Disclaimer no rodapé: "O VotoSim é uma ferramenta informativa.
     Não somos filiados a partidos políticos. A decisão de voto
     é exclusivamente do eleitor."

LGPD:
  ✅ Produto stateless no MVP — nenhum dado pessoal identificável coletado
  ✅ Localização armazenada apenas na sessão do browser
  ✅ Session token anônimo, sem vínculo a usuário

AdSense:
  ✅ Bloquear ads de candidatos políticos nas páginas de resultado
     (configurar política de conteúdo sensível no painel AdSense)

Dados do TSE:
  ✅ Uso amparado pelo Portal de Dados Abertos do TSE
     ("dados podem ser livremente acessados, utilizados, tratados
     e compartilhados por qualquer pessoa")
  ✅ Sem scraping — apenas APIs e downloads oficiais
  ✅ Rate limiting respeitado nas chamadas à API DivulgaCandContas
```

---

## 13. Próximos documentos a criar

| # | Arquivo | Conteúdo | Status |
|---|---|---|---|
| 08 | `08_supabase_setup.md` | Passo a passo completo de configuração do Supabase: criar projeto, rodar DDL, configurar RLS, conectar ao Lovable | 🔜 Próximo |
| 09 | `09_lovable_briefing.md` | Briefing completo para o Lovable: prompts iniciais, estrutura de telas, integração com Supabase e Gemini | 🔜 Após 08 |
| 10 | `10_gemini_prompts.md` | Prompts do agente: extração de posições do plano de governo + match por sessão de usuário | 🔜 Após 09 |
| 11 | `11_pipeline_scripts.md` | Scripts Node.js de ingestão: TSE CSV, API DivulgaCand, Câmara, Senado, Gemini extração | 🔜 v2 |

---

*Documentação iniciada em maio/2026. Versão 3.0 em junho/2026.*  
*Mantida por: Rappa — projeto solo, solo dev, São Paulo.*
