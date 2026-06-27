# VotoSim — Configuração do Supabase

> **Arquivo:** `08_supabase_setup.md`  
> **Pré-requisito:** ter lido o `README_DOCS.v3.md`  
> **Tempo estimado:** 30–40 minutos  
> **Resultado:** banco de dados pronto para conectar ao Lovable

---

## Visão geral das etapas

```
1. Criar conta e projeto no Supabase
2. Habilitar extensões
3. Aplicar DDL — Etapa 1: políticos e candidaturas (01_schema_politicians.md)
4. Aplicar DDL — Etapa 2: temas e questionário (02_schema_themes.v2.md)
5. Aplicar DDL — Etapa 3: alertas (04_schema_alerts.md)
6. Verificar o banco
7. Coletar as chaves de API
8. Conectar ao Lovable
```

Etapas 3–5 são executadas no **SQL Editor** do Supabase, colando os blocos SQL na ordem indicada. Cada etapa tem uma verificação antes de avançar.

---

## Etapa 1 — Criar conta e projeto

### 1.1 Criar conta
Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita com GitHub ou e-mail.

### 1.2 Criar novo projeto

No dashboard, clique em **New project** e preencha:

```
Name:         votosim
Database Password: [gere uma senha forte e guarde — você vai precisar]
Region:       South America (São Paulo)   ← importante para latência
Plan:         Free
```

Clique em **Create new project** e aguarde ~2 minutos enquanto o banco provisiona.

> **Atenção:** guarde a senha do banco agora. O Supabase não a mostra novamente depois.

---

## Etapa 2 — Habilitar extensões

No menu lateral, vá em **Database → Extensions**.

Busque e habilite as seguintes extensões (uma por vez, clicando no toggle):

| Extensão | Para que serve |
|---|---|
| `uuid-ossp` | Geração de UUIDs para os IDs das tabelas |
| `unaccent` | Busca de nomes sem acentos (ex: "Samia" encontra "Sâmia") |
| `pg_trgm` | Busca fuzzy por nome (ex: "Joens" encontra "Jones") |
| `vector` | pgvector — necessário apenas na v2, mas habilitar agora evita retrabalho |

Após habilitar as quatro, vá em **Database → SQL Editor** para as próximas etapas.

---

## Etapa 3 — DDL: políticos e candidaturas

No **SQL Editor**, crie uma nova query, cole o SQL abaixo e clique em **Run**.

### 3.1 Enums

```sql
-- Cargos cobertos nas eleições 2026 (federais e estaduais)
CREATE TYPE office_type AS ENUM (
  'presidente',
  'vice_presidente',
  'senador',
  'governador',
  'vice_governador',
  'deputado_federal',
  'deputado_estadual',
  'deputado_distrital'
);

-- Status da candidatura conforme TSE
CREATE TYPE candidacy_status AS ENUM (
  'pre_candidato',
  'registrado',
  'deferido',
  'indeferido',
  'cassado',
  'eleito',
  'nao_eleito',
  'segundo_turno'
);

-- UFs brasileiras
CREATE TYPE brazilian_state AS ENUM (
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO'
);
```

**Verificação:** deve retornar `Success. No rows returned`.

### 3.2 Tabela `parties`

```sql
CREATE TABLE parties (
  sigla         TEXT PRIMARY KEY,
  nome_completo TEXT NOT NULL,
  numero        SMALLINT UNIQUE NOT NULL,
  espectro      TEXT CHECK (espectro IN (
                  'esquerda','centro_esquerda','centro',
                  'centro_direita','direita','sem_classificacao'
                )),
  fundado_em    DATE,
  logo_url      TEXT,
  site_oficial  TEXT,
  ativo         BOOLEAN DEFAULT true,
  criado_em     TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE parties IS
  'Partidos políticos. Espectro usado apenas como metadado — nunca como critério de match.';
```

### 3.3 Função auxiliar para busca sem acento

O PostgreSQL exige que funções usadas em colunas geradas sejam declaradas como `IMMUTABLE`.
A função `unaccent` nativa não tem essa declaração, então criamos um wrapper antes da tabela:

```sql
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$
  SELECT unaccent($1);
$$;
```

**Verificação:** deve retornar `Success. No rows returned`.

### 3.4 Tabela `politicians`

```sql
CREATE TABLE politicians (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tse_id               TEXT UNIQUE,
  cpf_hash             TEXT UNIQUE,
  nome_completo        TEXT NOT NULL,
  nome_urna            TEXT NOT NULL,
  nome_search          TEXT GENERATED ALWAYS AS (
                         immutable_unaccent(lower(nome_urna))
                       ) STORED,
  data_nascimento      DATE,
  genero               TEXT CHECK (genero IN ('M','F','O')),
  escolaridade         TEXT,
  ocupacao             TEXT,
  naturalidade         TEXT,
  partido_atual        TEXT NOT NULL,
  partido_desde        DATE,
  foto_url             TEXT,
  foto_fonte           TEXT DEFAULT 'tse',
  redes_sociais        JSONB DEFAULT '{}',
  fonte_dados          TEXT DEFAULT 'tse_divulgacand',
  dados_atualizados_em TIMESTAMPTZ DEFAULT now(),
  criado_em            TIMESTAMPTZ DEFAULT now(),
  ativo                BOOLEAN DEFAULT true
);

CREATE INDEX idx_politicians_nome_search
  ON politicians USING gin(nome_search gin_trgm_ops);
CREATE INDEX idx_politicians_partido
  ON politicians (partido_atual);
CREATE INDEX idx_politicians_tse_id
  ON politicians (tse_id);

COMMENT ON TABLE politicians IS
  'Pessoa física do político. Um registro por pessoa, independente de quantas eleições participou.';
COMMENT ON COLUMN politicians.cpf_hash IS
  'SHA-256 do CPF. Nunca armazenar CPF em texto plano.';
COMMENT ON COLUMN politicians.nome_search IS
  'Gerado automaticamente: nome_urna minúsculo sem acentos. Usado nos índices de busca.';
```

