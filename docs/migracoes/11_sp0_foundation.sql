-- VotoSim — SP-0 Foundation schema
-- Spec: docs/superpowers/specs/2026-08-20-candidate-data-pipeline-design.md
-- Apply in the Supabase SQL Editor after base/10_party_positions.sql.
-- Idempotent: every CREATE is IF NOT EXISTS / OR REPLACE / wrapped to ignore
-- duplicate_object, so the whole file can be re-run safely. On PostgreSQL 12+
-- it can also be pasted and run as a single batch — see the ALTER TYPE note
-- below.

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE enrichment_stage AS ENUM (
    'documentos_oficiais', 'ficha_limpa', 'noticias', 'dossie', 'posicoes'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE enrichment_status AS ENUM (
    'pendente', 'em_progresso', 'concluido', 'falhou', 'nao_aplicavel'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- plataforma_partidaria / biografia were added later (ALTER TYPE ... ADD VALUE,
-- 2026-08-23) to cover party platform and biography documents — the common
-- evidence base for legislative candidates without a plano_governo. Fresh
-- databases get them here; existing ones must run the ALTERs in
-- docs/referencia/schema-adicoes-sp0.md.
DO $$ BEGIN
  CREATE TYPE source_tipo AS ENUM (
    'plano_governo', 'coligacao', 'bens_declarados', 'votacao',
    'tse_oficial', 'noticia', 'checagem', 'judicial',
    'plataforma_partidaria', 'biografia', 'desempenho_mandato'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Where a catalogued source is shown. Nothing is excluded from the catalogue;
-- only its destination differs.
DO $$ BEGIN
  CREATE TYPE source_destino AS ENUM ('card_candidato', 'pagina_sobre', 'interno');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE processing_tier AS ENUM ('total', 'por_score', 'fora_escopo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Per-theme coherence: did conduct match what the platform promised.
DO $$ BEGIN
  CREATE TYPE coherence_signal AS ENUM ('coerente', 'incoerente', 'sem_historico');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Two new alert types. On PostgreSQL 12+, ALTER TYPE ... ADD VALUE is safe
-- inside a transaction block as long as the new value is not USED in the same
-- transaction. This file DOES use both values, in the v_candidate_alerts badge
-- CASE at the end — so that CASE switches on pa.tipo::text rather than on the
-- enum itself. Comparing text literals never touches the pending enum values,
-- which keeps the whole file runnable as a single batch in the SQL Editor.
-- Verified on PostgreSQL 15: without the ::text cast this file fails with
-- 'unsafe use of new value "incoerencia" of enum type alert_type'.
-- IF NOT EXISTS keeps the statement idempotent.
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'incoerencia';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'divergencia_espectro';
-- ressalva_evidencias added 2026-08-23: caveat about the evidence base
-- (degraded extraction, party-inferred positions), a transparency flag rather
-- than an accusation. Referenced by the same v_candidate_alerts badge CASE.
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'ressalva_evidencias';

-- desempenho_mandato added 2026-08-23: the E4b evidence type — attendance,
-- votes cast, authored bills and CEAP spending for a candidate who holds or
-- held a legislative mandate. No pre-existing tipo fits: bens_declarados is
-- declared personal assets, votacao is a single roll-call.
ALTER TYPE source_tipo ADD VALUE IF NOT EXISTS 'desempenho_mandato';

-- ─── brazilian_state: 'BR' for national offices ───────────────────────────────

-- The TSE candidate CSV carries SG_UF = 'BR' for presidente and vice-presidente,
-- and the live database already accepts it (13 rows from 2022 sit there today).
-- But docs/legado/base/01_schema_politicians.md never listed it in the enum, so anyone
-- rebuilding the schema from the docs gets a database that rejects every
-- presidential candidacy. Verified on PostgreSQL 15 built from those docs:
-- 'invalid input value for enum brazilian_state: "BR"'.
-- This statement is a no-op against the live database and repairs a rebuilt one.
ALTER TYPE brazilian_state ADD VALUE IF NOT EXISTS 'BR';

-- ─── candidacies: processing tier, viability, federation/coalition detail ─────

ALTER TABLE candidacies
  ADD COLUMN IF NOT EXISTS tier_processamento    processing_tier,
  ADD COLUMN IF NOT EXISTS viabilidade_score     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS federacao             TEXT,
  ADD COLUMN IF NOT EXISTS composicao_coligacao  TEXT;

COMMENT ON COLUMN candidacies.tier_processamento IS
  'total = every candidate researched (presidente, governador, senador); por_score = gated by viabilidade_score (deputado federal/estadual); fora_escopo = not covered (deputado distrital).';
COMMENT ON COLUMN candidacies.viabilidade_score IS
  'Populated only for tier por_score. NULL elsewhere. Computed by a later plan.';
COMMENT ON COLUMN candidacies.federacao IS
  'Party federation the candidacy ran under, e.g. "PT/PC do B/PV", "PSDB/CIDADANIA" — distinct from coligacao, which is the broader (possibly multi-federation) electoral alliance. Source: TSE candidate CSV column SG_FEDERACAO. Declared-spectrum input for spec decision D5.';
COMMENT ON COLUMN candidacies.composicao_coligacao IS
  'Party composition of the alliance named in candidacies.coligacao, e.g. "44-UNIÃO/11-PP". Source: TSE candidate CSV column DS_COMPOSICAO_COLIGACAO.';

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
  'References candidate_sources.id. Every displayed fact must trace to a catalogued source. Not referentially enforced (plain UUID array) — candidate_sources.politician_id (NOT NULL, ON DELETE CASCADE) is what keeps this cascading together with politician_positions. candidate_sources.candidacy_id is nullable and ON DELETE SET NULL, so a candidacy deletion never deletes a catalogued source and never orphans an entry here.';
COMMENT ON COLUMN politician_positions.fontes IS
  'Superseded by source_ids for new writes: source_ids is the catalogue-backed reference introduced in SP-0. fontes is retained only for rows written by the pre-SP-0 pipeline and is not populated going forward.';

-- ─── enrichment_ledger ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enrichment_ledger (
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

CREATE INDEX IF NOT EXISTS idx_ledger_queue ON enrichment_ledger (status, etapa);
CREATE INDEX IF NOT EXISTS idx_ledger_candidacy ON enrichment_ledger (candidacy_id);

COMMENT ON TABLE enrichment_ledger IS
  'Per-candidate per-stage processing state. Answers which candidates are done and which are left.';
COMMENT ON COLUMN enrichment_ledger.metricas IS
  'Cost and quality metrics: tokens, duracao_ms, fontes_encontradas, confianca_media. Feeds the instrumented pilot.';
COMMENT ON COLUMN enrichment_ledger.status IS
  'nao_aplicavel means there is genuinely nothing to do — a senate candidate files no government plan, a first-time candidate has no coherence to measure.';

-- ─── candidate_sources ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS candidate_sources (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Nullable and ON DELETE SET NULL: a candidacy is just the run that gathered
  -- the source, not its owner. Deleting a candidacy must not delete the
  -- source or orphan a politician_positions.source_ids entry (see C1).
  candidacy_id     UUID REFERENCES candidacies(id) ON DELETE SET NULL,
  -- Durable owner. NOT NULL, ON DELETE CASCADE: this is the axis the source
  -- catalogue actually needs to cascade on, because politician_positions
  -- references sources by politician (via the unenforced source_ids array),
  -- never by candidacy.
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
  -- Deduplicated per person, not per run: the same URL for the same
  -- politician is the same source regardless of which candidacy gathered it,
  -- and a nullable column can't stay part of a working unique constraint.
  UNIQUE (politician_id, url)
);

CREATE INDEX IF NOT EXISTS idx_sources_candidacy ON candidate_sources (candidacy_id, destino_exibicao);
CREATE INDEX IF NOT EXISTS idx_sources_politician ON candidate_sources (politician_id);

COMMENT ON TABLE candidate_sources IS
  'Every URL the pipeline touched for a politician. Positions and alerts reference this catalogue instead of repeating URLs, so a displayed fact with no listed source is impossible by construction. Carries two foreign keys deliberately: politician_id is the durable owner (NOT NULL, ON DELETE CASCADE) and is what keeps this catalogue cascading on the same axis as politician_positions.source_ids, which is a plain UUID array with no referential enforcement of its own. candidacy_id records which specific election run gathered the source (e.g. a government plan filed for one candidacy); it is nullable and ON DELETE SET NULL, so deleting a candidacy never deletes a catalogued source and never leaves a source_ids entry pointing at nothing.';
COMMENT ON COLUMN candidate_sources.camada IS
  '1 = primary/official (TSE, STF, TCU, MPF, Camara, Senado); 2 = reference press; 3 = fact-checking.';

-- ─── politician_alerts: source reference ───────────────────────────────────────

ALTER TABLE politician_alerts
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES candidate_sources(id) ON DELETE SET NULL;

COMMENT ON COLUMN politician_alerts.source_id IS
  'References candidate_sources.id — alerts must trace to the catalogue like positions do. NULL for alerts written before this column existed, or for the rare alert with no catalogued source.';

-- ─── candidate_dossiers ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS candidate_dossiers (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidacy_id       UUID NOT NULL REFERENCES candidacies(id) ON DELETE CASCADE,
  resumo_perfil      TEXT NOT NULL,
  espectro_declarado TEXT CHECK (espectro_declarado IN (
                        'esquerda', 'centro_esquerda', 'centro',
                        'centro_direita', 'direita', 'sem_classificacao'
                      )),
  espectro_inferido  TEXT CHECK (espectro_inferido IN (
                        'esquerda', 'centro_esquerda', 'centro',
                        'centro_direita', 'direita', 'sem_classificacao'
                      )),
  coerencia_indice   NUMERIC(5,2) CHECK (coerencia_indice BETWEEN 0 AND 100),
  coerencia_base     TEXT,
  versao             SMALLINT NOT NULL DEFAULT 1,
  gerado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidacy_id, versao)
);

CREATE INDEX IF NOT EXISTS idx_dossiers_candidacy ON candidate_dossiers (candidacy_id, versao DESC);

COMMENT ON TABLE candidate_dossiers IS
  'Generated candidate profile: plain-language summary, declared vs inferred spectrum, coherence index. Versioned so it can be regenerated without losing the previous take.';
COMMENT ON COLUMN candidate_dossiers.coerencia_indice IS
  'NULL when the candidate has no track record. Never zero for that case — zero means measured and incoherent.';
COMMENT ON COLUMN candidate_dossiers.coerencia_base IS
  'What was compared against what, so the card can state its basis instead of showing a bare number.';
COMMENT ON COLUMN candidate_dossiers.espectro_declarado IS
  'Same vocabulary as parties.espectro. NULL allowed when not yet computed.';
COMMENT ON COLUMN candidate_dossiers.espectro_inferido IS
  'Same vocabulary as parties.espectro. NULL allowed when not yet computed.';

-- ─── Work queue ───────────────────────────────────────────────────────────────

-- Answers "who is left to process": presidents first, then grouped by state,
-- then by tier and viability. The electorate-size ordering spec D11 describes
-- (work one full UF at a time, by electorate size) is an operator decision
-- about which UF to run next — no per-UF electorate data exists anywhere in
-- this schema, so it cannot be expressed inside the view itself.
CREATE OR REPLACE VIEW v_enrichment_queue AS
SELECT
  c.id                AS candidacy_id,
  p.nome_urna,
  c.cargo,
  c.estado,
  c.partido_eleicao,
  c.tier_processamento,
  c.viabilidade_score,
  count(*) FILTER (WHERE l.status = 'pendente')     AS etapas_pendentes,
  count(*) FILTER (WHERE l.status = 'em_progresso') AS etapas_em_progresso,
  count(*) FILTER (WHERE l.status = 'falhou')       AS etapas_falhadas,
  count(*) FILTER (WHERE l.status = 'concluido')    AS etapas_concluidas,
  count(l.id) = 0                                   AS sem_ledger
FROM candidacies c
JOIN politicians p ON p.id = c.politician_id
LEFT JOIN enrichment_ledger l ON l.candidacy_id = c.id
WHERE c.ano_eleicao = 2026
  -- IS DISTINCT FROM, not <>: tier_processamento is NULL until backfilled,
  -- and NULL <> 'fora_escopo' is NULL (not true), which would silently hide
  -- every candidacy on day one.
  AND c.tier_processamento IS DISTINCT FROM 'fora_escopo'
GROUP BY c.id, p.nome_urna, c.cargo, c.estado, c.partido_eleicao,
         c.tier_processamento, c.viabilidade_score
-- A candidacy with zero ledger rows (never seeded) still has work outstanding;
-- one with only em_progresso rows (a crashed run) must stay visible too.
HAVING count(l.id) = 0
    OR count(*) FILTER (WHERE l.status IN ('pendente', 'falhou', 'em_progresso')) > 0
ORDER BY
  CASE c.cargo WHEN 'presidente' THEN 0 ELSE 1 END,
  c.estado,
  c.tier_processamento,
  c.viabilidade_score DESC NULLS LAST,
  p.nome_urna;

COMMENT ON VIEW v_enrichment_queue IS
  'Candidates with work outstanding: presidents first, then grouped by state, then by tier and viability. Includes candidacies never seeded into enrichment_ledger (see sem_ledger) and ones stuck in em_progresso. Electorate-size ordering across states (spec D11) is an operator decision, not expressed by this view. Feeds parallel agent dispatch.';
COMMENT ON COLUMN v_enrichment_queue.sem_ledger IS
  'True when this candidacy has zero enrichment_ledger rows — never seeded by bootstrap-ledger, not a candidacy whose work is done. Its etapas_* counts are all zero for that reason, not because every stage is concluido or nao_aplicavel. Consumers must check sem_ledger before treating etapas_pendentes = 0 as "nothing left to do".';

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE enrichment_ledger   ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_sources   ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_dossiers  ENABLE ROW LEVEL SECURITY;

-- Voter-facing tables are publicly readable, like politicians and candidacies.
DROP POLICY IF EXISTS "leitura_publica_candidate_sources" ON candidate_sources;
CREATE POLICY "leitura_publica_candidate_sources"
  ON candidate_sources FOR SELECT USING (true);

DROP POLICY IF EXISTS "leitura_publica_candidate_dossiers" ON candidate_dossiers;
CREATE POLICY "leitura_publica_candidate_dossiers"
  ON candidate_dossiers FOR SELECT USING (true);

-- enrichment_ledger is internal pipeline state — no public read policy.
-- Scripts reach it with the service role key, which bypasses RLS.

-- ─── v_candidate_alerts: badges for the two new alert types ───────────────────

-- Reproduces docs/legado/base/04_schema_alerts.md's v_candidate_alerts, unchanged
-- except for added branches in the badge_cor CASE. Without them, an alert of
-- type incoerencia, divergencia_espectro or ressalva_evidencias renders
-- badge_cor = NULL, because the original CASE has no ELSE.
-- 2026-08-25: stopped excluding ativo=false outright. Rule D says a resolved
-- alert "não é deletado, apenas ativo = false e resolução preenchida" so it
-- stays on record for transparency; the old WHERE pa.ativo = true silently
-- defeated that by making every resolved alert permanently invisible to the
-- voter, no matter how well-sourced. validado stays the only trust gate, and
-- is orthogonal to whether the matter is still open. See
-- docs/referencia/alertas.md and isAutoValidated() in ingest-research.ts,
-- which was corrected in the same pass to stop treating "resolved" as a
-- reason to withhold auto-validation for an otherwise layer-1-sourced
-- ficha_suja/investigacao.
--
-- ativo/resolucao/data_resolucao are appended AFTER badge_cor/ordem_exibicao
-- below, not before: this text originally had them first, but the SQL
-- actually run against production (pasted directly into the Supabase
-- dashboard, corrected there after a self-review caught the ordering bug)
-- put them last, since CREATE OR REPLACE VIEW forbids moving an existing
-- output column's position. This block was edited on 2026-08-25 to match
-- what is actually live, confirmed by querying v_candidate_alerts directly:
-- the text and the database had drifted apart, and the text was the one
-- that was wrong.
CREATE OR REPLACE VIEW v_candidate_alerts AS
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
  -- Badge para a UI. A resolved alert always renders gray regardless of
  -- tipo: the point is that the tipo-specific colour (vermelho/laranja/...)
  -- reads as "current," and a resolved matter is explicitly not current.
  -- Switches on pa.tipo::text, not pa.tipo: the two new enum values are added
  -- by this same file, and PostgreSQL forbids using a pending enum value in
  -- the transaction that adds it. Casting to text sidesteps that entirely.
  CASE
    WHEN NOT pa.ativo THEN 'cinza'
    ELSE (CASE pa.tipo::text
      WHEN 'ficha_suja'   THEN 'vermelho'
      WHEN 'investigacao' THEN 'laranja'
      WHEN 'polemica'     THEN 'cinza'
      -- incoerencia: conduct contradicted the platform declared on a theme.
      -- A distinct concern from the legal/media-sourced badges above, so it
      -- gets its own colour instead of reusing one of theirs.
      WHEN 'incoerencia'          THEN 'roxo'
      -- divergencia_espectro: declared vs. inferred political spectrum
      -- disagree. Informational, not a conduct or legal flag, so it takes the
      -- calmest colour in the set rather than a warning colour.
      WHEN 'divergencia_espectro' THEN 'azul'
      -- ressalva_evidencias: caveat about the evidence base (degraded
      -- extraction, party-inferred positions). Informational, not a conduct or
      -- legal flag, so it takes a neutral note colour rather than a warning one.
      WHEN 'ressalva_evidencias'  THEN 'amarelo'
    END)
  END AS badge_cor,
  CASE pa.severidade
    WHEN 'critica' THEN 1
    WHEN 'alta'    THEN 2
    WHEN 'media'   THEN 3
    WHEN 'baixa'   THEN 4
  END AS ordem_exibicao,
  pa.ativo,
  pa.resolucao,
  pa.data_resolucao
FROM politician_alerts pa
JOIN politicians p ON p.id = pa.politician_id
WHERE pa.validado = true
ORDER BY pa.politician_id, ordem_exibicao;

COMMENT ON VIEW v_candidate_alerts IS
  'Alertas validados prontos para exibição na UI, ativos ou resolvidos (ver ativo/resolucao). Ordenados por severidade. Extended by base/11_sp0_foundation.sql with badge_cor branches for incoerencia (roxo), divergencia_espectro (azul) and ressalva_evidencias (amarelo); extended again 2026-08-25 to stop hiding resolved alerts and to render them with a neutral gray badge instead.';
