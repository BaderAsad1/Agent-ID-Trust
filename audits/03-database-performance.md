# Audit 03 — Database Schema, Indexes, and Query Performance

**Scope:** `lib/db/src/schema/`, `lib/db/drizzle/`, `artifacts/api-server/src/routes/v1/`, `artifacts/api-server/src/services/`, `scripts/post-merge.sh`
**Method:** Static review of every schema file, every v1 route handler, every service file, the migration journal, and the connection-pool initializer. No production EXPLAIN was available; reasoning is grounded in the schema indexes shipped today and the SQL Drizzle generates from each call site.
**Out of scope (per task brief):** application-level caching, backups/DR, fix implementation.

---

## 0. Top-10 Hottest Query Paths — Summary Table

| # | Path | Estimated cost today | Recommended fix |
|---|------|----------------------|-----------------|
| 1 | `GET /resolve/discover` (agent search) — `agents` full-scan with `q`, `capability`, `protocol`, sandbox-flag JSONB filter, then `Promise.all(map(enrich))` | Sequential scan + JSONB `@>` per row (no GIN on `capabilities`/`protocols`); enrichment fans out unbounded queries per result | Add `agents_capabilities_gin_idx` and `agents_protocols_gin_idx` (`USING GIN`), cap `enrichAndResolve` concurrency, hoist `(metadata->>'isSandbox')` to a generated column with a partial index |
| 2 | `GET /marketplace/listings` (search + sort) | Composite indexes exist for `(category, status, createdAt)` and `(category, status, avgRating)` but **not** for `totalHires` or `priceAmount` sort options; `ilike '%term%'` on `title` is unindexed | Add `marketplace_listings_cat_status_hires_idx` and `..._price_idx`; add pg_trgm GIN on `title` for substring search |
| 3 | `GET /mail/agents/:agentId/messages` thread/inbox listing | `agent_messages` has 11 single-column indexes but no composite for the dominant access pattern `(inbox_id, created_at DESC)` or `(thread_id, created_at DESC)` | Replace `agent_messages_thread_id_idx` and `..._inbox_id_idx` with composites that include `created_at DESC` |
| 4 | `GET /dashboard/stats` | 4 separate aggregations (`agentsTable.findMany`, `tasksTable count(*) filter`, `paymentLedger sum`, `agent_activity_log findMany limit 20`) — fan-out without `Promise.all` | Run the four queries in parallel; add `payment_ledger_account_direction_idx` if missing; consider materialized view for stats |
| 5 | `decoratePayoutInfo` on `GET /marketplace/orders` | `inArray(payout_ledger.related_order_id, [orderIds])` on a single-column index — fine — but pulls **all** payout rows per order then JS-side max-by-createdAt | Replace with `DISTINCT ON (related_order_id) ORDER BY related_order_id, created_at DESC` |
| 6 | `routeMessage` per inbound mail | Per-rule `messageLabelsTable.findFirst(name='routed')` inside a `for (rule of sorted)` loop, then again inside `executeAction` — N labels lookups per message | Pre-fetch the agent's labels once per message and pass into the loop |
| 7 | `mail-inbound.ts` recipient fan-out | `for (const recipient of enriched.to) { await db.query.agentInboxesTable.findFirst(...) }` — N round-trips per inbound email | Batch with `inArray(agent_inboxes.address, [...])` then index by address (the unique index already covers the lookup) |
| 8 | `agent-transfer.ts` asset/key inserts | `for (const asset of allAssets) await db.insert(...)` and `for (const key of activeKeys) await tx.update(...)` — sequential per row inside a transaction holding a pool slot | Batch insert (`db.insert(...).values(rows)`) and batch update with `inArray(id, [...])` |
| 9 | `GET /a2a/...` service-call listings | `a2a_service_calls` has no `(provider_agent_id, created_at DESC)` index; only `(caller_agent_id, service_id)` and `created_at` exist as separate indexes | Add `a2a_service_calls_provider_created_idx` for provider-side dashboards |
| 10 | `auth-nonces` consumption on every PoP-JWT request | 4-column index `(nonce, agent_id, consumed_at, expires_at)` is over-specified; the unique constraint on `nonce` would already select a single row; the composite index is dead weight on writes | Drop `idx_auth_nonces_nonce_agent_consumed_expires`; the unique `nonce` index on the table is sufficient |

The remainder of this report walks through the audit dimensions in turn, with file:line evidence.

---

## 1. Schema Review

### 1.1 Strengths
- Every table uses `uuid("id").defaultRandom().primaryKey()` — no integer id leakage.
- Money columns are correctly `numeric(p,s)` (`marketplace_orders.priceAmount`, `payout_ledger.amount`, `a2a_service_calls.amountUsdc`). No `float`/`real` for money.
- Foreign keys are declared with explicit `onDelete` semantics (`cascade` for owned data, `set null` for soft references like `a2a_service_calls.engagementId`).
- Most tables carry `createdAt` and `updatedAt`, both `timestamp({withTimezone: true})` with `defaultNow().notNull()`.
- Enums (`payout_status`, `order_status`, `inbox_status`, etc.) are pgEnums rather than free-text + check constraint — good for storage and validation.

### 1.2 Issues — Missing `updatedAt`
The following tables track mutation but only carry `createdAt`. This makes "last touched" queries impossible and complicates cache invalidation:

| Table | File |
|-------|------|
| `task_messages` | `lib/db/src/schema/task-messages.ts` |
| `a2a_service_calls` | `lib/db/src/schema/a2a-service-calls.ts` |
| `message_labels` | `lib/db/src/schema/agent-mail.ts:194` |
| `message_label_assignments` | `lib/db/src/schema/agent-mail.ts:214` |
| `message_attachments` | `lib/db/src/schema/agent-mail.ts:238` (rows mutate via `scanStatus`/`scanResult`/`scannedAt`!) |
| `message_events` | `lib/db/src/schema/agent-mail.ts:270` |
| `inbound_transport_events` | `lib/db/src/schema/agent-mail.ts:321` (status mutates!) |
| `outbound_message_deliveries` | `lib/db/src/schema/agent-mail.ts:344` (attempts/lastAttemptAt/deliveredAt mutate!) |
| `undeliverable_messages` | `lib/db/src/schema/agent-mail.ts:369` |
| `agent_lineage` | `lib/db/src/schema/agents.ts` |

`message_attachments`, `inbound_transport_events`, and `outbound_message_deliveries` are the worst offenders — they have mutable status columns and no `updatedAt`. Add `updatedAt timestamp default now() not null` with `$onUpdate(() => new Date())`.

### 1.3 Issues — JSONB used where columns belong
- `agents.metadata->>'isSandbox'` — used as a tenant-scoping filter on **every** discovery query (`resolve.ts:846-847`). This must be a real `boolean` column with an index. Reading it from JSONB is correct only if there is a generated column or expression index; neither exists today.
- `agents.chainRegistrations` (JSONB) — filtered with `IS NOT NULL AND ::text != '[]' AND ::text != '{}'` (`resolve.ts:561`). Inefficient and unindexable. Move to a normalized `agent_chain_registrations` table, similar to the recent `agent_ows_wallet_accounts` normalization (migration 0033).
- `payout_ledger.metadata->>'stripeTransferId'` is queried via `=` predicate (`webhooks.ts:158`). Promote `stripeTransferId` to a real `varchar(255)` column with a unique index — it is the natural key from Stripe and will be looked up on every `transfer.created` and `transfer.failed` webhook.
- `agent_messages.metadata`, `headers`, `structuredPayload`, `provenanceChain`, `spamMetadata`, `paymentMetadata` — six JSONB columns on a hot table. None are queried structurally so this is acceptable, but consider whether `paymentMetadata` warrants a foreign key to `payment_intents` instead.

### 1.4 Issues — NOT NULL discipline
- `audit_events.actor_id` is declared `notNull()` but the table is used with `actorType: 'system'` events that have no actor — investigate whether system events lie about their actor. (Cross-reference with the audit-events service.)
- `marketplace_orders.taskDescription` is nullable; `marketplace_listings.description` is nullable. Both are user-visible — an empty string vs `NULL` distinction is leaky. Consider `notNull().default('')`.
- `a2a_service_calls.engagementId` is `set null` on engagement delete but the column is the only link back to the engagement — losing it makes payout reconciliation impossible. Audit whether engagements are ever hard-deleted.

### 1.5 Issues — Default-value smells
- `agents.api_access` defaults `true`. Newly-spawned subagents inherit API access by default. If this is intentional it is fine; if not, it is a privilege-escalation vector for the spawn endpoint.
- `inbox_webhooks.events` defaults `'[]'` JSONB but is **not** notNull — `null` and `[]` are both possible, complicating consumers.

