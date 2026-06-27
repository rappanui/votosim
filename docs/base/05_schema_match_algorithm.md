# VotoSim — Algoritmo de Match e Scoring

> **Arquivo:** `05_schema_match_algorithm.md`  
> **Banco:** Supabase (PostgreSQL 15)  
> **Depende de:** `01`, `02`, `03`, `04`  
> **Implementação backend:** Next.js API Route `/api/match`

---

## Visão geral

O algoritmo recebe o **perfil temático do usuário** (temas + concordância + peso) e retorna uma lista de candidatos ordenada por **score de match (0–100%)**, agrupada por cargo.

Dois caminhos de entrada, mesmo cálculo de saída:

```
Modo A (referência por candidato):
  [Candidato de referência] → IA extrai temas → usuário valida → [perfil_usuario]

Modo B (descrição de valores):
  [Texto do usuário] → IA extrai temas → usuário valida → [perfil_usuario]
                                                             ↓
                                              [algoritmo de match]
                                                             ↓
                                              [lista de candidatos com score%]
```

---

## Estrutura do perfil do usuário

```typescript
// Tipo: PerfilUsuario
// Criado no frontend após o usuário validar os temas

interface TemaUsuario {
  theme_id: string;           // UUID do tema em themes_catalog
  slug: string;               // ex: 'reforma_tributaria'
  nome: string;               // ex: 'Reforma tributária'
  concordancia: 'concordo' | 'neutro' | 'discordo';
  prioridade: 1 | 2 | 3;     // 1=baixa, 2=média, 3=alta — definida pelo usuário
}

interface PerfilUsuario {
  temas: TemaUsuario[];
  estado: string;             // UF onde vota (ex: 'SP')
  municipio_ibge?: string;
  candidato_referencia_id?: string;  // UUID (apenas Modo A)
  session_token?: string;            // token anônimo (apenas Modo B)
}
```

---

## Algoritmo: cálculo do score por candidato

### Fórmula geral

```
score_candidato = (score_tematico * 0.7 + score_semantico * 0.3) * 100

onde:
  score_tematico  = calculado pela função abaixo (0.0–1.0)
  score_semantico = similarity_coseno do pgvector (0.0–1.0)
                    → 0.0 se candidato não tem embedding
```

### Cálculo do score temático (passo a passo)

```
Para cada tema T no perfil do usuário onde concordancia != 'neutro':

  1. Verificar se o candidato tem posição sobre T em politician_positions
     → Se não tem: contribuição = 0 (não penaliza, não pontua)

  2. Calcular peso_usuario(T):
     prioridade 3 (alta)   → peso = 1.0
     prioridade 2 (média)  → peso = 0.6
     prioridade 1 (baixa)  → peso = 0.3

  3. Calcular relevancia_cargo(T, cargo_candidato):
     → Buscar em themes_catalog.relevancia_{cargo} para o cargo do candidato
     → Ex: tema 'privatizacao_estatais' + cargo 'governador' → relevancia = 0.1

  4. Calcular contribuicao(T):

     Se concordancia = 'concordo':
       Se candidato.posicao = 'favoravel':
         contribuicao = peso_usuario * relevancia_cargo * (intensidade / 5)
       Se candidato.posicao = 'contrario':
         contribuicao = -0.5 * peso_usuario * relevancia_cargo * (intensidade / 5)
         (penalidade: o candidato defende o oposto do que o usuário quer)
       Se candidato.posicao = 'neutro':
         contribuicao = 0

     Se concordancia = 'discordo':
       Se candidato.posicao = 'contrario':
         contribuicao = peso_usuario * relevancia_cargo * (intensidade / 5)
         (usuário discorda do tema → candidato que também é contra → match positivo)
       Se candidato.posicao = 'favoravel' E intensidade >= 3:
         contribuicao = -0.5 * peso_usuario * relevancia_cargo * (intensidade / 5)
         (penalidade: candidato defende o que o usuário rejeita)
       Se candidato.posicao = 'favoravel' E intensidade < 3:
         contribuicao = 0
         (posição fraca → não penaliza)
       Se candidato.posicao = 'neutro':
         contribuicao = 0

5. score_tematico_raw = Σ contribuicao(T) para todos os temas

6. score_tematico_max = Σ peso_usuario(T) * relevancia_cargo(T) para temas com concordancia != 'neutro'
   (máximo teórico se o candidato concordasse com tudo)

7. score_tematico = MAX(0, score_tematico_raw / score_tematico_max)
   → Normalizado entre 0.0 e 1.0
   → Clampado em 0 (não existe score negativo exibido — apenas impacta ordenação)
```

