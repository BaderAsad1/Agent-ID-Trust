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
# From the workspace root: every package with tests
pnpm test

# Individual launch gates
pnpm run test:unit
pnpm run test:integration
pnpm run test:security
pnpm run test:frontend
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

The GitHub Actions workflow (`.github/workflows/test.yml`) runs one fail-fast `verify` job with PostgreSQL and Redis services. It performs a frozen install, applies the committed SQL migrations to an empty database, then runs typecheck, API unit/integration/security suites, frontend and SDK tests, and the production release build. Configure `verify` as a required branch-protection check on `master`.

## Environment Requirements

For integration and security tests, a PostgreSQL database must be available. Set:

```
DATABASE_URL=postgres://user:pass@localhost:5432/dbname
```

The test database must have the current schema. Run `pnpm --filter @workspace/db push-force` only against a disposable local/CI database before integration tests.
