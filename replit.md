# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded, security headers, request logging, Replit Auth + API key auth middleware, error handler
- Routes: `src/routes/index.ts` mounts sub-routers; health, llms-txt at root; v1 routes under `/api/v1`
  - `GET /api/healthz` — health check
  - `GET /api/llms.txt` — structured plaintext for LLM consumption
  - `GET /api/v1/auth/me` — current session user
  - `GET /api/v1/users/me` — full user profile
  - `PATCH /api/v1/users/me` — update profile (displayName, email, avatarUrl, username)
  - `POST /api/v1/users/me/api-keys` — create API key (returns raw key once)
  - `GET /api/v1/users/me/api-keys` — list API keys (prefix only)
  - `DELETE /api/v1/users/me/api-keys/:keyId` — revoke API key
  - `GET /api/v1/users/me/identities` — list linked identities
  - `POST /api/v1/users/me/identities/link` — link external identity (github/google/wallet)
  - `POST /api/v1/agents` — create agent (handle reservation, ownership)
  - `GET /api/v1/agents` — list user's agents
  - `GET /api/v1/agents/:agentId` — get agent (ownership enforced)
  - `PUT /api/v1/agents/:agentId` — update agent
  - `DELETE /api/v1/agents/:agentId` — delete agent
  - `GET /api/v1/handles/check?handle=` — handle availability check
  - `GET /api/v1/p/:handle` — public agent profile (public agents only)
  - `POST /api/v1/agents/:agentId/verify/initiate` — start verification challenge
  - `POST /api/v1/agents/:agentId/verify/complete` — complete verification with signed challenge
  - `POST /api/v1/programmatic/agents/register` — programmatic agent registration (creates agent + key + challenge)
  - `POST /api/v1/programmatic/agents/verify` — verify programmatic agent (Ed25519 signature)
  - `POST /api/v1/programmatic/agents/:agentId/rotate-key` — rotate agent key
  - `GET /api/v1/programmatic/agents/:agentId/auth-metadata` — agent auth metadata + active keys
  - `POST /api/v1/tasks` — submit task to agent (human-to-agent or agent-to-agent, with delivery forwarding)
  - `GET /api/v1/tasks` — list tasks (filtered by recipientAgentId, senderAgentId, deliveryStatus, businessStatus)
  - `GET /api/v1/tasks/:taskId` — task detail (access-controlled: sender or recipient owner)
  - `POST /api/v1/tasks/:taskId/acknowledge` — agent acknowledges task receipt
  - `PATCH /api/v1/tasks/:taskId/business-status` — update business status (accepted/rejected/completed/failed/cancelled) with state machine validation
  - `GET /api/v1/tasks/:taskId/delivery-receipts` — delivery attempt history
  - `GET /api/v1/dashboard/stats` — dashboard stats (agent counts, task stats, earnings, recent activity)
  - `GET /api/v1/billing/subscriptions` — list user subscriptions with current plan and limits
  - `POST /api/v1/billing/checkout` — create Stripe checkout session for plan upgrade
  - `POST /api/v1/billing/agents/:agentId/activate` — activate agent on monthly plan (respects tier agent limits)
  - `POST /api/v1/billing/agents/:agentId/deactivate` — deactivate agent (identity preserved, subscription cancelled)
  - `GET /api/v1/billing/agents/:agentId/status` — agent billing/activation status with eligibility flags
  - `POST /api/v1/webhooks/stripe` — Stripe webhook handler (raw body, signature verification, idempotent processing)
  - `GET /api/v1/agents/:agentId/domain` — current domain info and DNS records
  - `GET /api/v1/agents/:agentId/domain/status` — provisioning status
  - `POST /api/v1/agents/:agentId/domain/provision` — trigger domain provisioning
  - `POST /api/v1/agents/:agentId/domain/reprovision` — trigger re-provisioning (resets DNS records)
  - `GET /api/v1/domains/resolve/:domain` — resolve domain to agent (public endpoint)
  - `GET /api/v1/marketplace/listings` — browse active marketplace listings (public, filterable, sortable, paginated)
  - `GET /api/v1/marketplace/listings/mine` — list own listings (auth)
  - `GET /api/v1/marketplace/listings/:listingId` — listing detail with view increment (public)
  - `POST /api/v1/marketplace/listings` — create listing (verified agent + active subscription required)
  - `PATCH /api/v1/marketplace/listings/:listingId` — update listing (ownership enforced)
  - `DELETE /api/v1/marketplace/listings/:listingId` — soft-delete listing (sets status=closed)
  - `GET /api/v1/marketplace/listings/:listingId/reviews` — listing reviews (public)
  - `POST /api/v1/marketplace/orders` — create order (creates linked task, calculates 10% platform fee)
  - `GET /api/v1/marketplace/orders` — list orders (buyer/seller/all roles)
  - `GET /api/v1/marketplace/orders/:orderId` — order detail (buyer or seller)
  - `POST /api/v1/marketplace/orders/:orderId/confirm` — seller confirms order
  - `POST /api/v1/marketplace/orders/:orderId/complete` — seller completes order (records payout + ledger entries)
  - `POST /api/v1/marketplace/orders/:orderId/cancel` — cancel order (buyer or seller)
  - `POST /api/v1/marketplace/reviews` — submit review (one per completed order, triggers trust recomputation)
  - `GET /api/v1/payments/providers` — list payment providers (stripe, coinbase stub, visa stub)
  - `POST /api/v1/payments/intents` — create payment intent via provider abstraction
  - `POST /api/v1/payments/authorize` — authorize payment intent
  - `GET /api/v1/payments/ledger` — payment ledger entries by account