---

## Implementação em SQL (função principal)

```sql
CREATE OR REPLACE FUNCTION calculate_match_scores(
  p_temas         JSONB,    -- array de TemaUsuario serializado
  p_estado        TEXT,
  p_municipio     TEXT DEFAULT NULL,
  p_limit         INTEGER DEFAULT 20
)
RETURNS TABLE (
  politician_id       UUID,
  nome_urna           TEXT,
  partido             TEXT,
  cargo               office_type,
  estado              brazilian_state,
  score_final         NUMERIC,      -- 0–100 (exibido como %)
  score_tematico      NUMERIC,      -- 0–100 (componente temático)
  score_semantico     NUMERIC,      -- 0–100 (componente de embedding)
  temas_alinhados     INTEGER,      -- quantos temas do usuário o candidato tem posição
  tem_dados_suficientes BOOLEAN,    -- false = exibir "Dados insuficientes"
  tem_alertas         BOOLEAN       -- true = exibir badge de alerta
) AS $$
BEGIN
  RETURN QUERY
  WITH

  -- 1. Expandir o JSON de temas do usuário
  user_themes AS (
    SELECT
      (t->>'theme_id')::UUID       AS theme_id,
      t->>'concordancia'           AS concordancia,
      (t->>'prioridade')::SMALLINT AS prioridade,
      CASE (t->>'prioridade')::SMALLINT
        WHEN 3 THEN 1.0
        WHEN 2 THEN 0.6
        ELSE 0.3
      END                          AS peso_usuario
    FROM jsonb_array_elements(p_temas) AS t
    WHERE t->>'concordancia' != 'neutro'
  ),

  -- 2. Candidatos elegíveis no estado/ano
  candidatos AS (
    SELECT
      p.id              AS politician_id,
      p.nome_urna,
      p.partido_atual   AS partido,
      c.cargo,
      c.estado
    FROM politicians p
    JOIN candidacies c ON c.politician_id = p.id
    WHERE c.ano_eleicao = 2026
      AND c.status IN ('deferido', 'registrado', 'pre_candidato')
      AND c.estado = p_estado::brazilian_state
      AND p.ativo = true
  ),

  -- 3. Calcular score temático por candidato
  scores_tematicos AS (
    SELECT
      ca.politician_id,

      -- Numerador: soma das contribuições
      SUM(
        CASE
          -- Concordo + candidato favorável = pontuação positiva
          WHEN ut.concordancia = 'concordo' AND pp.posicao = 'favoravel' THEN
            ut.peso_usuario
            * COALESCE(
                CASE ca.cargo
                  WHEN 'presidente'         THEN tc.relevancia_presidente
                  WHEN 'senador'            THEN tc.relevancia_senador
                  WHEN 'governador'         THEN tc.relevancia_governador
                  WHEN 'deputado_federal'   THEN tc.relevancia_deputado_federal
                  WHEN 'deputado_estadual'  THEN tc.relevancia_deputado_estadual
                  WHEN 'deputado_distrital' THEN tc.relevancia_deputado_distrital
                  ELSE 0.5
                END, 0.5)
            * (pp.intensidade::NUMERIC / 5)

          -- Concordo + candidato contrário = penalidade
          WHEN ut.concordancia = 'concordo' AND pp.posicao = 'contrario' THEN
            -0.5 * ut.peso_usuario
            * COALESCE(
                CASE ca.cargo
                  WHEN 'presidente'         THEN tc.relevancia_presidente
                  WHEN 'senador'            THEN tc.relevancia_senador
                  WHEN 'governador'         THEN tc.relevancia_governador
                  WHEN 'deputado_federal'   THEN tc.relevancia_deputado_federal
                  WHEN 'deputado_estadual'  THEN tc.relevancia_deputado_estadual
                  WHEN 'deputado_distrital' THEN tc.relevancia_deputado_distrital
                  ELSE 0.5
                END, 0.5)
            * (pp.intensidade::NUMERIC / 5)

          -- Discordo + candidato contrário = pontuação positiva
          WHEN ut.concordancia = 'discordo' AND pp.posicao = 'contrario' THEN
            ut.peso_usuario
            * COALESCE(
                CASE ca.cargo
                  WHEN 'presidente'         THEN tc.relevancia_presidente
                  WHEN 'senador'            THEN tc.relevancia_senador
                  WHEN 'governador'         THEN tc.relevancia_governador
                  WHEN 'deputado_federal'   THEN tc.relevancia_deputado_federal
                  WHEN 'deputado_estadual'  THEN tc.relevancia_deputado_estadual
                  WHEN 'deputado_distrital' THEN tc.relevancia_deputado_distrital
                  ELSE 0.5
                END, 0.5)
            * (pp.intensidade::NUMERIC / 5)

          -- Discordo + candidato favorável forte = penalidade
          WHEN ut.concordancia = 'discordo' AND pp.posicao = 'favoravel' AND pp.intensidade >= 3 THEN
            -0.5 * ut.peso_usuario
            * COALESCE(
                CASE ca.cargo
                  WHEN 'presidente'         THEN tc.relevancia_presidente
                  WHEN 'senador'            THEN tc.relevancia_senador
                  WHEN 'governador'         THEN tc.relevancia_governador
                  WHEN 'deputado_federal'   THEN tc.relevancia_deputado_federal
                  WHEN 'deputado_estadual'  THEN tc.relevancia_deputado_estadual
                  WHEN 'deputado_distrital' THEN tc.relevancia_deputado_distrital
                  ELSE 0.5
                END, 0.5)
            * (pp.intensidade::NUMERIC / 5)

          ELSE 0
        END
      )                             AS score_raw,

      -- Denominador: máximo teórico
      SUM(
        ut.peso_usuario
        * COALESCE(
            CASE ca.cargo
              WHEN 'presidente'         THEN tc.relevancia_presidente
              WHEN 'senador'            THEN tc.relevancia_senador
              WHEN 'governador'         THEN tc.relevancia_governador
              WHEN 'deputado_federal'   THEN tc.relevancia_deputado_federal
              WHEN 'deputado_estadual'  THEN tc.relevancia_deputado_estadual
              WHEN 'deputado_distrital' THEN tc.relevancia_deputado_distrital
              ELSE 0.5
            END, 0.5)
      )                             AS score_max,

      COUNT(pp.id)                  AS temas_alinhados

    FROM candidatos ca
    CROSS JOIN user_themes ut
    JOIN themes_catalog tc ON tc.id = ut.theme_id
    LEFT JOIN politician_positions pp
      ON pp.politician_id = ca.politician_id
      AND pp.theme_id = ut.theme_id
    GROUP BY ca.politician_id
  ),

  -- 4. Juntar com score semântico (embedding)
  scores_combinados AS (
    SELECT
      ca.politician_id,
      ca.nome_urna,
      ca.partido,
      ca.cargo,
      ca.estado,
      GREATEST(0, COALESCE(st.score_raw, 0) / NULLIF(st.score_max, 0))  AS score_tematico_norm,
      COALESCE(1 - (pe.embedding <=> (
        -- Embedding de referência: do candidato de referência (Modo A)
        -- ou do session_embedding (Modo B)
        -- Passado como parâmetro adicional quando disponível
        SELECT embedding FROM politician_embeddings LIMIT 1  -- placeholder
      )), 0)                                                               AS score_semantico_norm,
      COALESCE(st.temas_alinhados, 0)                                     AS temas_alinhados,
      EXISTS (
        SELECT 1 FROM politician_alerts pa
        WHERE pa.politician_id = ca.politician_id
          AND pa.ativo = true AND pa.validado = true
      )                                                                    AS tem_alertas
    FROM candidatos ca
    LEFT JOIN scores_tematicos st ON st.politician_id = ca.politician_id
    LEFT JOIN politician_embeddings pe ON pe.politician_id = ca.politician_id
  )

  -- 5. Score final e ordenação
  SELECT
    sc.politician_id,
    sc.nome_urna,
    sc.partido,
    sc.cargo,
    sc.estado,
    ROUND((sc.score_tematico_norm * 0.7 + sc.score_semantico_norm * 0.3) * 100, 1) AS score_final,
    ROUND(sc.score_tematico_norm * 100, 1)                                           AS score_tematico,
    ROUND(sc.score_semantico_norm * 100, 1)                                          AS score_semantico,
    sc.temas_alinhados::INTEGER,
    sc.temas_alinhados >= 2                                                           AS tem_dados_suficientes,
    sc.tem_alertas
  FROM scores_combinados sc
  ORDER BY sc.cargo, score_final DESC
  LIMIT p_limit;

END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_match_scores IS
  'Calcula score de match 0-100% para cada candidato no estado, dado o perfil temático do usuário. Combina score temático (70%) e semântico (30%).';
```

