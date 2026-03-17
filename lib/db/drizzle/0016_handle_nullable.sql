-- Migration: Make agents.handle nullable (UUID-first identity model)
-- Handle is now an optional paid alias, not required for identity.
-- Machine identity is always the UUID (agent.id).

-- Step 1: Reset agents where handle = id (UUID placeholder) to NULL
UPDATE agents SET handle = NULL WHERE handle = id::text;

-- Step 2: Drop the old NOT NULL constraint
ALTER TABLE agents ALTER COLUMN handle DROP NOT NULL;

-- Step 3: Drop old unique index (cannot be conditional once created as non-conditional)
DROP INDEX IF EXISTS agents_handle_idx;
DROP INDEX IF EXISTS agents_handle_lower_idx;

-- Step 4: Create partial unique indexes (only enforce uniqueness for non-null handles)
CREATE UNIQUE INDEX agents_handle_idx ON agents (handle) WHERE handle IS NOT NULL;
CREATE INDEX agents_handle_lower_idx ON agents (lower(handle)) WHERE handle IS NOT NULL;
