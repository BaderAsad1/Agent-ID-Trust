# Backup and Disaster Recovery Runbook

## Overview

This document covers the backup strategy, recovery procedures, RTO/RPO targets, and operational guidance for the Agent ID API infrastructure.

---

## RTO / RPO Targets

| Component   | RPO (Recovery Point Objective) | RTO (Recovery Time Objective) |
|-------------|-------------------------------|-------------------------------|
| PostgreSQL  | 24 hours                      | 4 hours                       |
| Redis       | 0 (ephemeral cache — no data loss requirement) | 30 minutes (restart/provision) |
| Application | N/A                           | 30 minutes (container restart) |

---

## PostgreSQL Backup

### Automated Backup (pg_dump + S3 Upload)

Run this script on a daily schedule (e.g., cron or CI):

```bash
# Full database dump with S3 upload
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="agentid-backup-${TIMESTAMP}.dump"

# Dump compressed
pg_dump "$DATABASE_URL" -Fc -f "/tmp/${BACKUP_FILE}"

# Upload to S3
aws s3 cp "/tmp/${BACKUP_FILE}" "s3://${BACKUP_BUCKET}/postgres/${BACKUP_FILE}"

# Clean up local file
rm -f "/tmp/${BACKUP_FILE}"

echo "Backup complete: s3://${BACKUP_BUCKET}/postgres/${BACKUP_FILE}"
```

### 30-Day Retention Policy

Apply an S3 lifecycle rule to expire backups after 30 days:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket "${BACKUP_BUCKET}" \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-old-backups",
      "Status": "Enabled",
      "Filter": { "Prefix": "postgres/" },
      "Expiration": { "Days": 30 }
    }]
  }'
```

### Restore from Backup

```bash
# List available backups
aws s3 ls "s3://${BACKUP_BUCKET}/postgres/" --recursive

# Download backup
aws s3 cp "s3://${BACKUP_BUCKET}/postgres/agentid-backup-YYYYMMDD-HHMMSS.dump" /tmp/restore.dump

# Restore (destructive — drops and recreates all objects)
pg_restore -d "$DATABASE_URL" --clean --if-exists /tmp/restore.dump
```

---

## Redis Configuration

### Persistence (Append-Only File + RDB Snapshots)

Add to `redis.conf`:

```
# RDB snapshots: save every 900s if 1 key changed, 300s if 10 keys, 60s if 10000 keys
save 900 1
save 300 10
save 60 10000

# Append-only file for durability
appendonly yes
appendfsync everysec
```

### Eviction Policy

Configure `allkeys-lru` to evict the least-recently-used keys when memory is full:

```bash
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

Persist in `redis.conf`:

```
maxmemory-policy allkeys-lru
maxmemory 512mb
```

---

## 6-Step Recovery Runbook

### Step 1: Assess the Incident

- Identify which components are affected (DB, Redis, application).
- Check monitoring dashboards and recent deployment logs.
- Declare incident severity and notify on-call team.

### Step 2: Isolate and Stabilize

- Route traffic to a static maintenance page or return 503 responses.
- Prevent further writes to a corrupted database by disabling application pods.

### Step 3: Restore PostgreSQL

- Follow the restore procedure above using the most recent valid backup from S3.
- Verify row counts and spot-check critical tables (`agents`, `users`, `marketplace_orders`).

### Step 4: Restore Redis (if needed)

- Redis is a cache layer — most data can be rebuilt from PostgreSQL.
- If using AOF, restart Redis with the existing AOF file.
- Otherwise, flush and let the application warm the cache naturally.

### Step 5: Validate Application

- Run smoke tests: `pnpm run load:smoke`
- Verify critical endpoints: `/api/v1/resolve/:handle`, `/api/health`
- Check error rates in logs and monitoring.

### Step 6: Resume Traffic and Post-Mortem

- Re-enable traffic routing.
- Document the incident timeline, root cause, and corrective actions.
- Update runbook if new failure modes were discovered.

---

## Environment Variables (Store in Secrets Manager)

The following environment variables must be stored in a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault, or Replit Secrets) and rotated regularly:

```
DATABASE_URL                 # PostgreSQL connection string
REDIS_URL                    # Redis connection string
SESSION_SECRET               # Express session secret
CREDENTIAL_SIGNING_SECRET    # HMAC signing secret for credentials
JWT_SECRET                   # JWT signing secret
STRIPE_SECRET_KEY            # Stripe API secret key
STRIPE_WEBHOOK_SECRET        # Stripe webhook endpoint secret
VC_PRIVATE_KEY               # Ed25519 private key for VC signing (JWK JSON)
VC_PUBLIC_KEY                # Ed25519 public key for VC verification (JWK JSON)
COINBASE_CDP_API_KEY         # Coinbase Developer Platform API key
COINBASE_CDP_API_SECRET      # Coinbase Developer Platform API secret
SENDGRID_API_KEY             # SendGrid transactional email API key
APP_URL                      # Public application base URL
API_BASE_URL                 # Public API base URL
DB_POOL_MAX                  # PostgreSQL connection pool max size (default: 100)
BACKUP_BUCKET                # S3 bucket name for database backups
```

All secrets must be rotated at least every 90 days. Access should be restricted to application service accounts using least-privilege IAM policies.
