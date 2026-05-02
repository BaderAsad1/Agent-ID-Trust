# Agent ID E2E tests (Playwright)

These tests drive a real Chromium browser against the locally running Agent ID
web app and exercise the Mail compose-modal attachment upload flow end-to-end,
including DB seeding, session-cookie auth, file upload, and DB verification.

## Prerequisites

- A running dev environment with the `artifacts/agent-id: web` and
  `artifacts/api-server: API Server` workflows up.
- `DATABASE_URL` set (the same Postgres the API server talks to).
- `REPLIT_DEV_DOMAIN` set (Replit normally injects this) **or** an explicit
  `E2E_BASE_URL` that points at the dev preview origin.
- Chromium installed for Playwright (one-time):

  ```bash
  pnpm --filter @workspace/agent-id exec playwright install chromium
  ```

## Run

```bash
pnpm --filter @workspace/agent-id run test:e2e
```

To target a different host, override `E2E_BASE_URL`:

```bash
E2E_BASE_URL=https://my-preview.example.dev \
  pnpm --filter @workspace/agent-id run test:e2e
```

## Test plan

`tests/e2e/mail-attachment.spec.ts` runs three cases:

| ID | Type     | What it verifies                                                                                       |
| -- | -------- | ------------------------------------------------------------------------------------------------------ |
| T1 | positive | Valid `text/plain` file dropped onto the dropzone via a real `dragenter`/`dragover`/`drop` sequence with a synthesized `DataTransfer`. After Send, the attachment row is asserted both in `message_attachments` (DB) and through the public mail API (`GET /v1/mail/agents/:agentId/messages/:messageId` → `attachments[]`). |
| T2 | negative | `application/x-msdownload` (`.exe`) → red banner with the exact `file type "…" is not allowed` message; no chip added. |
| T3 | negative | Oversize file rejected client-side. Always runs (no skip): the buffer is materialized to a temp file on disk and fed via `setInputFiles(path)` so the test works for both inline (~500 KB) and R2 (~100 MB) configurations. |

### Auth (why the spec injects a session row)

The api-server uses session-cookie auth. Real login flows go through
`/api/auth/{github,google,magic-link,agentid}` — none have a programmatic
test bypass exposed by the application server, and the Replit Auth testing
harness's `testReplitAuth: true` flag (see
`.local/skills/testing/replit-auth.md`) only applies inside the `runTest()`
subagent's process (it sets `ISSUER_URL` for that subprocess). It is not
available to a standalone Playwright spec, because the api-server already
running in this workspace is not started by the test runner.

The spec therefore seeds a `sessions` row directly and sets the `sid`
cookie on the browser context. This still exercises the production
`replitAuth` middleware → `loadUserFromSession` → cookie → `sessions` →
`users` code path that any successful OIDC callback would land in.

Each test seeds an isolated `users` + `subscriptions` (`pro`/`active`) +
`agents` (`active`/`verified`) + `sessions` row, and tears them down in
`afterEach` regardless of pass/fail. Plan gating in this app reads from the
`subscriptions` table — **not** `users.plan` — so an active subscription row
is required for mail endpoints to return anything other than 429.
