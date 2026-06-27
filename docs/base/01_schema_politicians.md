# VotoSim — Schema: Políticos e Candidaturas

> **Arquivo:** `01_schema_politicians.md`  
> **Banco:** Supabase (PostgreSQL 15 + pgvector)  
> **Dependências:** nenhuma (tabela base)  
> **Lido por:** `02_schema_themes.md`, `03_schema_embeddings.md`, `04_schema_alerts.md`

---

## Contexto

Este arquivo define as tabelas que representam **políticos** (pessoas) e suas **candidaturas** (participações em eleições específicas). Um político pode ter múltiplas candidaturas ao longo do tempo.

A separação entre `politicians` e `candidacies` é intencional:
- `politicians` armazena dados estáveis da pessoa (nome, CPF hash, partido atual)
- `candidacies` armazena dados voláteis por eleição (cargo disputado, estado, status TSE)

Isso permite que o algoritmo de match use o histórico completo de votações e posições de um político, mesmo que ele esteja concorrendo a um cargo diferente em 2026.

---

## Extensões necessárias

```sql
-- Habilitar no Supabase Dashboard > Database > Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";        -- pgvector (embeddings)
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- busca sem acento
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- busca fuzzy por nome
```

## Função auxiliar obrigatória

O PostgreSQL exige que funções em colunas geradas sejam `IMMUTABLE`.
`unaccent` nativa não tem essa declaração — criar o wrapper antes das tabelas:

```sql
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$
  SELECT unaccent($1);
$$;
```

---

## Enums

```sql
-- Cargos possíveis no sistema (eleições 2026 — federais e estaduais)
CREATE TYPE office_type AS ENUM (
  'presidente',
  'vice_presidente',
  'senador',
  'governador',
  'vice_governador',
  'deputado_federal',
  'deputado_estadual',
  'deputado_distrital'
  -- vereador e prefeito fora do escopo v1.0
);

-- Status da candidatura no TSE
CREATE TYPE candidacy_status AS ENUM (
  'pre_candidato',    -- antes do registro oficial (antes jul/2026)
  'registrado',       -- registro deferido pelo TSE
  'deferido',         -- apto a disputar
  'indeferido',       -- impedido pelo TSE
  'cassado',          -- cassado após eleição
  'eleito',
  'nao_eleito',
  'segundo_turno'
);

-- Estados brasileiros (UF)
CREATE TYPE brazilian_state AS ENUM (
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO'
);
```

---

## Tabela: `politicians`

Representa a **pessoa física** do político, independente de eleição ou cargo.

```sql
CREATE TABLE politicians (
  -- Identificação
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tse_id          TEXT UNIQUE,                    -- ID único no TSE (sequencial_candidato)
  cpf_hash        TEXT UNIQUE,                    -- SHA-256 do CPF (nunca armazenar CPF raw)
  nome_completo   TEXT NOT NULL,
  nome_urna       TEXT NOT NULL,                  -- nome como aparece na urna
  nome_search     TEXT GENERATED ALWAYS AS (      -- versão sem acento para busca
                    immutable_unaccent(lower(nome_urna))
                  ) STORED,

  -- Dados pessoais públicos (fonte: TSE)
  data_nascimento DATE,
  genero          TEXT CHECK (genero IN ('M', 'F', 'O')),
  escolaridade    TEXT,
  ocupacao        TEXT,                           -- ocupação declarada ao TSE
  naturalidade    TEXT,

  -- Filiação atual
  partido_atual   TEXT NOT NULL,                  -- sigla ex: 'PT', 'PL', 'PSOL'
  partido_desde   DATE,

  -- Foto
  foto_url        TEXT,                           -- URL pública (TSE ou curadoria)
  foto_fonte      TEXT DEFAULT 'tse',

  -- Redes sociais verificadas (JSON para flexibilidade)
  redes_sociais   JSONB DEFAULT '{}',
  -- Formato esperado:
  -- { "twitter": "@usuario", "instagram": "@usuario", "youtube": "canal", "site": "https://..." }

  -- Metadados de ingestão
  fonte_dados     TEXT DEFAULT 'tse_divulgacand',
  dados_atualizados_em TIMESTAMPTZ DEFAULT now(),
  criado_em       TIMESTAMPTZ DEFAULT now(),
  ativo           BOOLEAN DEFAULT true            -- false = removido/falecido/sem candidatura ativa
);

-- Índices para busca
CREATE INDEX idx_politicians_nome_search
  ON politicians USING gin(nome_search gin_trgm_ops);

CREATE INDEX idx_politicians_partido
  ON politicians (partido_atual);

CREATE INDEX idx_politicians_tse_id
  ON politicians (tse_id);

COMMENT ON TABLE politicians IS
  'Pessoas físicas que são ou foram políticos. Um registro por pessoa, independente de quantas eleições participou.';
COMMENT ON COLUMN politicians.cpf_hash IS
  'Hash SHA-256 do CPF. Nunca armazenar o CPF em texto plano. Usado apenas para deduplicação na ingestão.';
COMMENT ON COLUMN politicians.nome_search IS
  'Coluna gerada automaticamente: nome_urna em minúsculas sem acentos. Usada nos índices de busca fuzzy.';
```

