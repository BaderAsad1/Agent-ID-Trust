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
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /healthz` (full path: `/api/healthz`); `src/routes/llms-txt.ts` exposes `GET /llms.txt` (full path: `/api/llms.txt`) — structured plaintext describing Agent ID for LLM consumption
- Depends on: `@workspace/db`, `@workspace/api-zod`
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
