# Backup and Disaster Recovery Runbook

## Overview

This document covers the backup strategy, recovery procedures, RTO/RPO targets, and operational guidance for the Agent ID API infrastructure.

---

## RTO / RPO Targets

| Component   | RPO (Recovery Point Objective) | RTO (Recovery Time Objective) |
|-------------|-------------------------------|-------------------------------|
| PostgreSQL  | 1 hour (WAL-based)            | 30 minutes                    |
| Redis       | 0 (ephemeral cache — no data loss requirement) | 5 minutes (restart/provision) |
| Application | N/A                           | 5 minutes (container restart) |

---

## PostgreSQL Backup

### Automated Backups (Replit Managed)

Replit provisions PostgreSQL with automated backups. Verify backup frequency in the Replit dashboard under your project's database settings.

### Manual Backup (pg_dump)

```bash
# Full database dump (compressed)
pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%Y%m%d-%H%M%S).dump

# Restore from dump
pg_restore -d "$DATABASE_URL" --clean --if-exists backup-YYYYMMDD-HHMMSS.dump
```

### Continuous WAL Archiving (Recommended for Production)

For production deployments with RPO < 1 hour:

```bash
# In postgresql.conf:
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://your-bucket/wal/%f'
```

Point-in-time recovery (PITR) allows restoring to any moment after base backup.

---

## Redis Configuration

### No Persistence Required (Cache-Only)

Redis in this project is used for:
- Rate limiting counters (`rl:*` keys)
- Resolution cache (`resolve:handle:*` keys)
- Trust score cache (`trust:*` keys)
- Credential cache (`credential:*` keys)
- BullMQ job queues

**All data is ephemeral.** Redis failure causes:
- Rate limiters fall back to in-memory (per-process counters)
- Caches regenerate from PostgreSQL on next request
- BullMQ jobs replay from persisted queue state

### Recommended `maxmemory-policy`

```
maxmemory-policy allkeys-lru
```

This evicts the least-recently-used keys when memory is full, preventing OOM. The application sets `noeviction` on startup (see `lib/redis.ts`), but for production shared Redis instances, `allkeys-lru` is safer to prevent unbounded memory growth.

To update at runtime:
```bash
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG SET maxmemory 512mb
```

### Redis Backup (Optional)

If using Redis for persistent data (e.g. BullMQ job state you cannot lose):

```bash
# Enable RDB snapshots in redis.conf:
save 900 1
save 300 10
save 60 10000

# Or use AOF for stronger durability:
appendonly yes
appendfsync everysec
```

---

## Step-by-Step Recovery Procedures

### Scenario 1: Database Corruption or Total Loss

1. **Stop the API server** to prevent writes to a corrupted DB.
2. **Provision a new PostgreSQL database** (Replit dashboard or cloud provider).
3. **Set `DATABASE_URL`** to the new database connection string.
4. **Restore from backup**:
   ```bash
   pg_restore -d "$NEW_DATABASE_URL" --clean --if-exists latest.dump
   ```
5. **Run Drizzle migrations** against the restored database:
   ```bash
   pnpm --filter @workspace/db run db:migrate
   ```
6. **Restart the API server** and verify health endpoint (`/api/health`).
7. **Validate** — run smoke tests:
   ```bash
   BASE_URL=https://your-app.replit.app/api/v1 k6 run scripts/load-test-smoke.js
   ```

### Scenario 2: Redis Failure

1. Redis failure is **non-critical**. The application degrades gracefully.
2. Rate limiting falls back to in-memory (per-process, not distributed).
3. Resolution, trust, and credential caches regenerate from PostgreSQL automatically.
4. To restore Redis:
   - **Replit**: Redis restarts automatically.
   - **Self-hosted**: `systemctl restart redis` or `docker restart redis`.
5. Rate limiter Redis connection is re-established automatically via `getSharedRedis()` reconnect logic.

### Scenario 3: Application Server Crash

1. Replit auto-restarts the application workflow.
2. No data loss — all state is in PostgreSQL and Redis.
3. If workflow fails to restart, check logs:
   ```bash
   # Via Replit workflow console
   # Or: pnpm --filter @workspace/api-server run dev
   ```

### Scenario 4: Handle Benefit Claim Stranded (Billing)

If a user's included-handle benefit was claimed but agent creation failed and the claim was not released (look for `billing.included_handle_claim.stranded` audit events):

1. Query audit events:
   ```sql
   SELECT * FROM audit_events
   WHERE event_type = 'billing.included_handle_claim.stranded'
   ORDER BY created_at DESC;
   ```
2. For each stranded claim, release it via:
   ```sql
   UPDATE subscriptions
   SET included_handle_claimed = NULL,
       included_handle_claimed_at = NULL,
       updated_at = NOW()
   WHERE id = '<subscriptionId>';
   ```
3. Notify the affected user.

---

## Required Environment Variables

The following environment variables are **required in production**. Loss of any of these causes service degradation or complete failure.

| Variable | Purpose | Impact if Missing |
|----------|---------|-------------------|
| `DATABASE_URL` | PostgreSQL connection | **Server crash on startup** |
| `REDIS_URL` | Redis for caching/rate limiting | Rate limiting degrades to in-memory |
| `JWT_SECRET` | Session authentication | **All auth fails** |
| `CREDENTIAL_SIGNING_SECRET` | Agent credential HMAC | **Server crash in production** |
| `VC_SIGNING_KEY` | W3C VC signing | VC issuance fails |
| `WEBHOOK_SECRET_KEY` | Webhook payload encryption | Webhook delivery fails |
| `STRIPE_SECRET_KEY` | Payment processing | All payments fail |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Stripe events ignored |
| `APP_URL` | Base URL for links/redirects | Broken links in responses |
| `ACTIVITY_HMAC_SECRET` | Activity log signing | Activity log integrity fails |
| `DB_POOL_MAX` | PostgreSQL pool size (default: 100) | Optional — defaults to 100 |

---

## Monitoring Checklist

- [ ] Database connection count < `DB_POOL_MAX` (default 100)
- [ ] Redis memory usage < 80% of `maxmemory`
- [ ] Resolution cache hit rate monitored via `X-Cache: HIT` response header
- [ ] `[PAYOUT REQUIRED]` log lines monitored and actioned within 24h
- [ ] Stranded handle claims (`billing.included_handle_claim.stranded`) reviewed daily
- [ ] Smoke test run after every deployment: `pnpm load:smoke`
