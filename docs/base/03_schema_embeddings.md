# VotoSim — Schema: Embeddings e Similaridade Semântica

> **Arquivo:** `03_schema_embeddings.md`  
> **Banco:** Supabase (PostgreSQL 15 + pgvector)  
> **Depende de:** `01_schema_politicians.md`, `02_schema_themes.md`  
> **Lido por:** `05_schema_match_algorithm.md`

---

## Contexto

Embeddings são representações numéricas (vetores) do perfil político de cada candidato. Permitem calcular **similaridade semântica** entre candidatos de forma eficiente — sem precisar chamar a API de IA a cada consulta.

Dois usos distintos no VotoSim:
1. **Similaridade candidato–candidato:** "Quem se parece com Jones Manoel?"
2. **Similaridade perfil_usuário–candidato:** quando o usuário descreve valores em texto livre (Modo B), gera-se um embedding do perfil do usuário e compara com os candidatos

O modelo de embedding usado é **Voyage AI** (`voyage-large-2`) — 200M tokens/mês grátis, dimensão 1024, otimizado para português.

---

## Tabela: `politician_embeddings`

Vetor de embedding do perfil político de cada candidato.

```sql
CREATE TABLE politician_embeddings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id   UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,

  -- O vetor em si (1024 dimensões — Voyage AI voyage-large-2)
  embedding       vector(1024) NOT NULL,

  -- Metadados sobre o que foi usado para gerar o embedding
  -- Importante para saber quando o embedding está desatualizado
  modelo          TEXT NOT NULL DEFAULT 'voyage-large-2',
  texto_fonte     TEXT NOT NULL,
  -- texto_fonte é a concatenação estruturada dos dados do político:
  -- "Nome: Sâmia Bonfim | Partido: PSOL | Cargo: Deputada Federal (SP) |
  --  Temas favoráveis: direitos das mulheres (5), reforma tributária progressiva (4), saúde pública (4) |
  --  Temas contrários: privatização de estatais (5), flexibilização trabalhista (4) |
  --  Plano de governo: [resumo]"

  tokens_usados   INTEGER,                        -- para controle de uso da API
  gerado_em       TIMESTAMPTZ DEFAULT now(),
  valido_ate      TIMESTAMPTZ,                    -- null = válido indefinidamente até mudança de dados

  -- Versão do schema de texto_fonte (para invalidar embeddings quando o formato mudar)
  versao_schema   SMALLINT NOT NULL DEFAULT 1,

  UNIQUE (politician_id)                          -- um embedding ativo por político
);

-- Índice HNSW para busca por vizinhos mais próximos (ANN search)
-- Parâmetros: m=16, ef_construction=64 (equilíbrio custo/precisão para ~5000 candidatos)
CREATE INDEX idx_embeddings_hnsw
  ON politician_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE politician_embeddings IS
  'Vetores de embedding do perfil político de cada candidato. Um registro por político. Usado para busca por similaridade semântica.';
COMMENT ON COLUMN politician_embeddings.texto_fonte IS
  'Texto concatenado usado para gerar o embedding. Armazenado para auditoria e para detectar quando o embedding precisa ser regenerado.';
COMMENT ON COLUMN politician_embeddings.versao_schema IS
  'Versão do template de texto_fonte. Incrementar quando o formato mudar obriga regeneração de todos os embeddings.';
```

---

## Tabela: `similarity_cache`

Cache de similaridade pré-computada entre pares de candidatos.

```sql
CREATE TABLE similarity_cache (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id_a     UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  politician_id_b     UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,

  -- Scores de similaridade (0.0 a 1.0)
  similarity_coseno   NUMERIC(5,4) NOT NULL,      -- similaridade de embedding (semântica)
  similarity_tematica NUMERIC(5,4),               -- similaridade por temas (calculada em 05_schema_match)
  similarity_final    NUMERIC(5,4),               -- score combinado (60% semântica + 40% temática)

  -- Metadados
  calculado_em        TIMESTAMPTZ DEFAULT now(),
  valido_ate          TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours',

  -- Garantir que o par é único (A,B) sem duplicar (B,A)
  -- Convenção: politician_id_a < politician_id_b (ordem UUID)
  CHECK (politician_id_a < politician_id_b),
  UNIQUE (politician_id_a, politician_id_b)
);

CREATE INDEX idx_sim_cache_a ON similarity_cache (politician_id_a, similarity_final DESC);
CREATE INDEX idx_sim_cache_b ON similarity_cache (politician_id_b, similarity_final DESC);
CREATE INDEX idx_sim_cache_validade ON similarity_cache (valido_ate);

COMMENT ON TABLE similarity_cache IS
  'Cache de similaridade pré-computada entre pares de candidatos. TTL de 24h. Evita recalcular a cada consulta de usuário.';
COMMENT ON COLUMN similarity_cache.similarity_final IS
  'Score combinado: 0.6 * similarity_coseno + 0.4 * similarity_tematica. Usado como ordenação principal no resultado.';
```

