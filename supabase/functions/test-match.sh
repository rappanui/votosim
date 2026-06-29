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

curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"estado\": \"${ESTADO}\",
    \"municipio\": \"São Paulo\",
    \"faixaEtaria\": \"25 a 34 anos\",
    \"sessionToken\": \"test-local\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"respostas\": [
      { \"temaSlug\": \"sus_saude_publica\",        \"resposta\": 5, \"concordancia\": \"concordo\", \"intensidade\": 5 },
      { \"temaSlug\": \"privatizacao_estatais\",     \"resposta\": 1, \"concordancia\": \"discordo\", \"intensidade\": 5 },
      { \"temaSlug\": \"educacao_basica\",           \"resposta\": 5, \"concordancia\": \"concordo\", \"intensidade\": 4 },
      { \"temaSlug\": \"meio_ambiente_desmatamento\", \"resposta\": 5, \"concordancia\": \"concordo\", \"intensidade\": 4 },
      { \"temaSlug\": \"seguranca_publica_estadual\", \"resposta\": 3, \"concordancia\": \"neutro\",   \"intensidade\": 3 },
      { \"temaSlug\": \"corrupcao_transparencia\",   \"resposta\": 5, \"concordancia\": \"concordo\", \"intensidade\": 5 }
    ]
  }" | jq '.'
