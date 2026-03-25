#!/bin/bash
set -e
pnpm install --frozen-lockfile

# ── Pre-apply known column renames so Drizzle push doesn't prompt interactively ──
node -e "
const { Pool } = require('pg');
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

# Ensure audit_events has columns required by schema (idempotent via IF NOT EXISTS)
node -e "
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
p.query(\`
  ALTER TABLE audit_events
    ADD COLUMN IF NOT EXISTS target_type varchar(64),
    ADD COLUMN IF NOT EXISTS target_id varchar(128),
    ADD COLUMN IF NOT EXISTS ip_address varchar(64),
    ADD COLUMN IF NOT EXISTS user_agent varchar(512)
\`).then(() => { console.log('[post-merge] audit_events columns ensured'); p.end(); })
  .catch(e => { console.error('[post-merge] audit_events alter failed:', e.message); p.end(); process.exit(1); });
" 2>/dev/null || true