---

## Tabela: `session_embeddings`

Embedding gerado a partir do perfil descrito pelo usuário (Modo B — texto livre). Armazenado temporariamente na sessão.

```sql
CREATE TABLE session_embeddings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token   TEXT NOT NULL,                  -- token anônimo gerado no frontend (não vincula ao usuário)

  -- Embedding do perfil do usuário
  embedding       vector(1024) NOT NULL,
  texto_fonte     TEXT NOT NULL,                  -- texto que o usuário digitou (ou reconstruído dos temas)

  -- Temas extraídos (resultado da interpretação por IA)
  temas_extraidos JSONB DEFAULT '[]',
  -- Formato:
  -- [{ "theme_id": "uuid", "slug": "reforma_tributaria", "peso_usuario": 3, "concordancia": "concordo" }]

  -- Localização (filtro)
  estado          brazilian_state,
  municipio_ibge  TEXT,

  -- TTL curto — dados de sessão, sem PII
  criado_em       TIMESTAMPTZ DEFAULT now(),
  expira_em       TIMESTAMPTZ DEFAULT now() + INTERVAL '2 hours'
);

CREATE INDEX idx_session_emb_token ON session_embeddings (session_token);
CREATE INDEX idx_session_emb_expiry ON session_embeddings (expira_em);

COMMENT ON TABLE session_embeddings IS
  'Embedding temporário do perfil do usuário para o Modo B (descrição de valores). Expira em 2h. Sem dados pessoais identificáveis.';
```

---

## Função: busca por vizinhos mais próximos

```sql
-- Retorna os N candidatos mais similares a um político de referência
-- Usada no Modo A (busca por candidato de referência)
CREATE OR REPLACE FUNCTION find_similar_politicians(
  p_politician_id   UUID,
  p_estado          brazilian_state,
  p_cargo           office_type DEFAULT NULL,
  p_limit           INTEGER DEFAULT 10,
  p_min_similarity  NUMERIC DEFAULT 0.5
)
RETURNS TABLE (
  politician_id       UUID,
  nome_urna           TEXT,
  partido             TEXT,
  cargo               office_type,
  estado              brazilian_state,
  similarity_score    NUMERIC,
  temas_com_posicao   BIGINT
) AS $$
DECLARE
  v_embedding vector(1024);
BEGIN
  -- Busca o embedding do político de referência
  SELECT embedding INTO v_embedding
  FROM politician_embeddings
  WHERE politician_id = p_politician_id;

  IF v_embedding IS NULL THEN
    RAISE EXCEPTION 'Embedding não encontrado para o político %', p_politician_id;
  END IF;

  RETURN QUERY
  SELECT
    p.id                                          AS politician_id,
    p.nome_urna,
    p.partido_atual                               AS partido,
    c.cargo,
    c.estado,
    ROUND((1 - (pe.embedding <=> v_embedding))::NUMERIC, 4) AS similarity_score,
    COUNT(pp.id)                                  AS temas_com_posicao
  FROM politician_embeddings pe
  JOIN politicians p ON p.id = pe.politician_id
  JOIN candidacies c ON c.politician_id = p.id
    AND c.ano_eleicao = 2026
    AND c.status IN ('deferido', 'registrado', 'pre_candidato')
  LEFT JOIN politician_positions pp ON pp.politician_id = p.id
  WHERE pe.politician_id != p_politician_id       -- excluir o próprio político de referência
    AND p.ativo = true
    AND c.estado = p_estado
    AND (p_cargo IS NULL OR c.cargo = p_cargo)
    AND (1 - (pe.embedding <=> v_embedding)) >= p_min_similarity
  GROUP BY p.id, p.nome_urna, p.partido_atual, c.cargo, c.estado, pe.embedding
  ORDER BY pe.embedding <=> v_embedding           -- <=> = distância coseno (menor = mais similar)
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_similar_politicians IS
  'Retorna candidatos mais similares a um político de referência usando ANN search no pgvector. Filtra por estado e cargo opcionalmente.';
```

---

## Função: busca por embedding de sessão (Modo B)

