-- docs/migracoes/12_neutro_motivo.sql
-- Match v3: split the overloaded `neutro` position value.
--
-- `neutro` in politician_positions does not mean the candidate is neutral. The
-- enrichment prompt instructs the model to write `neutro` whenever confidence
-- is below 0.70 (docs/candidate-enrichment-prompt.md), so the value collapses
-- three different facts into one. Every `neutro` row in the database has
-- confianca_ia <= 0.50.
--
-- This column records which of the three a `neutro` row actually is. It does
-- not alter `posicao`, so existing consumers keep working unchanged.
--
--   nao_encontrado — searched, found nothing. Scores P_NAO_INFORMADO (0.10).
--   nao_responde   — has a documented stance on the theme, but orthogonal to
--                    the questionnaire's affirmation. Scores 0.5.
--   ambivalente    — contradictory, or "it depends on context". Scores 0.5.
--
-- NULL means "not classified yet". Readers treat NULL as nao_encontrado: the
-- safe default, and what ~85% of existing rows turn out to be.

ALTER TABLE politician_positions
  ADD COLUMN IF NOT EXISTS neutro_motivo text;

ALTER TABLE politician_positions
  DROP CONSTRAINT IF EXISTS politician_positions_neutro_motivo_check;

ALTER TABLE politician_positions
  ADD CONSTRAINT politician_positions_neutro_motivo_check
  CHECK (
    neutro_motivo IS NULL
    OR neutro_motivo IN ('nao_encontrado', 'nao_responde', 'ambivalente')
  );

-- Only `neutro` rows may carry a motivo. A favoravel/contrario row with one
-- would mean the classifier ran on the wrong input.
ALTER TABLE politician_positions
  DROP CONSTRAINT IF EXISTS politician_positions_neutro_motivo_only_neutro;

ALTER TABLE politician_positions
  ADD CONSTRAINT politician_positions_neutro_motivo_only_neutro
  CHECK (neutro_motivo IS NULL OR posicao = 'neutro');

COMMENT ON COLUMN politician_positions.neutro_motivo IS
  'Match v3: why a `neutro` row is neutral. nao_encontrado (nothing found, scores 0.10) | nao_responde (has a stance, orthogonal to the affirmation, scores 0.5) | ambivalente (contradictory, scores 0.5). NULL = unclassified, read as nao_encontrado. See docs/superpowers/specs/2026-08-23-match-v3-scoring-design.md.';

CREATE INDEX IF NOT EXISTS idx_politician_positions_neutro_motivo
  ON politician_positions (neutro_motivo)
  WHERE posicao = 'neutro';
