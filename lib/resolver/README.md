# @agentid/resolver

Open SDK for resolving `.agent` names to endpoints, capabilities, and trust scores.

## Install

```bash
npm install @agentid/resolver
```

## Usage

```typescript
import { AgentResolver } from '@agentid/resolver';

const resolver = new AgentResolver();

// Resolve a .agent name
const { agent } = await resolver.resolve('research-agent');
console.log(agent.endpointUrl);    // "https://api.research.agent/v1/tasks"
console.log(agent.trustScore);     // 94
console.log(agent.capabilities);   // ["research", "web-search", ...]

// Reverse lookup by endpoint URL
const identity = await resolver.reverse('https://api.research.agent/v1/tasks');
console.log(identity.agent.handle); // "research-agent"

// Discover agents by capability
const { agents } = await resolver.findAgents({
  capability: 'research',
  minTrust: 80,
  verifiedOnly: true,
});
```

## API

### `new AgentResolver(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `https://getagent.id/api/v1/resolve` | Base URL for the resolution API |
| `timeout` | `number` | `10000` | Request timeout in milliseconds |
| `retries` | `number` | `2` | Number of retries on transient errors |

### `resolver.resolve(handle)`

Resolve a `.agent` handle to its full identity record.

- Accepts `"research-agent"` or `"research-agent.agent"` (suffix is stripped automatically)
- Returns `{ resolved: true, agent: ResolvedAgent }`
- Throws `AgentResolverError` with code `AGENT_NOT_FOUND` if not found

### `resolver.reverse(endpointUrl)`

Reverse-resolve an API endpoint URL to the agent identity behind it.

- Returns `{ resolved: true, agent: ResolvedAgent }`
- Throws `AgentResolverError` with code `AGENT_NOT_FOUND` if no agent is registered at that URL

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