### 1.6 Issues — Migration hygiene
- `lib/db/drizzle/_journal.json` contains **two entries with the same idx-relative tag prefix `0008_subagent_lineage_system`** (idx 7 and 8). One of these is a duplicate that did nothing or replayed work. Verify and squash.
- Timestamps in `_journal.json` are not monotonic: idx 13 (`when: 1742169600000` ≈ 2025-03-17) is **older** than idx 12 (`when: 1774003200000` ≈ 2026-03-19). Several `_manual` files (0017, 0021, 0022, 0023, 0034) also have older `when` values than their predecessors. This means `drizzle-kit` cannot reliably re-derive ordering by timestamp; it relies on the `idx` integer instead, which is fine, but the timestamps suggest some migrations were authored against a fork and the wall clock is unreliable.
- `lib/db/drizzle/0028_marketplace_commerce_engine.sql` carries a `NOTE: Schema was applied to the database via 'drizzle-kit push --force'.` This means production schema state can have drifted from the file-based migration runner. The file was added retroactively as a record. Establish a hard rule: **no `push --force` against production**; always go through file-based migrations.
- The `post-merge.sh` script unconditionally re-runs `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS ...` for `target_type, target_id, ip_address, user_agent`. These columns **are** in the schema (`audit-events.ts:19-23`). The repeated "ensure" exists because at some point those columns were added in code without a migration, and the post-merge guard was the patch. Generate the missing migration (`0036_audit_events_columns.sql`) and remove the guard from `post-merge.sh`.
- Same for the `agent_ows_wallet_accounts` backfill in `post-merge.sh`: it re-runs an `INSERT ... ON CONFLICT DO NOTHING` from JSONB on every merge. After all data has migrated, this is wasted work on every deploy. Add a sentinel (e.g., a `meta_migrations` row) so the backfill runs once.
- `magic_link_tokens.token` → `magic_link_tokens.hashed_token` rename in `post-merge.sh:14` is also a schema-drift workaround. Migration 0023 (`0023_magic_link_hashed_token`) should already cover this; the guard exists because the file-based migration was added after some environments had already run the rename out-of-band.

### 1.7 Issues — Index audit (unused / redundant / missing)

**Likely unused / redundant**
- `agents`: 17 indexes total. Several look defensive:
  - `agents_handle_idx` (unique) **and** `agents_handle_lower_idx` — keep both (one for case-sensitive uniqueness, one for case-insensitive lookup), but **also** keep `agents_handle_status_is_public_idx`. Verify the case-sensitive `agents_handle_idx` is still queried; most code paths use `lower()`.
  - `agents_status_idx` is rarely used standalone — most queries combine status with `user_id` or `is_public`. Coverage probably comes from the composites (`agents_user_id_status_idx`, `agents_is_public_status_idx`). Drop after confirming with `pg_stat_user_indexes.idx_scan = 0`.
  - `agents_verification_status_idx` — same concern; combined queries exist.
  - `agents_is_reserved_idx` — low cardinality (boolean), rarely a useful prefix.
- `agent_messages`: `agent_messages_is_read_idx`, `agent_messages_is_encrypted_idx` are boolean single-column indexes — almost always worse than a partial index `WHERE is_read = false`.
- `auth_nonces`: `idx_auth_nonces_nonce_agent_consumed_expires` (4 columns, from migration 0024) duplicates work the `nonce` UNIQUE index already does. The unique index is the right key.
- `marketplace_listings_featured_idx` on a boolean — better as `WHERE featured = true` partial.

**Missing composite indexes (high impact)**
- `agent_messages (inbox_id, created_at DESC)` — replaces `agent_messages_inbox_id_idx` for inbox listing.
- `agent_messages (thread_id, created_at DESC)` — replaces `agent_messages_thread_id_idx` for thread reads.
- `agent_messages (agent_id, is_read) WHERE is_read = false` — partial index for unread badges.
- `marketplace_listings (category, status, total_hires DESC)` — for `sortBy=hires`.
- `marketplace_listings (category, status, price_amount)` — for `sortBy=price`.
- `marketplace_orders (buyer_user_id, created_at DESC)` and `(seller_user_id, created_at DESC)` — `listOrders` always orders by `createdAt DESC`.
- `payout_ledger (related_order_id, created_at DESC)` — `decoratePayoutInfo` needs latest-per-order.
- `a2a_service_calls (provider_agent_id, created_at DESC)` — provider dashboards.
- `audit_events (actor_type, actor_id, created_at DESC)` — admin audit-log endpoint orders by `createdAt DESC` after filtering by actor.
- `tasks (recipient_agent_id, business_status, created_at DESC)` — `GET /tasks` filters by recipient + status and orders by createdAt.

**Missing GIN indexes**
- `agents.capabilities` JSONB — queried with `@>` in discovery (`resolve.ts:871`).
- `agents.protocols` JSONB — same (`resolve.ts:876`).
- `job_posts.requiredCapabilities` JSONB — same pattern based on the `jobs.ts` filtering surface.
- pg_trgm GIN on `marketplace_listings.title` and `agent_messages.subject` for the `ilike '%term%'` substring searches (see §3.2).

**Missing expression indexes**
- `lower(agents.handle)` — partial expression index already exists; good.
- `lower(payout_ledger.metadata->>'stripeTransferId')` would be needed if you keep that JSONB pattern.

---

## 2. Hot Route Query Inventory (per `/api/v1` mount)

The full per-route catalog is large; here are the hottest paths with their current DB cost.

### `GET /agents` (`routes/v1/agents.ts:505`)
- Single query: `agentsTable.findMany({ where: agentOwnerFilter(userId), order: createdAt DESC })`.
- **No pagination**. Returns every agent the user owns. For power users with hundreds of subagents this returns the whole tree on every dashboard load.
- **Index used:** `agents_user_id_idx` and `agents_user_id_status_idx`. Adequate for the WHERE; no composite with `createdAt`. Add `(user_id, created_at DESC)` if these lists grow.

### `GET /marketplace/listings` (`routes/v1/marketplace.ts:188` → `services/marketplace.ts:listListings`)
- Filters: `category`, `status`, `agentId`, `featured`, `search`, `listingMode`. Sorts: `created` (default), `rating`, `hires`, `price`.
- **Indexes today:** `marketplace_listings_cat_status_created_idx`, `marketplace_listings_cat_status_rating_idx`. **Missing** for `hires` and `price`.
- `ilike(title, '%term%')` is unindexed and forces a sequential scan once filters are loose.
- `count(*)` runs in parallel (good) but on the same predicate — add an index that fully covers the WHERE so the count uses an index-only scan.

### `GET /marketplace/orders` (`routes/v1/marketplace.ts:366` → `services/orders.ts:643`)
- Two queries in `Promise.all`: page rows + total count.
- WHERE is `buyer_user_id = $1` OR `seller_user_id = $1` OR `(buyer = $1 OR seller = $1)`.
- `orderBy createdAt DESC`. **No tiebreaker** — duplicate `createdAt` (same millisecond) yields unstable pages.
- **Missing composite indexes** on `(buyer_user_id, created_at DESC)` and `(seller_user_id, created_at DESC)`. The `OR` variant cannot use either; consider `UNION ALL` if the `all` role is hot.
- After listing, `decoratePayoutInfo` (`marketplace.ts:81`) issues one more query against `payout_ledger` with `inArray(related_order_id, ids)` — fine, but JS-side max-by-createdAt reduces N rows to N. Push to SQL with `DISTINCT ON`.

### `GET /resolve/discover` (`routes/v1/resolve.ts:829`)
- WHERE: `status='active'`, `verificationStatus='verified'`, sandbox-flag JSONB filter, optional `trustScore >=`, optional full-text-search expression `search_vector @@ websearch_to_tsquery(...) OR handle % $q OR display_name % $q`, optional `capabilities @> $cap`, optional `protocols @> $proto`.
- ORDER BY: `trust_score DESC` (default), `created_at DESC`, or `updated_at DESC`. None have a composite that lines up with the WHERE selectivity.
- **Critical:** `enrichAndResolve` is `await Promise.all(agents.map(a => enrichAndResolve(a)))` (`resolve.ts:898`) — for `limit=100` this fans out 100 enrichments concurrently, each doing additional DB lookups (chain, attestations, etc.). Both an N+1 and a connection-pool burst.
- Add: GIN indexes on `capabilities`/`protocols`; cap concurrency with a small worker pool (e.g., `p-limit(8)`); promote `metadata->>'isSandbox'` to a real column.

### `GET /mail/agents/:agentId/messages` (`routes/v1/mail.ts:344`)
- WHERE: `agent_id = $1` plus optional `subject ilike '%q%'`, `body ilike '%q%'`, date range, `senderTrustScore >= $min`.
- ORDER BY `createdAt DESC`, LIMIT (no max enforced — `limit ? Number(limit) : undefined`).
- **No composite** `(agent_id, created_at DESC)`. Substring search on `subject`/`body` is unindexed; the `_manual/0009_capability_search_indexes.sql` migration installs trigram indexes on `agents` only — extend to `agent_messages.subject` and `body_text` (use `body_text`, not `body`, to avoid HTML noise).

### `GET /mail/agents/:agentId/threads` (`routes/v1/mail.ts:162`)
- Cursor-based on `lastMessageAt` — **good**, this is the only fully cursor-paginated list endpoint.
- Index is `agent_threads_last_message_at_idx` (single column). Cursor uses `<` on `lastMessageAt`. Fine, but add `inbox_id` to the index so multi-inbox agents don't scan others' threads: `(inbox_id, last_message_at DESC)`.

### `GET /tasks` (`routes/v1/tasks.ts:237`)
- Filters: `recipientAgentId`, `senderAgentId`, `deliveryStatus`, `businessStatus`. Order: `createdAt DESC`. Default 50, max 100.
- Most production-grade list endpoint in the file. Add a composite `(recipient_agent_id, created_at DESC)` and verify `business_status` cardinality justifies an index.

### `GET /admin/audit-log` (`routes/v1/admin.ts:380`)
- Default 50, max 500 — very generous. Most filters: `actorType`, `actorId`, `eventType`, `targetType`, `targetId`, date range. Order: `createdAt DESC`.
- Existing indexes: `audit_events_actor_idx (actor_type, actor_id)`, `audit_events_event_type_idx`, `audit_events_target_idx`, `audit_events_created_at_idx`. None compose `actor + created_at`.
- Add `(actor_type, actor_id, created_at DESC)` and consider partitioning `audit_events` by `created_at` once it grows past ~100M rows.

