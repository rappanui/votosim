-- docs/migracoes/14_severidade_atual.sql
-- `severidade` records how grave the underlying documented matter was, a
-- historical fact that never changes. It does not say whether that matter
-- is still current. A resolved (ativo = false) ficha_suja with severidade
-- critica reads, at a glance, exactly like an active one: same red, same
-- "1 crítico detectado". That misrepresents a resolved case as an ongoing
-- concern, the same failure the ativo/resolucao work fixed at the badge
-- level, reintroduced one layer up, at the counter that colors the
-- collapsed card.
--
-- severidade_atual answers a different question: given how the matter was
-- resolved, how much should it still weigh on a voter's judgment today. It
-- is not a discount applied uniformly to every resolved alert: an
-- annulment on a procedural technicality (wrong court, illegally obtained
-- evidence), where the underlying facts were never retried, leaves far
-- more reason for concern than an acquittal on the merits (found not to
-- have done it, or the conduct was never a crime). Assessed by the
-- research pipeline at ingestion, under the same 95%-confidence discipline
-- as every other AI-authored judgment in this project, specifically to
-- keep this call free of the bias a human curator inevitably carries into
-- reading about a political figure. See docs/procedimentos/
-- pesquisa-de-candidato.md (E2, resolution taxonomy) and
-- docs/referencia/alertas.md for the full rule.
--
-- NULL means "not reassessed": either the alert is still active (nothing
-- to reassess), or it is resolved but no divergence from severidade was
-- ever asserted. Readers coalesce NULL to severidade, so this migration
-- changes nothing for the roughly 25 resolved alerts already in the base
-- until a research pass explicitly revisits each one.

ALTER TABLE politician_alerts
  ADD COLUMN IF NOT EXISTS severidade_atual alert_severity;

ALTER TABLE politician_alerts
  ADD COLUMN IF NOT EXISTS severidade_atual_motivo text;

-- Can only ever read as calmer than severidade, never more alarming: a
-- resolution cannot manufacture new evidence of wrongdoing. alert_severity
-- was declared critica/alta/media/baixa, in that order, so >= here means
-- "at least as calm", exploiting Postgres enum ordinal comparison.
ALTER TABLE politician_alerts
  DROP CONSTRAINT IF EXISTS politician_alerts_severidade_atual_not_worse;

ALTER TABLE politician_alerts
  ADD CONSTRAINT politician_alerts_severidade_atual_not_worse
  CHECK (severidade_atual IS NULL OR severidade_atual >= severidade);

-- Only a resolved matter has a present-day reading that can differ from
-- its historical severidade. An active alert's current concern and
-- historical severity are the same fact by definition.
ALTER TABLE politician_alerts
  DROP CONSTRAINT IF EXISTS politician_alerts_severidade_atual_only_resolved;

ALTER TABLE politician_alerts
  ADD CONSTRAINT politician_alerts_severidade_atual_only_resolved
  CHECK (severidade_atual IS NULL OR ativo = false);

-- A downgrade without a stated reason is exactly the opaque judgment call
-- this column exists to avoid. Whoever sets severidade_atual states why in
-- the same write.
ALTER TABLE politician_alerts
  DROP CONSTRAINT IF EXISTS politician_alerts_severidade_atual_motivo_requires_valor;

ALTER TABLE politician_alerts
  ADD CONSTRAINT politician_alerts_severidade_atual_motivo_requires_valor
  CHECK (severidade_atual_motivo IS NULL OR severidade_atual IS NOT NULL);

COMMENT ON COLUMN politician_alerts.severidade_atual IS
  'How much a resolved alert should still weigh on a voter''s present-day judgment, distinct from severidade (the historical fact of how grave the matter was). NULL for an active alert, or a resolved one never reassessed; readers coalesce to severidade. Never more severe than severidade. See docs/referencia/alertas.md.';

COMMENT ON COLUMN politician_alerts.severidade_atual_motivo IS
  'Why severidade_atual was set, quoting or closely paraphrasing the resolution language that grounds the classification (merito, vicio processual, prescricao, condenacao mantida, etc.). Required whenever severidade_atual is set.';

-- Existing output columns keep their exact name, order and type; new
-- columns only append at the end, per PostgreSQL's CREATE OR REPLACE VIEW
-- rule (see git blame on this view for the bug this note prevents). The
-- order below was verified 2026-08-25 by querying v_candidate_alerts
-- directly (GET .../rest/v1/v_candidate_alerts?limit=1 and reading the raw
-- JSON key order): politician_id, nome_urna, tipo, severidade, titulo,
-- descricao, fonte_url, fonte_nome, data_ocorrencia, badge_cor,
-- ordem_exibicao, ativo, resolucao, data_resolucao. docs/migracoes/
-- 11_sp0_foundation.sql's own text had drifted from this (it listed
-- ativo/resolucao/data_resolucao before badge_cor/ordem_exibicao) and was
-- corrected in the same pass as this file; do not trust that file's column
-- order without checking a live query first, on the chance it drifts again.
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
      WHEN 'incoerencia'          THEN 'roxo'
      WHEN 'divergencia_espectro' THEN 'azul'
      WHEN 'ressalva_evidencias'  THEN 'amarelo'
    END)
  END AS badge_cor,
  -- Ordered, and colored client-side, by the coalesced value below, not raw
  -- severidade: a resolved critica alert with a calmer severidade_atual
  -- sorts and reads by its present-day weight, not by history alone.
  CASE COALESCE(pa.severidade_atual, pa.severidade)
    WHEN 'critica' THEN 1
    WHEN 'alta'    THEN 2
    WHEN 'media'   THEN 3
    WHEN 'baixa'   THEN 4
  END AS ordem_exibicao,
  pa.ativo,
  pa.resolucao,
  pa.data_resolucao,
  COALESCE(pa.severidade_atual, pa.severidade) AS severidade_atual,
  pa.severidade_atual_motivo
FROM politician_alerts pa
JOIN politicians p ON p.id = pa.politician_id
WHERE pa.validado = true
ORDER BY pa.politician_id, ordem_exibicao;

COMMENT ON VIEW v_candidate_alerts IS
  'Alertas validados prontos para exibição na UI, ativos ou resolvidos (ver ativo/resolucao). Ordenados e coloridos pelo peso atual (severidade_atual quando setado, senão severidade). Extended by base/11_sp0_foundation.sql with badge_cor branches for incoerencia (roxo), divergencia_espectro (azul) and ressalva_evidencias (amarelo); extended 2026-08-25 to stop hiding resolved alerts; extended again by 14_severidade_atual.sql to expose severidade_atual/severidade_atual_motivo and drive ordering by the coalesced value.';