### 3.5 Tabela `candidacies`

```sql
CREATE TABLE candidacies (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id        UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  ano_eleicao          SMALLINT NOT NULL CHECK (ano_eleicao >= 1994),
  turno                SMALLINT NOT NULL DEFAULT 1 CHECK (turno IN (1, 2)),
  cargo                office_type NOT NULL,
  estado               brazilian_state NOT NULL,
  municipio_ibge       TEXT,
  numero_urna          TEXT NOT NULL,
  partido_eleicao      TEXT NOT NULL,
  numero_partido       SMALLINT,
  coligacao            TEXT,
  status               candidacy_status DEFAULT 'pre_candidato',
  tse_sequencial       TEXT,
  data_registro        DATE,
  votos_obtidos        INTEGER,
  percentual_votos     NUMERIC(5,2),
  situacao_final       TEXT,
  plano_governo_url    TEXT,
  plano_governo_texto  TEXT,
  plano_governo_resumo TEXT,
  fonte_dados          TEXT DEFAULT 'tse_divulgacand',
  atualizado_em        TIMESTAMPTZ DEFAULT now(),
  criado_em            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (politician_id, ano_eleicao, turno, cargo, estado)
);

CREATE INDEX idx_candidacies_politician
  ON candidacies (politician_id);
CREATE INDEX idx_candidacies_eleicao_cargo_estado
  ON candidacies (ano_eleicao, cargo, estado);
CREATE INDEX idx_candidacies_status
  ON candidacies (status) WHERE status IN ('deferido','registrado');
CREATE INDEX idx_candidacies_2026
  ON candidacies (cargo, estado, status) WHERE ano_eleicao = 2026;

COMMENT ON TABLE candidacies IS
  'Candidatura em eleição específica. Um político pode ter N candidaturas.';
COMMENT ON COLUMN candidacies.plano_governo_texto IS
  'Texto extraído do PDF do plano de governo (TSE). Fonte para extração de temas via Gemini.';
```

### 3.6 View de candidatos 2026

```sql
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
  AND c.status IN ('deferido','registrado','pre_candidato')
  AND p.ativo = true;

COMMENT ON VIEW v_candidates_2026 IS
  'Candidatos disponíveis para o ciclo 2026. Principal view usada pelo backend de busca.';
```

### 3.7 RLS — políticos e candidaturas

```sql
-- Habilitar RLS
ALTER TABLE politicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties     ENABLE ROW LEVEL SECURITY;

-- Leitura pública (dados eleitorais são públicos)
CREATE POLICY "leitura_publica_politicians"
  ON politicians FOR SELECT USING (true);

CREATE POLICY "leitura_publica_candidacies"
  ON candidacies FOR SELECT USING (true);

CREATE POLICY "leitura_publica_parties"
  ON parties FOR SELECT USING (true);

-- Escrita: apenas service_role (pipeline de ingestão)
-- Não criar políticas de INSERT/UPDATE/DELETE para anon ou authenticated
-- service_role bypassa RLS automaticamente
```

### 3.8 Seed de partidos

```sql
INSERT INTO parties (sigla, nome_completo, numero, espectro) VALUES
  ('PT',          'Partido dos Trabalhadores',               13, 'esquerda'),
  ('PL',          'Partido Liberal',                         22, 'direita'),
  ('PSOL',        'Partido Socialismo e Liberdade',          50, 'esquerda'),
  ('UNIÃO',       'União Brasil',                            44, 'centro_direita'),
  ('MDB',         'Movimento Democrático Brasileiro',        15, 'centro'),
  ('PSD',         'Partido Social Democrático',              55, 'centro_direita'),
  ('PP',          'Progressistas',                           11, 'centro_direita'),
  ('REPUBLICANOS','Republicanos',                            10, 'centro_direita'),
  ('PDT',         'Partido Democrático Trabalhista',         12, 'centro_esquerda'),
  ('PSDB',        'Partido da Social Democracia Brasileira', 45, 'centro'),
  ('AVANTE',      'Avante',                                  70, 'centro'),
  ('CIDADANIA',   'Cidadania',                               23, 'centro'),
  ('PCdoB',       'Partido Comunista do Brasil',             65, 'esquerda'),
  ('PRD',         'Partido Renovação Democrática',           25, 'centro_direita'),
  ('SOLIDARIEDADE','Solidariedade',                          77, 'centro'),
  ('PODE',        'Podemos',                                 20, 'centro'),
  ('NOVO',        'Novo',                                    30, 'direita'),
  ('REDE',        'Rede Sustentabilidade',                   18, 'centro_esquerda'),
  ('DC',          'Democracia Cristã',                       27, 'centro_direita'),
  ('PMB',         'Partido da Mulher Brasileira',            35, 'sem_classificacao')
ON CONFLICT (sigla) DO NOTHING;
```

