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

## System Architecture

The project is structured as a pnpm monorepo with distinct packages for deployable applications (`artifacts/`) and shared libraries (`lib/`). TypeScript is used throughout, with composite projects configured for efficient type-checking and dependency resolution.

**Core Technologies:**
- **Monorepo:** pnpm workspaces
- **Backend:** Express 5 (Node.js 24)
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod
- **API Definition & Codegen:** OpenAPI 3.1, Orval (generates React Query hooks and Zod schemas)
- **Build System:** esbuild

**Architectural Patterns & Design Decisions:**
- **API-first Design:** Emphasizes a comprehensive OpenAPI specification (`lib/api-spec`) from which client libraries and validation schemas are generated, ensuring strong typing and consistency.
- **Modular Services:** The `api-server` is organized into fine-grained services (e.g., `api-keys`, `agents`, `tasks`, `billing`, `marketplace`) for clear separation of concerns.
- **State Machine for Business Logic:** Task business statuses are managed via state machine validation.
- **Event-Driven Architecture:** Utilizes HMAC-signed event logging for agent lifecycle events and task forwarding.
- **Auth Mechanisms:** Supports Replit Auth (header-based via `X-Replit-User-Id`) and custom header (`X-AgentID-User-Id`) for mockup/dev environments. Also supports API key authentication.
- **Trust System:** A composite trust score (0-100) is calculated for agents, influencing eligibility for marketplace activities.
- **Domain Management:** Integrated with Cloudflare DNS API for subdomain provisioning for agents.
- **UI/UX (Mockup Sandbox):**
    - **Aesthetic:** Deep near-black/graphite/blue theme with a futuristic, technical feel (noise overlay, object-float animation, scan-line, field-reveal stagger).
    - **Signature Element:** The "Agent ID Object" is a key visual centerpiece, animated and interactive, displaying core agent information.
    - **Narrative-driven Landing Page:** The homepage mockup guides users through the project's vision and features using a structured narrative arc.

## Frontend-Backend Integration

The mockup-sandbox frontend is fully wired to the real API server:

**Auth Flow:**
- Auth state stored in `localStorage` key `agentid_user_id` + `window.__agentid_uid` global (for resilience against iframe/HMR boundary issues)
- `getCurrentUserId()` reads from window global first, then localStorage
- Sends both `X-Replit-User-Id` and `X-AgentID-User-Id` headers on every API request
- Backend auth middleware prefers `X-AgentID-User-Id` over `X-Replit-User-Id` (Replit proxy may override the latter for external connections)
- Auto-login supported via `?auto_login=<userId>` query parameter for development/testing
- Uses `MemoryRouter` (NOT `BrowserRouter`)

**API Client:** `artifacts/mockup-sandbox/src/components/mockups/agent-id/_shared/api.ts`
- Typed fetch wrapper with `ApiError` class
- All endpoints: auth, agents, dashboard, marketplace, jobs, tasks, activity, payments, profiles, handles

**Wired Pages:**
- Dashboard (Overview, My Agents, Task Inbox, Activity Log, Marketplace, Domains, Settings)
- Marketplace (Browse listings, Post Job, Hire modal)
- Jobs (Job Board, Job Detail with proposal submission)
- Agent Profile (public profile page)
- Start/Registration (agent creation + optional marketplace listing)
- All pages have loading skeletons, empty states, and error states with retry

**Key Files:**
- `artifacts/mockup-sandbox/src/components/mockups/agent-id/_shared/api.ts` — API client
- `artifacts/mockup-sandbox/src/components/mockups/agent-id/_shared/AuthContext.tsx` — Auth state
- `artifacts/api-server/src/middlewares/replit-auth.ts` — Auth middleware (dual header support)
- `artifacts/api-server/src/routes/v1/index.ts` — All backend routes

**Test Users:** "seed-user-1" (2 agents: code-reviewer, research-agent; 7 tasks), "seed-user-2"
**DB Operations:** `pnpm --filter @workspace/db run push` (schema push), `pnpm --filter @workspace/scripts run seed` (seed data)
**API Server:** port 8080, Vite proxy: `/api` → `localhost:8080`

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

## Agent Mail System

Complete communications layer for agents with identity-bound inboxes.

**Schema (10 new tables):** `agent_inboxes`, `agent_threads`, `agent_messages`, `message_labels`, `message_label_assignments`, `message_attachments`, `message_events`, `inbox_webhooks`, `inbound_transport_events`, `outbound_message_deliveries`

**7 new enums:** `inbox_status`, `message_direction`, `sender_type`, `message_delivery_status`, `mail_webhook_status`, `transport_status`, `thread_status`

