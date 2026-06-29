#!/usr/bin/env bash
# Run match-candidatos Edge Function locally with Deno (no Docker needed).
# Usage:
#   bash supabase/functions/dev.sh
#
# Then test with:
#   bash supabase/functions/test-match.sh [estado]
#
# Reads secrets from supabase/functions/.env

set -euo pipefail

ENV_FILE="$(dirname "$0")/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.example or create it from the Supabase Dashboard."
  exit 1
fi

# Load env vars from .env file
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DENO="${DENO_BIN:-${HOME}/.deno/bin/deno}"

if [[ ! -x "$DENO" ]]; then
  echo "ERROR: Deno not found at $DENO. Install with: curl -fsSL https://deno.land/install.sh | sh"
  exit 1
fi

echo "Starting match-candidatos on http://localhost:8000 ..."
echo "  Supabase: ${SUPABASE_URL}"
echo "  Election year: ${ELECTION_YEAR:-2026}"
echo ""

exec "$DENO" run \
  --allow-net \
  --allow-env \
  --allow-read \
  "$(dirname "$0")/match-candidatos/index.ts"