### `GET /payments/ledger` (`routes/v1/payments.ts:83`)
- 20/no-max LIMIT/OFFSET, order `createdAt DESC`. No tiebreaker.
- Indexes on `payment_ledger` not enumerated here — verify a composite exists for `(account_id, direction, created_at DESC)` (the dashboard stats query uses `account_id IN (...) AND direction = 'inbound'`).

### `GET /a2a/...` service-call listings (`routes/v1/a2a.ts`)
- Existing: `(caller_agent_id, service_id)` composite. Provider-side dashboards use `provider_agent_id` which has no index of its own — full scan.
- The `engagementId` index covers the most common `?engagementId=...` query; ok.

### `GET /wallet/:agentId/wallet/transactions` (`routes/v1/wallet.ts:114`)
- 20/100 LIMIT/OFFSET, `createdAt DESC`. Verify `agent_wallet_transactions` has a composite `(agent_id, created_at DESC)`.

### `GET /admin/audit-log` LIMIT 500 / `GET /payments/ledger` no-max
These are the biggest pagination blast radii. Enforce a uniform `MAX_PAGE_SIZE = 100` at the route layer.

---

## 3. Drizzle Usage & Query Construction

### 3.1 `select()` returning more columns than needed
Several routes use `db.select().from(...)` (no projection) when only a few columns are needed:

- `routes/v1/marketplace.ts:398, 819, 886` — `db.select().from(marketplaceOrderMessagesTable)` returns the full row including `body` (text). For listing endpoints, project explicit columns.
- `services/orders.ts:661` — `listOrders` uses `db.select().from(...)` returning all columns. Drizzle's `findMany` with `columns: { ... }` would let the page+count query be index-only.
- Dashboard stats (`routes/v1/dashboard.ts:21`) does correctly use `columns: { id, handle, displayName, trustScore, status }`. Use this pattern everywhere.

### 3.2 `ilike '%term%'` (unindexable substring search)
- `services/marketplace.ts:246` — `ilike(title, '%search%')`
- `services/jobs.ts:251` — `ilike(jobPostsTable.title, '%search%')`
- `services/a2a-services.ts:97` — `ilike(name, '%search%')`
- `services/mail.ts:993, 1891-1893` — multiple ilikes including on `body` (worst)
- `services/agents.ts:98, 142, 261` — `ilike(handle, $exact)` (no wildcards) — **this is fine**, it just hits the trigram GIN, but a `lower(handle)` expression index would be cheaper for case-insensitive equality.

For the wildcard variants: install `pg_trgm` GIN indexes (`USING GIN (title gin_trgm_ops)`), or move to `tsvector` columns like `agents.search_vector`. The `_manual/0009_capability_search_indexes.sql` migration sets the precedent.

### 3.3 Raw SQL — appropriate vs risky
- **Appropriate:** `pg_advisory_xact_lock(hashtext(handle))` in `programmatic.ts:336` and `agents.ts:268` — this is the right tool for handle-claim races.
- **Appropriate:** `count(*) filter (...)` aggregates in `dashboard.ts:46-49` and `mail.ts:141` — Drizzle has no equivalent.
- **Risky:** the JSONB-cast filters in `resolve.ts:561, 846-847, 871, 876` — they string-interpolate (`@>`) untrusted shape via `JSON.stringify(...)` which is parameterized correctly, but the unindexable `::text != '[]'` is a smell.
- **Risky:** the `metadata->>'stripeTransferId' = $1` lookup in `webhooks.ts:158` is unindexed (see §1.3).

### 3.4 Transaction boundaries
- 23 `db.transaction(async (tx) => ...)` call sites; the pattern is consistent and uses `tx` for all inner work.
- `services/agent-transfer.ts:322-360` performs sequential row updates inside a transaction (key revocations one by one). **Holds the tx open for N round-trips** — batch with `inArray(agent_keys.id, [...])`.
- `routes/v1/programmatic.ts` has 4 transactions with non-trivial work; spot-check that none call out to network (Stripe, mail, IPFS) inside the transaction.

### 3.5 Connection pool (`lib/db/src/index.ts`)
- `Pool({ max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, allowExitOnIdle: false })` — sane defaults.
- `statement_timeout` enforced via the connection `options` startup string (default 30 s, configurable via `DB_STATEMENT_TIMEOUT_MS`). Good defense against runaway queries.
- Pool is **lazy** (created on first use) and exposed via a `Proxy` — risk: the `Proxy.get` pattern returns `function.bind(p)`, which is correct, but means every `db.select` call triggers a property lookup through the proxy. The cost is negligible per call but adds up at hot-path scale; consider eager init on app start in production.
- `p.on('error', ...)` handler is present — won't crash on idle-client errors. ✅
- **No idle-in-transaction timeout** is configured. Add `idle_in_transaction_session_timeout` to the startup options to evict orphaned transactions (e.g., when a request handler throws between tx start and commit).
- **Pool size of 20 vs Replit deployment:** verify the deployment scales horizontally and that `20 × N_instances < max_connections` of the Postgres server. With 20 workers × 4 instances you're at 80, comfortably below typical Postgres defaults of 100–200.

### 3.6 Error-path connection leaks
- All transactions are wrapped in `await db.transaction(async (tx) => ...)` which auto-rolls-back on throw — no manual `BEGIN`/`COMMIT` patterns found, so leak risk is low.
- The `Proxy` indirection means top-level `db.query.x.findMany(...)` inherits Drizzle's release-on-completion semantics. ✅

---

## 4. N+1 Patterns

Confirmed N+1 / serial-query loops (file:line):

| # | File:Line | Pattern | Inner query target | Suggested fix |
|---|-----------|---------|--------------------|---------------|
| 1 | `services/mail-inbound.ts:456-458` | `for recipient of enriched.to { await db.query.agentInboxesTable.findFirst(...) }` | `agent_inboxes` | `inArray(address, [...])` once |
| 2 | `services/mail.ts:1194-1212` (`routeMessage`) | per-rule loop, fetches the `routed` label every iteration | `message_labels` | Pre-fetch labels for the agent once |
| 3 | `services/mail.ts:1306-1321` (`executeAction`) | `case 'label'` fetches the label inside an action loop inside a rule loop | `message_labels` | Same — cache labels on the `routeMessage` scope |
| 4 | `services/agent-transfer.ts:106-107` | sequential `db.insert` for each transfer asset | `agent_transfer_assets` | Single `db.insert(...).values(rows)` |
| 5 | `services/agent-transfer.ts:330-332` | sequential `tx.update` per active key | `agent_keys` | `tx.update(...).where(inArray(id, keyIds))` |
| 6 | `services/operator-history.ts:29-32` | per-record `db.update` to mark previous as not-current | `agent_operator_history` | Single update with `where eq(agentId, $) AND is_current` |
| 7 | `services/mail.ts:2134-2135` | per-label `removeLabel` calls | `message_label_assignments` | Single `delete ... where messageId = $ AND labelId IN (...)` |
| 8 | `routes/v1/resolve.ts:898` | `Promise.all(agents.map(enrichAndResolve))` — fan-out without concurrency cap | varies | Cap with `p-limit`, batch what you can |

Pattern 8 is structurally different from the others: it parallelizes correctly but bursts the pool. With `limit=100`, each `enrichAndResolve` doing 2-3 DB calls × 100 = up to 300 concurrent acquires against a 20-slot pool → queueing.

---

## 5. Pagination Audit

| Endpoint | Scheme | Default | Max | Tiebreaker | Issue |
|---|---|---|---|---|---|
| `/marketplace/listings` | OFFSET | 20 | 100 | none | Add tiebreaker on `id` |
| `/marketplace/listings/:id/reviews` | OFFSET | 20 | **none** | none | Cap at 100 |
| `/marketplace/orders` | OFFSET | 20 | **none** | none | Cap; add tiebreaker |
| `/jobs` | OFFSET | 20 | 100 | none | Add tiebreaker |
| `/jobs/proposals/mine` | OFFSET | 20 | **none** | none | Cap |
| `/jobs/:jobId/proposals` | OFFSET | 20 | **none** | none | Cap |
| `/mail/agents/:agentId/threads` | **Cursor** | 25 | none | `lastMessageAt + id` | ✅ best in class; add `inbox_id` to index |
| `/mail/agents/:agentId/messages` | OFFSET | 20 | **none** | none | Cap; consider cursor |
| `/tasks` | OFFSET | 50 | 100 | none | Add tiebreaker |
| `/wallet/:id/transactions` | OFFSET | 20 | 100 | none | Add tiebreaker |
| `/mpp/payments/history` | OFFSET | 20 | 100 | none | Add tiebreaker |
| `/payments/ledger` | OFFSET | 20 | **none** | none | Cap |
| `/p/:handle/activity` | OFFSET | 20 | 100 | none | Add tiebreaker |
| `/admin/audit-log` | OFFSET | 50 | 500 | none | Lower max to 100 |

**Endpoints with no pagination at all** (return every row matching the filter):

- `/agents` (`agents.ts:505`)
- `/marketplace/listings/mine` (`marketplace.ts:201`)
- `/jobs/mine` (`jobs.ts:71`)
- `/fleet` (`fleet.ts:39`)
- `/api-keys` (`api-keys.ts:15`)
- `/identities` (`identities.ts:21`)
- `/mail/agents/:agentId/labels` (`mail.ts:598`)
- `/mail/agents/:agentId/inbox/unread` (`mail.ts:111`) — hardcoded LIMIT 100
- `/org-policies` (`org-policies.ts:24`)

