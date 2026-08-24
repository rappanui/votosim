# VotoSim — Schema: Temas e Posições

> **Status:** ⚠️ DEPRECIADO em 2026-08-24 · **Última atualização real:** 2026-06-27
> **Motivo:** Adiciona os campos de questionário mas ainda antecede as colunas do match v3 (`justificativa`, `source_ids`, `neutro_motivo`, `coerencia_tema`) em `politician_positions`.
> **Substituído por:** `docs/referencia/modelo-de-dados.md`


> **Arquivo:** `02_schema_themes.v2.md`  
> **Versão anterior:** `02_schema_themes.v1.md` — 10 temas, sem campos de questionário  
> **O que mudou nesta versão:**
> - Adicionados campos `afirmacao_questionario`, `contexto_questionario`, `exibir_no_quiz` na tabela `themes_catalog`
> - Adicionados 4 temas novos: `corrupcao_transparencia`, `politica_economica`, `politica_externa`, `pauta_moral_costumes`
> - Seed atualizado com afirmações neutras (escala 1–5: Discordo totalmente → Concordo totalmente)
> - Temas originais preservados sem alteração de slugs, nomes ou relevâncias por cargo
>
> **Banco:** Supabase (PostgreSQL 15)  
> **Depende de:** `01_schema_politicians.md`  
> **Lido por:** `03_schema_embeddings.md`, `05_schema_match_algorithm.md`, `07_questionnaire.md`

---

## Contexto

Este arquivo define como o sistema representa **temas políticos** e as **posições** que cada candidato tem sobre eles.

Dois conceitos distintos:
- `themes_catalog` — catálogo global de temas. Curado manualmente, enriquecido por IA.
- `politician_positions` — posição específica de um político sobre um tema, com intensidade e fontes.

A qualidade desses dados é o principal determinante da qualidade do match. Um candidato sem posições registradas recebe o label "Dados insuficientes" no resultado.

---

## Extensão da tabela `themes_catalog`

Novos campos adicionados em relação à v1. Rodar antes do seed:

```sql
ALTER TABLE themes_catalog
  ADD COLUMN IF NOT EXISTS afirmacao_questionario TEXT,
  -- Afirmação exibida ao usuário no questionário.
  -- Formulada de forma neutra — descreve uma política, não um valor.
  -- O usuário responde na escala 1–5 (Discordo totalmente → Concordo totalmente).

  ADD COLUMN IF NOT EXISTS contexto_questionario TEXT,
  -- Parágrafo educativo exibido abaixo da afirmação.
  -- Explica o debate sem tomar partido. ~3–5 linhas.
  -- Objetivo: ajudar usuários sem opinião formada a entender o que estão respondendo.

  ADD COLUMN IF NOT EXISTS exibir_no_quiz BOOLEAN DEFAULT true;
  -- false = tema existe no catálogo mas não aparece no questionário do MVP.
  -- Útil para temas muito técnicos ou com cobertura de dados insuficiente.
```

---

## Tabela: `themes_catalog` (DDL completo — igual à v1)

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
  slug            TEXT UNIQUE NOT NULL,
  nome            TEXT NOT NULL,
  descricao       TEXT NOT NULL,
  categoria       theme_category NOT NULL,

  relevancia_presidente         NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_presidente BETWEEN 0 AND 1),
  relevancia_senador            NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_senador BETWEEN 0 AND 1),
  relevancia_governador         NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_governador BETWEEN 0 AND 1),
  relevancia_deputado_federal   NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_deputado_federal BETWEEN 0 AND 1),
  relevancia_deputado_estadual  NUMERIC(3,2) DEFAULT 0.5 CHECK (relevancia_deputado_estadual BETWEEN 0 AND 1),
  relevancia_deputado_distrital NUMERIC(3,2) DEFAULT 0.3 CHECK (relevancia_deputado_distrital BETWEEN 0 AND 1),

  nota_educativa  TEXT,
  sinonimos       TEXT[] DEFAULT '{}',

  -- Campos novos v2
  afirmacao_questionario TEXT,
  contexto_questionario  TEXT,
  exibir_no_quiz         BOOLEAN DEFAULT true,

  ativo           BOOLEAN DEFAULT true,
  ordem_exibicao  SMALLINT DEFAULT 50,
  criado_em       TIMESTAMPTZ DEFAULT now(),
  atualizado_em   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_themes_categoria ON themes_catalog (categoria);