**Verificação:** vá em **Table Editor → parties** e confirme que há registros.

---

## Etapa 4 — DDL: temas e questionário

### 4.1 Enums de temas

```sql
CREATE TYPE theme_category AS ENUM (
  'economia',
  'saude',
  'educacao',
  'seguranca',
  'meio_ambiente',
  'direitos_sociais',
  'politica_externa',
  'infraestrutura',
  'ciencia_tecnologia',
  'cultura',
  'religiao_costumes',
  'reforma_politica',
  'outro'
);

CREATE TYPE position_stance AS ENUM (
  'favoravel',
  'contrario',
  'neutro',
  'variavel'
);
```

### 4.2 Tabela `themes_catalog`

```sql
CREATE TABLE themes_catalog (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                      TEXT UNIQUE NOT NULL,
  nome                      TEXT NOT NULL,
  descricao                 TEXT NOT NULL,
  categoria                 theme_category NOT NULL,
  relevancia_presidente     NUMERIC(3,2) DEFAULT 0.5
                              CHECK (relevancia_presidente BETWEEN 0 AND 1),
  relevancia_senador        NUMERIC(3,2) DEFAULT 0.5
                              CHECK (relevancia_senador BETWEEN 0 AND 1),
  relevancia_governador     NUMERIC(3,2) DEFAULT 0.5
                              CHECK (relevancia_governador BETWEEN 0 AND 1),
  relevancia_deputado_federal  NUMERIC(3,2) DEFAULT 0.5
                              CHECK (relevancia_deputado_federal BETWEEN 0 AND 1),
  relevancia_deputado_estadual NUMERIC(3,2) DEFAULT 0.5
                              CHECK (relevancia_deputado_estadual BETWEEN 0 AND 1),
  relevancia_deputado_distrital NUMERIC(3,2) DEFAULT 0.3
                              CHECK (relevancia_deputado_distrital BETWEEN 0 AND 1),
  nota_educativa            TEXT,
  sinonimos                 TEXT[] DEFAULT '{}',
  -- Campos v2: questionário
  afirmacao_questionario    TEXT,
  contexto_questionario     TEXT,
  exibir_no_quiz            BOOLEAN DEFAULT true,
  ativo                     BOOLEAN DEFAULT true,
  ordem_exibicao            SMALLINT DEFAULT 50,
  criado_em                 TIMESTAMPTZ DEFAULT now(),
  atualizado_em             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_themes_categoria
  ON themes_catalog (categoria);
CREATE INDEX idx_themes_slug
  ON themes_catalog (slug);
CREATE INDEX idx_themes_sinonimos
  ON themes_catalog USING gin(sinonimos);
CREATE INDEX idx_themes_quiz
  ON themes_catalog (exibir_no_quiz, ordem_exibicao)
  WHERE exibir_no_quiz = true;

COMMENT ON TABLE themes_catalog IS
  'Catálogo dos 14 temas políticos. Inclui afirmações do questionário e pesos de relevância por cargo.';
```

### 4.3 Tabela `politician_positions`

```sql
CREATE TABLE politician_positions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id   UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  theme_id        UUID NOT NULL REFERENCES themes_catalog(id) ON DELETE CASCADE,
  posicao         position_stance NOT NULL,
  intensidade     SMALLINT NOT NULL DEFAULT 3 CHECK (intensidade BETWEEN 1 AND 5),
  -- 1=fraca/mencionada uma vez, 2=moderada, 3=clara e documentada,
  -- 4=forte/central na campanha, 5=bandeira identitária
  fontes          JSONB NOT NULL DEFAULT '[]',
  -- [{tipo, descricao, url, data, confiabilidade}]
  -- tipo: votacao_nominal | projeto_lei | plano_governo | entrevista | discurso
  -- confiabilidade: alta | media | baixa
  gerado_por_ia   BOOLEAN DEFAULT true,
  validado        BOOLEAN DEFAULT false,
  confianca_ia    NUMERIC(3,2),
  ano_referencia  SMALLINT,
  valido_ate      DATE,
  notas_curador   TEXT,
  criado_em       TIMESTAMPTZ DEFAULT now(),
  atualizado_em   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (politician_id, theme_id)
);

CREATE INDEX idx_positions_politician
  ON politician_positions (politician_id);
CREATE INDEX idx_positions_theme
  ON politician_positions (theme_id);
CREATE INDEX idx_positions_politician_theme
  ON politician_positions (politician_id, theme_id);
CREATE INDEX idx_positions_stance
  ON politician_positions (posicao, intensidade);
CREATE INDEX idx_positions_nao_validadas
  ON politician_positions (validado, gerado_por_ia)
  WHERE validado = false AND gerado_por_ia = true;

COMMENT ON TABLE politician_positions IS
  'Posição de cada político por tema. Extraída por Gemini do plano de governo. Central para o match.';
```

