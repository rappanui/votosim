-- party_positions: stores political positions derived from official party programs.
-- Applied manually via Supabase SQL Editor (no migration framework in this project).
-- Run AFTER the parties table exists (from 01_schema_politicians.md).

CREATE TABLE IF NOT EXISTS party_positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_sigla     TEXT NOT NULL REFERENCES parties(sigla) ON DELETE CASCADE,
  theme_id        UUID NOT NULL REFERENCES themes_catalog(id) ON DELETE CASCADE,
  posicao         TEXT NOT NULL CHECK (posicao IN ('favoravel', 'contrario', 'neutro')),
  intensidade     SMALLINT NOT NULL DEFAULT 3 CHECK (intensidade BETWEEN 1 AND 5),
  fontes          JSONB NOT NULL DEFAULT '[]',
  gerado_por_ia   BOOLEAN NOT NULL DEFAULT true,
  validado        BOOLEAN NOT NULL DEFAULT false,
  confianca_ia    NUMERIC(3,2),
  criado_em       TIMESTAMPTZ DEFAULT now(),
  atualizado_em   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (party_sigla, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_party_positions_sigla ON party_positions (party_sigla);
CREATE INDEX IF NOT EXISTS idx_party_positions_theme ON party_positions (theme_id);

-- RLS: public can read, only service_role can write
ALTER TABLE party_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "party_positions_public_read" ON party_positions FOR SELECT USING (true);
