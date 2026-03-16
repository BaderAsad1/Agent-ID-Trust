UPDATE agents
SET status = 'active', updated_at = NOW()
WHERE verification_status = 'verified'
  AND status = 'draft';
