#!/bin/bash
set -e

# Remove stale subrepl-* remotes left by task agents
git remote | grep '^subrepl-' | xargs -r -I{} git remote remove {} || true

pnpm install --frozen-lockfile

# ── Pre-apply known column renames so Drizzle push doesn't prompt interactively ──
node -e "
const { Pool } = require('./lib/db/node_modules/pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const renames = [
    ['magic_link_tokens', 'token', 'hashed_token'],
  ];
  for (const [table, oldCol, newCol] of renames) {
    const check = await p.query(
      \"SELECT 1 FROM information_schema.columns WHERE table_name = \$1 AND column_name = \$2\",
      [table, oldCol]
    );
    if (check.rowCount > 0) {
      await p.query('ALTER TABLE ' + table + ' RENAME COLUMN ' + oldCol + ' TO ' + newCol);
      console.log('[post-merge] Renamed ' + table + '.' + oldCol + ' -> ' + newCol);
    }
  }
  await p.end();
})().catch(e => { console.error('[post-merge] rename step:', e.message); process.exit(1); });
"

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

# Note: previously this script ran two idempotent "ensure" blocks here —
#   - audit_events column adds, and
#   - agent_ows_wallet_accounts JSONB backfill —
# both of which now live in the numbered Drizzle migration
# 0036_audit_events_target_and_ows_accounts_backfill.sql so the schema is the
# single source of truth instead of drifting silently between push and the script.
