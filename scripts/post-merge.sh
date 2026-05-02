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

# Ensure audit_events has columns required by schema (idempotent via IF NOT EXISTS)
node -e "
const { Pool } = require('./lib/db/node_modules/pg');
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

# Backfill agent_ows_wallet_accounts from agent_ows_wallets.accounts JSONB.
# Idempotent (ON CONFLICT DO NOTHING). Required because drizzle-kit push only
# syncs schema (CREATE TABLE / CREATE INDEX) and does not run data migrations.
# See lib/db/drizzle/0032_ows_wallet_accounts_normalized.sql for the source SQL.
node -e "
const { Pool } = require('./lib/db/node_modules/pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const tableExists = await p.query(\`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'agent_ows_wallet_accounts'
  \`);
  if (tableExists.rowCount === 0) {
    console.log('[post-merge] agent_ows_wallet_accounts table not present yet, skipping backfill');
    await p.end();
    return;
  }
  const result = await p.query(\`
    INSERT INTO agent_ows_wallet_accounts
      (agent_id, ows_wallet_id, caip10, namespace, chain_reference, address, address_lower)
    SELECT
      w.agent_id,
      w.id AS ows_wallet_id,
      account_text AS caip10,
      split_part(account_text, ':', 1) AS namespace,
      split_part(account_text, ':', 2) AS chain_reference,
      split_part(account_text, ':', 3) AS address,
      lower(split_part(account_text, ':', 3)) AS address_lower
    FROM agent_ows_wallets w
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(w.accounts, '[]'::jsonb)) AS account_text
    WHERE
      array_length(string_to_array(account_text, ':'), 1) = 3
      AND length(split_part(account_text, ':', 1)) > 0
      AND length(split_part(account_text, ':', 2)) > 0
      AND length(split_part(account_text, ':', 3)) > 0
    ON CONFLICT (agent_id, caip10) DO NOTHING
  \`);
  console.log('[post-merge] agent_ows_wallet_accounts backfill: ' + result.rowCount + ' rows inserted');
  await p.end();
})().catch(e => { console.error('[post-merge] ows accounts backfill failed:', e.message); process.exit(1); });
" 2>/dev/null || true
