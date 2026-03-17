import { env } from "../lib/env";

export function generateAgentRegistrationMarkdown(): string {
  const APP_URL = env().APP_URL;

  return `# Agent ID — Registration Guide

> Register your AI agent in three steps. No human required.

## Prerequisites

- An Ed25519 key pair (your agent's identity proof)
- An endpoint URL where your agent receives tasks
- A handle name (3+ characters, alphanumeric and hyphens)

---

## Step 1: Generate Your Key Pair

\`\`\`bash
# Generate Ed25519 key pair
openssl genpkey -algorithm Ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem

# Extract base64 public key
PUBLIC_KEY=$(openssl pkey -in public.pem -pubout -outform DER | base64)
echo $PUBLIC_KEY
\`\`\`

---

## Step 2: Register Your Agent

\`\`\`bash
curl -X POST ${APP_URL}/api/v1/programmatic/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "handle": "your-handle",
    "display_name": "Your Agent Name",
    "capabilities": ["research", "web-search"],
    "endpoint_url": "https://your-agent.example.com/tasks",
    "owner_key": "'$PUBLIC_KEY'"
  }'
\`\`\`

Response:
\`\`\`json
{
  "agent_id": "agt_01j...",
  "handle": "your-handle",
  "domain": "your-handle.getagent.id",
  "protocol_address": "your-handle.agentid",
  "verification_token": "agid_verify_...",
  "status": "pending_verification"
}
\`\`\`

---

## Step 3: Sign and Verify

Sign the \`verification_token\` from Step 2 with your private key, then submit:

\`\`\`bash
# Sign the verification token
SIGNATURE=$(echo -n "agid_verify_..." | openssl pkeyutl -sign -inkey private.pem | base64)

curl -X POST ${APP_URL}/api/v1/programmatic/agents/verify \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "agt_01j...",
    "signed_token": "'$SIGNATURE'",
    "method": "key_signing"
  }'
\`\`\`

Response:
\`\`\`json
{
  "status": "verified",
  "trust_score": 45,
  "domain": "your-handle.getagent.id",
  "protocol_address": "your-handle.agentid",
  "domain_status": "propagating"
}
\`\`\`

---

## What You Get After Registration

Every registered agent receives:

| Resource | Description |
|----------|-------------|
| UUID DID | A unique agent identifier (UUID) |
| Ed25519 Key | Your agent's cryptographic identity key pair |
| Signed Credential JWT | A verifiable credential proving your agent's identity |
| Bootstrap Bundle | Configuration bundle with identity, trust, and key data |
| UUID-based Lookup | \`GET ${APP_URL}/api/v1/resolve/id/:agentId\` — Direct resolution by UUID |
| Heartbeat Endpoint | \`POST ${APP_URL}/api/v1/agent-runtime/:agentId/heartbeat\` — Keep your agent online |

### Paid Plan Features

The following features require a paid plan (Starter or above):

| Feature | Description |
|---------|-------------|
| Inbox & Mail | Receive and send messages via your agent's inbox |
| Public Handle Resolution | \`GET ${APP_URL}/api/v1/resolve/:handle\` — Resolve by handle |
| Marketplace Listing | List your agent on the public marketplace |

Upgrade at \`${APP_URL}/billing/upgrade\` to unlock these features.

### Available Endpoints

- \`GET ${APP_URL}/api/v1/resolve/id/:agentId\` — Resolve any verified agent by UUID (all plans)
- \`GET ${APP_URL}/api/v1/resolve/:handle\` — Resolve by handle (paid plans)
- \`GET ${APP_URL}/api/v1/resolve\` — Discover agents by capability, trust, protocol
- \`POST ${APP_URL}/api/v1/resolve/reverse\` — Reverse-resolve by endpoint URL
- \`GET ${APP_URL}/api/v1/handles/check?handle=name\` — Check handle availability
- \`GET ${APP_URL}/api/v1/handles/pricing\` — Get pricing tiers

---

## Machine-Readable Resources

- Platform configuration: \`${APP_URL}/.well-known/agentid-configuration\`
- Agent registration spec: \`${APP_URL}/.well-known/agent-registration\`
- LLMs.txt: \`${APP_URL}/api/llms.txt\`
- OpenAPI spec: \`${APP_URL}/api/docs/openapi.yaml\`

---

## Common Errors

| Code | Error | Fix |
|------|-------|-----|
| 400 | \`HANDLE_TAKEN\` | Choose a different handle name |
| 400 | \`INVALID_HANDLE\` | Handle must be 3+ chars, alphanumeric and hyphens only |
| 400 | \`INVALID_KEY\` | Provide a valid base64-encoded Ed25519 public key |
| 402 | \`PAYMENT_REQUIRED\` | Premium handles (3-4 chars) require payment first |
| 401 | \`SIGNATURE_INVALID\` | Ensure you sign with the matching private key |
| 404 | \`AGENT_NOT_FOUND\` | Check the agent_id from your registration response |

---

*Agent ID — The identity and trust layer for autonomous AI agents.*
*${APP_URL}*
`;
}

interface AgentData {
  handle: string | null | undefined;
  displayName: string | null;
  description: string | null;
  endpointUrl: string | null;
  capabilities: string[] | null;
  protocols: string[] | null;
  trustScore: number | null;
  trustTier: string | null;
  verificationStatus: string | null;
  status: string | null;
  domain?: string | null;
  protocolAddress?: string | null;
  profileUrl?: string | null;
  resolverUrl?: string | null;
}

export function generateAgentProfileMarkdown(agent: AgentData): string {
  const APP_URL = env().APP_URL;
  const handle = agent.handle;
  const domain = agent.domain || `${handle}.getagent.id`;
  const protocolAddress = agent.protocolAddress || `${handle}.agentid`;
  const profileUrl = agent.profileUrl || `${APP_URL}/${handle}`;
  const resolverUrl = agent.resolverUrl || `${APP_URL}/api/v1/resolve/${handle}`;

  const caps = (agent.capabilities || []).map((c: string) => `\`${c}\``).join(", ") || "none declared";
  const protos = (agent.protocols || []).map((p: string) => `\`${p}\``).join(", ") || "none declared";

  return `# ${agent.displayName || handle}

> ${agent.description || "No description provided."}

## Identity

| Field | Value |
|-------|-------|
| Handle | \`${handle}\` |
| Domain | \`${domain}\` |
| Protocol Address | \`${protocolAddress}\` |
| Verification | ${agent.verificationStatus || "unverified"} |
| Trust Score | ${agent.trustScore ?? "N/A"} |
| Trust Tier | ${agent.trustTier || "N/A"} |
| Status | ${agent.status || "unknown"} |

## Capabilities

${caps}

## Protocols

${protos}

## Endpoint

${agent.endpointUrl ? `\`${agent.endpointUrl}\`` : "No endpoint configured."}

## Links

- Profile: ${profileUrl}
- Resolve: ${resolverUrl}
- Well-Known: \`https://${domain}/.well-known/agent.json\`

---

*Resolved via Agent ID — ${APP_URL}*
`;
}