For `/agents` and `/fleet` the row counts can grow unboundedly with subagent fleets — paginate.

`OFFSET` is acceptable up to a few thousand rows but degrades; everything that orders by `createdAt DESC` should ultimately move to keyset pagination (`WHERE created_at < $cursor ORDER BY created_at DESC, id DESC LIMIT $n`).

---

## 6. Specific Known Hotspots (per task brief)

### `agent_messages` thread queries
- 11 single-column indexes; no composite for the read pattern. Replace `(thread_id)` and `(inbox_id)` with `(thread_id, created_at DESC)` and `(inbox_id, created_at DESC)`. Consider partial `(agent_id, is_read) WHERE is_read = false` for unread badges.
- The `services/mail.ts:216` query `inArray(agent_messages.thread_id, threadIds)` will benefit hugely from the composite once threads carry hundreds of messages.

### `payout_ledger` joins on order routes
- `decoratePayoutInfo` (`marketplace.ts:81`) is called on **every** order list and detail render. Today it pulls all payout rows for a set of orders and reduces JS-side. Two fixes:
  1. SQL-side `DISTINCT ON (related_order_id) ... ORDER BY related_order_id, created_at DESC`.
  2. Add `(related_order_id, created_at DESC)` composite index to back the DISTINCT ON.
- Also extract `metadata->>'stripeTransferId'` to a real column with a unique index, since `webhooks.ts:158` looks it up by transfer id.

### `a2a_service_calls` listing
- Has only 4 indexes: `(engagement_id)`, `(caller_agent_id, service_id)`, `(user_id)`, `(created_at)`. **Provider-side queries are unindexed.** Add `(provider_agent_id, created_at DESC)`.
- The `unique` on `call_id` doubles as an upsert key — good.

### `audit_events` "ensure columns" in `post-merge.sh`
- Cause: someone added `target_type`, `target_id`, `ip_address`, `user_agent` to `lib/db/src/schema/audit-events.ts` without producing a migration file. The `post-merge.sh` `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is a permanent workaround. Generate the missing migration (`drizzle-kit generate` after a clean reset) and remove the post-merge guard.
- The same pattern applies to the `agent_ows_wallet_accounts` backfill (one-time data migration that runs on every deploy).

---

## 7. Recommendations Summary (prioritized)

**Critical (do first):**
1. Add composite indexes for the hottest read paths: `agent_messages (thread_id, created_at DESC)`, `(inbox_id, created_at DESC)`; `marketplace_orders (buyer_user_id, created_at DESC)` and `(seller_user_id, created_at DESC)`; `payout_ledger (related_order_id, created_at DESC)`; `a2a_service_calls (provider_agent_id, created_at DESC)`; `audit_events (actor_type, actor_id, created_at DESC)`.
2. Add GIN indexes on `agents.capabilities` and `agents.protocols` for the discovery hot path.
3. Cap `enrichAndResolve` concurrency in `/resolve/discover`.
4. Promote `agents.metadata->>'isSandbox'` to a real boolean column.
5. Promote `payout_ledger.metadata->>'stripeTransferId'` to a real column with a unique index.

**High (next):**
6. Fix the 8 N+1 patterns listed in §4 (start with `mail-inbound.ts` recipient fan-out and `agent-transfer.ts` per-asset inserts).
7. Enforce a uniform `MAX_PAGE_SIZE` on every list endpoint; add `id` tiebreaker to every `ORDER BY createdAt DESC`.
8. Paginate `/agents`, `/fleet`, and `/marketplace/listings/mine`.
9. Generate the missing migration for `audit_events` columns and remove the post-merge guard. Same for the `agent_ows_wallet_accounts` backfill (gate behind a one-shot sentinel).

**Medium:**
10. Add `updatedAt` to the 10 mutable-but-no-updatedAt tables listed in §1.2.
11. Add pg_trgm GIN indexes for the `ilike '%term%'` hot paths (`marketplace_listings.title`, `agent_messages.subject`/`body_text`, `job_posts.title`, `a2a_service_listings.name`).
12. Move `/mail/agents/:agentId/messages` to keyset pagination.
13. Audit `pg_stat_user_indexes` and drop indexes whose `idx_scan = 0` (start with the boolean single-column indexes flagged in §1.7).

**Low / hygiene:**
14. Squash the duplicate `0007/0008_subagent_lineage_system` journal entries.
15. Forbid `drizzle-kit push --force` against production; document this.
16. Add `idle_in_transaction_session_timeout` to the pool startup options.
17. Eager-init the connection pool in production to avoid first-request latency through the lazy Proxy.
18. Normalize `agents.chainRegistrations` JSONB into a real table (mirror of `agent_ows_wallet_accounts`).

---

## Appendix A — Exhaustive `/api/v1` Route Inventory

This appendix enumerates **every** route mounted under `/api/v1`, the database queries each route triggers, and the index coverage for the WHERE / ORDER BY / JOIN predicates.

**Index-coverage shorthand**:
- ✅ Covered — predicate hits an existing index (single or composite).
- ⚠️ Partial — predicate hits part of an index (prefix only) or sort is unindexed.
- ❌ Missing — predicate has no usable index; falls back to seq scan.
- 🔵 PK / unique — primary-key or unique-constraint lookup; trivially indexed.
- ➖ No DB — pure response, no DB query issued.

Routes are listed by mounting file in alphabetical order.

### A.1 `a2a.ts` — A2A service marketplace

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /services` | `a2a_service_listings` (filter by name/category/agentId) | ⚠️ category and agentId have indexes; `ilike(name,'%q%')` is ❌ |
| `GET /services/:serviceId` | `a2a_service_listings` (PK), enriches with `agents` (PK) | 🔵 |
| `POST /services` | `a2a_service_listings.insert`, `agent_activity_log.insert` | n/a (writes) |
| `PATCH /services/:serviceId` | `a2a_service_listings.update` (PK) | 🔵 |
| `DELETE /services/:serviceId` | `a2a_service_listings.update status='inactive'` | 🔵 |
| `POST /services/:serviceId/call` | `a2a_service_listings` (PK), `agents` (PK on caller+provider), `agent_spending_rules` lookup, `payments.insert`, `a2a_service_calls.insert`, `a2a_payout_queue.insert`, `agent_activity_log.insert` | 🔵 / ✅ (`agent_spending_rules.agent_id`) |
| `GET /lineage/:orderId` | `marketplace_orders` (PK), `a2a_engagements` (by orderId), `a2a_service_calls` (by engagementId) | 🔵 / ✅ engagement→calls index |
| `POST /payouts/process` | `a2a_payout_queue` (status='pending'), `payments.update`, `agent_activity_log.insert` | ⚠️ status filter — single-column index acceptable here |

### A.2 `admin.ts` — Operator-only admin

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /agents/:id/revoke` | `agents.update`, `agent_keys.update where agent_id`, `agent_credentials.update where agent_id`, `agentid_sessions.update where agent_id`, `oauth_tokens.update where agent_id` | ✅ all `agent_id` indexes present |
| `POST /tokens/revoke` | `oauth_tokens.update` (by id or jti) | 🔵 |
| `POST /sessions/revoke` | `agentid_sessions.update` (by id) | 🔵 |
| `POST /clients/:clientId/revoke` | `oauth_clients.update` | 🔵 |
| `GET /audit-log` | `audit_events.findMany(actor/event/target/dateRange) ORDER BY createdAt DESC LIMIT 50/max 500` | ❌ **no `(actor, created_at DESC)` composite — see §1.7** |
| `GET /audit-log/export` | same as above (no LIMIT — full export) | ❌ |
| `POST /claims/resolve` | `agent_claim_history.update`, `agents.update`, `audit_events.insert` | 🔵 |
| `POST /process-pending-mints` | `agents.findMany(handleNftStatus='pending_mint')`, then per-agent updates | ⚠️ no index on `handleNftStatus` |
| `POST /reconcile-handle` | `agents.findFirst(handle)` + `update` | ✅ unique index on handle |
| `POST /orders/:orderId/dispute/resolve` (POST + PATCH) | `marketplace_orders.update`, `audit_events.insert` | 🔵 |
| `GET /disputes` | `marketplace_orders.findMany(status='disputed') ORDER BY createdAt DESC` | ⚠️ status index exists; sort unindexed |

### A.3 `agent-attestations.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /:agentId/attest/:subjectHandle` | `agents` (PK + handle lookup for subject), `agent_keys` (active key lookup), `agent_attestations.insert`, trust-score recompute, webhook delivery | 🔵 / ✅ |
| `POST /:agentId/trust-attestation` | same dependency surface; inserts to `agent_attestations` | 🔵 / ✅ |

### A.4 `agent-auth.ts` — DPoP / PoP-JWT issuance

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /challenge` | `agentid_sessions.insert` (nonce), `auth_nonces.insert` | 🔵 / ✅ unique on `nonce` |
| `POST /session` | `agents` (handle/PK), `agent_keys` (active key), `auth_nonces.update consumed`, `agentid_sessions.insert` | ✅ on all FKs; **see §1.7 — drop the redundant 4-col `auth_nonces` index** |
| `POST /introspect` | `agentid_sessions.findFirst(token hash)` | ✅ unique on session token |
| `POST /revoke` | `agentid_sessions.update` (PK) | 🔵 |

