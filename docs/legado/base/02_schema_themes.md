# VotoSim — Schema: Temas e Posições

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-27
> **Motivo:** Idêntico, byte a byte, a `02_schema_themes.v1.md` — descreve a versão de 10 temas, anterior aos campos `afirmacao_questionario`, `contexto_questionario` e `exibir_no_quiz`.
> **Substituído por:** `docs/referencia/questionario.md`


> **Arquivo:** `02_schema_themes.md`  
> **Banco:** Supabase (PostgreSQL 15)  
> **Depende de:** `01_schema_politicians.md` (tabela `politicians`)  
> **Lido por:** `03_schema_embeddings.md`, `05_schema_match_algorithm.md`

---

## Contexto

Este arquivo define como o sistema representa **temas políticos** e as **posições** que cada candidato tem sobre eles.

Dois conceitos distintos:
- `themes_catalog` — catálogo global de temas (ex: "Reforma tributária", "Segurança pública"). Curado manualmente, enriquecido por IA.
- `politician_positions` — posição específica de um político sobre um tema, com intensidade e fontes.

A qualidade desses dados é o principal determinante da qualidade do match. Um candidato sem posições registradas recebe o label "Dados insuficientes" no resultado.

---

## Tabela: `themes_catalog`

Catálogo centralizado de temas políticos usados no sistema.

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

CREATE TABLE themes_catalog (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            TEXT UNIQUE NOT NULL,           -- ex: 'reforma_tributaria', 'privatizacao_petrobras'
  nome            TEXT NOT NULL,                  -- ex: "Reforma tributária"
  descricao       TEXT NOT NULL,                  -- 1-2 frases explicando o tema em linguagem simples
  categoria       theme_category NOT NULL,

  -- Relevância por cargo (0.0 a 1.0)
  -- Peso que este tema tem no cálculo de match para cada cargo
  -- 1.0 = cargo totalmente responsável por este tema
  -- 0.0 = cargo sem nenhuma atribuição sobre este tema
  relevancia_presidente         NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_presidente BETWEEN 0 AND 1),
  relevancia_senador            NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_senador BETWEEN 0 AND 1),
  relevancia_governador         NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_governador BETWEEN 0 AND 1),
  relevancia_deputado_federal   NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_deputado_federal BETWEEN 0 AND 1),
  relevancia_deputado_estadual  NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_deputado_estadual BETWEEN 0 AND 1),
  relevancia_deputado_distrital NUMERIC(3,2) DEFAULT 0.3 CHECK (relevancia_deputado_distrital BETWEEN 0 AND 1),

  -- Texto educativo exibido ao usuário quando ele seleciona este tema
  nota_educativa  TEXT,
  -- Ex: "Privatização de estatais é definida por lei federal. Cabe ao Presidente propor
  --      e ao Congresso (Deputados e Senadores) aprovar ou rejeitar."

  -- Sinônimos e termos alternativos (para detecção via IA)
  sinonimos       TEXT[] DEFAULT '{}',
  -- Ex: ['privatização', 'estatização', 'empresa estatal', 'empresa pública']

  -- Metadados
  ativo           BOOLEAN DEFAULT true,
  ordem_exibicao  SMALLINT DEFAULT 50,            -- menor = aparece primeiro na UI
  criado_em       TIMESTAMPTZ DEFAULT now(),
  atualizado_em   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_themes_categoria ON themes_catalog (categoria);
CREATE INDEX idx_themes_slug ON themes_catalog (slug);
CREATE INDEX idx_themes_sinonimos ON themes_catalog USING gin(sinonimos);

COMMENT ON TABLE themes_catalog IS
  'Catálogo global de temas políticos. Curado manualmente. Cada tema inclui pesos de relevância por cargo para o algoritmo de match.';
COMMENT ON COLUMN themes_catalog.relevancia_presidente IS
  'Peso 0.0–1.0 de quanto este tema é atribuição do cargo de Presidente. Usado como multiplicador no cálculo de match.';
COMMENT ON COLUMN themes_catalog.sinonimos IS
  'Lista de termos alternativos. Usada pelo agente de IA para reconhecer o tema quando o usuário descreve com palavras diferentes.';
