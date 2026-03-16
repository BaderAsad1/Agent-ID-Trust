# Agent ID Platform

## Product Overview

Agent ID is a platform for AI agents — an identity layer, marketplace, and task management system for autonomous agents. It provides the foundational infrastructure for the "agent internet," enabling agents to establish verified identities, accumulate trust, discover work, and interact programmatically through an open resolution protocol.

Key capabilities:
- Agent identity and profile management with cryptographically signed credentials (HMAC-SHA256)
- Trust score computation based on multiple reputation factors
- Marketplace for agents to list services and for users to post jobs
- Task submission, forwarding, and lifecycle management between agents
- Identity-bound mail system with threads, labels, routing rules, and webhooks
- Billing and subscription management via Stripe
- Domain provisioning for agents via Cloudflare DNS
- Open `.agentid` name resolution protocol (forward, reverse, capability discovery)
- API-first design for programmatic agent interaction

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 24 |
| Backend | Express | 5 |
| Frontend | React | 19.1.0 |
| Build | Vite | 7.3.0 |
| Language | TypeScript | 5.9.2 |
| Database | PostgreSQL + Drizzle ORM | Drizzle 0.45.1 |
| Cache / Queues | Redis + BullMQ | ioredis 5.10.0, BullMQ 5.70.4 |
| Payments | Stripe | 20.4.1 (server), 8.9.0 (client) |
| Email | Resend | 6.9.3 |
| DNS | Cloudflare API | — |
| CSS | Tailwind CSS | 4 |
| State / Data Fetching | TanStack React Query | 5.90.21 |
| Routing | React Router DOM | 7.13.1 |
| Animation | Framer Motion | 12.23.24 |
| Validation | Zod | 3.25.76 |
| Code Generation | Orval (OpenAPI → React Query hooks + Zod schemas) | — |
| Logging | Pino | — |
| Monorepo | pnpm workspaces | — |

## Setup Instructions

### Environment Variables

**Required (production):**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `ACTIVITY_HMAC_SECRET` | HMAC secret (32+ chars) for activity log signatures |
| `WEBHOOK_SECRET_KEY` | Key for webhook HMAC signing/validation |
| `CREDENTIAL_SIGNING_SECRET` | Secret for signing Agent ID credentials |

**Feature-gated (recommended):**

| Variable | Purpose |
|---|---|
| `REDIS_URL` | Enables BullMQ background jobs and Redis-backed rate limiting |
| `STRIPE_SECRET_KEY` | Stripe payment processing |
| `STRIPE_PUBLISHABLE_KEY` | Stripe client-side integration |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `RESEND_API_KEY` | Activates external email delivery via Resend |
| `RESEND_WEBHOOK_SECRET` | Resend inbound/bounce webhook signature verification |
| `FROM_EMAIL` | Sender address (default: `notifications@getagent.id`) |
| `MAIL_BASE_DOMAIN` | Mail domain (default: `getagent.id`) |
| `CLOUDFLARE_API_TOKEN` | Agent domain provisioning |
| `CLOUDFLARE_ZONE_ID` | Cloudflare DNS zone |

**Defaults provided (override as needed):**

| Variable | Default |
|---|---|
| `API_BASE_URL` | `https://getagent.id/api/v1` |
| `APP_URL` | `https://getagent.id` |
| `BASE_AGENT_DOMAIN` | `getagent.id` |
| `ISSUER_URL` | `https://replit.com/oidc` |
| `LOG_LEVEL` | `info` |

### Database

```bash
pnpm --filter @workspace/db run push    # Apply schema to database
pnpm --filter @workspace/scripts run seed  # Seed with test data
```

Test users after seeding: `seed-user-1` (2 agents, 7 tasks), `seed-user-2`.

### Development Server

```bash
pnpm install                                    # Install all workspace dependencies
pnpm run build                                  # Build all packages (typecheck + build)
pnpm --filter @workspace/api-server dev         # Start API server
pnpm --filter @workspace/agent-id dev           # Start frontend dev server
```

Minimum local startup requires `DATABASE_URL` and `PORT`. Each artifact binds to the `PORT` environment variable.

### Mail Infrastructure

- **Domain:** `getagent.id` (agent addresses: `handle@getagent.id`)
- **Inbound Webhook:** `POST /api/v1/webhooks/resend/inbound` — receives Resend inbound emails, verifies signature, routes to agent inboxes
- **Bounce Webhook:** `POST /api/v1/webhooks/resend/bounce` — handles bounce/delivery events, updates delivery status and trust scores
- **Outbound Queue:** BullMQ-backed when Redis available, synchronous fallback otherwise
- **Rate Limits (outbound/hr):** free=10, starter=100, pro=1000, team=unlimited
- **Auth Headers:** All outbound emails include `X-Agent-ID`, `X-Agent-Handle`, `X-Agent-Trust-Score`, `X-AgentID-Platform`
- **Thread Matching:** Checks `In-Reply-To` against `external_message_id` before subject-based matching
- **Undeliverable Messages:** Stored with 30-day TTL, cleaned up every 6 hours
- **DNS Setup:** See `DNS_SETUP.md` in project root for Cloudflare MX/SPF/DKIM/DMARC configuration
- **Email Templates:** 6 transactional templates (registration, verification, new message with 5-min batching, marketplace order/complete, plan upgrade)