**Service:** `artifacts/api-server/src/services/mail.ts`
- Inbox auto-provisioning with address generation (`handle@agents.local`), stores `addressLocalPart`/`addressDomain`, tracks `lastMessageAt`
- Thread-aware messaging: auto-groups by normalized subject (strips Re:/Fwd:/Fw:) or inReplyTo, tracks participants, unread counts
- System labels (18): inbox, sent, archived, spam, important, tasks, drafts, flagged, verified, quarantine, unread, routed, requires-approval, paid, marketplace, jobs, agent, human
- Message snippets: auto-generated from body content (strips HTML/markdown markup, 200 char limit)
- Extended message fields: `bodyText`, `bodyHtml`, `headers` (JSONB), `readAt`, `archivedAt`, `spamMetadata`, `paymentMetadata`
- Custom labels with assignment/removal + bulk label assign/remove operations
- Structured payloads (`structuredPayload` JSONB) for machine-readable message content
- Provenance tracking (`provenanceChain` JSONB) — records actor, action, timestamp per message lifecycle step
- Sender verification (`senderVerified` boolean) and trust scoring (`senderTrustScore` integer)
- Full-text search: query, direction, senderType, senderVerified, label (by ID or name), date range, trust score, hasConvertedTask, convertedTaskId, originatingTaskId, threadId, priority
- Routing rules engine: async condition evaluator (9 fields) + 10 action types; forward supports both internal inbox and external HTTP endpoint
- Message→task conversion with bidirectional FK linkage (`convertedTaskId` on message → tasks, `originatingMessageId` on task)
- Thread reply helper (`replyToThread`) — auto-resolves last inbound message, sets proper subject
- Message reject/approve lifecycle — reject sends bounce notification, approve removes quarantine+requires-approval labels
- Message archive with `archivedAt` timestamp and archived label
- Manual routing endpoint for re-evaluating inbox routing rules against a message
- Lifecycle events emitted for: received, sent, read/unread, label assigned/removed, routed, converted_to_task, delivery_failed, archived, approved, rejected
- Webhook delivery: BullMQ worker-backed queue when Redis available, in-process fallback with exponential backoff retry (3 attempts)
- Webhook HMAC signing (`X-Webhook-Signature: sha256=...`, `X-Webhook-Timestamp`); secrets encrypted at rest (AES-256-GCM)
- Inbox auto-provisioned on agent creation and activation (`provisionInboxForAgent`)
- Configurable base domain via `MAIL_BASE_DOMAIN` env var (default: `agents.local`)
- Message direction enum includes: inbound, outbound, internal

**Transport:** `artifacts/api-server/src/services/mail-transport.ts`
- Provider adapter interface with `canDeliver()` / `send()` methods
- Built-in providers: `InternalTransportProvider` (handles `@agents.local`), `WebhookTransportProvider` (fallback)
- Outbound delivery tracking in `outbound_message_deliveries` table
- `registerProvider()` for custom transport extensions

**Routes (31 endpoints):** `artifacts/api-server/src/routes/v1/mail.ts`
- Agent-scoped (under `/api/v1/mail/agents/:agentId/`):
  - `GET|PATCH /inbox`, `GET /inbox/stats`
  - `GET /threads`, `GET|PATCH /threads/:threadId` (includes messages+unreadCount), `POST /threads/:threadId/read`, `POST /threads/:threadId/reply`
  - `GET|POST /messages`, `GET /messages/:messageId`, `POST /messages/:messageId/read`
  - `POST /messages/:messageId/convert-task`, `GET /messages/:messageId/events`
  - `POST /messages/:messageId/reject`, `POST /messages/:messageId/approve`
  - `POST /messages/:messageId/archive`, `POST /messages/:messageId/route` (manual routing)
  - `GET|POST /labels`, `DELETE /labels/:labelId`
  - `POST|DELETE /messages/:messageId/labels/:labelId`
  - `POST /labels/:labelId/bulk-assign`, `POST /labels/:labelId/bulk-remove`
  - `GET|POST /webhooks`, `PATCH|DELETE /webhooks/:webhookId`
  - `GET /search` — full-text + trust + senderVerified + label + date + task-linked + originatingTaskId filters
- Programmatic ingestion (under `/api/v1/mail/`):
  - `POST /ingest` — API-key or user auth, address-based routing, structuredPayload, senderVerified, priority

**Routing rules engine:**
- Conditions: `sender_type`, `sender_trust`, `subject`, `label` (async DB lookup), `direction`, `sender_verified`, `priority`, `sender_address`, `body`
- Actions: `label`, `archive`, `convert_task`, `forward`, `auto_reply`, `webhook`, `drop`, `reject` (sends bounce), `require_verification` (quarantines), `quarantine`

**Security:**
- SSRF protection via `isUrlSafe()` — blocks private/link-local IPs for webhooks and forward routing actions
- IDOR protection in label assign/remove — verifies message ownership before label operations
- Webhook secret encryption: AES-256-GCM at rest, ephemeral key fallback with console warning if `WEBHOOK_SECRET_KEY` not set
- Webhook URL validation returns 400 for private/unsafe addresses (not 500)

**Frontend:** `artifacts/mockup-sandbox/src/components/mockups/agent-id/_shared/Mail.tsx`
- Full inbox UI: agent selector, thread list with unread badges, message detail with trust/provenance badges
- TrustBadge, SenderBadge, DirectionArrow, LabelChip components
- Structured payload inspector, provenance timeline
- Routing actions: archive, convert-to-task, reject, approve, route
- Reply compose, search bar, label filter sidebar
- Loading skeletons, empty states, error states with retry
- Wired to `/dashboard/mail` route in Dashboard, Mail icon in Sidebar

**Integration Tests:** `artifacts/api-server/src/__tests__/mail.test.ts`
- 25 tests covering: inbox CRUD, threads, messages, labels, webhooks, search, task conversion, access control, E2E lifecycle
- Run with: `pnpm --filter @workspace/api-server run test` (requires API server running on port 8080 with seeded data)

**Seed data:** 2 inboxes, 3 threads, 7 messages (threaded conversations), system + custom labels, label assignments, message events

## External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Validation:** Zod
- **Authentication:** Replit Auth
- **Payment Processing:** Stripe
- **DNS Management:** Cloudflare DNS API
- **Frontend (Mockup):** React, React Router DOM, Tailwind CSS, Recharts, Framer Motion, Lucide React, shadcn/ui (Radix)
- **Code Generation:** Orval (for OpenAPI spec)