```

---

## Tabela: `politician_positions`

Posição de um político específico sobre um tema específico.

```sql
CREATE TYPE position_stance AS ENUM (
  'favoravel',        -- político apoia / defende este tema
  'contrario',        -- político se opõe a este tema
  'neutro',           -- posição ambígua ou sem declaração clara
  'variavel'          -- mudou de posição ao longo do tempo (registrar histórico em position_history)
);

CREATE TABLE politician_positions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id   UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  theme_id        UUID NOT NULL REFERENCES themes_catalog(id) ON DELETE CASCADE,

  -- Posição e intensidade
  posicao         position_stance NOT NULL,
  intensidade     SMALLINT NOT NULL DEFAULT 3
                  CHECK (intensidade BETWEEN 1 AND 5),
  -- Escala de intensidade:
  -- 1 = posição fraca / mencionada uma vez
  -- 2 = posição moderada
  -- 3 = posição clara e documentada
  -- 4 = posição forte / tema central da campanha
  -- 5 = tema bandeira / identidade política do candidato

  -- Evidências (mínimo 1 fonte obrigatória)
  fontes          JSONB NOT NULL DEFAULT '[]',
  -- Formato esperado (array de objetos):
  -- [
  --   {
  --     "tipo": "votacao_nominal",       -- votacao_nominal | discurso | plano_governo | entrevista | projeto_lei
  --     "descricao": "Votou a favor da PEC 45/2019 (reforma tributária)",
  --     "url": "https://camara.leg.br/...",
  --     "data": "2023-07-06",
  --     "confiabilidade": "alta"         -- alta | media | baixa
  --   }
  -- ]

  -- Geração e validação
  gerado_por_ia   BOOLEAN DEFAULT true,           -- true = extraído por IA, false = curadoria manual
  validado        BOOLEAN DEFAULT false,           -- true = revisado por curador humano
  confianca_ia    NUMERIC(3,2),                   -- score de confiança da extração por IA (0.0–1.0)

  -- Contexto temporal
  ano_referencia  SMALLINT,                       -- ano a que esta posição se refere (pode ser histórica)
  valido_ate      DATE,                           -- null = ainda válida

  -- Metadados
  notas_curador   TEXT,                           -- observações internas do curador
  criado_em       TIMESTAMPTZ DEFAULT now(),
  atualizado_em   TIMESTAMPTZ DEFAULT now(),

  -- Um político tem apenas uma posição ativa por tema por vez
  UNIQUE (politician_id, theme_id)
);

-- Índices críticos para o algoritmo de match
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
  'Posição de cada político sobre cada tema. Central para o cálculo de match. Mínimo 1 fonte por registro.';
COMMENT ON COLUMN politician_positions.intensidade IS
  '1=fraca, 2=moderada, 3=clara, 4=forte, 5=bandeira. Multiplicador no algoritmo de match.';
COMMENT ON COLUMN politician_positions.fontes IS
  'Array JSON com evidências. Obrigatório mínimo 1 item. Cada item: {tipo, descricao, url, data, confiabilidade}.';
```

---

## Tabela: `position_history`

Histórico de mudanças de posição de um político (para casos de `posicao = 'variavel'`).

```sql
CREATE TABLE position_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id   UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  theme_id        UUID NOT NULL REFERENCES themes_catalog(id) ON DELETE CASCADE,

  posicao_anterior  position_stance,
  posicao_nova      position_stance NOT NULL,
  intensidade       SMALLINT CHECK (intensidade BETWEEN 1 AND 5),
  data_mudanca      DATE NOT NULL,
  fonte_url         TEXT,
  descricao         TEXT NOT NULL,               -- ex: "Em 2019 era contra; em 2022 passou a apoiar após..."

  criado_em         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_position_history_politician_theme
  ON position_history (politician_id, theme_id);

COMMENT ON TABLE position_history IS
  'Registro de mudanças de posição ao longo do tempo. Exibido no card do candidato como "Mudou de posição em X".';
```

---

## Seed: temas principais (dados de exemplo)

```sql
INSERT INTO themes_catalog
  (slug, nome, descricao, categoria,
   relevancia_presidente, relevancia_senador, relevancia_governador,
   relevancia_deputado_federal, relevancia_deputado_estadual,
   nota_educativa, sinonimos, ordem_exibicao)
VALUES