### 4.4 Tabela `position_history`

```sql
CREATE TABLE position_history (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id    UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  theme_id         UUID NOT NULL REFERENCES themes_catalog(id) ON DELETE CASCADE,
  posicao_anterior position_stance,
  posicao_nova     position_stance NOT NULL,
  intensidade      SMALLINT CHECK (intensidade BETWEEN 1 AND 5),
  data_mudanca     DATE NOT NULL,
  fonte_url        TEXT,
  descricao        TEXT NOT NULL,
  criado_em        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_position_history_politician_theme
  ON position_history (politician_id, theme_id);

COMMENT ON TABLE position_history IS
  'Mudanças de posição ao longo do tempo. Exibido no card como badge "Mudou de posição em X".';
```

### 4.5 Views de cobertura temática

```sql
CREATE VIEW v_politician_theme_coverage AS
SELECT
  p.id                      AS politician_id,
  p.nome_urna,
  p.partido_atual,
  COUNT(pp.id)              AS temas_com_posicao,
  COUNT(pp.id) FILTER (WHERE pp.validado = true)       AS temas_validados,
  COUNT(pp.id) FILTER (WHERE pp.posicao = 'favoravel') AS posicoes_favoraveis,
  COUNT(pp.id) FILTER (WHERE pp.posicao = 'contrario') AS posicoes_contrarias,
  ROUND(AVG(pp.intensidade), 1)                        AS intensidade_media
FROM politicians p
LEFT JOIN politician_positions pp ON pp.politician_id = p.id
WHERE p.ativo = true
GROUP BY p.id, p.nome_urna, p.partido_atual;

CREATE VIEW v_candidates_2026_matchable AS
SELECT
  vc.*,
  cov.temas_com_posicao,
  cov.temas_validados,
  CASE
    WHEN cov.temas_com_posicao >= 5 THEN 'suficiente'
    WHEN cov.temas_com_posicao >= 2 THEN 'parcial'
    ELSE 'insuficiente'
  END AS cobertura_dados
FROM v_candidates_2026 vc
LEFT JOIN v_politician_theme_coverage cov
  ON vc.politician_id = cov.politician_id;
```

### 4.6 RLS — temas e posições

```sql
ALTER TABLE themes_catalog      ENABLE ROW LEVEL SECURITY;
ALTER TABLE politician_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_history    ENABLE ROW LEVEL SECURITY;

-- Temas: leitura pública total
CREATE POLICY "leitura_publica_themes"
  ON themes_catalog FOR SELECT USING (true);

-- Posições: leitura pública apenas de posições validadas
CREATE POLICY "leitura_publica_positions"
  ON politician_positions FOR SELECT
  USING (validado = true);

-- Histórico: leitura pública
CREATE POLICY "leitura_publica_position_history"
  ON position_history FOR SELECT USING (true);
```

### 4.7 Seed — 14 temas com afirmações

Cole e execute o bloco completo abaixo:

