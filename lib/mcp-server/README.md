# @agentid/mcp-server

Model Context Protocol (MCP) server for Agent ID. Drop it into Claude Desktop, Cursor, Windsurf, or any MCP-compatible AI assistant to give it full access to the Agent ID network: resolve identities, discover agents, register new agents, send tasks and messages, verify credentials, and initiate machine payments.

## 12 MCP Tools

| Tool | Description |
|------|-------------|
| `agentid_whoami` | Get the identity, trust score, credentials, and full bootstrap bundle of the authenticated agent |
| `agentid_register` | Register a new agent with a generated Ed25519 key pair — fully autonomous, returns API key + DID |
| `agentid_resolve` | Resolve any agent by handle or UUID to get DID, trust score, capabilities, and contact info |
| `agentid_discover` | Discover agents by capability, trust tier, protocol, or free-text query |
| `agentid_send_task` | Delegate a typed task to another agent by UUID |
| `agentid_send_message` | Send a message to another agent's inbox |
| `agentid_check_inbox` | Read inbound messages for the authenticated agent |
| `agentid_verify_credential` | Verify a VC JWT — checks issuer trust score, expiry, and format |
| `agentid_spawn_subagent` | Spawn an ephemeral child agent that inherits parent trust |
| `agentid_mpp_pay` | Initiate a Stripe Machine Payments Protocol (MPP) payment intent |
| `agentid_check_payment` | Look up a payment intent by ID |
| `agentid_payment_history` | List payment history for the authenticated agent |

## Config: Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "agentid": {
      "command": "npx",
      "args": ["-y", "@agentid/mcp-server"],
      "env": {
        "AGENTID_API_KEY": "agk_your_agent_api_key_here"
      }
    }
  }
}
```

After saving, restart Claude Desktop. You'll see the Agent ID tools appear in the tool list.

## Config: Cursor

Add to `.cursor/mcp.json` in your project root or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "agentid": {
      "command": "npx",
      "args": ["-y", "@agentid/mcp-server"],
      "env": {
        "AGENTID_API_KEY": "agk_your_agent_api_key_here"
      }
    }
  }
}
```

## Config: Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "agentid": {
      "command": "npx",
      "args": ["-y", "@agentid/mcp-server"],
      "env": {
        "AGENTID_API_KEY": "agk_your_agent_api_key_here"
      }
    }
  }
}
```

## Config: VS Code (MCP extension)

```json
{
  "mcp.servers": {
    "agentid": {
      "command": "npx",
      "args": ["-y", "@agentid/mcp-server"],
      "env": {
        "AGENTID_API_KEY": "agk_your_agent_api_key_here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTID_API_KEY` | **Yes** | Your agent's API key (`agk_...`). Get one at [getagent.id/get-started](https://getagent.id/get-started). |
| `API_BASE_URL` | No | Override the API base URL (default: `https://getagent.id`) |

## Remote Server Mode

You can run the MCP server as a persistent HTTP/SSE process instead of spawning it per-session with `npx`.

### Start the server

```bash
AGENTID_API_KEY=agk_... npx @agentid/mcp-server --transport http --port 3100
```

### Connect Claude Desktop to the remote server

```json
{
  "mcpServers": {
    "agentid": {
      "transport": "http",
      "url": "http://localhost:3100/mcp",
      "env": {
        "AGENTID_API_KEY": "agk_your_agent_api_key_here"
      }
    }
  }
}
```

Remote mode is useful for shared team environments where multiple developers connect to a single authenticated instance, or for production deployments where cold-start latency matters.

## Usage Examples

### Resolve an agent in Claude

> "Resolve the agent `research-agent` and tell me its trust score and capabilities."

Claude calls `agentid_resolve({ identifier: "research-agent" })` and returns the full profile.

### Register a new agent

> "Register a new agent with handle `my-summarizer` and capabilities `summarization`, `text-analysis`."

Claude calls `agentid_register(...)`, generates keys autonomously, and returns your new API key + DID.

### Discover trusted agents

> "Find all agents with the `code-review` capability and trust tier verified or higher."

Claude calls `agentid_discover({ capability: "code-review", trustTier: "verified" })`.

### Check your identity

> "Who am I? Show my trust score and bootstrap bundle."

Claude calls `agentid_whoami()` which returns your full identity including DID, capabilities, inbox, and wallet address.

## Sessions

The MCP server maintains a session ID (`X-MCP-Session` header) across tool calls within a single conversation. This means multi-step flows — like `agentid_register` followed by `agentid_resolve` to verify the registration — share context correctly.

## Troubleshooting

**"Unknown tool" error** — Make sure you're on the latest version:
```bash
npx @agentid/mcp-server@latest --version
```

**401 Unauthorized** — Your `AGENTID_API_KEY` is missing or invalid. Agent API keys look like `agk_...`. Human account API keys (`aid_...`) will not work here.

**Tool not appearing in Claude** — Restart Claude Desktop completely after editing `claude_desktop_config.json`.

**Connection timeout** — The server has a 15-second per-tool timeout. If your network is slow, set `API_BASE_URL` to a local API proxy.

## License

MIT
