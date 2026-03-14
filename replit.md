# Workspace

## Overview

This project is a pnpm workspace monorepo utilizing TypeScript to build a robust platform for AI agents. It provides an identity layer, marketplace, and task management system for autonomous agents, aiming to be a foundational infrastructure for the "agent internet." The platform enables agents to establish verified identities, accumulate trust, discover work, and interact programmatically.

Key capabilities include:
- Agent identity and profile management.
- Trust score computation based on various factors.
- A marketplace for agents to list services and for users to post jobs.
- Task submission, forwarding, and status management between agents.
- Billing and subscription management for agents.
- Domain provisioning for agents.
- API-first approach for programmatic agent interaction.

## User Preferences

- I want iterative development.
- Ask before making major changes.
- I prefer detailed explanations.
- I like functional programming.
- I prefer simple language.
- DO NOT call `mark_task_complete` proactively — only when explicitly told.

## System Architecture

The project is structured as a pnpm monorepo with distinct packages for deployable applications (`artifacts/`) and shared libraries (`lib/`). TypeScript is used throughout, with composite projects configured for efficient type-checking and dependency resolution.

**Core Technologies:**
- **Monorepo:** pnpm workspaces
- **Backend:** Express 5 (Node.js 24)
- **Database:** PostgreSQL with Drizzle ORM
- **Frontend:** React 19 + Vite + Tailwind CSS + React Router DOM
- **Validation:** Zod
- **API Definition & Codegen:** OpenAPI 3.1, Orval (generates React Query hooks and Zod schemas)
- **Build System:** esbuild

## Artifacts

### `artifacts/agent-id` — Main Frontend App (React + Vite)
The primary web application at `/`. Contains:
- **Landing Page** (`/`) — Issuance Film scroll-driven animation (Apple-launch aesthetic)
- **Marketplace** (`/marketplace`) — Browse/search agent listings with category filters
- **Jobs** (`/jobs`) — Job board for hiring agents
- **Registration** (`/start`) — Dual registration (human wizard / agent API)
- **Sign In** (`/sign-in`) — Authentication
- **For Agents** (`/for-agents`) — API registration guide with code samples
- **Dashboard** (`/dashboard`) — Protected area with overview, agents, task inbox, mail, activity, marketplace management, domains, settings
- **Agent Profile** (`/:handle`) — Public agent profile page
- **Protocol Spec** (`/protocol`) — Open resolution protocol documentation (forward/reverse resolution, capability discovery, JSON schema, error codes)
- **Integration Docs** (`/docs/integrations`) — Framework integration guides (LangChain, CrewAI, AutoGPT, raw fetch, Python)

**Key Files:**
- `src/App.tsx` — BrowserRouter with route definitions
- `src/lib/api.ts` — Typed API client (fetches from `/api/v1/...`)
- `src/lib/AuthContext.tsx` — Auth state with localStorage persistence
- `src/components/IssuanceFilm.tsx` — Landing page (50KB, self-contained scroll animation)
- `src/components/Nav.tsx` — Frosted glass navigation bar
- `src/components/Footer.tsx` — Minimal footer
- `src/components/Sidebar.tsx` — Dashboard sidebar
- `src/styles/theme.css` — CSS variables (design system)
- `src/index.css` — Tailwind + dark theme HSL values

**Design System:**
- Background: `#050711` (deep navy-black)
- Accent: `#4f7df3` (blue)
- Success: `#34d399` (green)
- Display font: Bricolage Grotesque
- Body font: Inter
- Mono font: JetBrains Mono

### `artifacts/api-server` — Backend API
Express REST API on its own port. Routes under `/api/v1/...`.

### `artifacts/mockup-sandbox` — Design Prototyping (Canvas)
Still contains the original mockup versions used during design iteration. The agent-id mockup is the source that was graduated to `artifacts/agent-id`.

### `artifacts/pitch-deck` — Pitch Deck Slides

## Frontend-Backend Integration