```sql
INSERT INTO themes_catalog
  (slug, nome, descricao, categoria,
   relevancia_presidente, relevancia_senador, relevancia_governador,
   relevancia_deputado_federal, relevancia_deputado_estadual,
   nota_educativa, sinonimos, ordem_exibicao,
   afirmacao_questionario, contexto_questionario)
VALUES

('reforma_tributaria','Reforma tributária',
 'Mudanças no sistema de impostos brasileiro, como unificação de tributos e alteração de alíquotas.',
 'economia', 0.9, 0.9, 0.2, 0.9, 0.1,
 'A reforma tributária é legislação federal. Cabe ao Presidente propor e ao Congresso votar. Governadores e deputados estaduais têm papel limitado.',
 ARRAY['imposto','tributação','IVA','CBS','IBS','imposto único','carga tributária'], 10,
 'O sistema tributário brasileiro deve ser reformado para simplificar e unificar os impostos cobrados sobre consumo, renda e produção.',
 'O Brasil tem um dos sistemas de impostos mais complexos do mundo, com tributos federais, estaduais e municipais sobrepostos. Uma reforma poderia simplificar esse sistema — mas há debate sobre quem ganha e quem perde com as mudanças.'),

('sus_saude_publica','Saúde pública (SUS)',
 'Financiamento, estrutura e qualidade do Sistema Único de Saúde.',
 'saude', 0.9, 0.8, 0.8, 0.8, 0.7,
 'Saúde é competência concorrente: União, estados e municípios compartilham responsabilidade. O governo federal financia e normatiza; estados e municípios executam.',
 ARRAY['SUS','hospital público','saúde pública','plano de saúde','UPA','posto de saúde'], 20,
 'O governo deve aumentar o investimento público no SUS como principal forma de garantir saúde à população.',
 'O SUS atende mais de 150 milhões de brasileiros que não têm plano de saúde privado. Há debate sobre se o caminho é investir mais no sistema público ou ampliar incentivos para planos privados populares.'),

('privatizacao_estatais','Privatização × estatização',
 'Debate sobre a venda ou manutenção de empresas estatais como Petrobras, Correios e Eletrobras.',
 'economia', 1.0, 0.9, 0.1, 0.8, 0.05,
 'Estatais federais são privatizadas por lei federal, aprovada pelo Congresso e sancionada pelo Presidente. Governadores e deputados estaduais não votam sobre estatais federais.',
 ARRAY['privatização','estatização','empresa estatal','Petrobras','Correios','Eletrobras'], 30,
 'O governo federal deve vender suas participações em empresas estatais como Petrobras, Correios e Eletrobras para a iniciativa privada.',
 'Empresas estatais são controladas pelo governo e prestam serviços considerados estratégicos. Defensores da privatização argumentam maior eficiência; opositores argumentam que o Estado perde controle sobre setores essenciais.'),

('seguranca_publica_estadual','Segurança pública',
 'Combate à criminalidade, polícias, presídios e política de drogas.',
 'seguranca', 0.6, 0.5, 1.0, 0.5, 0.9,
 'As Polícias Civil e Militar são estaduais — geridas pelos governadores. O governo federal controla a Polícia Federal e a legislação penal. Deputados estaduais votam o orçamento das polícias do estado.',
 ARRAY['segurança','criminalidade','violência','polícia','presídio','tráfico','drogas'], 40,
 'O combate à criminalidade deve priorizar o endurecimento de penas, a ampliação do efetivo policial e a restrição à progressão de regime para condenados.',
 'Há dois grandes modelos de política de segurança: repressão e punição mais severa, versus prevenção social, educação e redução da desigualdade. A maioria dos especialistas defende uma combinação dos dois.'),

('educacao_basica','Educação básica e ensino público',
 'Qualidade das escolas públicas, salário de professores, ENEM e acesso à universidade.',
 'educacao', 0.8, 0.7, 0.8, 0.8, 0.8,
 'Educação é competência concorrente. O governo federal define diretrizes (MEC, BNCC, ENEM) e repassa verbas; estados e municípios gerem suas redes de escolas.',
 ARRAY['educação','escola pública','professor','ENEM','universidade','ensino médio'], 50,
 'O governo deve aumentar o investimento em escolas públicas e na valorização de professores como prioridade da política educacional.',
 'O Brasil gasta valores significativos em educação, mas os resultados em qualidade ainda são baixos. O debate é sobre quanto investir no sistema público versus criar incentivos para escolas privadas com vouchers ou subsídios.'),

('meio_ambiente_desmatamento','Meio ambiente e desmatamento',
 'Proteção da Amazônia, Cerrado e outros biomas, licenciamento ambiental e políticas climáticas.',
 'meio_ambiente', 0.9, 0.8, 0.8, 0.8, 0.7,
 'A política ambiental é responsabilidade federal (IBAMA, ICMBio), mas estados têm papel importante no licenciamento. Desmatamento na Amazônia envolve todos os níveis de governo.',
 ARRAY['Amazônia','desmatamento','Cerrado','licenciamento ambiental','clima','aquecimento global'], 60,
 'O governo deve endurecer a fiscalização ambiental e as restrições ao desmatamento, mesmo que isso limite atividades econômicas em áreas rurais.',
 'O Brasil abriga a maior floresta tropical do mundo e enfrenta pressão internacional para reduzir o desmatamento. Produtores rurais argumentam que restrições limitam o desenvolvimento; ambientalistas apontam os riscos climáticos e a perda de biodiversidade.'),

('reforma_previdencia','Previdência social e aposentadoria',
 'Regras de aposentadoria, INSS, pensões e benefícios sociais.',
 'economia', 0.9, 0.9, 0.1, 0.9, 0.05,
 'Previdência Social (INSS) é federal. Mudanças nas regras exigem Emenda Constitucional aprovada pelo Congresso. Governadores legislam sobre previdências estaduais dos servidores.',
 ARRAY['aposentadoria','INSS','previdência','pensão','reforma da previdência'], 70,
 'O governo deve tornar as regras de aposentadoria mais flexíveis, reduzindo a idade mínima e os requisitos de contribuição exigidos atualmente.',
 'A Reforma da Previdência de 2019 aumentou a idade mínima e o tempo de contribuição. Defensores dizem que era necessário para equilibrar as contas públicas; críticos dizem que prejudicou trabalhadores, especialmente os mais pobres e informais.'),

('direitos_lgbtqia','Direitos LGBTQIA+',
 'Reconhecimento legal, proteção contra discriminação e direitos civis de pessoas LGBTQIA+.',
 'direitos_sociais', 0.7, 0.8, 0.5, 0.8, 0.5,
 'Direitos civis e criminalização da homofobia são temas federais (Congresso e STF). Estados podem legislar sobre proteção local, mas não podem contrariar legislação federal.',
 ARRAY['LGBT','LGBTQIA','homossexualidade','casamento gay','diversidade','identidade de gênero'], 80,
 'O governo deve criar e ampliar leis específicas de proteção contra discriminação de pessoas LGBTQIA+ em áreas como trabalho, saúde e moradia.',
 'O STF criminalizou a homofobia em 2019, mas não existe lei aprovada pelo Congresso sobre o tema. Há debate sobre o papel do Estado na proteção de grupos minoritários versus a autonomia de instituições religiosas e famílias.'),

('porte_armas','Porte e posse de armas',
 'Regulamentação do acesso a armas de fogo por civis.',
 'seguranca', 0.8, 0.8, 0.2, 0.8, 0.1,
 'O Estatuto do Desarmamento é lei federal — só pode ser alterado pelo Congresso. Decretos presidenciais podem flexibilizar ou restringir o acesso. Estados têm papel mínimo.',
 ARRAY['arma','armamento','desarmamento','CAC','estatuto do desarmamento','porte de arma'], 90,
 'O governo deve ampliar o direito do cidadão comum de adquirir e portar armas de fogo para uso pessoal.',
 'O Brasil tem uma das maiores taxas de mortes por armas de fogo do mundo. Defensores da flexibilização argumentam que o cidadão armado se defende melhor; opositores apontam estudos que associam maior acesso a armas com mais mortes.'),

('bolsa_familia_transferencia','Transferência de renda e assistência social',
 'Programas como Bolsa Família, BPC e outros benefícios sociais federais.',
 'direitos_sociais', 1.0, 0.8, 0.2, 0.8, 0.1,
 'Bolsa Família e BPC são programas federais. O Presidente e o Congresso definem critérios e orçamento. Governadores e deputados estaduais não têm ingerência direta.',
 ARRAY['Bolsa Família','auxílio','BPC','renda mínima','assistência social','programa social'], 100,
 'O governo deve ampliar programas de transferência direta de renda para famílias de baixa renda como o Bolsa Família.',
 'Programas de transferência de renda pagam um valor mensal para famílias pobres. Apoiadores dizem que reduzem a fome e a pobreza imediata; críticos argumentam que devem ser temporários e condicionados à inserção no mercado de trabalho.'),

('corrupcao_transparencia','Combate à corrupção',
 'Mecanismos de controle, transparência, órgãos de fiscalização e punição de agentes públicos corruptos.',
 'reforma_politica', 0.9, 0.9, 0.8, 0.8, 0.7,
 'O combate à corrupção envolve todos os poderes e esferas. Leis de transparência e órgãos de controle (TCU, CGU, MP) são federais. Governadores respondem pelos equivalentes estaduais.',
 ARRAY['corrupção','improbidade','ficha limpa','transparência','TCU','CGU','lavagem de dinheiro'], 110,
 'O governo deve fortalecer os órgãos de controle e fiscalização para ampliar a punição de agentes públicos envolvidos em corrupção.',
 'O Brasil perdeu bilhões em esquemas de corrupção nas últimas décadas. Há debate sobre o equilíbrio entre eficiência das investigações e garantias do devido processo legal — e sobre quais órgãos devem ter mais autonomia e recursos.'),

('politica_economica','Política econômica e papel do Estado',
 'Papel do Estado na economia, controle da inflação, juros, câmbio e autonomia do Banco Central.',
 'economia', 1.0, 0.9, 0.3, 0.8, 0.1,
 'A política econômica é definida pelo governo federal. O Banco Central (autônomo desde 2021) define a Selic. O Congresso aprova o orçamento e regras fiscais como o teto de gastos.',
 ARRAY['juros','Selic','inflação','câmbio','Banco Central','teto de gastos','fiscal','déficit'], 120,
 'O governo deve adotar uma política econômica com maior participação estatal em investimentos estratégicos, mesmo que isso implique maior gasto público.',
 'Há dois modelos predominantes: o liberal, que defende menos gasto público e menos intervenção estatal; e o desenvolvimentista, que defende investimento público em infraestrutura e indústria como motor de crescimento. Ambos buscam geração de empregos e controle da inflação por caminhos diferentes.'),

('politica_externa','Política externa e relações internacionais',
 'Alinhamento do Brasil com blocos e países, acordos comerciais e posicionamento em conflitos internacionais.',
 'politica_externa', 1.0, 0.8, 0.0, 0.6, 0.0,
 'Política externa é atribuição exclusiva do Presidente, com participação do Senado na aprovação de tratados. Governadores e deputados estaduais não têm papel neste tema.',
 ARRAY['política externa','relações exteriores','Mercosul','BRICS','Estados Unidos','China','soberania'], 130,
 'O Brasil deve priorizar acordos e alianças com países ocidentais como Estados Unidos e União Europeia em detrimento de blocos como BRICS e parcerias com China e Rússia.',
 'O Brasil historicamente adotou política externa independente, buscando equidistância entre blocos. Há debate sobre se aproximar do ocidente traz mais benefícios comerciais, ou se manter independência preserva soberania e diversifica parcerias econômicas.'),

('pauta_moral_costumes','Valores morais e costumes na legislação',
 'Influência de valores religiosos e conservadores nas leis sobre família, aborto, educação e costumes.',
 'religiao_costumes', 0.7, 0.8, 0.5, 0.8, 0.5,
 'Leis sobre família, aborto e costumes são aprovadas pelo Congresso. O STF também tem papel relevante. Estados podem legislar em algumas áreas, mas não podem contrariar a Constituição.',
 ARRAY['aborto','família','costumes','religião','valores conservadores','escola sem partido'], 140,
 'O governo deve adotar legislação baseada em princípios laicos e científicos ao tratar de temas como aborto, educação sexual e composição familiar, independentemente de posições religiosas.',
 'Há um debate central entre visões laicas — que defendem que o Estado não deve impor valores religiosos — e visões conservadoras — que defendem que a moral tradicional deve orientar as leis. Isso afeta temas como aborto legal, educação nas escolas e reconhecimento de diferentes arranjos familiares.')

ON CONFLICT (slug) DO UPDATE SET
  afirmacao_questionario = EXCLUDED.afirmacao_questionario,
  contexto_questionario  = EXCLUDED.contexto_questionario,
  descricao              = EXCLUDED.descricao,
  nota_educativa         = EXCLUDED.nota_educativa,
  sinonimos              = EXCLUDED.sinonimos,
  atualizado_em          = now();
```

