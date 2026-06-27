# VotoSim — Contexto para o Claude Code

Este arquivo é lido automaticamente pelo Claude Code ao abrir o projeto. Contém todo o contexto necessário para continuar o desenvolvimento sem perder nenhuma decisão tomada anteriormente.

---

## O que é o VotoSim

Ferramenta de informação eleitoral para as eleições brasileiras 2026. O usuário responde um questionário de 14 temas políticos numa escala de 1 a 5 e recebe uma lista de candidatos do seu estado com percentual de alinhamento temático. O produto nunca recomenda voto — apenas informa e compara. Alinhado à Resolução TSE nº 23.755/2026.

**Conceito central:** "Spotify de políticos" — busca por similaridade entre valores do eleitor e posições documentadas dos candidatos.

**Eleição-alvo:** Eleições Gerais 2026 — 1º turno: 4 de outubro de 2026.

**Desenvolvedor:** Rappa — projeto solo, São Paulo.

---

## Stack tecnológico

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind CSS |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Banco de dados | Supabase (PostgreSQL 15 + pgvector) |
| IA — match por sessão | Gemini Flash (Google AI Studio — free tier) |
| IA — extração de dados | Gemini Flash (sem grounding) |
| Dados eleitorais | APIs públicas oficiais TSE, Câmara e Senado |
| Deploy | Vercel |

**Ambiente de desenvolvimento:** Windows 11 + WSL2 (Ubuntu 22.04).

**Produto stateless:** nenhum dado do usuário é salvo no banco. Sem autenticação no MVP.

---

## Supabase — banco já configurado

O banco de dados está **totalmente configurado e pronto**. Não criar nenhuma tabela nova sem consultar a documentação em `docs/`.

### Tabelas existentes

| Tabela | Conteúdo |
|---|---|
| `politicians` | Pessoa física do político — um registro por pessoa |
| `candidacies` | Candidatura por eleição/cargo/estado |
| `themes_catalog` | 14 temas políticos com afirmações do questionário |
| `politician_positions` | Posição de cada político por tema (extraída por Gemini) |
| `politician_alerts` | Alertas de ficha suja, investigações e polêmicas |
| `parties` | Partidos políticos com espectro e metadados |

### Views prontas

- `v_candidates_2026` — candidatos ativos em 2026
- `v_candidates_2026_matchable` — candidatos com cobertura de dados para o match
- `v_candidate_alerts` — alertas validados prontos para exibição
- `v_politician_theme_coverage` — cobertura temática por candidato

### Variáveis de ambiente necessárias

```bash
# .env.local (projeto Next.js)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Nos secrets do Supabase Edge Functions:
```
SERVICE_ROLE_KEY=eyJ...      # não usa prefixo SUPABASE_ — proibido pelo Supabase
GEMINI_API_KEY=AIza...
```

---

## Gemini Flash — uso e limites

| Uso | Grounding | Custo |
|---|---|---|
| Match por sessão de usuário | Não | Free tier (tokens) |
| Extração de posições do pipeline | Não | ~R$0,01 por candidato |

**Free tier:** 1.500 req/dia, 10 RPM, 1M tokens/min, 5.000 grounding queries/mês. Não ativar billing — elimina o free tier completamente.

**URL da API:**
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}
```

---

## Estrutura de rotas do MVP

| Rota | Descrição |
|---|---|
| `/inicio` | Boas-vindas e CTA para começar |
| `/perfil` | Coleta estado, município e faixa etária |
| `/questionario` | 14 perguntas uma por vez, carregadas do Supabase |
| `/revisao` | Revisão das respostas antes de enviar |
| `/resultado` | Lista de candidatos com % de alinhamento |
| `/sobre` | Sobre o projeto e disclaimer legal |

---

## Identidade visual

```
Primária:        #1A3A5C  (azul escuro)
Destaque:        #1A56A0  (azul médio)
Fundo principal: #FFFFFF
Fundo secundário:#F4F4F4  (cinza claro)
Texto:           #222222
Alinhamento +:   #3B6D11  (verde)
Alerta médio:    #854F0B  (laranja)
Alerta crítico:  #A32D2D  (vermelho)
Tipografia:      Inter (Google Fonts)
```

Mobile first — funcionar bem em 375px. Favicon com iniciais "VS" em azul escuro.

---

## Questionário — 14 temas

Carregados do banco via `SELECT slug, nome, afirmacao_questionario, contexto_questionario, nota_educativa FROM themes_catalog ORDER BY ordem_exibicao`.

**Escala de resposta (universal):**
- 1 — Discordo totalmente
- 2 — Discordo parcialmente
- 3 — Não tenho opinião formada
- 4 — Concordo parcialmente
- 5 — Concordo totalmente

**Regras do questionário:**
- Uma pergunta por tela com animação de transição suave
- Slider começa sem valor selecionado (não no centro)
- Botão "Pular" registra neutro (valor 3) e avança
- Botão "Próxima" só habilita após mover o slider
- Permitir voltar e alterar respostas anteriores
- Mínimo 3 respostas não-neutras para habilitar "Ver candidatos"

**Formato das respostas em React state:**
```typescript
interface RespostaUsuario {
  temaSlug: string;
  resposta: 1 | 2 | 3 | 4 | 5;
  concordancia: 'concordo' | 'neutro' | 'discordo';
  intensidade: 1 | 2 | 3 | 4 | 5;  // igual a resposta
  // 1-2 = discordo, 3 = neutro, 4-5 = concordo
}
```

---

## Edge Function "match-candidatos"

**Endpoint:** `POST /functions/v1/match-candidatos`

**Body recebido:**
```typescript
{
  estado: string;        // UF ex: "SP"
  municipio: string;
  faixa_etaria: string;
  respostas: RespostaUsuario[];
}
```

