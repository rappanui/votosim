# VotoSim — Schema: Alertas

> **Arquivo:** `04_schema_alerts.md`  
> **Banco:** Supabase (PostgreSQL 15)  
> **Depende de:** `01_schema_politicians.md`  
> **Lido por:** `05_schema_match_algorithm.md`

---

## Contexto

Alertas são informações negativas ou sensíveis sobre um candidato, exibidas no card de resultado com fonte primária obrigatória. Nunca são usados para excluir candidatos da lista — apenas para informar o usuário, que decide o peso que quer dar.

Três tipos de alerta, com tratamentos distintos:

| Tipo | Fonte principal | Exibição |
|---|---|---|
| `ficha_suja` | TSE (condenação transitada em julgado) | Badge vermelho "Ficha suja" |
| `investigacao` | STF, PGR, TCU, CPIs | Badge laranja "Em investigação" |
| `polemica` | Mídia, votações polêmicas documentadas | Badge cinza "Atenção" |

**Princípio editorial:** alertas de `polemica` são os mais subjetivos e os mais propensos a viés. A curadoria humana é obrigatória para esse tipo antes de publicar.

---

## Tabela: `politician_alerts`

```sql
CREATE TYPE alert_type AS ENUM (
  'ficha_suja',     -- condenação transitada em julgado (inelegibilidade TSE)
  'investigacao',   -- investigação em curso (STF, PGR, operações policiais, CPIs)
  'polemica'        -- posição ou declaração amplamente criticada, documentada em mídia
);

-- Adicionados em 2026-08-20 por base/11_sp0_foundation.sql:
--   'incoerencia'          -- conduta contradisse a plataforma declarada num tema
--   'divergencia_espectro' -- espectro declarado x inferido não batem
-- A view v_candidate_alerts abaixo NÃO cobre esses dois tipos: o CASE de badge_cor
-- não tem ELSE, então eles renderizariam badge_cor = NULL. O arquivo 11 substitui a
-- view com as duas branches adicionais. Ver docs/sp0-schema-additions.md.

CREATE TYPE alert_severity AS ENUM (
  'critica',    -- ficha_suja ou investigação por crime grave (corrupção, violência)
  'alta',       -- investigação por crime moderado ou condenação sem trânsito em julgado
  'media',      -- investigação administrativa, TCU, polêmica relevante
  'baixa'       -- polêmica de menor impacto, declaração controversa isolada
);

CREATE TABLE politician_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id   UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,

  -- Classificação
  tipo            alert_type NOT NULL,
  severidade      alert_severity NOT NULL,

  -- Conteúdo do alerta
  titulo          TEXT NOT NULL,
  -- Ex: "Condenado por improbidade administrativa em 2021"
  -- Ex: "Réu na Operação Lava Jato (fase X)"
  -- Ex: "Votou contra a PEC das Mulheres em 2023"

  descricao       TEXT NOT NULL,
  -- Descrição neutra e factual em 2–4 linhas.
  -- REGRA: apenas fatos documentados. Sem adjetivos ("corrupto", "desonesto").
  -- CORRETO: "Foi condenado em 1ª instância por desvio de R$2,3M em licitações municipais."
  -- ERRADO: "É um político corrupto que desviou dinheiro público."

  -- Fonte primária (obrigatório)
  fonte_url       TEXT NOT NULL,
  -- Deve ser fonte primária: TSE, STF, Câmara, Senado, TCU, Ministério Público
  -- Aceito também: Agência Brasil, G1, Folha (para polêmicas), mas preferir fontes oficiais
  fonte_nome      TEXT NOT NULL,
  -- Ex: "TSE — Ficha Limpa", "STF — Ação Penal 470", "Câmara dos Deputados — votação 2023-09-12"
  data_ocorrencia DATE,

  -- Status
  ativo           BOOLEAN DEFAULT true,
  -- false = alerta resolvido (ex: absolvido, decisão revertida)
  resolucao       TEXT,
  -- Preenchido quando ativo = false: "Absolvido pelo STJ em mar/2025"
  data_resolucao  DATE,

  -- Curadoria (obrigatória para tipo = 'polemica')
  validado        BOOLEAN DEFAULT false,
  validado_por    TEXT,                           -- identificador do curador (interno)
  validado_em     TIMESTAMPTZ,
  notas_curador   TEXT,

  -- Metadados
  gerado_por_ia   BOOLEAN DEFAULT false,          -- true = sugerido por IA, pendente validação
  criado_em       TIMESTAMPTZ DEFAULT now(),
  atualizado_em   TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_alerts_politician
  ON politician_alerts (politician_id, ativo);

CREATE INDEX idx_alerts_tipo_severidade
  ON politician_alerts (tipo, severidade)
  WHERE ativo = true;

CREATE INDEX idx_alerts_nao_validados
  ON politician_alerts (validado, tipo)
  WHERE validado = false AND tipo = 'polemica';

COMMENT ON TABLE politician_alerts IS
  'Alertas sobre candidatos: ficha suja, investigações e polêmicas. Exibidos no card com fonte obrigatória. Não excluem o candidato do resultado.';
COMMENT ON COLUMN politician_alerts.descricao IS
  'Texto neutro e factual. Proibido adjetivos ou juízo de valor. Apenas fatos documentados na fonte.';
COMMENT ON COLUMN politician_alerts.fonte_url IS
  'URL da fonte primária. Obrigatório. Preferencialmente fontes governamentais (TSE, STF, Câmara, Senado, TCU).';
```

