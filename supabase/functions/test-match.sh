#!/usr/bin/env bash
# Test script for match-candidatos Edge Function running locally.
# Usage:
#   Terminal 1: bash supabase/functions/dev.sh
#   Terminal 2: bash supabase/functions/test-match.sh [estado]
#
# Default estado: SP

ESTADO="${1:-SP}"
URL="http://localhost:8000"

echo "Testing match-candidatos for estado=${ESTADO}..."
echo ""

# Payload shape must match RespostaUsuario (src/lib/types.ts,
# supabase/functions/match-candidatos/ai-providers.ts): posicao +
# importancia. An earlier version of this script used resposta/concordancia/
# intensidade, which silently matched nothing — every response fell through
# to "contrario" inside scoreCandidato because r.posicao was always
# undefined, and the function returned cargos: [] with no error at all.
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"estado\": \"${ESTADO}\",
    \"sessionToken\": \"test-local\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"respostas\": [
      { \"temaSlug\": \"sus_saude_publica\",        \"posicao\": \"favoravel\", \"importancia\": 3 },
      { \"temaSlug\": \"privatizacao_estatais\",     \"posicao\": \"contrario\", \"importancia\": 3 },
      { \"temaSlug\": \"educacao_basica\",           \"posicao\": \"favoravel\", \"importancia\": 2 },
      { \"temaSlug\": \"meio_ambiente_desmatamento\", \"posicao\": \"favoravel\", \"importancia\": 2 },
      { \"temaSlug\": \"seguranca_publica_estadual\", \"posicao\": \"neutro\",    \"importancia\": 1 },
      { \"temaSlug\": \"corrupcao_transparencia\",   \"posicao\": \"favoravel\", \"importancia\": 3 }
    ]
  }" | jq '.'