**Verificação:** execute `SELECT slug, nome, ordem_exibicao FROM themes_catalog ORDER BY ordem_exibicao;` e confirme 14 linhas.

---

## Etapa 5 — DDL: alertas

### 5.1 Enums de alerta

```sql
CREATE TYPE alert_type AS ENUM (
  'ficha_suja',
  'investigacao',
  'polemica'
);

CREATE TYPE alert_severity AS ENUM (
  'critica',
  'alta',
  'media',
  'baixa'
);
```

### 5.2 Tabela `politician_alerts`

```sql
CREATE TABLE politician_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id   UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  tipo            alert_type NOT NULL,
  severidade      alert_severity NOT NULL,
  titulo          TEXT NOT NULL,
  descricao       TEXT NOT NULL,
  -- Regra editorial: apenas fatos documentados, sem adjetivos ou juízo de valor.
  -- CORRETO: "Foi condenado em 1ª instância por desvio de R$2,3M em licitações."
  -- ERRADO: "É um político corrupto."
  fonte_url       TEXT NOT NULL,
  fonte_nome      TEXT NOT NULL,
  data_ocorrencia DATE,
  ativo           BOOLEAN DEFAULT true,
  resolucao       TEXT,
  data_resolucao  DATE,
  validado        BOOLEAN DEFAULT false,
  validado_por    TEXT,
  validado_em     TIMESTAMPTZ,
  notas_curador   TEXT,
  gerado_por_ia   BOOLEAN DEFAULT false,
  criado_em       TIMESTAMPTZ DEFAULT now(),
  atualizado_em   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alerts_politician
  ON politician_alerts (politician_id, ativo);
CREATE INDEX idx_alerts_tipo_severidade
  ON politician_alerts (tipo, severidade) WHERE ativo = true;
CREATE INDEX idx_alerts_nao_validados
  ON politician_alerts (validado, tipo) WHERE validado = false AND tipo = 'polemica';

COMMENT ON TABLE politician_alerts IS
  'Alertas sobre candidatos. Exibidos no card com fonte obrigatória. Não excluem o candidato do resultado.';
COMMENT ON COLUMN politician_alerts.fonte_url IS
  'URL da fonte primária. Obrigatório. Preferencialmente fontes governamentais (TSE, STF, Câmara, TCU).';
```