---

## Implementação backend: API Route `/api/match`

```typescript
// Arquivo: app/api/match/route.ts (Next.js 15 App Router)
// Recebe o perfil do usuário, executa o algoritmo, retorna resultado agrupado por cargo

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // service_role — nunca expor no frontend
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { temas, estado, municipio, candidato_referencia_id, session_token } = body;

  // Validação básica
  if (!temas || !estado) {
    return NextResponse.json({ error: 'temas e estado são obrigatórios' }, { status: 400 });
  }
  const temas_ativos = temas.filter((t: any) => t.concordancia !== 'neutro');
  if (temas_ativos.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos 1 tema com concordo ou discordo' }, { status: 400 });
  }

  // Checar cache (TTL 1h para o mesmo estado + set de temas)
  // Implementar cache key como hash SHA-256 do JSON ordenado
  // Omitido aqui por brevidade — ver 06_data_pipeline.md

  // Executar algoritmo
  const { data, error } = await supabase.rpc('calculate_match_scores', {
    p_temas: temas,
    p_estado: estado,
    p_municipio: municipio ?? null,
    p_limit: 50
  });

  if (error) {
    console.error('Erro no calculate_match_scores:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }

  // Agrupar por cargo e buscar alertas
  const grouped = groupByCargo(data ?? []);

  // Buscar alertas para todos os politician_ids retornados
  const politicianIds = (data ?? []).map((r: any) => r.politician_id);
  const { data: alertas } = await supabase
    .from('v_candidate_alerts')
    .select('*')
    .in('politician_id', politicianIds);

  // Montar resposta
  const resultado = {
    cargos: grouped,
    alertas: indexBy(alertas ?? [], 'politician_id'),
    meta: {
      total_candidatos: data?.length ?? 0,
      temas_usados: temas_ativos.length,
      estado,
      gerado_em: new Date().toISOString()
    }
  };

  return NextResponse.json(resultado);
}

function groupByCargo(candidatos: any[]) {
  const ordemCargos = [
    'presidente', 'vice_presidente', 'governador', 'vice_governador',
    'senador', 'deputado_federal', 'deputado_estadual', 'deputado_distrital'
  ];
  const grouped: Record<string, any[]> = {};
  for (const c of candidatos) {
    if (!grouped[c.cargo]) grouped[c.cargo] = [];
    grouped[c.cargo].push(c);
  }
  // Ordenar cargos pela ordem definida, candidatos já vêm ordenados por score
  return ordemCargos
    .filter(cargo => grouped[cargo]?.length > 0)
    .map(cargo => ({ cargo, candidatos: grouped[cargo] }));
}

function indexBy(arr: any[], key: string): Record<string, any[]> {
  return arr.reduce((acc, item) => {
    if (!acc[item[key]]) acc[item[key]] = [];
    acc[item[key]].push(item);
    return acc;
  }, {});
}
```