### A.5 `agent-card.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:handle` | `agents.findFirst(handle)` only | ✅ |

### A.6 `agentic-pay.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /options` | `agents` (PK), `agent_subscriptions` lookup via billing service | 🔵 / ✅ |
| `POST /upgrade` | `agents.update`, billing service (Stripe) | 🔵 |
| `POST /authorize` | `agents` (PK), agentic-payment service writes | 🔵 |
| `POST /handle/claim` | `agents.update handle`, `audit_events.insert` | 🔵 |
| `POST /execute-upgrade` | `agents.update`, billing service | 🔵 |
| `POST /upgrade/x402` | same | 🔵 |
| `GET /x402-info` | `agents` (PK) | 🔵 |

### A.7 `agent-identity.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:agentIdOrHandle` | `agents.findFirst(id OR handle)` + `agent_keys` (active) + `agent_transfers` (latest) + operator history | ✅ id/handle; `agent_transfers` ordered by createdAt — ⚠️ |
| `GET /:agentIdOrHandle/identity` | ➖ static identity-document endpoint |

### A.8 `agent-oauth-tokens.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:agentId/oauth-tokens` | `oauth_tokens.findMany(agent_id) ORDER BY createdAt DESC` + `oauth_clients` join (PK) | ✅ `agent_id`; sort ⚠️ |
| `DELETE /:agentId/oauth-tokens/:tokenId` | `oauth_tokens.update revoked` (PK + agent_id check) | 🔵 |

### A.9 `agent-payments.ts` — Stripe Connect

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /:agentId/onboarding-link` | `agents` (PK), Stripe API + `agents.update stripeAccountId` | 🔵 |
| `GET /:agentId/account` | `agents` (PK) + Stripe API | 🔵 |
| `GET /:agentId/onboarding-status` | `agents` (PK) + Stripe API | 🔵 |

### A.10 `agent-registry.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:agentId/registry/status` | agent-registry service: `agents` (PK), `agent_keys`, `agent_chain_anchors` | 🔵 / ✅ |

### A.11 `agent-runtime.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:agentId/bootstrap` | `agents` (PK), `api_keys` (agent_id) | 🔵 / ✅ |
| `GET /:agentId/runtime` | `agents` (PK), `agent_messages` (recent), `marketplace_orders` (active) | ⚠️ message recency unindexed composite |
| `GET /:agentId/prompt-block` | `agents` (PK), template lookup | 🔵 |
| `GET /:agentId/marketplace/context` | `marketplace_listings` (agent_id), `marketplace_orders` (agent_id), `marketplace_milestones`, `marketplace_order_messages` | ✅ `agent_id` on listings/orders; messages join ⚠️ |
| `POST /:agentId/heartbeat` | `agents.update lastSeenAt` (PK) | 🔵 |
| `GET /:agentId/activity` | `agent_activity_log.findMany(agentId) ORDER BY createdAt DESC LIMIT n` | ✅ agentId; sort ⚠️ — needs `(agent_id, created_at DESC)` |

### A.12 `agents.ts` (largest file)

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /whoami` | `agents.findFirst(PK)` | 🔵 |
| `POST /` (create) | `agents.insert` (with advisory lock on handle), `audit_events.insert`, billing/identity/credentials side effects | 🔵 |
| `GET /` | `agents.findMany(user_id) ORDER BY createdAt DESC` — **no LIMIT** | ✅ user_id; sort ⚠️ — see §5 (unbounded) |
| `GET /:agentId` | `agents.findFirst(PK)` enriched | 🔵 |
| `PUT /:agentId` | `agents.update`, `audit_events.insert` | 🔵 |
| `DELETE /:agentId` | `agents.update status='deleted'`, `audit_events.insert` | 🔵 |
| `GET /:agentId/activity` | `agent_activity_log.findMany(agentId) ORDER BY createdAt DESC` | ⚠️ same composite gap as A.11 |
| `POST /:agentId/keys/rotate` | `agent_keys.update old`, `agent_keys.insert new`, `audit_events.insert` | ✅ |
| `POST /:agentId/keys/verify-rotation` | `agent_keys.findFirst(rotation challenge)`, update | 🔵 |
| `POST /:agentId/keys` | `agent_keys.insert` | n/a |
| `POST /:agentId/shutdown` | `agents.update`, `agent_keys.update`, `audit_events.insert` | 🔵 |
| `GET /:agentId/credential` | `agent_credentials.findFirst(agent_id, latest)` | ✅ if `(agent_id, created_at DESC)` exists; otherwise ⚠️ |
| `POST /claim` | `agent_claim_tokens.findFirst(token)`, `agents.update` | ✅ unique on token |
| `POST /:agentId/regenerate-claim-token` | `agent_claim_tokens.insert`, prior tokens invalidated | 🔵 |
| `POST /:agentId/credential/reissue` | `agent_credentials.insert` | n/a |
| `POST /:agentId/report` | `agent_reports.insert`, `audit_events.insert` | n/a |
| `GET /:agentId/revenue` | `marketplace_orders` aggregations by seller | ⚠️ needs `(seller_user_id, status, createdAt)` index |
| `POST /:agentId/claim` | similar to `/claim` | ✅ |
| `POST /:agentId/transfer` | `agents.update ownerUserId`, `agent_transfers.insert`, `audit_events.insert` | 🔵 |
| `POST /:agentId/wallets/ows` | `agent_ows_wallets.insert`, `agent_ows_wallet_accounts.insert` (multiple) | 🔵 |
| `GET /:agentId/identity-file` | `agents` (PK), `agent_keys`, `agent_credentials`, `agent_chain_anchors` | 🔵 / ✅ |
| `GET /:agentId/wallets/ows` | `agent_ows_wallets.findFirst(agentId)` + accounts | ✅ |
| `POST /:agentId/anchor/retry` | `agents.update chainStatus` | 🔵 |
| `DELETE /:agentId/wallets/ows` | `agent_ows_wallets.delete(agentId)` | ✅ |

### A.13 `agent-spawn.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /:agentId/subagents` | `agents.insert`, `agent_lineage.insert`, `agent_keys.insert`, `api_keys.insert`, mail bootstrap | 🔵 |
| `GET /:agentId/subagents` | `agent_lineage.findMany(parentAgentId)` joined to `agents` | ✅ if `parent_agent_id` indexed (it is) |
| `DELETE /:agentId/subagents/:subagentId` | `agents.update status='deleted'`, lineage update | 🔵 |

### A.14 `agent-stream.ts` — SSE

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:agentId/stream` (SSE) | initial `agents` (PK) check; subsequent reads come from `agent_activity_log.findMany(agentId, createdAt > $)` polled | ⚠️ needs `(agent_id, created_at DESC)` composite — repeated polling amplifies the gap |

### A.15 `agent-transfers.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:agentId/transfers/readiness` | `agents` (PK), `agent_keys`, `agent_credentials` | 🔵 / ✅ |
| `POST /:agentId/transfers` | `agent_transfers.insert`, `agent_transfer_assets.insert` (loop — **N+1**, see §4 #4) | n/a |
| `GET /:agentId/transfers` | `agent_transfers.findMany(agentId) ORDER BY createdAt DESC` | ✅ agentId; sort ⚠️ |
| `GET /:agentId/transfers/:transferId` | `agent_transfers.findFirst(PK)` | 🔵 |
| `PATCH /:agentId/transfers/:transferId` | `agent_transfers.update` | 🔵 |
| `POST /:agentId/transfers/:transferId/list` | ➖ unimplemented (next handler) |
| `POST /:agentId/transfers/:transferId/accept` | `agent_transfers.update`, `audit_events.insert` | 🔵 |
| `POST /:agentId/transfers/:transferId/advance` | `agent_transfers.update`, `audit_events.insert` | 🔵 |
| `POST /:agentId/transfers/:transferId/fund-hold` | ➖ unimplemented |
| `POST /:agentId/transfers/:transferId/start-handoff` | `agent_transfers.update`, `agent_keys.update where active` (loop — **N+1**, see §4 #5) | 🔵 / ⚠️ |
| `POST /:agentId/transfers/:transferId/complete` | `agent_transfers.update`, `agents.update ownerUserId`, `agent_keys.update`, `audit_events.insert` | 🔵 |
| `POST /:agentId/transfers/:transferId/cancel` | `agent_transfers.update status='cancelled'` | 🔵 |
| `POST /:agentId/transfers/:transferId/dispute` | `agent_transfers.update`, `audit_events.insert` | 🔵 |
| `GET /:agentId/transfers/:transferId/events` | `agent_transfer_events.findMany(transferId) ORDER BY createdAt` | ✅ |
| `POST /:agentId/transfers/:transferId/assets/:assetId/reconnect` | `agent_transfer_assets.update` | 🔵 |
| `GET /:agentId/transfers/:transferId/assets` | `agent_transfer_assets.findMany(transferId)` | ✅ |

### A.16 `agent-verification.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /:agentId/verify/initiate` | `agents.update verificationToken` | 🔵 |
| `POST /:agentId/verify/complete` | `agents.update verificationStatus`, trust-score recompute, activity log | 🔵 |
| `GET /:agentId/verify/status` | `agents` (PK) | 🔵 |

### A.17 `agent-webhooks.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /:agentId/webhooks` | `agent_webhooks.insert` | n/a |
| `GET /:agentId/webhooks` | `agent_webhooks.findMany(agentId)` | ✅ |
| `DELETE /:agentId/webhooks/:webhookId` | `agent_webhooks.delete(PK + agentId)` | 🔵 |
| `POST /:agentId/webhooks/:webhookId/test` | `agent_webhooks.findFirst`, fire HTTP, `agent_webhook_deliveries.insert` | 🔵 |

### A.18 `api-keys.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /` | `api_keys.insert` | n/a |
| `GET /` | `api_keys.findMany(user_id)` — **no LIMIT** | ✅ user_id (sort by created — ⚠️) |
| `DELETE /:keyId` | `api_keys.update revoked` | 🔵 |

### A.19 `auth.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /me` | ➖ uses session middleware data only |

### A.20 `billing.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /plans` | ➖ static |
| `GET /subscription` | `agent_subscriptions.findFirst(user_id)` via billing service | ✅ |
| `GET /subscriptions` | `agent_subscriptions.findMany(user_id)` | ✅ |
| `POST /checkout` | `users.update stripeCustomerId` if missing; calls Stripe | 🔵 |
| `POST /portal` | calls Stripe (no DB mutation) | ➖ |
| `POST /cancel` | `agent_subscriptions.update status` | 🔵 |
| `POST /handle-checkout` | `agents` (PK), Stripe checkout-session create | 🔵 |
| `POST /crypto-checkout`, `POST /crypto-payment-status` | ➖ unimplemented |
| `GET /handle-checkout/status` | `agents` (PK), Stripe lookup | 🔵 |
| `POST /agents/:agentId/activate` | `agents.update status` | 🔵 |
| `POST /agents/:agentId/deactivate` | `agents.update status='inactive'` | 🔵 |
| `GET /agents/:agentId/status` | `agents` (PK), `agent_subscriptions.findFirst` | 🔵 / ✅ |

### A.21 `bootstrap.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /claim` | `agent_claim_tokens.findFirst(token)`, `agents.update`, `users.insert/update`, `api_keys.insert` | ✅ unique token |
| `POST /activate` | `agents.update`, `agent_keys.insert`, mail/credential side effects | 🔵 |
| `GET /status/:agentId` | `agents` (PK), `agent_keys` | 🔵 / ✅ |

### A.22 `claim-history.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:agentId/claim-history` | `agent_claim_history.findMany(agentId) ORDER BY createdAt DESC` | ✅ agentId; sort ⚠️ |
| `POST /:agentId/claims/dispute` | `agent_claim_history.insert(disputeReason)` | n/a |

### A.23 `control-plane.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| (mounted handlers via service) | `agents` (PK reads) for control-plane signaling | 🔵 |