### 5.3 View de alertas para a UI

```sql
CREATE VIEW v_candidate_alerts AS
SELECT
  pa.politician_id,
  p.nome_urna,
  pa.tipo,
  pa.severidade,
  pa.titulo,
  pa.descricao,
  pa.fonte_url,
  pa.fonte_nome,
  pa.data_ocorrencia,
  CASE pa.tipo
    WHEN 'ficha_suja'   THEN 'vermelho'
    WHEN 'investigacao' THEN 'laranja'
    WHEN 'polemica'     THEN 'cinza'
  END AS badge_cor,
  CASE pa.severidade
    WHEN 'critica' THEN 1
    WHEN 'alta'    THEN 2
    WHEN 'media'   THEN 3
    WHEN 'baixa'   THEN 4
  END AS ordem_exibicao
FROM politician_alerts pa
JOIN politicians p ON p.id = pa.politician_id
WHERE pa.ativo = true
  AND pa.validado = true
ORDER BY pa.politician_id, ordem_exibicao;

COMMENT ON VIEW v_candidate_alerts IS
  'Alertas ativos e validados prontos para exibição. Ordenados por severidade.';
```

### 5.4 RLS — alertas

```sql
ALTER TABLE politician_alerts ENABLE ROW LEVEL SECURITY;

-- Leitura pública apenas de alertas validados e ativos
CREATE POLICY "leitura_publica_alertas_validados"
  ON politician_alerts FOR SELECT
  USING (ativo = true AND validado = true);
```

---

## Etapa 6 — Verificação geral

Execute cada query abaixo no SQL Editor e confirme os resultados esperados:

```sql
-- 1. Listar todas as tabelas criadas
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Esperado: candidacies, parties, politician_alerts,
--           politician_positions, politicians, position_history, themes_catalog
```

```sql
-- 2. Listar todas as views criadas
SELECT viewname FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;
-- Esperado: v_candidate_alerts, v_candidates_2026,
--           v_candidates_2026_matchable, v_politician_theme_coverage
```

```sql
-- 3. Confirmar 14 temas com afirmações
SELECT slug, nome, ordem_exibicao,
       LEFT(afirmacao_questionario, 60) AS afirmacao_preview
FROM themes_catalog
ORDER BY ordem_exibicao;
-- Esperado: 14 linhas, todas com afirmacao_preview preenchido
```

```sql
-- 4. Confirmar partidos seed
SELECT COUNT(*) FROM parties;
-- Esperado: 20
```