CREATE INDEX idx_themes_slug ON themes_catalog (slug);
CREATE INDEX idx_themes_sinonimos ON themes_catalog USING gin(sinonimos);
CREATE INDEX idx_themes_quiz ON themes_catalog (exibir_no_quiz, ordem_exibicao)
  WHERE exibir_no_quiz = true;
```

---

## Tabelas `politician_positions` e `position_history`

Sem alterações em relação à v1. Ver `02_schema_themes.v1.md`.

---

## Seed completo v2 — 14 temas com afirmações

### Escala de resposta (igual para todos os temas)
```
1 — Discordo totalmente
2 — Discordo parcialmente
3 — Não tenho opinião formada
4 — Concordo parcialmente
5 — Concordo totalmente
```

### Princípio das afirmações
Cada afirmação descreve **uma política concreta**, não um valor abstrato.
Evita termos com carga emocional universal ("proteger", "merecer", "garantir").
O usuário pode discordar ou concordar com a política descrita — ambas as posições são legítimas.

```sql
INSERT INTO themes_catalog
  (slug, nome, descricao, categoria,
   relevancia_presidente, relevancia_senador, relevancia_governador,
   relevancia_deputado_federal, relevancia_deputado_estadual,
   nota_educativa, sinonimos, ordem_exibicao,
   afirmacao_questionario, contexto_questionario)
VALUES

-- ── TEMAS ORIGINAIS (v1) ─────────────────────────────────────────────────────

('reforma_tributaria',
 'Reforma tributária',
 'Mudanças no sistema de impostos brasileiro, como unificação de tributos e alteração de alíquotas.',
 'economia',
 0.9, 0.9, 0.2, 0.9, 0.1,
 'A reforma tributária é legislação federal. Cabe ao Presidente propor e ao Congresso Nacional (Deputados Federais e Senadores) votar. Governadores e deputados estaduais têm papel limitado.',
 ARRAY['imposto', 'tributação', 'IVA', 'CBS', 'IBS', 'imposto único', 'carga tributária'],
 10,
 'O sistema tributário brasileiro deve ser reformado para simplificar e unificar os impostos cobrados sobre consumo, renda e produção.',
 'O Brasil tem um dos sistemas de impostos mais complexos do mundo, com tributos federais, estaduais e municipais sobrepostos. Uma reforma poderia simplificar esse sistema — mas há debate sobre quem ganha e quem perde com as mudanças.'),

('sus_saude_publica',
 'Saúde pública (SUS)',
 'Financiamento, estrutura e qualidade do Sistema Único de Saúde.',
 'saude',
 0.9, 0.8, 0.8, 0.8, 0.7,
 'Saúde é competência concorrente: União, estados e municípios compartilham responsabilidade. O governo federal financia e normatiza o SUS; estados e municípios executam os serviços.',
 ARRAY['SUS', 'hospital público', 'saúde pública', 'plano de saúde', 'UPA', 'posto de saúde'],
 20,
 'O governo deve aumentar o investimento público no SUS como principal forma de garantir saúde à população.',
 'O SUS atende mais de 150 milhões de brasileiros que não têm plano de saúde privado. Há debate sobre se o caminho é investir mais no sistema público ou ampliar incentivos para planos privados populares.'),