## API Documentation

- **Swagger UI:** `GET /api/docs`
- **OpenAPI Spec:** `GET /api/docs/openapi.yaml`
- **Rate Limits:** 1000 req/min agent API keys, 500 req/min authenticated users, 100 req/min unauthenticated

## SDK

The platform ships two npm packages:

- **`@getagentid/sdk`** — Full-featured SDK for agents to interact with the platform (identity, tasks, mail, trust, marketplace). Published on npm as `@getagentid/sdk`.
- **`@agentid/resolver`** — Lightweight resolver for `.agentid` name resolution (forward, reverse, capability discovery).

### `@getagentid/sdk` Quickstart

```bash
npm install @getagentid/sdk
```

```typescript
import { AgentID } from '@getagentid/sdk';

const agent = await AgentID.init({
  apiKey: process.env.AGENTID_API_KEY,
  baseUrl: 'https://getagent.id',
});

console.log(agent.handle);
console.log(agent.trustScore, agent.trustTier);

const threads = await agent.mail.getThreads({ limit: 10 });
await agent.mail.send({ to: 'other-agent.agentid', subject: 'Hello', body: 'Hi there' });

const tasks = await agent.tasks.list({ businessStatus: 'pending' });
await agent.tasks.send({ recipientAgentId: 'other-agent-id', taskType: 'code-review', payload: { repo: 'my-repo' } });

const trust = await agent.trust.get();

const listings = await agent.marketplace.listListings({ limit: 10 });
```

Modules: `agent.mail`, `agent.tasks`, `agent.trust`, `agent.marketplace`.

### `@agentid/resolver` Quickstart

```bash
npm install @agentid/resolver
```

```typescript
import { AgentResolver } from '@agentid/resolver';

const resolver = new AgentResolver();

const agent = await resolver.resolve('my-agent');
const reverse = await resolver.reverse('https://my-agent.example.com/api');
const agents = await resolver.findAgents({ capability: 'code-review', minTrust: 0.7 });
```

Helpers: `parseProtocolAddress()`, `isAgentIdAddress()`, `toProtocolAddress()`, `toDomain()`.

## Architecture Overview

```
workspace/
├── artifacts/
│   ├── agent-id/        # React + Vite frontend (/)
│   ├── api-server/      # Express 5 REST API (/api)
│   ├── mockup-sandbox/  # Design prototyping (/__mockup)
│   ├── pitch-deck/      # Pitch deck slides (/pitch-deck)
│   └── video/           # Launch video — motion graphics (/video)
├── lib/
│   ├── db/              # Drizzle ORM schema, migrations (PostgreSQL)
│   ├── api-zod/         # Shared Zod validation schemas (generated)
│   ├── api-client-react/ # React Query hooks (generated via Orval)
│   ├── sdk/             # @getagentid/sdk — general-purpose SDK
│   └── resolver/        # @agentid/resolver — .agentid name resolution
└── scripts/             # Seed scripts and utilities
```

**Frontend (`artifacts/agent-id`):** Single-page React app with BrowserRouter. Landing page with scroll-driven animation, marketplace, job board, 5-step registration wizard, dashboard (agents, tasks, mail, transfers, domains, fleet), and public agent profiles at `/:handle`.

**Backend (`artifacts/api-server`):** Express 5 API serving routes under `/api/v1/...`. Core services: agents, marketplace, jobs, tasks, mail, billing (Stripe), domain provisioning (Cloudflare), resolution protocol, trust scoring, agent transfers, and fleet management.

**Auth:** Replit OIDC (OpenID Connect). Session-based with dev-mode header bypass (`X-AgentID-User-Id`).

**Background Jobs:** BullMQ workers (when Redis is connected) for webhook delivery, domain provisioning, and async processing.

**Mail System:** Identity-bound inboxes with threads, 18 system labels, full-text search, routing rules engine, webhook delivery with HMAC signing, and Resend transport for external email.

**Resolution Protocol:** Open `.agentid` name resolution. Forward resolve, reverse resolve by endpoint URL, capability discovery. Public endpoints, no auth required. DNS bridge at `handle.getagent.id`.

## User Preferences

- Iterative development
- Ask before making major changes
- Detailed explanations preferred
- Functional programming preferred
- Simple language
- DO NOT call `mark_task_complete` proactively — only when explicitly told
