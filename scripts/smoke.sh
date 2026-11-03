#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:3000}"
curl -fsS "$BASE/health"
curl -fsS -X POST "$BASE/v1/chat/completions" -H 'Content-Type: application/json' -d '{"model":"mock","messages":[{"role":"user","content":"晨报"}],"tools":[{"type":"function","function":{"name":"get_sales_briefing","description":"briefing","parameters":{"type":"object"}}}]}'
curl -fsS -N -X POST "$BASE/api/chat" -H 'Content-Type: application/json' -H 'x-actor-id: u_sales_lin' -d '{"message":"给华辰设计的张总报 120 台 X1"}' | head -n 20
echo "smoke ok"