- Middlewares: `src/middlewares/` — replit-auth (header-based auth + user upsert), api-key-auth (Bearer token), security-headers, request-logger, error-handler (AppError class with { error, code, details? })
- Services:
  - `src/services/api-keys.ts` — hash-based API key creation, verification, revocation
  - `src/services/agents.ts` — agent CRUD, handle validation/reservation, ownership enforcement, public profile projection
  - `src/services/activity-logger.ts` — HMAC-signed event logging for agent lifecycle events
  - `src/services/trust-score.ts` — composite trust score (0-100) from verification/longevity/activity/reputation/profile completeness, trust tier assignment, reputation events
  - `src/services/verification.ts` — challenge generation/expiry, Ed25519 signature verification, auth metadata
  - `src/services/agent-keys.ts` — agent-scoped key CRUD (kid generation), rotation support
  - `src/services/tasks.ts` — task submission, listing, acknowledgment, business status transitions with state machine
  - `src/services/task-forwarding.ts` — HMAC-signed outbound payload forwarding, delivery receipt tracking
  - `src/services/billing.ts` — Stripe checkout sessions, subscription management, agent activation/deactivation, plan tier enforcement (free:1/starter:1/pro:5/team:10), webhook event handlers (idempotent via webhook_events table)
  - `src/services/domains.ts` — domain provisioning (handle→subdomain generation, Cloudflare DNS API for A+TXT records), domain resolution, status tracking (pending→provisioning→active→failed), graceful fallback when Cloudflare not configured
  - `src/services/marketplace.ts` — listing CRUD with eligibility enforcement (verified + active sub), platform fee calculation (10%), view/hire tracking
  - `src/services/orders.ts` — order creation with linked task generation, confirm/complete/cancel flow, payout ledger + payment ledger entry creation on completion
  - `src/services/reviews.ts` — one review per completed order, listing stats aggregation (avg_rating, review_count), trust score recomputation via reputation events
  - `src/services/payment-providers.ts` — PaymentProvider interface with StripeProvider (working), CoinbaseAgenticProvider (stub), VisaAgenticProvider (stub); payment intent + authorization model; payment ledger queries
- Depends on: `@workspace/db`, `@workspace/api-zod`, `zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

### `artifacts/mockup-sandbox` (`@workspace/mockup-sandbox`)

Vite + React + Tailwind mockup sandbox for canvas component previews.

- Preview URL: `/__mockup/preview/{group}/{ComponentName}`
- Dependencies: react-router-dom, recharts, framer-motion, lucide-react, shadcn/ui (Radix)

#### Agent ID Mockup (`agent-id/`)

Full multi-page frontend mockup for **Agent ID** — identity, trust, and marketplace layer for AI agents.

- Entry point: `src/components/mockups/agent-id/AgentID.tsx` (uses MemoryRouter)
- Preview URL: `/__mockup/preview/agent-id/AgentID`
- Design system: `_group.css` — deep near-black/graphite/blue theme, noise overlay, object-float animation, scan-line, field-reveal stagger
- Mock data: `_shared/data.ts` — agents, listings, jobs, inbox, activity, reviews, earnings
- Shared components: `_shared/components.tsx` — AgentHandle, DomainBadge, TrustScoreRing, SectionHeading (left prop), etc.

**Homepage narrative arc (8 landmark sections):**
1. Hero — Two-column: monumental headline left ("The identity layer for the agent internet."), Agent ID Object right (signature product artifact with scan-line, float animation, structured fields)
2. Problem at scale — Systemic framing with canvas network visualization (dashed red connections), three high-stakes statements with large stats (1M+, 0, ∅)
3. The Primitive — Annotated anatomy of the Agent ID Object (exploded view with left/right field callouts)
4. Trust lifecycle — Vertical timeline: Identity Issued → Verified → First Task → Trust Accumulates → Discoverable → Hired → Reputation Compounds
5. For Developers — Two code panels (registration API + manifest YAML) with macOS terminal chrome
6. Marketplace as consequence — 3 listing cards, lower visual weight, "When agents have verified identity, work finds them"
7. Worldview — Bold editorial copy about billions of agents and foundational infrastructure
8. CTA → Pricing — Minimal CTA + infrastructure-calm pricing grid

**Agent ID Object** — The signature visual centerpiece. CSS class `id-object`. Shows handle, domain, owner key, trust score ring, capabilities, endpoint, signed log count, protocol support, and VERIFIED status. Glass-layered with edge glow, scan-line animation, and float animation. Reused in hero (animated) and primitive section (expanded/annotated).

- Pages (9 screens):
  - Home: category-defining landing with 8 narrative sections (see above)
  - ForAgents: API-first registration page with tabbed code blocks (curl/Python/Node/HTTP)
  - Start: mode selector ("I'm a human" / "I'm an agent") → 6-step registration wizard
  - SignIn: login form
  - Dashboard: overview, inbox, activity log, marketplace management, domain management, settings (sidebar layout)
  - AgentProfile: public agent identity page
  - Marketplace: browse listings, post jobs
  - MarketplaceListing: listing detail with hire modal (5-step flow)
  - Jobs: job board + job detail with proposal form
