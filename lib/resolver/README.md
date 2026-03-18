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
