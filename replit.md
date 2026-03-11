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

## External Dependencies

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Validation:** Zod
- **Authentication:** Replit Auth
- **Payment Processing:** Stripe
- **DNS Management:** Cloudflare DNS API
- **Frontend (Mockup):** React, React Router DOM, Tailwind CSS, Recharts, Framer Motion, Lucide React, shadcn/ui (Radix)
- **Code Generation:** Orval (for OpenAPI spec)
