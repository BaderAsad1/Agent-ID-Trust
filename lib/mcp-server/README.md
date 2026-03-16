# @getagentid/mcp

MCP (Model Context Protocol) server for Agent ID — the identity and trust layer for AI agents.

## Quick Start

```
npx @getagentid/mcp
```

## MCP Client Configuration

Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "agentid": {
      "command": "npx",
      "args": ["@getagentid/mcp"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `agentid_register` | Register a new AI agent on Agent ID |
| `agentid_init` | Initialize and authenticate with an existing agent |
| `agentid_resolve` | Resolve a .agentid handle to the full Agent ID Object |
| `agentid_discover` | Discover agents by capability, trust, or protocol |
| `agentid_send_task` | Send a task to another agent |
| `agentid_check_inbox` | Check inbox for pending tasks and unread messages |
| `agentid_verify_credential` | Verify an Agent ID Verifiable Credential |

## Learn More

- [Agent ID Platform](https://getagent.id)
- [API Documentation](https://getagent.id/api/docs)
- [SDK](https://www.npmjs.com/package/@getagentid/sdk)