---

## Formato da resposta da API

```jsonc
{
  "cargos": [
    {
      "cargo": "presidente",
      "candidatos": [
        {
          "politician_id": "uuid",
          "nome_urna": "Sâmia Bonfim",
          "partido": "PSOL",
          "cargo": "deputado_federal",
          "estado": "SP",
          "score_final": 84.2,         // exibido como "84% de alinhamento"
          "score_tematico": 91.0,
          "score_semantico": 67.5,
          "temas_alinhados": 6,
          "tem_dados_suficientes": true,
          "tem_alertas": false
        }
      ]
    },
    {
      "cargo": "deputado_federal",
      "candidatos": [
        // ...
        {
          // Candidato sem dados suficientes
          "score_final": null,
          "tem_dados_suficientes": false
          // Frontend exibe: "Dados insuficientes — consultar TSE"
        }
      ]
    }
  ],
  "alertas": {
    "uuid-do-candidato": [
      {
        "tipo": "investigacao",
        "severidade": "alta",
        "titulo": "Citado em CPI",
        "badge_cor": "laranja",
        "fonte_url": "https://..."
      }
    ]
  },
  "meta": {
    "total_candidatos": 47,
    "temas_usados": 5,
    "estado": "SP",
    "gerado_em": "2026-08-01T14:23:00Z"
  }
}
```

