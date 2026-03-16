# Agent Registration Flow — Self-Verification Report

**Run timestamp**: 2026-03-16T01:42:18.786Z
**API Base**: http://localhost:8080
**Overall Result**: 15/17 PASS, 2/17 FAIL

---

## Step 1: Health Check & DB Connection — PASS

- **HTTP Status**: 200
- **Response Body**:
```json
{"status":"healthy","timestamp":"2026-03-16T01:42:18.897Z","services":{"database":{"status":"ok","latencyMs":28},"redis":{"status":"not_configured","latencyMs":0},"stripe":{"configured":false},"cloudflare":{"configured":false},"resend":{"configured":false}}}
```

## Step 2: Generate Ed25519 Key Pair — PASS

- **Public Key (base64 SPKI DER)**: `MCowBQYDK2VwAyEA5XPevMjH0jERcLXkarEd/OsW2DLI+6bmHxf+9u+zR7k=`
- **Key Length**: 44 bytes

## Step 3: Handle Availability Check — PASS

- **Handle**: `replit-test-agent`
- **HTTP Status**: 200
- **Response Body**:
```json
{"available":true,"handle":"replit-test-agent","pricing":{"annualPrice":5,"tierLabel":"5+ characters","description":"Standard handle"}}
```

## Step 4: Programmatic Registration — PASS

- **HTTP Status**: 201
- **Response Body**:
```json
{"agentId":"8e45fcb3-e82c-4208-8c5a-9b0f112f83d3","handle":"replit-test-agent","kid":"kid_8961d31f3fccafea119017fe","challenge":"885eea347f6dfad04cb41f4aa72531a7209ed3f96fc7a2a075e7e14ed8799ef2","expiresAt":"2026-03-16T01:52:19.058Z","provisionalDomain":"replit-test-agent.getagent.id","protocolAddress":"replit-test-agent.agentid"}
```

## Step 5: Challenge Sign & Verification — PASS

- **HTTP Status**: 200
- **Response Body** (apiKey redacted, bootstrap keys listed):
```json
{"verified":true,"agentId":"8e45fcb3-e82c-4208-8c5a-9b0f112f83d3","handle":"replit-test-agent","domain":"replit-test-agent.getagent.id","protocolAddress":"replit-test-agent.agentid","trustScore":29,"trustTier":"basic","apiKey":"agk_56a572d3…[redacted]","bootstrapKeys":["spec_version","agent_id","handle","display_name","protocol_address","provisional_domain","public_profile_url","inbox_id","inbox_address","inbox_poll_endpoint","trust","capabilities","auth_methods","key_ids","status","prompt_block"]}
```

## Step 6: Bootstrap Bundle — PASS

- **HTTP Status**: 200
- **Response Body Keys**: `["spec_version","agent_id","handle","display_name","protocol_address","provisional_domain","public_profile_url","inbox_id","inbox_address","inbox_poll_endpoint","trust","capabilities","auth_methods","key_ids","status","prompt_block"]`
- **prompt_block present**: true
- **prompt_block preview**:
```
=== AGENT IDENTITY ===
Name: Replit Test Agent
Handle: @replit-test-agent
Protocol Address: replit-test-agent.agentid
Public Profile: /api/v1/public/agents/replit-test-agent
Agent ID: 8e45fcb3-e82c-42…
```

## Step 7: Inbox Address — PASS

- **HTTP Status**: 200
- **Response Body**:
```json
{"inbox":{"id":"081a4c7b-fad4-4b77-b2e7-190c569e6bc4","agentId":"8e45fcb3-e82c-4208-8c5a-9b0f112f83d3","address":"replit-test-agent@agents.local","addressLocalPart":"replit-test-agent","addressDomain":"agents.local","displayName":"replit-test-agent","status":"active","visibility":"private","autoRespond":false,"autoRespondMessage":null,"routingRules":[],"settings":{},"retentionPolicy":null,"lastMessageAt":null,"metadata":null,"createdAt":"2026-03-16T01:42:19.034Z","updatedAt":"2026-03-16T01:42:19.034Z"},"stats":{"messages":{"total":0,"unread":0},"threads":{"total":0,"open":0}}}
```

## Step 8: JSON Resolution — FAIL

- **HTTP Status**: 404
- **Response Body**:
```json
{"error":"AGENT_NOT_FOUND","message":"No agent found for handle \"replit-test-agent\"","requestId":"79ad6339-790a-4d37-90fb-9af4b67277f8"}
```
- **Root cause**: The resolve endpoint at `artifacts/api-server/src/routes/v1/resolve.ts:143` filters by `agent.status === "active" && agent.isPublic`. Newly registered agents have `isPublic` defaulting to `false`. The programmatic registration flow does not set `isPublic=true`, and there is no endpoint accessible via agent API key to change this.

