-- VotoSim — SP-0 Foundation schema
-- Spec: docs/superpowers/specs/2026-08-20-candidate-data-pipeline-design.md
-- Apply in the Supabase SQL Editor after base/10_party_positions.sql.

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE enrichment_stage AS ENUM (
  'documentos_oficiais', 'ficha_limpa', 'noticias', 'dossie', 'posicoes'
);

CREATE TYPE enrichment_status AS ENUM (
  'pendente', 'em_progresso', 'concluido', 'falhou', 'nao_aplicavel'
);

CREATE TYPE source_tipo AS ENUM (
  'plano_governo', 'coligacao', 'bens_declarados', 'votacao',
  'tse_oficial', 'noticia', 'checagem', 'judicial'
);

-- Where a catalogued source is shown. Nothing is excluded from the catalogue;
-- only its destination differs.
CREATE TYPE source_destino AS ENUM ('card_candidato', 'pagina_sobre', 'interno');

CREATE TYPE processing_tier AS ENUM ('total', 'por_score', 'fora_escopo');

-- Per-theme coherence: did conduct match what the platform promised.
CREATE TYPE coherence_signal AS ENUM ('coerente', 'incoerente', 'sem_historico');

-- Two new alert types. ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction block — run these two statements on their own.
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'incoerencia';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'divergencia_espectro';

-- ─── candidacies: processing tier and viability ───────────────────────────────

ALTER TABLE candidacies
  ADD COLUMN IF NOT EXISTS tier_processamento processing_tier,
  ADD COLUMN IF NOT EXISTS viabilidade_score  NUMERIC(5,2);

COMMENT ON COLUMN candidacies.tier_processamento IS
  'total = every candidate researched (presidente, governador, senador); por_score = gated by viabilidade_score (deputado federal/estadual); fora_escopo = not covered (deputado distrital).';
COMMENT ON COLUMN candidacies.viabilidade_score IS
  'Populated only for tier por_score. NULL elsewhere. Computed by a later plan.';

-- ─── politician_positions: justification, coherence, source refs ──────────────

ALTER TABLE politician_positions
  ADD COLUMN IF NOT EXISTS justificativa  TEXT,
  ADD COLUMN IF NOT EXISTS coerencia_tema coherence_signal,
  ADD COLUMN IF NOT EXISTS source_ids     UUID[] DEFAULT '{}';

COMMENT ON COLUMN politician_positions.justificativa IS
  'Why this position was assigned, in language a voter understands. Shown on the candidate card.';
COMMENT ON COLUMN politician_positions.coerencia_tema IS
  'Whether conduct on this theme matched the declared platform. sem_historico when there is no record to compare.';
COMMENT ON COLUMN politician_positions.source_ids IS
  'References candidate_sources.id. Every displayed fact must trace to a catalogued source. Not referentially enforced (plain UUID array) — candidate_sources.politician_id is what keeps this cascading together with politician_positions.';

-- ─── enrichment_ledger ────────────────────────────────────────────────────────

CREATE TABLE enrichment_ledger (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidacy_id  UUID NOT NULL REFERENCES candidacies(id) ON DELETE CASCADE,
  etapa         enrichment_stage NOT NULL,
  status        enrichment_status NOT NULL DEFAULT 'pendente',
  tentativas    SMALLINT NOT NULL DEFAULT 0,
  erro          TEXT,
  metricas      JSONB NOT NULL DEFAULT '{}',
  concluido_em  TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidacy_id, etapa)
);

CREATE INDEX idx_ledger_queue ON enrichment_ledger (status, etapa);
CREATE INDEX idx_ledger_candidacy ON enrichment_ledger (candidacy_id);

COMMENT ON TABLE enrichment_ledger IS
  'Per-candidate per-stage processing state. Answers which candidates are done and which are left.';
COMMENT ON COLUMN enrichment_ledger.metricas IS
  'Cost and quality metrics: tokens, duracao_ms, fontes_encontradas, confianca_media. Feeds the instrumented pilot.';
COMMENT ON COLUMN enrichment_ledger.status IS
  'nao_aplicavel means there is genuinely nothing to do — a senate candidate files no government plan, a first-time candidate has no coherence to measure.';

-- ─── candidate_sources ────────────────────────────────────────────────────────

CREATE TABLE candidate_sources (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidacy_id     UUID NOT NULL REFERENCES candidacies(id) ON DELETE CASCADE,
  politician_id    UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  tipo             source_tipo NOT NULL,
  camada           SMALLINT NOT NULL CHECK (camada BETWEEN 1 AND 3),
  titulo           TEXT,
  veiculo          TEXT,
  url              TEXT NOT NULL,
  data_publicacao  DATE,
  acessado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  hash_conteudo    TEXT,
  destino_exibicao source_destino NOT NULL DEFAULT 'card_candidato',
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidacy_id, url)
);