**Auth Flow:**
- Auth state stored in `localStorage` key `agentid_user_id` + `window.__agentid_uid` global
- `getCurrentUserId()` reads from window global first, then localStorage
- Sends both `X-Replit-User-Id` and `X-AgentID-User-Id` headers on every API request
- Backend auth middleware prefers `X-AgentID-User-Id` over `X-Replit-User-Id`
- Auto-login supported via `?auto_login=<userId>` query parameter for development/testing
- Uses `BrowserRouter` with `basename={import.meta.env.BASE_URL}`

**API Client:** `artifacts/agent-id/src/lib/api.ts`
- Typed fetch wrapper with `ApiError` class, retry logic (2 retries for GET 5xx errors)
- All endpoints: auth, agents, dashboard, marketplace, jobs, tasks, activity, payments, profiles, handles, mail

**Test Users:** "seed-user-1" (2 agents: code-reviewer, research-agent; 7 tasks), "seed-user-2"
**DB Operations:** `pnpm --filter @workspace/db run push` (schema push), `pnpm --filter @workspace/scripts run seed` (seed data)

## Key Features Implemented in `api-server`

- User and API key management.
- Agent CRUD operations, handle reservation, and ownership enforcement.
- Verification challenges and Ed25519 signature verification for programmatic agents.
- Task submission, acknowledgement, and business status updates.
- Stripe-based billing for subscriptions, agent activation/deactivation, and plan tier enforcement.
- Marketplace for listings, orders, and reviews with platform fees.
- Job board for posting jobs and managing proposals.
- Payment intent and authorization abstraction with multiple provider stubs.
- Agent activity log endpoint (`GET /api/v1/agents/:id/activity`)
- Dashboard stats endpoint (`GET /api/v1/dashboard/stats`)
- **Agent Mail System** — identity-bound inboxes, threads, messages, labels, routing, webhooks, and message-to-task conversion.
- **Resend Email Transport** — `ResendTransportProvider` in `mail-transport.ts` for external email delivery (activates when `RESEND_API_KEY` is set).
- **API Docs** — Swagger UI at `GET /api/docs`, raw OpenAPI spec at `GET /api/docs/openapi.yaml`.
- **Rate Limiting** — `express-rate-limit` middleware: 500 req/min authenticated, 100 req/min unauthenticated, skips Stripe webhooks.
- **Resolution Protocol** — Open `.agent` name resolution: `GET /api/v1/resolve/:handle` (forward), `POST /api/v1/resolve/reverse` (reverse by endpoint URL), `GET /api/v1/resolve?capability=X&minTrust=Y` (capability discovery). All public, no auth required.

## Agent Mail System

Complete communications layer for agents with identity-bound inboxes.

**Schema (10 new tables):** `agent_inboxes`, `agent_threads`, `agent_messages`, `message_labels`, `message_label_assignments`, `message_attachments`, `message_events`, `inbox_webhooks`, `inbound_transport_events`, `outbound_message_deliveries`

**Service:** `artifacts/api-server/src/services/mail.ts`
- Inbox auto-provisioning with address generation
- Thread-aware messaging with auto-grouping
- System labels (18) + custom labels
- Full-text search with trust/verification filters
- Routing rules engine with 9 condition types and 10 action types
- Webhook delivery with HMAC signing

**Frontend:** `artifacts/agent-id/src/pages/Mail.tsx`
- Full inbox UI: agent selector, thread list, message detail with trust/provenance badges
- Reply compose, search, label filter sidebar
- Integrated into Dashboard at `/dashboard/mail`

## External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Validation:** Zod
- **Authentication:** Replit Auth
- **Payment Processing:** Stripe
- **DNS Management:** Cloudflare DNS API
- **Protocol Namespace:** Self-sovereign .agent registry (like ENS for AI agents)
- **Frontend:** React 19, React Router DOM, Tailwind CSS, Recharts, Framer Motion, Lucide React
- **Code Generation:** Orval (for OpenAPI spec)

## Shared Libraries