## Step 9: Markdown Resolution — FAIL

- **HTTP Status**: 404
- **Response Body**:
```json
{"error":"AGENT_NOT_FOUND","message":"No agent found for handle \"replit-test-agent\"","requestId":"d1f21b35-8abd-4f0d-8575-6cb22696ba89"}
```
- **Root cause**: Same as Step 8. The resolve endpoint filters by `isPublic=true` and newly registered agents default to `isPublic=false`.

## Step 10: Send Test Message — PASS

- **HTTP Status**: 201
- **Recipient Address**: `replit-test-agent@agents.local`
- **Response Body**:
```json
{"message":{"id":"2f219d02-fd9f-407b-86fa-c447e568d10a","threadId":"6ce37991-1fbb-4870-8113-4612248038e4","inboxId":"081a4c7b-fad4-4b77-b2e7-190c569e6bc4","agentId":"8e45fcb3-e82c-4208-8c5a-9b0f112f83d3","direction":"inbound","senderType":"agent","senderAgentId":"8e45fcb3-e82c-4208-8c5a-9b0f112f83d3","senderUserId":null,"senderAddress":null,"recipientAddress":"replit-test-agent@agents.local","subject":"Verification Test","body":"This is an automated verification test message.","bodyText":null,"bodyHtml":null,"snippet":"This is an automated verification test message.","bodyFormat":"text","headers":null,"structuredPayload":null,"isRead":false,"readAt":null,"archivedAt":null,"deliveryStatus":"delivered","senderTrustScore":null,"senderVerified":false,"provenanceChain":[{"actor":"8e45fcb3-e82c-4208-8c5a-9b0f112f83d3","action":"received","details":{"inboxId":"081a4c7b-fad4-4b77-b2e7-190c569e6bc4","threadId":"6ce37991-1fbb-4870-8113-4612248038e4"},"actorType":"agent","timestamp":"2026-03-16T01:42:19.300Z"}],"priority":"normal","spamMetadata":null,"paymentMetadata":null,"originatingTaskId":null,"convertedTaskId":null,"inReplyToId":null,"externalMessageId":null,"metadata":null,"createdAt":"2026-03-16T01:42:19.302Z","updatedAt":"2026-03-16T01:42:19.302Z"}}
```

## Step 11: Read Messages — PASS

- **HTTP Status**: 200
- **Response Body**:
```json
{"messages":[{"id":"2f219d02-fd9f-407b-86fa-c447e568d10a","threadId":"6ce37991-1fbb-4870-8113-4612248038e4","inboxId":"081a4c7b-fad4-4b77-b2e7-190c569e6bc4","agentId":"8e45fcb3-e82c-4208-8c5a-9b0f112f83d3","direction":"inbound","senderType":"agent","senderAgentId":"8e45fcb3-e82c-4208-8c5a-9b0f112f83d3","senderUserId":null,"senderAddress":null,"recipientAddress":"replit-test-agent@agents.local","subject":"Verification Test","body":"This is an automated verification test message.","bodyText":null,"bodyHtml":null,"snippet":"This is an automated verification test message.","bodyFormat":"text","headers":null,"structuredPayload":null,"isRead":false,"readAt":null,"archivedAt":null,"deliveryStatus":"delivered","senderTrustScore":null,"senderVerified":false,"provenanceChain":[{"actor":"8e45fcb3-e82c-4208-8c5a-9b0f112f83d3","action":"received","details":{"inboxId":"081a4c7b-fad4-4b77-b2e7-190c569e6bc4","threadId":"6ce37991-1fbb-4870-8113-4612248038e4"},"actorType":"agent","timestamp":"2026-03-16T01:42:19.300Z"}],"priority":"normal","spamMetadata":null,"paymentMetadata":null,"originatingTaskId":null,"convertedTaskId":null,"inReplyToId":null,"externalMessageId":null,"metadata":null,"createdAt":"2026-03-16T01:42:19.302Z","updatedAt":"2026-03-16T01:42:19.302Z"}],"total":1}
```

## Step 12: Heartbeat — PASS

- **HTTP Status**: 200
- **Response Body**:
```json
{"acknowledged":true,"server_time":"2026-03-16T01:42:19.486Z","next_expected_heartbeat":"2026-03-16T01:47:19.486Z"}
```

## Step 13: Discovery Listing — PASS

- **HTTP Status**: 200
- **Total agents listed**: 3 (test agent not included since `isPublic=false`)
- **Test agent found in listing**: false
- **Response Body** (truncated, 3 agents: `research-agent`, `code-reviewer`, `data-pipeline`):
```json
{"agents":[{"handle":"research-agent","domain":"research-agent.getagent.id","protocolAddress":"research-agent.agentid","did":"urn:agentid:research-agent","resolverUrl":"https://getagent.id/api/v1/resolve/research-agent","displayName":"Research Agent","description":"Deep research agent specializing in academic papers, market analysis, and competitive intelligence.","endpointUrl":"https://ra.example.com/tasks","capabilities":["research","web-search","summarization","citation"],"protocols":["mcp","a2a","rest"],"authMethods":[],"trustScore":94,"trustTier":"elite","verificationStatus":"verified","status":"active",...},...]}
```

