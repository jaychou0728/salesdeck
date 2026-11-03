#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
curl -fsS "$BASE/health"
curl -fsS -X POST "$BASE/v1/chat/completions" -H 'Content-Type: application/json' --data-binary @"$SCRIPT_DIR/smoke-briefing.json"
curl -fsS -N -X POST "$BASE/api/chat" -H 'Content-Type: application/json' -H 'x-actor-id: u_sales_lin' --data-binary @"$SCRIPT_DIR/smoke-quote.json" | head -n 20
echo "smoke ok"