('reforma_tributaria',
 'Reforma tributária',
 'Mudanças no sistema de impostos brasileiro, como unificação de tributos e alteração de alíquotas.',
 'economia',
 0.9, 0.9, 0.2, 0.9, 0.1,
 'A reforma tributária é legislação federal. Cabe ao Presidente propor e ao Congresso Nacional (Deputados Federais e Senadores) votar. Governadores e deputados estaduais têm papel limitado.',
 ARRAY['imposto', 'tributação', 'IVA', 'CBS', 'IBS', 'imposto único', 'carga tributária'],
 10),

('sus_saude_publica',
 'Saúde pública (SUS)',
 'Financiamento, estrutura e qualidade do Sistema Único de Saúde.',
 'saude',
 0.9, 0.8, 0.8, 0.8, 0.7,
 'Saúde é competência concorrente: União, estados e municípios compartilham responsabilidade. O governo federal financia e normatiza o SUS; estados e municípios executam os serviços.',
 ARRAY['SUS', 'hospital público', 'saúde pública', 'plano de saúde', 'UPA', 'posto de saúde'],
 20),

('privatizacao_estatais',
 'Privatização × estatização',
 'Debate sobre a venda ou manutenção de empresas estatais como Petrobras, Correios e Eletrobras.',
 'economia',
 1.0, 0.9, 0.1, 0.8, 0.05,
 'Estatais federais são privatizadas por lei federal, aprovada pelo Congresso e sancionada pelo Presidente. Governadores e deputados estaduais não votam sobre estatais federais — mas podem votar sobre estatais dos seus estados.',
 ARRAY['privatização', 'estatização', 'empresa estatal', 'Petrobras', 'Correios', 'Eletrobras', 'empresa pública'],
 30),

('seguranca_publica_estadual',
 'Segurança pública',
 'Combate à criminalidade, polícias, presídios e política de drogas.',
 'seguranca',
 0.6, 0.5, 1.0, 0.5, 0.9,
 'As Polícias Civil e Militar são estaduais — geridas pelos governadores. O governo federal controla a Polícia Federal e a legislação penal (via Congresso). Deputados estaduais votam o orçamento das polícias do seu estado.',
 ARRAY['segurança', 'criminalidade', 'violência', 'polícia', 'presídio', 'tráfico', 'drogas', 'armamento'],
 40),

('educacao_basica',
 'Educação básica e ensino público',
 'Qualidade das escolas públicas, salário de professores, ENEM e acesso à universidade.',
 'educacao',
 0.8, 0.7, 0.8, 0.8, 0.8,
 'Educação é competência concorrente. O governo federal define as diretrizes (MEC, BNCC, ENEM) e repassa verbas; estados e municípios gerem suas redes de escolas.',
 ARRAY['educação', 'escola pública', 'professor', 'ENEM', 'universidade', 'vestibular', 'ensino médio'],
 50),

('meio_ambiente_desmatamento',
 'Meio ambiente e desmatamento',
 'Proteção da Amazônia, Cerrado e outros biomas, licenciamento ambiental e políticas climáticas.',
 'meio_ambiente',
 0.9, 0.8, 0.8, 0.8, 0.7,
 'A política ambiental é responsabilidade federal (IBAMA, ICMBio), mas estados têm papel importante no licenciamento e fiscalização. Desmatamento na Amazônia envolve governo federal, estadual e municipal.',
 ARRAY['Amazônia', 'desmatamento', 'Cerrado', 'licenciamento ambiental', 'clima', 'aquecimento global', 'meio ambiente'],
 60),

('reforma_previdencia',
 'Previdência social e aposentadoria',
 'Regras de aposentadoria, INSS, pensões e benefícios sociais.',
 'economia',
 0.9, 0.9, 0.1, 0.9, 0.05,
 'Previdência Social (INSS) é federal. Mudanças nas regras de aposentadoria exigem Emenda Constitucional, aprovada pelo Congresso. Governadores e deputados estaduais legislam sobre previdências estaduais (dos servidores do estado).',
 ARRAY['aposentadoria', 'INSS', 'previdência', 'pensão', 'benefício social', 'reforma da previdência'],
 70),