---

## Regras editoriais (para o pipeline de IA e curadores)

```
REGRA A — Fonte primária obrigatória
  Todo alerta precisa de fonte_url preenchida.
  Se a IA não encontrar fonte primária confiável, não cria o alerta.
  Melhor ter menos alertas com fontes sólidas do que muitos sem evidência.

REGRA B — Curadoria obrigatória para polêmicas
  Alertas do tipo 'polemica' só aparecem na interface após validado = true.
  Alertas 'ficha_suja' e 'investigacao' com fonte do TSE/STF podem ser publicados
  automaticamente (gerado_por_ia = true, validado = true definido pelo pipeline).

REGRA C — Neutralidade de linguagem
  O campo descricao deve passar no teste: "isso é um fato ou uma opinião?"
  FATO: "Foi condenado em 1ª instância pelo TRF-4 por lavagem de dinheiro em 2019."
  OPINIÃO: "Comprovadamente corrupto."

REGRA D — Alerta resolvido
  Quando uma investigação é arquivada ou o candidato é absolvido,
  o alerta não é deletado — apenas ativo = false e resolucao preenchida.
  O histórico é mantido para transparência.

REGRA E — Polêmica vs. posição política
  Votar contra uma pauta não é polêmica — é posição política (vai em politician_positions).
  Polêmica = declaração discriminatória documentada, denúncia de desvio de conduta,
  conflito de interesses comprovado, uso irregular de verba de gabinete.
```

---

## View: alertas ativos por candidato

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
  -- Badge para a UI
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
  'Alertas ativos e validados prontos para exibição na UI. Ordenados por severidade.';
```

---

## Exemplos de dados para teste

```sql
-- Exemplo de alerta ficha_suja (gerado pelo pipeline automaticamente)
-- NOTA: dados fictícios apenas para teste de desenvolvimento
INSERT INTO politician_alerts (
  politician_id,    -- substituir por UUID real após inserir politician
  tipo, severidade,
  titulo,
  descricao,
  fonte_url, fonte_nome,
  data_ocorrencia,
  validado, gerado_por_ia
) VALUES (
  '00000000-0000-0000-0000-000000000001',  -- UUID de teste
  'ficha_suja', 'critica',
  'Condenado por improbidade administrativa com trânsito em julgado',
  'Foi condenado pelo TRF-4 em 2021 por desvio de recursos do FNDE durante gestão como secretário municipal. A condenação transitou em julgado em março de 2023, gerando inelegibilidade pelo período de 8 anos (Lei Complementar 135/2010).',
  'https://www.tse.jus.br/eleitor/certidoes/certidao-de-quitacao-eleitoral',
  'TSE — Ficha Limpa / LC 135/2010',
  '2023-03-15',
  true, false
);

-- Exemplo de alerta investigacao (requer validação de curador)
INSERT INTO politician_alerts (
  politician_id,
  tipo, severidade,
  titulo, descricao,
  fonte_url, fonte_nome,
  data_ocorrencia,
  validado, gerado_por_ia
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'investigacao', 'alta',
  'Citado em investigação do TCU sobre contratos emergenciais na pandemia',
  'Figura como investigado pelo Tribunal de Contas da União (processo TC 015.427/2021-0) por irregularidades em contratos de aquisição de respiradores firmados sem licitação em 2020. Investigação em andamento sem conclusão até a publicação deste dado.',
  'https://portal.tcu.gov.br/imprensa/noticias/',
  'TCU — processo TC 015.427/2021-0',
  '2021-06-10',
  true, true
);
```

---

## RLS

```sql
ALTER TABLE politician_alerts ENABLE ROW LEVEL SECURITY;

-- Leitura pública apenas de alertas validados e ativos
CREATE POLICY "leitura_publica_alertas_validados"
  ON politician_alerts FOR SELECT
  USING (ativo = true AND validado = true);

-- service_role lê tudo (inclusive não validados, para o painel de curadoria)
-- O painel de curadoria usa service_role key no backend — não expõe para o browser
```

---

## Checklist de implementação

- [ ] Criar enums `alert_type` e `alert_severity`
- [ ] Criar tabela `politician_alerts` com todos os índices
- [ ] Criar view `v_candidate_alerts`
- [ ] Habilitar RLS com política de leitura apenas de alertas validados
- [ ] Testar política RLS: anon key não deve ver alertas com `validado = false`
- [ ] Implementar validação no pipeline: bloquear INSERT sem `fonte_url`
- [ ] Criar painel interno de curadoria (fora do escopo do MVP público)

---

*Próximo arquivo: `05_schema_match_algorithm.md` — algoritmo de match e scoring*