### A.24 `dashboard.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /stats` | `agents.findMany(user_id)` + `tasks count(*) filter (...)` + `payment_ledger sum(amount)` + `agent_activity_log.findMany LIMIT 20` — **4 sequential queries** (see §0 #4) | ✅ user_id / agent_id; ⚠️ payment_ledger needs `(account_id, direction)` composite |

### A.25 `domain-resolve.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /resolve/:domain` | domains service: `agent_custom_domains.findFirst(domain)` | ✅ unique on domain |

### A.26 `domains.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:agentId/domain` | `agent_custom_domains.findFirst(agentId)` | ✅ |
| `GET /:agentId/domain/status` | same | ✅ |
| `POST /:agentId/domain/provision` | `agent_custom_domains.insert/update` + DNS provider call | 🔵 |
| `POST /:agentId/domain/reprovision` | same | 🔵 |

### A.27 `fleet.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /` | `agents.findMany(user_id, parent_agent_id IS NOT NULL) ORDER BY createdAt DESC` — **no LIMIT** | ✅ user_id; ⚠️ sort + null filter |
| `POST /sub-handles` | `agents.insert` | 🔵 |
| `DELETE /sub-handles/:agentId` | `agents.update status='deleted'` | 🔵 |

### A.28 `governance.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /governance` | ➖ static |
| `POST /:agentId/appeal` | `agent_appeals.insert` | n/a |

### A.29 `handles.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /check` | `agents.findFirst(handle)` + `handle_auctions.findFirst(handle)` + `handle_trademark_claims.findFirst(handle)` | ✅ all unique on handle |
| `GET /pricing` | ➖ static |
| `POST /:handle/trademark-claim` | `handle_trademark_claims.insert` | n/a |
| `POST /auctions/:handle/bid` | `handle_auctions.update`, `agents` lookup, Stripe charge | 🔵 / ✅ |
| `POST /:handle/mint-chain` | `agents.update`, `nft_audit_log.insert`, chain RPC | 🔵 |
| `POST /:handle/claim-nft` | `agents.update`, `nft_audit_log.insert` | 🔵 |
| `POST /:handle/request-mint` | `agents.update handleNftStatus='pending_mint'` | 🔵 |

### A.30 `humans.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /claim` | `human_profiles.insert` (with advisory lock on handle) | 🔵 |
| `GET /:handle` | `agents.findFirst(handle)` + `human_profiles.findFirst(handle)` | ✅ |

### A.31 `identities.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /` | `user_identities.findMany(user_id)` — **no LIMIT** | ✅ user_id |
| `POST /link` | `user_identities.insert` (with unique constraint on provider+sub) | ✅ |