---

## Tabela: `candidacies`

Representa a participação de um político em uma **eleição específica**, para um **cargo específico**.

```sql
CREATE TABLE candidacies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id   UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,

  -- Eleição
  ano_eleicao     SMALLINT NOT NULL CHECK (ano_eleicao >= 1994),
  turno           SMALLINT NOT NULL DEFAULT 1 CHECK (turno IN (1, 2)),

  -- Cargo e localização
  cargo           office_type NOT NULL,
  estado          brazilian_state NOT NULL,
  municipio_ibge  TEXT,                           -- código IBGE (relevante para cargos estaduais/distritais)
  numero_urna     TEXT NOT NULL,                  -- número do candidato na urna

  -- Partido na época (pode diferir do partido_atual em politicians)
  partido_eleicao TEXT NOT NULL,
  numero_partido  SMALLINT,
  coligacao       TEXT,                           -- nome da coligação/federação

  -- Status TSE
  status          candidacy_status DEFAULT 'pre_candidato',
  tse_sequencial  TEXT,                           -- sequencial único TSE para esta candidatura
  data_registro   DATE,                           -- data do registro no TSE

  -- Resultado eleitoral (preenchido após a eleição)
  votos_obtidos   INTEGER,
  percentual_votos NUMERIC(5,2),
  situacao_final  TEXT,                           -- texto livre do TSE (ex: "ELEITO POR QP")

  -- Dados do plano de governo (quando disponível)
  plano_governo_url     TEXT,
  plano_governo_texto   TEXT,                     -- texto extraído do PDF do plano de governo
  plano_governo_resumo  TEXT,                     -- resumo gerado por IA (max 500 chars)

  -- Metadados
  fonte_dados     TEXT DEFAULT 'tse_divulgacand',
  atualizado_em   TIMESTAMPTZ DEFAULT now(),
  criado_em       TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  UNIQUE (politician_id, ano_eleicao, turno, cargo, estado)
);

-- Índices para queries frequentes
CREATE INDEX idx_candidacies_politician
  ON candidacies (politician_id);

CREATE INDEX idx_candidacies_eleicao_cargo_estado
  ON candidacies (ano_eleicao, cargo, estado);

CREATE INDEX idx_candidacies_status
  ON candidacies (status) WHERE status IN ('deferido', 'registrado');

CREATE INDEX idx_candidacies_2026
  ON candidacies (cargo, estado, status)
  WHERE ano_eleicao = 2026;

COMMENT ON TABLE candidacies IS
  'Candidatura de um político em uma eleição específica. Um político pode ter N candidaturas.';
COMMENT ON COLUMN candidacies.plano_governo_texto IS
  'Texto completo extraído do PDF do plano de governo enviado ao TSE. Fonte para extração de temas via IA.';
```

---

## Tabela: `parties`

Tabela auxiliar com dados dos partidos políticos.

