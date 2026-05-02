#!/usr/bin/env bash
# Reproducible metrics for audits/05-api-sdk-contract.md.
# Run from the repo root:  bash audits/scripts/05-api-sdk-metrics.sh
# Re-run after touching /v1 routes, openapi.yaml, or the SDKs.

set -euo pipefail

ROUTES_DIR="artifacts/api-server/src/routes/v1"
SPEC="lib/api-spec/openapi.yaml"
PYTHON_SYNC="lib/python-sdk/agentid/client.py"
PYTHON_ASYNC="lib/python-sdk/agentid/async_client.py"
JS_MODULES_DIR="lib/sdk/src/modules"

echo "=== Server routes (/v1) ==="
echo "Router files:                $(ls "$ROUTES_DIR"/*.ts | wc -l)"
echo "Total router.<verb>( calls:  $(grep -hcE 'router\.(get|post|put|patch|delete)\(' "$ROUTES_DIR"/*.ts | awk '{s+=$1} END {print s}')"
# Many calls use a string literal; some use template literals or variable names.
literal_calls=$(grep -hoE 'router\.(get|post|put|patch|delete)\((`[^`]+`|"[^"]+")' "$ROUTES_DIR"/*.ts | wc -l)
echo "Calls with literal path:     $literal_calls"
echo "Unique (verb, literal-path): $(grep -hoE 'router\.(get|post|put|patch|delete)\((`[^`]+`|"[^"]+")' "$ROUTES_DIR"/*.ts | sort -u | wc -l)"

echo
echo "=== OpenAPI spec ==="
echo "File:                        $SPEC"
echo "openapi:                     $(grep -E '^openapi:' "$SPEC" | head -1 | awk '{print $2}')"
echo "info.version:                $(awk '/^info:/{f=1;next} f && /^[a-z]/{f=0} f && /version:/{print $2; exit}' "$SPEC")"
echo "Paths in 'paths:' section:   $(awk '/^paths:/{f=1;next} f && /^[a-z]+:/{f=0} f' "$SPEC" | grep -cE '^[[:space:]]+/[a-zA-Z][^:]*:[[:space:]]*$')"
echo "Tag entries:                 $(awk '/^tags:/{f=1;next} f && /^[a-z]+:/{f=0} f' "$SPEC" | grep -cE '^[[:space:]]*-[[:space:]]*name:')"

echo
echo "=== Python SDK ==="
for f in "$PYTHON_SYNC" "$PYTHON_ASYNC"; do
  echo "$f"
  echo "  LoC:                       $(wc -l < "$f")"
  echo "  Class methods (def at indent 4):  $(grep -cE '^    (async )?def [a-z_]' "$f")"
done
echo "Python pyproject version:    $(grep -E '^version' lib/python-sdk/pyproject.toml | head -1 | awk -F'\"' '{print $2}')"
echo "Python __version__:          $(grep -E '__version__' lib/python-sdk/agentid/__init__.py | head -1 | awk -F'\"' '{print $2}')"

echo
echo "=== JS SDK ==="
echo "Module files:                $(ls "$JS_MODULES_DIR"/*.ts | wc -l)"
echo "JS package.json version:     $(grep -E '\"version\"' lib/sdk/package.json | head -1 | awk -F'\"' '{print $4}')"

echo
echo "=== Error envelopes ==="
echo "AppError throws (canonical):       $(grep -rcE 'throw new AppError\(' "$ROUTES_DIR"/*.ts | awk -F: '{s+=$2} END {print s}')"
echo "Direct res.status(...).json(...):  $(grep -rcE 'res\.status\([0-9]+\)\.json' "$ROUTES_DIR"/*.ts | awk -F: '{s+=$2} END {print s}')"

echo
echo "=== Cache headers on public-ish endpoints ==="
grep -rE 'Cache-Control' "$ROUTES_DIR"/*.ts artifacts/api-server/src/routes/well-known.ts \
  | grep -v test | sort -u | head -40

echo
echo "=== Outbound webhook signature scheme ==="
grep -nE 'X-AgentID-Signature|X-Webhook-Signature' artifacts/api-server/src/services/*.ts || true
