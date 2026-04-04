# Testing Guide

## Test Suites

The API server uses [Vitest](https://vitest.dev) with three tiered test projects:

| Project | Pattern | Purpose |
|---------|---------|---------|
| `unit` | `*.unit.test.ts`, `*-unit.test.ts` | Fast, isolated, no DB |
| `integration` | `*.integration.test.ts` | Full DB + HTTP routes |
| `security` | `*.security.test.ts` | Auth, BOLA, injection, webhook safety |

## Running Tests

```bash
# From the workspace root
cd artifacts/api-server

# All suites
pnpm test

# Individual suites
pnpm test:unit
pnpm test:integration
pnpm test:security
```

## Test Files

### Integration Tests

| File | Coverage |
|------|----------|
| `claim-later-flow.integration.test.ts` | Owner token issuance, claim flow, expiry, double-claim prevention |
| `agent-lifecycle.integration.test.ts` | Draft → active → inactive transitions, auth enforcement, isolation |
| `key-lifecycle.integration.test.ts` | Key creation, rotation (UUID PK), revocation, active key enforcement |
| `resolver-states.integration.test.ts` | DID resolution for active/suspended/revoked/deleted agents, field leakage |
| `credentials-trust.integration.test.ts` | Credential issuance, signature verification, trust score computation |

### Security Tests

| File | Coverage |
|------|----------|
| `payment-webhooks.security.test.ts` | Stripe signature validation, forged payload blocking, disabled provider 501s, billing auth |
| `security-expanded.security.test.ts` | Replay attack prevention, BOLA isolation, sandbox middleware, payload size limits |

## CI Jobs

The GitHub Actions workflow (`.github/workflows/test.yml`) runs three jobs:

1. **`unit`** — runs on every push/PR, no DB required, fastest feedback
2. **`integration`** — runs after `unit` passes, requires Postgres service
3. **`security`** — runs after `unit` passes, requires Postgres service and `STRIPE_WEBHOOK_SECRET` secret

Integration and security jobs both block PR merges when they fail.

## Environment Requirements

For integration and security tests, a PostgreSQL database must be available. Set:

```
DATABASE_URL=postgres://user:pass@localhost:5432/dbname
```

The test database must have all migrations applied. Run `pnpm push` in the `@workspace/db` package to sync the schema before running integration tests.