**Lógica:**
1. Buscar candidatos do estado via `v_candidates_2026_matchable` + posições + alertas
2. Montar JSON estruturado por candidato
3. Chamar Gemini Flash com prompt de match
4. Retornar JSON estruturado com cargos e scores

**Formato de retorno:**
```typescript
{
  cargos: Array<{
    cargo: string;
    candidatos: Array<{
      politician_id: string;
      nome_urna: string;
      partido: string;
      score: number;           // 0-100
      temas_alinhados: string[];  // slugs
      temas_divergentes: string[]; // slugs
      tem_alertas: boolean;
      alertas: Array<{
        tipo: string;
        severidade: string;
        titulo: string;
        descricao: string;
        fonte_url: string;
      }>;
    }>;
  }>;
  total_candidatos_analisados: number;
  estado: string;
}
```

**Ordem de cargos no resultado:** presidente → governador → senador → deputado_federal → deputado_estadual

**Regra crítica:** o Gemini nunca usa as expressões "vote em", "escolha" ou "recomendo".

---

## Fontes de dados públicos (pipeline)

Todas oficiais — sem scraping:

| Fonte | URL | O que fornece |
|---|---|---|
| TSE Dados Abertos | dadosabertos.tse.jus.br | CSV de candidatos, certidões criminais |
| DivulgaCandContas | divulgacandcontas.tse.jus.br | Plano de governo por candidato |
| Câmara | dadosabertos.camara.gov.br | Votações nominais, deputados em exercício |
| Senado | dadosabertos.senado.leg.br | Votações, senadores em exercício |

O pipeline usa Gemini Flash (sem grounding) para extrair posições temáticas dos planos de governo e salvar em `politician_positions`. Um processo por candidato, resultado cacheado para sempre.

---

## Alertas de candidatos

Três tipos com tratamentos distintos:

| Tipo | Badge | Fonte principal |
|---|---|---|
| `ficha_suja` | Vermelho — "Ficha suja" | TSE CSV (certidões criminais) |
| `investigacao` | Laranja — "Em investigação" | STF, PGR, TCU, CPIs |
| `polemica` | Cinza — "Atenção" | Curadoria manual |

Alertas **não excluem** candidatos do resultado — apenas informam. O usuário decide o peso.

Antecedentes carregam **assincronamente** — cards aparecem primeiro, alertas atualizam em background. Após primeira busca, resultado salvo no banco para todas as sessões seguintes.

---

## Compliance legal

- Nenhuma tela usa "vote em" ou equivalente
- Disclaimer no rodapé de todas as páginas
- LGPD: produto stateless, nenhum dado pessoal coletado
- AdSense: bloquear ads de candidatos políticos nas páginas de resultado
- Dados do TSE: uso amparado pelo Portal de Dados Abertos ("dados podem ser livremente acessados, utilizados, tratados e compartilhados por qualquer pessoa")

---

## Roadmap

### MVP (lançar até agosto/2026)
- Questionário de 14 temas
- Resultado com candidatos por cargo e % de alinhamento
- Alertas de ficha suja automáticos
- AdSense integrado
- Página /sobre com disclaimer legal

### v2 (setembro/2026)
- Busca por candidato de referência (Modo A: "quero alguém parecido com Jones Manoel")
- Descrição de valores em texto livre (Modo B)
- Questionário completo (~3 perguntas por tema)
- Ajuste manual de peso por tema
- Relatório premium PDF "Minha colinha eleitoral" (R$9,90)
- Páginas estáticas por candidato (SEO)
- pgvector + embeddings + similaridade semântica

### v3 (pós-eleição)
- Comparação promessas vs votações de parlamentares eleitos
- API pública para ONGs
- Cobertura de eleições municipais

---

## Documentação completa

Todos os detalhes técnicos estão na pasta `docs/` deste repositório.

**Docs ativos:**

| Arquivo | Conteúdo |
|---|---|
| `docs/README_DOCS.md` | Referência master — leia primeiro |
| `docs/06_data_pipeline.md` | Pipeline de ingestão TSE + Gemini Flash |
| `docs/09_nextjs_setup.md` | Setup do Next.js 15, env vars, Supabase client, estrutura de pastas |
| `docs/10_frontend_pages.md` | Spec de cada página, interfaces TypeScript, state management |

**Docs de banco (inalterados, em `docs/base/`):**

| Arquivo | Conteúdo |
|---|---|
| `docs/base/01_schema_politicians.md` | DDL: políticos, candidaturas, partidos |
| `docs/base/02_schema_themes.v2.md` | DDL: temas + seed dos 14 temas |
| `docs/base/04_schema_alerts.md` | DDL: alertas e regras editoriais |
| `docs/base/05_schema_match_algorithm.md` | Algoritmo de match em SQL |
| `docs/base/07_questionnaire.md` | 14 perguntas completas com formato JSON |
| `docs/base/08_supabase_setup.md` | Passo a passo de configuração do Supabase |

---

## Como começar com o Claude Code

O banco já está pronto. O próximo passo é criar o projeto Next.js e as telas do MVP.

**Sugestão de início:**
```bash
# No WSL2
npx create-next-app@latest votosim \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --no-turbopack
cd votosim
npm install @supabase/supabase-js @supabase/ssr
```

Depois criar o arquivo `.env.local` com as chaves do Supabase (ver `docs/09_nextjs_setup.md`) e começar pelas telas na ordem: `/inicio` → `/perfil` → `/questionario` → `/revisao` → `/resultado` → `/sobre`.

A Edge Function `match-candidatos` pode ser desenvolvida em paralelo e testada via Supabase Dashboard → Edge Functions → Test.