('privatizacao_estatais',
 'Privatização × estatização',
 'Debate sobre a venda ou manutenção de empresas estatais como Petrobras, Correios e Eletrobras.',
 'economia',
 1.0, 0.9, 0.1, 0.8, 0.05,
 'Estatais federais são privatizadas por lei federal, aprovada pelo Congresso e sancionada pelo Presidente. Governadores e deputados estaduais não votam sobre estatais federais — mas podem votar sobre estatais dos seus estados.',
 ARRAY['privatização', 'estatização', 'empresa estatal', 'Petrobras', 'Correios', 'Eletrobras', 'empresa pública'],
 30,
 'O governo federal deve vender suas participações em empresas estatais como Petrobras, Correios e Eletrobras para a iniciativa privada.',
 'Empresas estatais são controladas pelo governo e prestam serviços considerados estratégicos. Defensores da privatização argumentam que empresas privadas são mais eficientes; opositores argumentam que o Estado perde controle sobre setores essenciais.'),

('seguranca_publica_estadual',
 'Segurança pública',
 'Combate à criminalidade, polícias, presídios e política de drogas.',
 'seguranca',
 0.6, 0.5, 1.0, 0.5, 0.9,
 'As Polícias Civil e Militar são estaduais — geridas pelos governadores. O governo federal controla a Polícia Federal e a legislação penal (via Congresso). Deputados estaduais votam o orçamento das polícias do seu estado.',
 ARRAY['segurança', 'criminalidade', 'violência', 'polícia', 'presídio', 'tráfico', 'drogas', 'armamento'],
 40,
 'O combate à criminalidade deve priorizar o endurecimento de penas, a ampliação do efetivo policial e a restrição à progressão de regime para condenados.',
 'Há dois grandes modelos de política de segurança: o que foca em repressão e punição mais severa, e o que foca em prevenção social, educação e redução da desigualdade. A maioria dos especialistas defende uma combinação dos dois.'),

('educacao_basica',
 'Educação básica e ensino público',
 'Qualidade das escolas públicas, salário de professores, ENEM e acesso à universidade.',
 'educacao',
 0.8, 0.7, 0.8, 0.8, 0.8,
 'Educação é competência concorrente. O governo federal define as diretrizes (MEC, BNCC, ENEM) e repassa verbas; estados e municípios gerem suas redes de escolas.',
 ARRAY['educação', 'escola pública', 'professor', 'ENEM', 'universidade', 'vestibular', 'ensino médio'],
 50,
 'O governo deve aumentar o investimento em escolas públicas e na valorização de professores como prioridade da política educacional.',
 'O Brasil gasta valores significativos em educação, mas os resultados em qualidade ainda são baixos. O debate é sobre quanto investir no sistema público versus criar incentivos para que famílias acessem escolas privadas com vouchers ou subsídios.'),

('meio_ambiente_desmatamento',
 'Meio ambiente e desmatamento',
 'Proteção da Amazônia, Cerrado e outros biomas, licenciamento ambiental e políticas climáticas.',
 'meio_ambiente',
 0.9, 0.8, 0.8, 0.8, 0.7,
 'A política ambiental é responsabilidade federal (IBAMA, ICMBio), mas estados têm papel importante no licenciamento e fiscalização. Desmatamento na Amazônia envolve governo federal, estadual e municipal.',
 ARRAY['Amazônia', 'desmatamento', 'Cerrado', 'licenciamento ambiental', 'clima', 'aquecimento global', 'meio ambiente'],
 60,
 'O governo deve endurecer a fiscalização ambiental e as restrições ao desmatamento, mesmo que isso limite atividades econômicas em áreas rurais.',
 'O Brasil abriga a maior floresta tropical do mundo e enfrenta pressão internacional para reduzir o desmatamento. Produtores rurais argumentam que restrições ambientais limitam o desenvolvimento; ambientalistas apontam os riscos climáticos e a perda de biodiversidade.'),

('reforma_previdencia',
 'Previdência social e aposentadoria',
 'Regras de aposentadoria, INSS, pensões e benefícios sociais.',
 'economia',
 0.9, 0.9, 0.1, 0.9, 0.05,
 'Previdência Social (INSS) é federal. Mudanças nas regras de aposentadoria exigem Emenda Constitucional, aprovada pelo Congresso. Governadores e deputados estaduais legislam sobre previdências estaduais (dos servidores do estado).',
 ARRAY['aposentadoria', 'INSS', 'previdência', 'pensão', 'benefício social', 'reforma da previdência'],
 70,
 'O governo deve tornar as regras de aposentadoria mais flexíveis, reduzindo a idade mínima e os requisitos de contribuição exigidos atualmente.',
 'A Reforma da Previdência de 2019 aumentou a idade mínima para aposentadoria e o tempo de contribuição. Defensores dizem que era necessário para equilibrar as contas públicas; críticos dizem que prejudicou trabalhadores, especialmente os mais pobres e informais.'),