---

## Nota sobre transparência do algoritmo

O frontend deve exibir, em acordeão expansível abaixo de cada candidato, uma explicação do score gerado. O backend deve retornar campos adicionais para isso (omitidos na v1 por performance — implementar na v1.1):

```typescript
// v1.1: adicionar ao retorno por candidato
breakdown: [
  {
    tema: "Reforma tributária",
    concordancia_usuario: "concordo",
    prioridade_usuario: 3,
    posicao_candidato: "favoravel",
    intensidade_candidato: 4,
    relevancia_cargo: 0.9,
    contribuicao: "+18.0 pts",
    fonte_principal: { descricao: "Votou a favor da PEC 45/2019", url: "..." }
  },
  {
    tema: "Privatização de estatais",
    concordancia_usuario: "discordo",
    posicao_candidato: "favoravel",
    intensidade_candidato: 4,
    contribuicao: "-9.0 pts (penalidade)",
    fonte_principal: { ... }
  }
]
```

---

## Checklist de implementação

- [ ] Criar função `calculate_match_scores` no Supabase
- [ ] Testar função manualmente com JSON de temas mock
- [ ] Implementar API Route `/api/match` em Next.js
- [ ] Validar agrupamento por cargo no retorno
- [ ] Testar caso "sem dados suficientes" (candidato com 0 posições)
- [ ] Testar penalidade de "discordo" com candidato favorável intensidade >= 3
- [ ] Implementar cache de resultado (hash do perfil → TTL 1h)
- [ ] Adicionar breakdown por tema (v1.1)

---

*Próximo arquivo: `06_data_pipeline.md` — pipeline de ingestão de dados do TSE e geração de embeddings*