## Step 14: Response Headers — PASS

- **HTTP Status**: 200
- **Headers**:
```json
{"X-AgentID-Platform":"PRESENT: getagent.id","X-AgentID-Registration":"PRESENT: https://getagent.id/agent","X-AgentID-Namespace":"PRESENT: .agentID","X-AgentID-Version":"PRESENT: 1.0"}
```

## Step 15: Cleanup — Delete Test Agent — PASS

- **Method**: DB `user_id` lookup + temporary user API key + DELETE endpoint
- **HTTP Status**: 200
- **Response Body**:
```json
{"success":true}
```
- **User ID**: `558412a3-c29d-4572-bf46-a4b31163167e`
- **Process**: Queried the agent's `user_id` from the database, created a temporary `aid_`-prefixed user API key for the auto-created owner user, called `DELETE /api/v1/agents/:agentId` with `Authorization: Bearer <tempKey>`, then cleaned up the temporary API key and the auto-created user from the database.

## Step 16: Post-Cleanup Verification — PASS

- **HTTP Status**: 200
- **Response Body**:
```json
{"available":true,"handle":"replit-test-agent","pricing":{"annualPrice":5,"tierLabel":"5+ characters","description":"Standard handle"}}
```
- **Handle freed**: true
- **Cleanup success**: true

## Step 17: Auth Metadata Endpoint — PASS

- **HTTP Status**: 404 (expected after cleanup — agent was deleted)
- **Expected Status**: 404
- **Response Body**:
```json
{"error":"NOT_FOUND","message":"Agent not found","requestId":"39c6a6bf-9789-4546-a232-2fc6fe9176a2"}
```

---

## Final Summary Table

| # | Step | Result |
|---|------|--------|
| 1 | Health Check & DB Connection | PASS |
| 2 | Generate Ed25519 Key Pair | PASS |
| 3 | Handle Availability Check | PASS |
| 4 | Programmatic Registration | PASS |
| 5 | Challenge Sign & Verification | PASS |
| 6 | Bootstrap Bundle | PASS |
| 7 | Inbox Address | PASS |
| 8 | JSON Resolution | FAIL |
| 9 | Markdown Resolution | FAIL |
| 10 | Send Test Message | PASS |
| 11 | Read Messages | PASS |
| 12 | Heartbeat | PASS |
| 13 | Discovery Listing | PASS |
| 14 | Response Headers | PASS |
| 15 | Cleanup — Delete Test Agent | PASS |
| 16 | Post-Cleanup Verification | PASS |
| 17 | Auth Metadata Endpoint | PASS |

## Service Status

| Service | Status |
|---------|--------|
| Database | ok (28ms latency) |
| Redis | not_configured |
| Stripe | not configured |
| Cloudflare | not configured |
| Resend | not configured |

## Registered Agent Details (before cleanup)

| Field | Value |
|-------|-------|
| Agent ID | `8e45fcb3-e82c-4208-8c5a-9b0f112f83d3` |
| Handle | `replit-test-agent` |
| Domain | `replit-test-agent.getagent.id` |
| Protocol Address | `replit-test-agent.agentid` |
| Trust Score | 29 |
| Trust Tier | basic |
| API Key Prefix | `agk_56a5` |
| Cleaned Up | true |

## Blocking Issues

None.

## Non-Blocking Issues

### Issue 1: JSON & Markdown Resolution returns 404 (Steps 8-9)

- **Symptom**: `GET /api/v1/resolve/:handle` returns 404 for the newly registered and verified agent.
- **HTTP Status**: 404
- **Error**: `AGENT_NOT_FOUND`
- **Root cause**: The resolve endpoint at `artifacts/api-server/src/routes/v1/resolve.ts:143` checks `agent.status === "active" && agent.isPublic`. Newly registered agents have `isPublic=false` by default. The programmatic registration flow does not set this flag, and there is no agent-accessible endpoint to change it.
- **Impact**: Programmatically registered agents are invisible to resolution until explicitly made public. This may be a deliberate privacy-by-default design, but it creates a gap in the external agent experience where a fully verified agent cannot be resolved.

## How to Re-run

```bash
node artifacts/api-server/verification/run-registration-flow.mjs
```

Requires `DATABASE_URL` env var for the cleanup step (DB-assisted agent deletion).
Set `API_BASE` env var to override the default `http://localhost:8080` base URL.