### A.32 `index.ts` — root-level resolve aliases

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /reverse` | delegates to `handleReverse` (resolve service) — see A.45 | |
| `GET /agents` | delegates to discovery — see A.45 `GET /` | |
| `POST /agents` | delegates to programmatic register — see A.43 | |

### A.33 `integrations.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /` | ➖ static catalog |
| `GET /:framework` | ➖ static |

### A.34 `jobs.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /` | `job_posts.findMany(category/status/skills) ORDER BY createdAt DESC LIMIT 20/100` | ⚠️ `ilike(title,'%q%')` is ❌; status+createdAt composite ⚠️ |
| `GET /mine` | `job_posts.findMany(creator_user_id)` — **no LIMIT** | ✅ creator |
| `GET /proposals/mine` | `job_proposals.findMany(proposer_user_id) ORDER BY createdAt DESC` — **no LIMIT** | ✅ proposer; sort ⚠️ |
| `GET /:jobId` | `job_posts.findFirst(PK)` + `job_proposals.findMany(jobId)` | 🔵 / ✅ |
| `POST /` | `job_posts.insert` | n/a |
| `PATCH /:jobId` | `job_posts.update` | 🔵 |
| `PATCH /:jobId/status` | `job_posts.update status` | 🔵 |
| `GET /:jobId/proposals` | `job_proposals.findMany(jobId) ORDER BY createdAt DESC` — **no LIMIT** | ✅ jobId; sort ⚠️ |
| `POST /:jobId/proposals` | `job_proposals.insert` | n/a |
| `PATCH /:jobId/proposals/:proposalId` | `job_proposals.update` | 🔵 |
| `POST /:jobId/proposals/:proposalId/withdraw` | `job_proposals.update status='withdrawn'` | 🔵 |

### A.35 `mail.ts` (38 routes — heaviest mount)

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /agents/:agentId/inbox` | `agent_inboxes.findMany(agentId)` | ✅ |
| `PATCH /agents/:agentId/inbox` | `agent_inboxes.update` | 🔵 |
| `GET /agents/:agentId/inbox/unread` | `agent_messages.findMany(agentId, isRead=false) LIMIT 100` | ❌ — needs partial `(agent_id) WHERE is_read = false` |
| `GET /agents/:agentId/inbox/stats` | `agent_messages count(*) filter (...)` aggregations | ⚠️ filter aggregations on `agent_id` only |
| `GET /agents/:agentId/threads` | `agent_threads.findMany(inbox_id, lastMessageAt < cursor) LIMIT 25` | ⚠️ — keyset cursor exists but index is single-col `last_message_at`; needs `(inbox_id, last_message_at DESC)` |
| `POST /agents/:agentId/threads/:threadId/star` | `agent_threads.update isStarred` | 🔵 |
| `DELETE /agents/:agentId/threads/:threadId` | `agent_threads.update deletedAt` | 🔵 |
| `DELETE /agents/:agentId/messages/:messageId` | `agent_messages.update deletedAt` | 🔵 |
| `POST /agents/:agentId/drafts` | `agent_messages.insert(status='draft')` | n/a |
| `POST /agents/:agentId/threads/bulk` | `agent_threads.update where id in (...)` | ✅ inArray on PK |
| `GET /agents/:agentId/threads/:threadId` | `agent_threads.findFirst(PK)` + `agent_messages.findMany(threadId) ORDER BY createdAt` | 🔵 / ❌ — composite missing |
| `PATCH /agents/:agentId/threads/:threadId` | `agent_threads.update` | 🔵 |
| `POST /agents/:agentId/threads/:threadId/read` | `agent_messages.update where threadId AND isRead=false` | ⚠️ |
| `GET /agents/:agentId/messages` | `agent_messages.findMany(agentId, optional ilike subject/body, dateRange) ORDER BY createdAt DESC LIMIT n` — **no max LIMIT** | ❌ — composite missing; ilike unindexed (see §3.2) |
| `GET /agents/:agentId/messages/:messageId` | `agent_messages.findFirst(PK)` + `message_attachments.findMany(messageId)` | 🔵 / ✅ |
| `POST /agents/:agentId/messages` (compose) | `agent_messages.insert`, `agent_threads.upsert`, optional outbound delivery insert | 🔵 |
| `POST /agents/:agentId/messages/:messageId/read` | `agent_messages.update isRead=true` (PK) | 🔵 |
| `POST /agents/:agentId/messages/:messageId/convert-task` | `tasks.insert`, `agent_messages.update` | n/a |
| `GET /agents/:agentId/messages/:messageId/events` | `message_events.findMany(messageId) ORDER BY createdAt` | ✅ |
| `GET /agents/:agentId/labels` | `message_labels.findMany(agentId)` — **no LIMIT** | ✅ |
| `POST /agents/:agentId/labels` | `message_labels.insert` | n/a |
| `DELETE /agents/:agentId/labels/:labelId` | `message_labels.delete` + `message_label_assignments.delete where labelId` | ✅ labelId |
| `POST /agents/:agentId/messages/:messageId/labels/:labelId` | `message_label_assignments.insert` | n/a |
| `DELETE /agents/:agentId/messages/:messageId/labels/:labelId` | `message_label_assignments.delete (messageId, labelId)` | ✅ unique composite |
| `GET /agents/:agentId/webhooks` | `inbox_webhooks.findMany(inboxId)` | ✅ |
| `POST /agents/:agentId/webhooks` | `inbox_webhooks.insert` | n/a |
| `PATCH /agents/:agentId/webhooks/:webhookId` | `inbox_webhooks.update` | 🔵 |
| `DELETE /agents/:agentId/webhooks/:webhookId` | `inbox_webhooks.delete` | 🔵 |
| `POST /agents/:agentId/threads/:threadId/reply` | `agent_messages.insert`, `agent_threads.update lastMessageAt`, outbound delivery | 🔵 |
| `POST /agents/:agentId/messages/:messageId/reject` | `agent_messages.update status='rejected'` | 🔵 |
| `POST /agents/:agentId/messages/:messageId/approve` | `agent_messages.update status='approved'`, downstream routing | 🔵 |
| `POST /agents/:agentId/messages/:messageId/archive` | `agent_messages.update isArchived=true` | 🔵 |
| `POST /agents/:agentId/messages/:messageId/route` | `agent_messages.update`, label rule loop (**N+1**, §4 #2,#3) | ⚠️ |
| `POST /agents/:agentId/labels/:labelId/bulk-assign` | `message_label_assignments.insert ... values [...]` | n/a |
| `POST /agents/:agentId/labels/:labelId/bulk-remove` | `message_label_assignments.delete where labelId AND messageId IN [...]` | ✅ |
| `GET /agents/:agentId/search` | `agent_messages` ilike on subject/body + dateRange | ❌ — see §3.2 |
| `POST /ingest` | `agent_messages.insert`, `inbound_transport_events.insert`, attachments insert | 🔵 |
| `GET /attachment-limits` | ➖ static |
| `POST .../:messageId/attachments` (signed upload) | `message_attachments.insert` | n/a |
| `GET .../:messageId/attachments/:id` | `message_attachments.findFirst(PK)` | 🔵 |
| `DELETE .../:messageId/attachments/:id` | `message_attachments.delete(PK)` | 🔵 |

### A.36 `marketplace.ts` (27+ routes)

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /listings` | `marketplace_listings.findMany(category/status/agentId/featured/search/mode) ORDER BY $sort LIMIT 20/100` | ⚠️ — `created`/`rating` ✅; `hires`/`price` ❌; ilike title ❌ (see §0 #2) |
| `GET /listings/mine` | `marketplace_listings.findMany(creator_user_id)` — **no LIMIT** | ✅ |
| `GET /listings/:listingId` | `marketplace_listings.findFirst(PK)` + `agents` | 🔵 |
| `GET /listings/:listingId/analytics` | `marketplace_listings`, `marketplace_orders` aggregations by listingId | ✅ listingId |
| `POST /listings` | `marketplace_listings.insert` | n/a |
| `PUT /listings/:listingId` | `marketplace_listings.update` | 🔵 |
| `PATCH /listings/:listingId` | `marketplace_listings.update` | 🔵 |
| `DELETE /listings/:listingId` | `marketplace_listings.update status='deleted'` | 🔵 |
| `GET /listings/:listingId/reviews` | `marketplace_reviews.findMany(listingId) ORDER BY createdAt DESC LIMIT 20` — **no max** | ✅ listingId; sort ⚠️ |
| `GET /stripe-config` | ➖ static |
| `POST /orders` | `marketplace_orders.insert`, `marketplace_milestones.insert` | n/a |
| `GET /orders` | `marketplace_orders.findMany(buyer OR seller OR all) ORDER BY createdAt DESC LIMIT 20` — **no max**; then `decoratePayoutInfo` | ❌ — composite missing on `(buyer_user_id, created_at DESC)` and `(seller_user_id, created_at DESC)`; `decoratePayoutInfo` reduces N rows to N in JS (see §0 #5, §6) |
| `GET /orders/:orderId` | `marketplace_orders.findFirst(PK)` + `decoratePayoutInfo` | 🔵 |
| `GET /orders/:orderId/messages` | `marketplace_order_messages.findMany(orderId) ORDER BY createdAt` | ✅ |
| `POST /orders/:orderId/messages` | `marketplace_order_messages.insert` | n/a |
| `POST /orders/:orderId/confirm-payment` | `marketplace_orders.update status='paid'` | 🔵 |
| `POST /orders/:orderId/confirm` | `marketplace_orders.update status='confirmed'` | 🔵 |
| `POST /orders/:orderId/complete` | `marketplace_orders.update`, `payout_ledger.insert`, Stripe transfer | 🔵 |
| `POST /orders/:orderId/cancel` | `marketplace_orders.update status='cancelled'` | 🔵 |
| `GET /orders/:orderId/milestones` | `marketplace_milestones.findMany(orderId)` | ✅ |
| `POST /orders/:orderId/milestones` | `marketplace_milestones.insert` | n/a |
| `POST /orders/:orderId/milestones/:milestoneId/release` | `marketplace_milestones.update status='released'`, `payout_ledger.insert` | 🔵 |
| `POST /orders/:orderId/milestones/:milestoneId/dispute` | `marketplace_milestones.update`, dispute service | 🔵 |
| `POST /orders/:orderId/dispute` | `marketplace_orders.update status='disputed'`, `audit_events.insert` | 🔵 |
| `GET /orders/:orderId/dispute` | `marketplace_orders.findFirst(PK)` enriched | 🔵 |
| `POST /orders/:orderId/dispute/withdraw` | `marketplace_orders.update` | 🔵 |
| `POST /reviews` | `marketplace_reviews.insert`, `marketplace_listings.update avgRating` (recompute) | n/a |
| `GET /a2a/registry` | `a2a_service_listings` enriched with `agents` (multiple joins) | ✅ |
| `GET /a2a/engagements` | `a2a_engagements.findMany(buyer/seller agent)` | ✅ |
| `POST /a2a/engagements` | `a2a_engagements.insert`, `a2a_service_calls.insert` | n/a |
| `GET /a2a/engagements/:id` | `a2a_engagements.findFirst(PK)` enriched with calls | 🔵 / ✅ |
| `GET /a2a/engagements/:id/calls` | `a2a_service_calls.findMany(engagementId)` | ✅ |

### A.37 `meta.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /auth-matrix` | ➖ static auth matrix |
| `GET /stats` | `agents count(*)` (single aggregation) | ⚠️ full table count — should be cached |

### A.38 `mpp.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /providers` | ➖ static |
| `POST /create-intent` | `mpp_payments.insert`, provider call | n/a |
| `GET /payments/:paymentId/status` | `mpp_payments.findFirst(PK)` + provider call | 🔵 |
| `GET /payments/history` | `mpp_payments.findMany(agentId or userId) ORDER BY createdAt DESC LIMIT 20/100` | ✅ agentId; sort ⚠️ |
| `GET /payments/:paymentId` | `mpp_payments.findFirst(PK)` | 🔵 |

### A.39 `nft.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /nft/metadata/:handle` | `agents.findFirst(handle)` | ✅ |
| `GET /metadata/:handle` | same | ✅ |
| `GET /handles/:handle/image.svg` | `agents.findFirst(handle)` | ✅ |
| `POST /handles/:handle/transfer` | `agents.update ownerUserId`, `nft_audit_log.insert` | ✅ |

### A.40 `oauth-clients.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /icon-upload` | object-storage write only | ➖ |
| `GET /` | `oauth_clients.findMany(owner_user_id)` | ✅ |
| `POST /` | `oauth_clients.insert` | n/a |
| `GET /:id` | `oauth_clients.findFirst(PK)` | 🔵 |
| `PATCH /:id` | `oauth_clients.update` | 🔵 |
| `DELETE /:id` | `oauth_clients.delete` | 🔵 |
| `POST /:id/rotate-secret` | `oauth_clients.update clientSecretHash` | 🔵 |

### A.41 `organizations.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /` | `agent_organizations.insert`, `org_members.insert` | n/a |
| `GET /:slug` | `agent_organizations.findFirst(slug)` + `org_members` | ✅ unique slug |
| `POST /:orgSlug/agents` | `org_agents.insert`, `agents.update` | n/a |
| `DELETE /:orgSlug/agents/:agentId` | `org_agents.delete`, `agents.update` | 🔵 |
| `GET /:orgSlug/members` | `org_members.findMany(orgId)` | ✅ |

### A.42 `org-policies.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /` | `org_policies.findMany(orgId)` — **no LIMIT** | ✅ |
| `POST /` | `org_policies.insert` (after org membership check on `org_members`) | ✅ |
| `DELETE /:policyId` | `org_policies.delete` | 🔵 |

### A.43 `owner-tokens.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| (mounted handlers — owner token mgmt) | `owner_tokens.insert/findMany/update/delete` keyed by `agent_id` and token hash | ✅ |

### A.44 `payments.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /providers` | ➖ static |
| `POST /intents` | provider service call → `payments.insert` | n/a |
| `POST /authorize` | `payments.update status='authorized'` | 🔵 |
| `GET /ledger` | `payment_ledger.findMany(account_id, direction) ORDER BY createdAt DESC LIMIT 20` — **no max** | ⚠️ — needs `(account_id, direction, created_at DESC)` composite |

### A.45 `programmatic.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /agents/register` | `agents.insert` (advisory lock on handle), `agent_keys.insert`, `api_keys.insert`, `users.upsert` | 🔵 |
| `POST /agents/verify` | `agents.update verificationStatus` | 🔵 |
| `POST /agents/:agentId/rotate-key` | `agent_keys.update` (old) + `insert` (new) | 🔵 |
| `GET /agents/:agentId/auth-metadata` | `agents` (PK), `agent_keys` (active) | 🔵 / ✅ |
| `POST /agents/:agentId/api-keys` | `api_keys.insert` | n/a |
| `GET /agents/:agentId/api-keys` | `api_keys.findMany(agent_id)` — **no LIMIT** | ✅ |
| `POST /agents/:agentId/api-keys/rotate` | `api_keys.update` + `insert` | 🔵 |
| `POST /agents/:agentId/handle/renew` | `agents.update handleExpiresAt` | 🔵 |
| `POST /recover/challenge` | `agent_recovery_challenges.insert` (or owner_tokens lookup) | 🔵 |
| `POST /recover` | `agent_recovery_challenges.findFirst`, `agents.update`, `agent_keys.insert` | 🔵 |

### A.46 `public-profiles.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:handle` | `agents.findFirst(handle)` + `human_profiles.findFirst(handle)` + reviews/marketplace summary | ✅ unique handle |
| `GET /:handle/credential` | `agents.findFirst(handle)` + `agent_credentials.findFirst(latest)` | ✅ / ⚠️ |
| `GET /:handle/credential/jwt` | same | ✅ / ⚠️ |
| `GET /:handle/activity` | `agent_activity_log.findMany(agentId, isPublic=true) ORDER BY createdAt DESC LIMIT 20/100` | ⚠️ needs `(agent_id, is_public, created_at DESC)` composite |
| `GET /:handle/credential/verify` | `agent_credentials.findFirst` + signature verify | ✅ |
| `POST /:handle/credential/verify` | (verify-only, no DB writes) | ➖ |
| `GET /:handle/erc8004` | resolve service: `agents.findFirst(handle)` + `agent_chain_anchors` | ✅ |

### A.47 `reputation-feedback.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /:handle/feedback` | `agents.findFirst(handle)`, `agent_feedback.insert` | ✅ |

### A.48 `resend-webhooks.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /resend/inbound` | mail-inbound service: per-recipient `agent_inboxes.findFirst(address)` (**N+1**, §4 #1), `agent_messages.insert`, `outbound_message_deliveries.update` | ✅ unique address; loop should be `inArray` |
| `POST /resend/bounce` | `outbound_message_deliveries.update`, `message_events.insert` | ✅ |

### A.49 `resolve.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /id/:agentId` | `agents.findFirst(PK)` + `agent_keys` + chain anchors | 🔵 / ✅ |
| `GET /address/:address` | `agent_ows_wallet_accounts.findFirst(address)` + `agents` | ✅ unique on (chain,address) |
| `GET /:handle` | `agents.findFirst(handle)` + enrichments (chain, attestations, marketplace) | ✅ unique |
| `GET /:handle/stats` | `agents` (handle), `marketplace_listings count`, `marketplace_orders sum`, `agent_messages count` | ✅ / ⚠️ aggregations |
| `POST /reverse` | `agents.findMany(metadata->>'isSandbox' filter, optional capabilities/protocols)` | ❌ — JSONB filters unindexed (see §0 #1) |
| `GET /erc8004/:chainId/:agentId` | `agent_chain_anchors.findFirst(chainId, agentId)` | ✅ |
| `GET /` (handleAgentDiscovery) | `agents.findMany(status, verificationStatus, sandbox JSONB filter, q, capabilities JSONB, protocols JSONB) ORDER BY trust_score/created_at/updated_at` then `Promise.all(map(enrichAndResolve))` | ❌ — see §0 #1 (N+1 fan-out + missing GINs) |
| `GET /:orgSlug/:handle` | `agent_organizations.findFirst(slug)` + `agents.findFirst(handle)` | ✅ |

### A.50 `tasks.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /` | `tasks.insert`, `task_messages.insert` | n/a |
| `GET /` | `tasks.findMany(recipientAgentId/senderAgentId/deliveryStatus/businessStatus) ORDER BY createdAt DESC LIMIT 50/100` | ⚠️ — needs `(recipient_agent_id, business_status, created_at DESC)` |
| `GET /:taskId` | `tasks.findFirst(PK)` + `task_messages.findMany(taskId)` | 🔵 / ✅ |
| `POST /:taskId/acknowledge` | `tasks.update status='acknowledged'`, `task_messages.insert` | 🔵 |
| `POST /:taskId/accept` | `tasks.update status='accepted'`, `task_messages.insert` | 🔵 |
| `POST /:taskId/start` | `tasks.update status='in_progress'`, `task_messages.insert` | 🔵 |
| `POST /:taskId/complete` | `tasks.update status='completed'`, `task_messages.insert`, optional Stripe transfer | 🔵 |
| `POST /:taskId/reject` | `tasks.update status='rejected'`, `task_messages.insert` | 🔵 |
| `POST /:taskId/fail` | `tasks.update status='failed'`, `task_messages.insert` | 🔵 |
| `PATCH /:taskId/business-status` | `tasks.update businessStatus`, `task_messages.insert` | 🔵 |
| `POST /:taskId/dispute` | `tasks.update status='disputed'`, `audit_events.insert` | 🔵 |
| `GET /:taskId/delivery-receipts` | `task_delivery_receipts.findMany(taskId)` | ✅ |

### A.51 `users.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /me` | ➖ session middleware only |
| `PATCH /me` | `users.update` (PK) | 🔵 |
| `DELETE /me` | `users.update deletedAt`, `agents.update`, `api_keys.update`, `marketplace_listings.update` (cascade soft-delete) | ✅ user_id on all child tables |

### A.52 `waitlist.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /` | `waitlist.insert` (unique on email) | ✅ unique email |

### A.53 `wallet.ts`

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `GET /:agentId/wallet` | wallet service: `agents` (PK), `agent_wallets.findFirst(agentId)` | ✅ |
| `GET /:agentId/wallet/balance` | `agent_wallets.findFirst(agentId)` + provider call | ✅ |
| `GET /:agentId/wallet/transactions` | `agent_wallet_transactions.findMany(agentId) ORDER BY createdAt DESC LIMIT 20/100` | ⚠️ needs `(agent_id, created_at DESC)` |
| `GET /:agentId/wallet/spending-rules` | `agent_spending_rules.findMany(agentId)` | ✅ |
| `PUT /:agentId/wallet/spending-rules` | `agent_spending_rules.update` | 🔵 |
| `POST /:agentId/wallet/custody-transfer` | `agent_wallet_transactions.insert`, provider call | n/a |
| `POST /:agentId/wallet/provision` | `agent_wallets.insert`, `agent_keys.insert` | n/a |
| `GET /user/:agentId/wallet` | (user-auth variant) — same as agent variant | same |
| `GET /user/:agentId/wallet/balance` | same | same |
| `GET /user/:agentId/wallet/transactions` | same | ⚠️ same composite gap |
| `GET /user/:agentId/wallet/spending-rules` | same | ✅ |
| `PUT /user/:agentId/wallet/spending-rules` | same | 🔵 |
| `POST /user/:agentId/wallet/custody-transfer` | same | n/a |
| `POST /user/:agentId/wallet/provision` | same | n/a |
| `GET /:agentId/wallet/info` | `agents` (PK) + `agent_wallets.findFirst` | ✅ |

### A.54 `webhooks.ts` — Stripe + provider webhooks

| Method+Path | Tables touched | Index coverage |
|---|---|---|
| `POST /stripe` | demultiplexes by event type: <br>• `checkout.session.completed` → `users.update`, `agents.update handleStatus`, `agent_subscriptions.upsert`<br>• `invoice.paid` → `agent_subscriptions.update`<br>• `transfer.created`/`transfer.failed` → `payout_ledger.findFirst(metadata->>'stripeTransferId')` | ❌ — JSONB lookup unindexed; see §1.3, §6 |
| `ALL /coinbase` | ➖ unimplemented |
| `ALL /visa` | ➖ unimplemented |

---

### Appendix A — Coverage Summary

- Total `/api/v1` routes inventoried: **~205** across 53 mounting files
- Routes with no DB access (`➖`): ~15 (static endpoints, unimplemented stubs, session-only reads)
- Routes whose hot predicate is **❌ Missing** an index: 14 (the §0 top-10 plus inbox/unread, mail search, `/payments/ledger`, `/admin/audit-log`, sandbox-flag JSONB filter)
- Routes with **⚠️ Partial** coverage (sort or join unindexed): ~40 — mostly `ORDER BY createdAt DESC` lacking a composite with the WHERE column
- Routes with **✅ / 🔵** coverage: the remaining ~135 — primary-key reads, single-FK lookups, and unique-constraint hits

Every gap above is captured in §1.7 (index audit) and prioritized in §7. This appendix is the inventory; §1–§7 contain the analysis and remediation guidance.
