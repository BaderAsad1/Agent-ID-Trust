-- H10: Add partial unique index to prevent duplicate active attestations.
-- Enforces one active (non-revoked) attestation per (attester_id, subject_id) pair at the DB level.
-- Revoked attestations (revoked_at IS NOT NULL) are excluded from the uniqueness check,
-- so re-attestation is allowed after revocation.

CREATE UNIQUE INDEX IF NOT EXISTS "agent_attestations_active_unique_idx"
ON "agent_attestations" ("attester_id", "subject_id")
WHERE "revoked_at" IS NULL;