```sql
CREATE TABLE parties (
  sigla           TEXT PRIMARY KEY,               -- ex: 'PT', 'PL', 'PSOL'
  nome_completo   TEXT NOT NULL,
  numero          SMALLINT UNIQUE NOT NULL,        -- número eleitoral
  espectro        TEXT CHECK (espectro IN (
                    'esquerda', 'centro_esquerda', 'centro',
                    'centro_direita', 'direita', 'sem_classificacao'
                  )),
  fundado_em      DATE,
  logo_url        TEXT,
  site_oficial    TEXT,
  ativo           BOOLEAN DEFAULT true,
  criado_em       TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE parties IS
  'Partidos políticos. Usado para enriquecer perfis e como filtro secundário de busca.';
COMMENT ON COLUMN parties.espectro IS
  'Classificação do espectro político. Usada apenas como metadado informativo, nunca como critério de match.';
```

---

## Views úteis

```sql
-- Candidatos ativos em 2026 com dados do político
CREATE VIEW v_candidates_2026 AS
SELECT
  c.id                  AS candidacy_id,
  c.politician_id,
  p.nome_urna,
  p.nome_completo,
  p.partido_atual,
  p.foto_url,
  c.cargo,
  c.estado,
  c.municipio_ibge,
  c.numero_urna,
  c.partido_eleicao,
  c.status,
  c.plano_governo_resumo,
  p.dados_atualizados_em
FROM candidacies c
JOIN politicians p ON c.politician_id = p.id
WHERE c.ano_eleicao = 2026
  AND c.turno = 1
  AND c.status IN ('deferido', 'registrado', 'pre_candidato')
  AND p.ativo = true;

COMMENT ON VIEW v_candidates_2026 IS
  'Candidatos disponíveis para o ciclo 2026. Principal view usada pelo backend de busca.';
```

---

## Row Level Security (RLS)

```sql
-- Habilitar RLS nas tabelas
ALTER TABLE politicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties     ENABLE ROW LEVEL SECURITY;

-- Leitura pública (anon key do Supabase)
-- Todos podem ler políticos e candidaturas — dados públicos
CREATE POLICY "leitura_publica_politicians"
  ON politicians FOR SELECT
  USING (true);

CREATE POLICY "leitura_publica_candidacies"
  ON candidacies FOR SELECT
  USING (true);

CREATE POLICY "leitura_publica_parties"
  ON parties FOR SELECT
  USING (true);

-- Escrita apenas pelo service_role (pipeline de ingestão backend)
-- Nenhuma política de INSERT/UPDATE/DELETE para anon ou authenticated
-- O pipeline usa a service_role key do Supabase, que bypassa RLS
```

---

## Dados de seed mínimos (para desenvolvimento)

```sql
-- Partidos principais para seed inicial
INSERT INTO parties (sigla, nome_completo, numero, espectro) VALUES
  ('PT',   'Partido dos Trabalhadores',                13, 'esquerda'),
  ('PL',   'Partido Liberal',                          22, 'direita'),
  ('PSOL', 'Partido Socialismo e Liberdade',           50, 'esquerda'),
  ('UNIÃO','União Brasil',                             44, 'centro_direita'),
  ('MDB',  'Movimento Democrático Brasileiro',         15, 'centro'),
  ('PSD',  'Partido Social Democrático',               55, 'centro_direita'),
  ('PP',   'Progressistas',                            11, 'centro_direita'),
  ('REPUBLICANOS', 'Republicanos',                     10, 'centro_direita'),
  ('PDT',  'Partido Democrático Trabalhista',          12, 'centro_esquerda'),
  ('PSDB', 'Partido da Social Democracia Brasileira',  45, 'centro')
ON CONFLICT (sigla) DO NOTHING;
```

---

## Checklist de implementação

- [ ] Executar extensões (`uuid-ossp`, `vector`, `unaccent`, `pg_trgm`)
- [ ] Criar enums na ordem correta
- [ ] Criar tabela `parties` (sem dependências)
- [ ] Criar tabela `politicians`
- [ ] Criar tabela `candidacies` (depende de `politicians`)
- [ ] Criar índices
- [ ] Criar view `v_candidates_2026`
- [ ] Habilitar RLS e criar políticas
- [ ] Executar seed de partidos
- [ ] Validar com `\d+ politicians` e `\d+ candidacies` no psql

---

*Próximo arquivo: `02_schema_themes.md` — temas políticos e posições dos candidatos*