CREATE INDEX idx_sources_candidacy ON candidate_sources (candidacy_id, destino_exibicao);
CREATE INDEX idx_sources_politician ON candidate_sources (politician_id);

COMMENT ON TABLE candidate_sources IS
  'Every URL the pipeline touched for a candidate. Positions and alerts reference this catalogue instead of repeating URLs, so a displayed fact with no listed source is impossible by construction. Carries two foreign keys deliberately: politician_id exists because politician_positions.source_ids (a plain UUID array, not referentially enforced) references this table by politician, not by candidacy — so politician_id is what keeps the source catalogue cascading on the same axis as politician_positions when a politician row is deleted. candidacy_id records which specific election run the source was gathered for (e.g. a government plan filed for one candidacy) and cascades independently when that candidacy is deleted.';
COMMENT ON COLUMN candidate_sources.camada IS
  '1 = primary/official (TSE, STF, TCU, MPF, Camara, Senado); 2 = reference press; 3 = fact-checking.';

-- ─── candidate_dossiers ───────────────────────────────────────────────────────

CREATE TABLE candidate_dossiers (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidacy_id       UUID NOT NULL REFERENCES candidacies(id) ON DELETE CASCADE,
  resumo_perfil      TEXT NOT NULL,
  espectro_declarado TEXT,
  espectro_inferido  TEXT,
  coerencia_indice   NUMERIC(4,2) CHECK (coerencia_indice BETWEEN 0 AND 100),
  coerencia_base     TEXT,
  versao             SMALLINT NOT NULL DEFAULT 1,
  gerado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidacy_id, versao)
);

CREATE INDEX idx_dossiers_candidacy ON candidate_dossiers (candidacy_id, versao DESC);

COMMENT ON TABLE candidate_dossiers IS
  'Generated candidate profile: plain-language summary, declared vs inferred spectrum, coherence index. Versioned so it can be regenerated without losing the previous take.';
COMMENT ON COLUMN candidate_dossiers.coerencia_indice IS
  'NULL when the candidate has no track record. Never zero for that case — zero means measured and incoherent.';
COMMENT ON COLUMN candidate_dossiers.coerencia_base IS
  'What was compared against what, so the card can state its basis instead of showing a bare number.';

-- ─── Work queue ───────────────────────────────────────────────────────────────

-- Answers "who is left to process", ordered the way D11 says to work:
-- presidents first, then by tier and viability.
CREATE VIEW v_enrichment_queue AS
SELECT
  c.id                AS candidacy_id,
  p.nome_urna,
  c.cargo,
  c.estado,
  c.partido_eleicao,
  c.tier_processamento,
  c.viabilidade_score,
  count(*) FILTER (WHERE l.status = 'pendente')   AS etapas_pendentes,
  count(*) FILTER (WHERE l.status = 'falhou')     AS etapas_falhadas,
  count(*) FILTER (WHERE l.status = 'concluido')  AS etapas_concluidas
FROM candidacies c
JOIN politicians p ON p.id = c.politician_id
JOIN enrichment_ledger l ON l.candidacy_id = c.id
WHERE c.tier_processamento <> 'fora_escopo'
GROUP BY c.id, p.nome_urna, c.cargo, c.estado, c.partido_eleicao,
         c.tier_processamento, c.viabilidade_score
HAVING count(*) FILTER (WHERE l.status IN ('pendente', 'falhou')) > 0
ORDER BY
  CASE c.cargo WHEN 'presidente' THEN 0 ELSE 1 END,
  c.tier_processamento,
  c.viabilidade_score DESC NULLS LAST,
  p.nome_urna;

COMMENT ON VIEW v_enrichment_queue IS
  'Candidates with work outstanding, ordered per spec D11. Feeds parallel agent dispatch.';

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE enrichment_ledger   ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_sources   ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_dossiers  ENABLE ROW LEVEL SECURITY;

-- Voter-facing tables are publicly readable, like politicians and candidacies.
CREATE POLICY "leitura_publica_candidate_sources"
  ON candidate_sources FOR SELECT USING (true);

CREATE POLICY "leitura_publica_candidate_dossiers"
  ON candidate_dossiers FOR SELECT USING (true);

-- enrichment_ledger is internal pipeline state — no public read policy.
-- Scripts reach it with the service role key, which bypasses RLS.
