#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Run DB push; if it fails only due to duplicate enum labels (already-applied
# ALTER TYPE … ADD VALUE statements), treat that as success and continue.
if ! pnpm --filter db push 2>&1 | tee /tmp/db-push.log; then
  if grep -q "already exists" /tmp/db-push.log; then
    echo "[post-merge] DB push: enum values already present, schema is up to date."
  else
    echo "[post-merge] DB push failed with unexpected error:"
    cat /tmp/db-push.log
    exit 1
  fi
fi

npx tsc -p lib/db/tsconfig.json --noEmit false