```sql
-- Retorna candidatos mais similares ao perfil descrito pelo usuário
-- Usada no Modo B (descrição de valores em texto livre)
CREATE OR REPLACE FUNCTION find_similar_to_session(
  p_session_token   TEXT,
  p_estado          brazilian_state,
  p_cargo           office_type DEFAULT NULL,
  p_limit           INTEGER DEFAULT 10
)
RETURNS TABLE (
  politician_id       UUID,
  nome_urna           TEXT,
  partido             TEXT,
  cargo               office_type,
  estado              brazilian_state,
  similarity_score    NUMERIC,
  temas_com_posicao   BIGINT
) AS $$
DECLARE
  v_embedding vector(1024);
BEGIN
  SELECT embedding INTO v_embedding
  FROM session_embeddings
  WHERE session_token = p_session_token
    AND expira_em > now()
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_embedding IS NULL THEN
    RAISE EXCEPTION 'Sessão não encontrada ou expirada: %', p_session_token;
  END IF;

  RETURN QUERY
  SELECT
    p.id                                          AS politician_id,
    p.nome_urna,
    p.partido_atual                               AS partido,
    c.cargo,
    c.estado,
    ROUND((1 - (pe.embedding <=> v_embedding))::NUMERIC, 4) AS similarity_score,
    COUNT(pp.id)                                  AS temas_com_posicao
  FROM politician_embeddings pe
  JOIN politicians p ON p.id = pe.politician_id
  JOIN candidacies c ON c.politician_id = p.id
    AND c.ano_eleicao = 2026
    AND c.status IN ('deferido', 'registrado', 'pre_candidato')
  LEFT JOIN politician_positions pp ON pp.politician_id = p.id
  WHERE p.ativo = true
    AND c.estado = p_estado
    AND (p_cargo IS NULL OR c.cargo = p_cargo)
  GROUP BY p.id, p.nome_urna, p.partido_atual, c.cargo, c.estado, pe.embedding
  ORDER BY pe.embedding <=> v_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## Template de texto para geração de embedding

O texto abaixo é o formato padrão usado para gerar o `texto_fonte` de cada candidato antes de enviar ao Voyage AI. Manter consistente é crítico — qualquer mudança no template deve incrementar `versao_schema` e disparar regeneração.

```
-- Template versao_schema = 1
-- Usado em: pipeline de ingestão (ver 06_data_pipeline.md)

Nome: {nome_urna}
Partido: {partido_atual} ({espectro_partido})
Cargo disputado em 2026: {cargo} pelo estado de {estado}
Histórico de cargos: {cargos_anteriores_concatenados}

Posições documentadas:
- FAVORÁVEL (intensidade {i}): {tema} | {tema} | {tema}
- CONTRÁRIO (intensidade {i}): {tema} | {tema}
- NEUTRO: {tema}

Temas bandeira (intensidade 4-5): {temas_bandeira}

Resumo do plano de governo: {plano_governo_resumo}

Palavras-chave de discursos e proposições: {keywords_extraidas}
```

---

## Job de limpeza (cron)

```sql
-- Remover session_embeddings expirados
-- Executar diariamente via pg_cron ou Supabase Edge Function agendada
DELETE FROM session_embeddings WHERE expira_em < now();

-- Invalidar similarity_cache expirado
DELETE FROM similarity_cache WHERE valido_ate < now();

-- Log de embeddings desatualizados (para o pipeline regenerar)
-- Um embedding fica desatualizado quando politician_positions foi atualizado após gerado_em
CREATE VIEW v_embeddings_desatualizados AS
SELECT
  pe.politician_id,
  p.nome_urna,
  pe.gerado_em,
  MAX(pp.atualizado_em) AS ultima_posicao_atualizada
FROM politician_embeddings pe
JOIN politicians p ON p.id = pe.politician_id
LEFT JOIN politician_positions pp ON pp.politician_id = pe.politician_id
GROUP BY pe.politician_id, p.nome_urna, pe.gerado_em
HAVING MAX(pp.atualizado_em) > pe.gerado_em
    OR pe.valido_ate < now();
```

---

## RLS

```sql
ALTER TABLE politician_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE similarity_cache      ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_embeddings    ENABLE ROW LEVEL SECURITY;

-- Embeddings de políticos: leitura pública (são dados derivados de fontes públicas)
CREATE POLICY "leitura_publica_embeddings"
  ON politician_embeddings FOR SELECT USING (true);

-- Similarity cache: leitura pública
CREATE POLICY "leitura_publica_similarity"
  ON similarity_cache FOR SELECT USING (true);

-- Session embeddings: leitura apenas pelo próprio token (via RLS em session_token)
-- Na prática, o acesso é feito pelo backend via service_role, não pelo browser diretamente
CREATE POLICY "leitura_propria_sessao"
  ON session_embeddings FOR SELECT
  USING (true);  -- controle de acesso feito no backend por session_token
```

---

## Checklist de implementação

- [ ] Confirmar que extensão `vector` está ativa (`01_schema_politicians.md`)
- [ ] Criar tabela `politician_embeddings` com índice HNSW
- [ ] Criar tabela `similarity_cache`
- [ ] Criar tabela `session_embeddings`
- [ ] Criar função `find_similar_politicians`
- [ ] Criar função `find_similar_to_session`
- [ ] Criar view `v_embeddings_desatualizados`
- [ ] Habilitar RLS nas 3 tabelas
- [ ] Testar função com `SELECT * FROM find_similar_politicians('<uuid>', 'SP', null, 5, 0.3)`
- [ ] Configurar job de limpeza (pg_cron ou Edge Function agendada)

---

*Próximo arquivo: `04_schema_alerts.md` — alertas de ficha suja, investigações e polêmicas*