('direitos_lgbtqia',
 'Direitos LGBTQIA+',
 'Reconhecimento legal, proteção contra discriminação e direitos civis de pessoas LGBTQIA+.',
 'direitos_sociais',
 0.7, 0.8, 0.5, 0.8, 0.5,
 'Direitos civis e criminalização da homofobia são temas federais (Congresso e STF). Estados e municípios podem legislar sobre proteção local, mas não podem contrariar legislação federal.',
 ARRAY['LGBT', 'LGBTQIA', 'homossexualidade', 'casamento gay', 'diversidade', 'identidade de gênero', 'transsexual'],
 80,
 'O governo deve criar e ampliar leis específicas de proteção contra discriminação de pessoas LGBTQIA+ em áreas como trabalho, saúde e moradia.',
 'O STF criminalizou a homofobia em 2019, mas não existe lei aprovada pelo Congresso sobre o tema. Há debate sobre o papel do Estado na proteção de grupos minoritários versus a autonomia de instituições religiosas e famílias.'),

('porte_armas',
 'Porte e posse de armas',
 'Regulamentação do acesso a armas de fogo por civis.',
 'seguranca',
 0.8, 0.8, 0.2, 0.8, 0.1,
 'O Estatuto do Desarmamento é lei federal — só pode ser alterado pelo Congresso. Decretos presidenciais podem flexibilizar ou restringir o acesso. Estados têm papel mínimo neste tema.',
 ARRAY['arma', 'armamento', 'desarmamento', 'CAC', 'estatuto do desarmamento', 'porte de arma'],
 90,
 'O governo deve ampliar o direito do cidadão comum de adquirir e portar armas de fogo para uso pessoal.',
 'O Brasil tem uma das maiores taxas de mortes por armas de fogo do mundo. Defensores da flexibilização argumentam que o cidadão armado pode se defender melhor; opositores apontam estudos que associam maior acesso a armas com mais mortes.'),

('bolsa_familia_transferencia',
 'Transferência de renda e assistência social',
 'Programas como Bolsa Família, BPC e outros benefícios sociais federais.',
 'direitos_sociais',
 1.0, 0.8, 0.2, 0.8, 0.1,
 'Bolsa Família e BPC são programas federais controlados pelo governo federal. O Presidente e o Congresso definem os critérios e o orçamento. Governadores e deputados estaduais não têm ingerência direta.',
 ARRAY['Bolsa Família', 'auxílio', 'BPC', 'renda mínima', 'assistência social', 'programa social', 'benefício'],
 100,
 'O governo deve ampliar programas de transferência direta de renda para famílias de baixa renda como o Bolsa Família.',
 'Programas de transferência de renda pagam um valor mensal para famílias pobres. Apoiadores dizem que reduzem a fome e a pobreza imediata; críticos argumentam que devem ser temporários e condicionados à inserção no mercado de trabalho.'),

-- ── TEMAS NOVOS (v2) ─────────────────────────────────────────────────────────

('corrupcao_transparencia',
 'Combate à corrupção',
 'Mecanismos de controle, transparência, órgãos de fiscalização e punição de agentes públicos corruptos.',
 'reforma_politica',
 0.9, 0.9, 0.8, 0.8, 0.7,
 'O combate à corrupção envolve todos os poderes e esferas de governo. Leis de transparência e os órgãos de controle (TCU, CGU, MP) são federais. Governadores e deputados estaduais respondem pelos órgãos equivalentes nos estados.',
 ARRAY['corrupção', 'improbidade', 'ficha limpa', 'transparência', 'TCU', 'CGU', 'lavagem de dinheiro', 'peculato'],
 110,
 'O governo deve fortalecer os órgãos de controle e fiscalização para ampliar a punição de agentes públicos envolvidos em corrupção.',
 'O Brasil perdeu bilhões em esquemas de corrupção nas últimas décadas. Há debate sobre o equilíbrio entre eficiência das investigações e garantias do devido processo legal — e sobre quais órgãos devem ter mais autonomia e recursos.'),

