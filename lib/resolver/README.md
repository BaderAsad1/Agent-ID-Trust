# @agentid/resolver

Open SDK for resolving `.agentid` names to endpoints, capabilities, and trust scores.

## Install

```bash
npm install @agentid/resolver
```

## Handle format

The canonical Agent ID address format is `<handle>.agentid` (e.g. `research-agent.agentid`). The resolver accepts both the canonical form and the bare handle — the `.agentid` suffix is stripped automatically before the API call.

```
research-agent.agentid   ← canonical protocol address
research-agent            ← accepted (suffix added implicitly)
```

## Usage

```typescript
import { AgentResolver } from '@agentid/resolver';

const resolver = new AgentResolver();

// Resolve a canonical .agentid address
const { agent } = await resolver.resolve('research-agent.agentid');
console.log(agent.endpointUrl);    // "https://api.example.com/v1/tasks"
console.log(agent.trustScore);     // 94
console.log(agent.capabilities);   // ["research", "web-search", ...]

// Multi-chain wallet data
console.log(agent.addresses);      // { "base-mainnet": "0x..." }
console.log(agent.wallets);        // [{ type: "mpc", network: "base-mainnet", address: "0x..." }]
console.log(agent.owsWallets);     // { evm: ["eip155:8453:0x..."], tron: [], solana: [] }
console.log(agent.chainPresence);  // { base: { tokenId, txHash, mintedAt, custodian } }

// Reverse lookup by endpoint URL
const identity = await resolver.reverse('https://api.example.com/v1/tasks');
console.log(identity.agent.handle); // "research-agent"

// Discover agents by capability
const { agents } = await resolver.findAgents({
  capability: 'research',
  minTrust: 80,
  verifiedOnly: true,
});
```

## How resolution works

`resolve()` uses a two-phase lookup:

1. **Local in-memory cache** — if the handle was resolved within the last 5 minutes (configurable via `cacheTtl`), the cached result is returned immediately without an API call.
2. **API fallback** — on a cache miss, a request is made to the Agent ID resolution API and the result is stored in the cache for future calls.

`reverse()` and `findAgents()` always call the API (not cached). On transient failures (HTTP 429, 502, 503, 504) any API call is automatically retried with exponential back-off (500 ms, then 1 500 ms).

## Resolution method

All DID resolution is currently **off-chain only**, served via the Agent ID REST API (`GET /api/v1/resolve/:handle`). On-chain credential anchoring (ERC-8004) is on the roadmap but not yet active.

**Subdomain resolution** (e.g., `research-agent.getagent.id`) is not yet active because wildcard SSL has not been configured. Until then, use the API endpoint `GET /api/v1/resolve/:handle` as the authoritative resolution path. The `domain` field in resolution responses reflects the intended subdomain but does not resolve via HTTPS at this time.

## Multi-chain Resolution

The resolve response includes multi-chain wallet data:

- **`addresses`** — map of network → address for all known wallet addresses (e.g. `{ "base-mainnet": "0x..." }`)
- **`wallets`** — array of MPC wallet entries with `type`, `network`, `address`, and `custodian`
- **`owsWallets`** — OWS-registered accounts grouped by chain family: `{ evm: [...], tron: [...], solana: [...] }` — each entry is a CAIP-10 formatted string (e.g. `eip155:8453:0x...`)
- **`chainPresence`** — on-chain NFT presence data keyed by chain name (e.g. `base`, `tron`) with `tokenId`, `txHash`, `mintedAt`, and `custodian`
- **`status`** — reflects the handle lifecycle status: `active`, `grace_period`, or `suspended`

### Chain filter

Use `?chain=base` or `?chain=tron` to return chain-specific data only.

### CAIP-10 format

Use `?format=caip` to return wallet addresses in CAIP-10 format (e.g. `eip155:8453:0x...` instead of `0x...`).

## Reverse Address Resolution

Look up all handles associated with a blockchain address:

```
GET /api/v1/resolve/address/{address}
```

Accepts:
- **EVM addresses** — `0x` prefix, 40 hex chars
- **Tron addresses** — `T` prefix, 34 base58 chars
- **Solana addresses** — base58, 32–44 chars

Returns:
```json
{
  "address": "0x...",
  "addressType": "evm",
  "handles": [
    {
      "handle": "my-agent",
      "agentId": "uuid",
      "relationship": "mpc_wallet",
      "resolveUrl": "https://getagent.id/api/v1/resolve/my-agent"
    }
  ],
  "total": 1
}
```

`relationship` values:
- `nft_owner` — address is the on-chain NFT owner
- `mpc_wallet` — address is the agent's Coinbase MPC wallet
- `ows_registered` — address is in the agent's OWS-registered CAIP-10 accounts

## OWS Wallet Registration

Agents can register Open Wallet Standard (OWS) accounts via their API key:

```
POST /api/v1/agents/{agentId}/wallets/ows
X-Agent-Key: aid_...

{
  "walletId": "my-wallet-id",
  "accounts": [
    "eip155:8453:0x...",
    "tron:mainnet:T...",
    "solana:mainnet:..."
  ]
}
```

- Requires agent API key authentication via `X-Agent-Key` header
- `accounts` must be valid CAIP-10 format: `{namespace}:{reference}:{address}`
- Maximum 20 accounts per registration
- Replaces any prior OWS registration for this agent (upsert)
- Returns `{ registered, agentId, walletId, accountCount, resolveUrl }`

Supported namespaces:
- `eip155` — EVM chains (Ethereum, Base, Polygon, etc.)
- `tron` — Tron network
- `solana` — Solana network

## API

### `new AgentResolver(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `https://getagent.id/api/v1/resolve` | Base URL for the resolution API |
| `timeout` | `number` | `10000` | Request timeout in milliseconds |
| `retries` | `number` | `2` | Number of retries on 429/5xx transient errors |
| `cacheTtl` | `number` | `300000` | In-memory cache TTL in milliseconds (5 min). Set to `0` to disable caching |

### `resolver.resolve(handle)`

Resolve a `.agentid` handle to its full identity record.

- Accepts `"research-agent"` or `"research-agent.agentid"` (suffix is stripped automatically)
- Returns `{ resolved: true, agent: ResolvedAgent }`
- Throws `AgentResolverError` with code `AGENT_NOT_FOUND` if not found

### `resolver.reverse(endpointUrl)`

Reverse-resolve an API endpoint URL to the agent identity behind it.

- Returns `{ resolved: true, agent: ResolvedAgent }`
- Throws `AgentResolverError` with code `AGENT_NOT_FOUND` if no agent is registered at that URL

### `resolver.invalidate(handle)`

Remove a single handle from the local cache, forcing the next `resolve()` call to hit the API.

### `resolver.clearCache()`

Flush the entire local cache.

### `resolver.findAgents(options?)`

Discover agents by capability, trust score, and other filters.

| Option | Type | Description |
|--------|------|-------------|
| `capability` | `string` | Filter by capability (e.g., `"research"`) |
| `minTrust` | `number` | Minimum trust score (0-100) |
| `protocol` | `string` | Filter by protocol support |
| `verifiedOnly` | `boolean` | Only return verified agents |
| `limit` | `number` | Max results (default: 50, max: 100) |
| `offset` | `number` | Pagination offset |

Returns `{ agents: ResolvedAgent[], total: number, limit: number, offset: number }`

## License

MIT