### `lib/resolver` — `@agentid/resolver` SDK
Open-source npm package for resolving `.agent` names. Provides `AgentResolver` class with `resolve()`, `reverse()`, and `findAgents()` methods. Full TypeScript types, retry logic, configurable base URL/timeout.

## ENS-Inspired Name System & Domain Features

**Handle Pricing Tiers (ENS-style):**
- 3-char handles: $640/year (ultra-premium)
- 4-char handles: $160/year (premium)
- 5+ char handles: $5/year (standard)
- Pricing utility: `getHandlePrice(handle)` in `artifacts/agent-id/src/lib/pricing.ts`

**Agent Transfer & Sale (Enterprise-grade):**
- Multi-stage transfer lifecycle: `draft → listed → pending_acceptance → hold_pending → transfer_pending → in_handoff → completed | disputed | cancelled`
- DB tables: `agent_transfers`, `agent_transfer_assets`, `agent_transfer_events`, `agent_transfer_snapshots`, `agent_operator_history`
- Transfer types: `sale`, `private_transfer`, `internal_reassignment`
- Escrow-ready hold state model with `hold_provider`, `hold_status`, `hold_reference` (internal provider; real escrow integration marked with `// ESCROW_PROVIDER_GAP`)
- Trust recalibration: separate `trust-recalibration.ts` service (does NOT modify `trust-score.ts`), computes three surfaces: `historical_agent_reputation`, `current_operator_reputation`, `effective_live_trust`
- Transfer readiness report classifies assets into transferable / buyer_must_reconnect / excluded_by_default
- Routes: `artifacts/api-server/src/routes/v1/agent-transfers.ts` (replaces old `handle-transfer.ts`)
- Services: `agent-transfer.ts`, `transfer-readiness.ts`, `trust-recalibration.ts`, `operator-history.ts`
- Public identity document updated with `trust_surfaces`, `transfer`, `operator_history` objects (spec version 1.1.0)
- All lifecycle events logged to `agent_transfer_events` and `agent_activity_log`

**Fleet Management (Pro/Enterprise):**
- `GET /api/v1/fleet` — list root handles + sub-handles
- `POST /api/v1/fleet/sub-handles` — create sub-handle (e.g., research.acme)
- `DELETE /api/v1/fleet/sub-handles/:id` — delete sub-handle
- Route: `artifacts/api-server/src/routes/v1/fleet.ts`
- UI: `FleetManagement` component at `/dashboard/fleet`

**.agent Protocol Registry (self-sovereign, like ENS):**
- Service: `artifacts/api-server/src/services/agent-registry.ts`
- Route: `artifacts/api-server/src/routes/v1/agent-registry.ts`
- Canonical resolve: `GET /api/v1/resolve/:handle` — resolves .agent names to Agent ID Objects (no auth, in resolve.ts)
- Owner status: `GET /api/v1/agents/:id/registry/status` — protocol resolve URL + DNS bridge
- Two resolution paths: protocol layer (`getagent.id/api/v1/resolve/handle`) + DNS bridge (`handle.getagent.id`)
- UI: Registry status panel in DomainDashboard with resolve URL + DNS bridge display

**Handle Pricing Enforcement:**
- Server-side: `getHandlePriceCents()` in billing.ts calculates authoritative tier pricing
- Registration records `handlePricing.paymentStatus: "pending"` in agent metadata
- Activation blocked until payment: `activateAgent()` returns `HANDLE_PAYMENT_REQUIRED` if unpaid
- Checkout: `POST /api/v1/billing/handle-checkout` creates Stripe checkout for handle payment
- Webhook: `handleCheckoutCompleted()` detects `type: "handle_registration"` and marks paid
- `markHandlePaymentComplete()` updates metadata paymentStatus to "paid"

**URL Migration:**
- All URLs migrated from `agentid.dev` → `getagent.id`
- Default base domain: `getagent.id`
- Email from: `notifications@getagent.id`
- llms.txt updated with new API endpoints and features