('politica_economica',
 'Política econômica e papel do Estado',
 'Papel do Estado na economia, controle da inflação, juros, câmbio e autonomia do Banco Central.',
 'economia',
 1.0, 0.9, 0.3, 0.8, 0.1,
 'A política econômica é definida principalmente pelo governo federal. O Banco Central, desde 2021 com autonomia formal, define a taxa de juros (Selic). O Congresso aprova o orçamento federal e regras fiscais como o teto de gastos.',
 ARRAY['juros', 'Selic', 'inflação', 'câmbio', 'Banco Central', 'teto de gastos', 'fiscal', 'déficit', 'dívida pública'],
 120,
 'O governo deve adotar uma política econômica com maior participação estatal em investimentos estratégicos, mesmo que isso implique maior gasto público.',
 'Há dois modelos predominantes: o liberal, que defende menos gasto público e menos intervenção estatal; e o desenvolvimentista, que defende investimento público em infraestrutura e indústria como motor de crescimento. Ambos buscam geração de empregos e controle da inflação por caminhos diferentes.'),

('politica_externa',
 'Política externa e relações internacionais',
 'Alinhamento do Brasil com blocos e países, acordos comerciais e posicionamento em conflitos internacionais.',
 'politica_externa',
 1.0, 0.8, 0.0, 0.6, 0.0,
 'Política externa é atribuição exclusiva do Presidente da República, com participação do Senado na aprovação de tratados internacionais. Governadores e deputados estaduais não têm papel neste tema.',
 ARRAY['política externa', 'relações exteriores', 'Mercosul', 'BRICS', 'Estados Unidos', 'China', 'soberania', 'multilateralismo'],
 130,
 'O Brasil deve priorizar acordos e alianças com países ocidentais como Estados Unidos e União Europeia em detrimento de blocos como BRICS e parcerias com China e Rússia.',
 'O Brasil historicamente adotou uma política externa independente, buscando equidistância entre blocos. Há debate sobre se aproximar do ocidente traz mais benefícios comerciais e diplomáticos, ou se manter independência preserva mais soberania e diversifica parcerias econômicas.'),

('pauta_moral_costumes',
 'Valores morais e costumes na legislação',
 'Influência de valores religiosos e conservadores nas leis sobre família, aborto, educação e costumes.',
 'religiao_costumes',
 0.7, 0.8, 0.5, 0.8, 0.5,
 'Leis sobre família, aborto e costumes são aprovadas pelo Congresso Nacional. O STF também tem papel relevante em decisões sobre esses temas. Estados podem legislar em algumas áreas, mas não podem contrariar a Constituição Federal.',
 ARRAY['aborto', 'família', 'costumes', 'religião', 'valores conservadores', 'ideologia de gênero', 'escola sem partido'],
 140,
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

---

## Views — sem alterações em relação à v1

Ver `02_schema_themes.v1.md`.

---

## Regras de negócio — sem alterações em relação à v1

Ver `02_schema_themes.v1.md`.

---

## Checklist de implementação v2

- [ ] Rodar `ALTER TABLE` para adicionar os 3 novos campos
- [ ] Executar seed completo acima (14 temas com upsert)
- [ ] Confirmar via `SELECT slug, afirmacao_questionario FROM themes_catalog ORDER BY ordem_exibicao` que todos os 14 temas têm afirmação
- [ ] Confirmar índice `idx_themes_quiz` criado
- [ ] Validar que os 10 temas originais não tiveram slugs, nomes ou relevâncias alterados

---

*Arquivo anterior: `02_schema_themes.v1.md`*  
*Próximo arquivo: `07_questionnaire.md` — questionário completo para o frontend*