('direitos_lgbtqia',
 'Direitos LGBTQIA+',
 'Reconhecimento legal, proteção contra discriminação e direitos civis de pessoas LGBTQIA+.',
 'direitos_sociais',
 0.7, 0.8, 0.5, 0.8, 0.5,
 'Direitos civis e criminalização da homofobia são temas federais (Congresso e STF). Estados e municípios podem legislar sobre proteção local, mas não podem contrariar legislação federal.',
 ARRAY['LGBT', 'LGBTQIA', 'homossexualidade', 'casamento gay', 'diversidade', 'identidade de gênero', 'transsexual'],
 80),

('porte_armas',
 'Porte e posse de armas',
 'Regulamentação do acesso a armas de fogo por civis.',
 'seguranca',
 0.8, 0.8, 0.2, 0.8, 0.1,
 'O Estatuto do Desarmamento é lei federal — só pode ser alterado pelo Congresso. Decretos presidenciais podem flexibilizar ou restringir o acesso. Estados têm papel mínimo neste tema.',
 ARRAY['arma', 'armamento', 'desarmamento', 'CAC', 'estatuto do desarmamento', 'porte de arma'],
 90),

('bolsa_familia_transferencia',
 'Transferência de renda e assistência social',
 'Programas como Bolsa Família, BPC e outros benefícios sociais federais.',
 'direitos_sociais',
 1.0, 0.8, 0.2, 0.8, 0.1,
 'Bolsa Família e BPC são programas federais controlados pelo governo federal. O Presidente e o Congresso definem os critérios e o orçamento. Governadores e deputados estaduais não têm ingerência direta.',
 ARRAY['Bolsa Família', 'auxílio', 'BPC', 'renda mínima', 'assistência social', 'programa social', 'benefício'],
 100)

ON CONFLICT (slug) DO NOTHING;
```

---

## Views úteis

```sql
-- Cobertura temática por candidato (quantos temas têm posição registrada)
CREATE VIEW v_politician_theme_coverage AS
SELECT
  p.id                      AS politician_id,
  p.nome_urna,
  p.partido_atual,
  COUNT(pp.id)              AS temas_com_posicao,
  COUNT(pp.id) FILTER (WHERE pp.validado = true) AS temas_validados,
  COUNT(pp.id) FILTER (WHERE pp.posicao = 'favoravel')  AS posicoes_favoraveis,
  COUNT(pp.id) FILTER (WHERE pp.posicao = 'contrario')  AS posicoes_contrarias,
  ROUND(AVG(pp.intensidade), 1)  AS intensidade_media
FROM politicians p
LEFT JOIN politician_positions pp ON pp.politician_id = p.id
WHERE p.ativo = true
GROUP BY p.id, p.nome_urna, p.partido_atual;

-- Candidatos 2026 com cobertura temática mínima para o match
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

---

## Regras de negócio importantes

```
REGRA 1 — Fonte obrigatória
  Nenhum registro em politician_positions pode ter fontes = '[]'
  O pipeline de ingestão deve rejeitar posições sem evidência.

REGRA 2 — Intensidade mínima para penalidade
  Posições com intensidade <= 2 não geram penalidade no match para temas "discordo".
  Apenas posições com intensidade >= 3 ativam penalidade.
  (Evitar penalizar candidato por menção casual a um tema)

REGRA 3 — Dados insuficientes
  Candidato com menos de 2 temas com posição registrada
  não recebe percentual de match — exibe "Dados insuficientes".

REGRA 4 — Prioridade de fontes
  Confiabilidade: votacao_nominal > projeto_lei > plano_governo > entrevista > discurso
  O algoritmo usa a fonte de maior confiabilidade disponível como evidência principal.

REGRA 5 — Posição variável
  Se posicao = 'variavel', obrigatório ter ao menos 1 registro em position_history.
  O card do candidato exibe badge "Mudou de posição" com link para o histórico.
```

---

## Checklist de implementação

- [ ] Criar enum `theme_category` e `position_stance`
- [ ] Criar tabela `themes_catalog`
- [ ] Criar tabela `politician_positions`
- [ ] Criar tabela `position_history`
- [ ] Criar índices de todas as tabelas
- [ ] Criar views `v_politician_theme_coverage` e `v_candidates_2026_matchable`
- [ ] Executar seed de temas
- [ ] Habilitar RLS (leitura pública, escrita apenas service_role)
- [ ] Validar constraint `fontes != '[]'` com teste de insert sem fonte

---

*Próximo arquivo: `03_schema_embeddings.md` — vetores de similaridade semântica*