```sql
-- 5. Confirmar RLS ativo
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('politicians','candidacies','themes_catalog','politician_alerts');
-- Esperado: rowsecurity = true em todas as 4 linhas
```

```sql
-- 6. Confirmar extensões
SELECT extname FROM pg_extension
WHERE extname IN ('uuid-ossp','vector','unaccent','pg_trgm');
-- Esperado: 4 linhas
```

Se todas as 6 verificações passarem, o banco está correto.

---

## Etapa 7 — Coletar as chaves de API

No Supabase Dashboard, vá em **Project Settings → API**.

Você vai precisar de três valores:

| Variável | Onde encontrar | Uso |
|---|---|---|
| `SUPABASE_URL` | Project URL (ex: `https://xxxx.supabase.co`) | Frontend + Edge Functions |
| `SUPABASE_ANON_KEY` | Project API Keys → `anon public` | Frontend (seguro expor no browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API Keys → `service_role` | Apenas Edge Functions e pipeline — **nunca expor no browser** |

Guarde os três valores. O `service_role` bypassa o RLS — quem tem essa chave pode ler e escrever qualquer dado.

---

## Etapa 8 — Conectar ao Lovable

### 8.1 No Lovable — fluxo OAuth (não requer colar URL/Anon Key manualmente)

O Lovable conecta ao Supabase via OAuth — não é necessário colar URL ou chaves nesta etapa.

1. Abra seu projeto no Lovable
2. Vá em **Settings → Connectors → Supabase**
3. Clique em **Manage Connected Organizations**
4. Selecione a organização do Supabase onde está o projeto VotoSim
5. De volta ao chat do Lovable, diga:
   ```
   Connect my Supabase project VotoSim to this app
   ```
6. O Lovable lista os projetos disponíveis na organização — selecione o VotoSim
7. Para confirmar a conexão, peça no chat:
   ```
   List the tables available in my connected Supabase project
   ```
   Se retornar `politicians`, `candidacies`, `themes_catalog`, etc., está tudo conectado.

> O Lovable detecta o schema automaticamente via OAuth e passa a usar
> as chaves do projeto internamente. Sem necessidade de configuração manual
> de URL ou Anon Key nesta etapa.

### 8.2 Configurar secrets para Edge Functions

As Edge Functions do Supabase (onde ficará a chamada ao Gemini e a lógica de match) precisam das chaves secretas. Configure em **Supabase Dashboard → Edge Functions → Secrets**:

```
SERVICE_ROLE_KEY   = [a chave service_role coletada acima]
# Atenção: o Supabase não permite o prefixo SUPABASE_ em secrets customizados
GEMINI_API_KEY              = [obter em aistudio.google.com → Get API key]
```

> **Como obter a GEMINI_API_KEY:**
> 1. Acesse [aistudio.google.com](https://aistudio.google.com)
> 2. Faça login com sua conta Google
> 3. Clique em **Get API key → Create API key**
> 4. Selecione **Create API key in new project**
> 5. Copie a chave — começa com `AIza...`
> 6. **Não ativar billing** — o free tier é suficiente para o MVP (1.500 req/dia, 5.000 grounding queries/mês)

### 8.3 Variáveis de ambiente no Lovable (opcional via OAuth)

Com a conexão OAuth ativa, o Lovable gerencia as chaves do Supabase internamente.
Caso alguma Edge Function precise de variáveis adicionais, configure em **Settings → Environment Variables**:

```
VITE_SUPABASE_URL      = https://xxxx.supabase.co   ← só se necessário explicitamente
VITE_SUPABASE_ANON_KEY = eyJ...                     ← só se necessário explicitamente
```

> O prefixo `VITE_` é obrigatório para variáveis acessíveis no browser em projetos Vite.
> Nunca colocar `SERVICE_ROLE_KEY` ou `GEMINI_API_KEY` com prefixo `VITE_`.

---

## Checklist final

```
Supabase:
  [ ] Projeto criado na região South America (São Paulo)
  [ ] 4 extensões habilitadas: uuid-ossp, vector, unaccent, pg_trgm
  [ ] Etapa 3 aplicada: enums + parties + politicians + candidacies + view + RLS + seed partidos
  [ ] Etapa 4 aplicada: enums + themes_catalog + positions + history + views + RLS + seed 14 temas
  [ ] Etapa 5 aplicada: enums + alerts + view + RLS
  [ ] 6 verificações passaram sem erro
  [ ] 3 chaves coletadas: URL, anon_key, service_role_key
  [ ] Secrets configurados nas Edge Functions: SERVICE_ROLE_KEY + GEMINI_API_KEY

Lovable:
  [ ] Supabase conectado via Settings → Connectors
  [ ] Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY configuradas
  [ ] Teste: Lovable consegue listar os 14 temas via query SELECT
```

---

## Próximo passo

Com o Supabase configurado e conectado ao Lovable, o próximo documento é o briefing completo para construir o MVP no Lovable: telas, fluxo, integração com Gemini e estrutura das Edge Functions.

Ver: `09_lovable_briefing.md`

---

*Arquivo anterior: `07_questionnaire.md`*  
*Próximo arquivo: `09_lovable_briefing.md`*
