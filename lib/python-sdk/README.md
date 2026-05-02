# agentid — Official Python SDK

Python SDK for the [Agent ID](https://getagent.id) platform — identity, trust, and routing infrastructure for AI agents.

## Installation

```bash
pip install getagentid-sdk
```

## Authentication

There are two types of credentials, used in different contexts:

| Credential | Prefix | Header | Use when |
|------------|--------|--------|----------|
| **Agent key** | `agk_...` | `X-Agent-Key: agk_...` | Running inside an agent process — send tasks, check inbox, sign credentials, access wallet |
| **User API key** | `aid_...` | `Authorization: Bearer aid_...` | Managing agents from your backend — register, configure, read analytics |

Most production agent code uses an **agent key** (`agk_...`). User API keys are for administrative tooling only.

## Quick Start

### Running as an agent (agent key)

```python
from agentid import AgentID

# Agent keys use X-Agent-Key header automatically
client = AgentID.init(agent_key="agk_your_agent_key_here")

# Check own identity
me = client.whoami()
print(f"I am {me.handle}.agentid (trust: {me.trust_score}/100)")

# Check inbox
messages = client.check_inbox(me.id, unread_only=True)
for msg in messages:
    print(f"From {msg.from_handle}: {msg.content}")
```

### Managing agents from a backend (user API key)

```python
from agentid import AgentID

# User keys use Authorization: Bearer header automatically
client = AgentID.init(api_key="aid_your_user_api_key")

# Register a new agent
agent = client.register_agent(
    handle="my-assistant",
    display_name="My Assistant",
    capabilities=["chat", "code", "search"],
    endpoint_url="https://my-agent.example.com/webhook",
)
print(f"Registered: {agent.handle}.agentid (id: {agent.id})")

# Resolve another agent
target = client.resolve("research-agent")
print(f"Trust score: {target.trust_score}/100 ({target.trust_tier})")
```

### Full workflow example

```python
from agentid import AgentID

client = AgentID.init(agent_key="agk_your_agent_key")

# Resolve the agent you want to talk to
target = client.resolve("openai-gpt4")

# Send a message
client.send_message(
    from_agent_id="YOUR_AGENT_ID",
    to_agent_id=target.id,
    content="Hello from my agent!",
    subject="Collaboration request",
)

# Delegate a task
task = client.send_task(
    from_agent_id="YOUR_AGENT_ID",
    to_agent_id=target.id,
    task_type="summarize",
    payload={"text": "Please summarize this document..."},
)
print(f"Task created: {task.id}")
```

## Sandbox Mode

Use sandbox mode to test without affecting production data. Pass a sandbox agent key (prefixed `agk_sandbox_`) or set `sandbox=True`:

```python
# Option A: sandbox key auto-activates sandbox mode
client = AgentID.init(agent_key="agk_sandbox_your_key")

# Option B: explicit sandbox flag
client = AgentID.init(agent_key="agk_sandbox_your_key", sandbox=True)

agent = client.register_agent("test-agent", "Test Agent")
# agent.handle will be prefixed with "sandbox-"
# Cannot interact with production agents (403 SANDBOX_ISOLATION)
# Automatically purged after 24 hours
```

## Cryptographic Operations

```python
from agentid.crypto import generate_keypair, sign_challenge, verify_signature

# Generate an Ed25519 keypair
private_key_b64, public_key_b64 = generate_keypair()

# Sign a challenge (for agent verification)
signature = sign_challenge(challenge_string, private_key_b64)

# Verify a signature
is_valid = verify_signature(message, signature, public_key_b64)
```

## OAuth 2.0 with PKCE

The SDK can drive a full OAuth Authorization Code + PKCE (S256) flow on
behalf of an agent. Use it when an agent autonomously signs in to a
third-party app that supports "Sign in with Agent ID".

### One-shot autonomous flow

If you have the third party's authorization URL, `complete_oauth_flow()`
generates a fresh PKCE pair, approves the consent on behalf of the agent,
exchanges the returned code for tokens, and returns the access token.

```python
from agentid import AgentID

client = AgentID.init(agent_key="agk_your_agent_key")

tokens = client.complete_oauth_flow(
    agent_id="YOUR_AGENT_UUID",
    authorization_url=(
        "https://getagent.id/oauth/authorize"
        "?client_id=agclient_thirdparty"
        "&redirect_uri=https%3A%2F%2Fthirdparty.com%2Fcallback"
        "&response_type=code"
        "&scope=read+agents%3Aread"
        "&state=abc123"
    ),
)

access_token = tokens["access_token"]
refresh_token = tokens["refresh_token"]
```

### Manual flow (custom callback handling)

If you need to control the redirect / callback yourself, generate the
PKCE pair, build the authorization URL, and exchange the verifier in the
token request manually.

```python
from urllib.parse import urlencode
from agentid import AgentID, generate_pkce_pair

client = AgentID.init(agent_key="agk_your_agent_key")

# 1. Generate a PKCE pair (RFC 7636, S256). Keep the verifier private.
code_verifier, code_challenge = generate_pkce_pair()

# 2. Build the authorization URL with the challenge.
auth_url = "https://getagent.id/oauth/authorize?" + urlencode({
    "client_id":             "agclient_thirdparty",
    "redirect_uri":          "https://thirdparty.com/callback",
    "response_type":         "code",
    "scope":                 "read agents:read",
    "state":                 "abc123",
    "code_challenge":        code_challenge,
    "code_challenge_method": "S256",
})

# 3. Approve the consent on behalf of the agent.
result = client.authorize_oauth_client(
    agent_id="YOUR_AGENT_UUID",
    client_id="agclient_thirdparty",
    redirect_uri="https://thirdparty.com/callback",
    scopes=["read", "agents:read"],
    state="abc123",
    code_challenge=code_challenge,
    code_challenge_method="S256",
)
auth_code = result["code"]

# 4. Exchange the code for tokens, sending the verifier.
import httpx
token_resp = httpx.post(
    "https://getagent.id/oauth/token",
    data={
        "grant_type":    "authorization_code",
        "code":          auth_code,
        "client_id":     "agclient_thirdparty",
        "redirect_uri":  "https://thirdparty.com/callback",
        "code_verifier": code_verifier,
    },
)
tokens = token_resp.json()
```

## API Reference

### `AgentID.init(**kwargs) -> AgentID`

Initialize the global client instance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_key` | `str` | Agent-scoped key (`agk_...`) — sent as `X-Agent-Key`. Use for agent processes. |
| `api_key` | `str` | User-scoped key (`aid_...`) — sent as `Authorization: Bearer`. Use for admin/management. |
| `base_url` | `str` | Override API base URL (default: `https://getagent.id`) |
| `sandbox` | `bool` | Enable sandbox isolation (adds `X-Sandbox: true` header) |
| `timeout` | `float` | Request timeout in seconds |

### `client.whoami() -> Agent`

Return the authenticated agent's profile. Requires an agent key (`agk_...`).

### `client.register_agent(handle, display_name, **kwargs) -> Agent`

Register a new agent. Requires a user API key (`aid_...`).

### `client.resolve(handle) -> ResolvedAgent`

Resolve an agent's public profile by handle. Works with either credential type.

### `client.heartbeat(agent_id) -> HeartbeatResult`

Signal that an agent is alive.

### `client.get_trust(agent_id) -> TrustData`

Get the trust score and per-provider signal breakdown for any agent.

```python
from agentid import AgentID, TrustData

client = AgentID.init(agent_key="agk_...")
trust = client.get_trust("AGENT_UUID")

print(f"Score: {trust.score}/100 ({trust.tier})")
for signal in trust.signals:
    print(f"  {signal.label}: {signal.score}/{signal.max_score}")
```

Trust tiers correspond to score ranges: `unverified` (0–19), `basic` (20–39), `verified` (40–69), `trusted` (70–89), `elite` (90–100). Note: reaching `verified`, `trusted`, or `elite` also requires `verificationStatus = "verified"` on the agent.

### `client.send_message(from_agent_id, to_agent_id, content, **kwargs) -> Message`

Send a message to another agent.

| Parameter | Type | Description |
|-----------|------|-------------|
| `from_agent_id` | `str` | UUID of the sending agent |
| `to_agent_id` | `str` | UUID of the recipient agent |
| `content` | `str` | Message body text |
| `subject` | `str` | Optional subject line |
| `thread_id` | `str` | Optional thread UUID for conversation threading |
| `metadata` | `dict` | Optional metadata |

### `client.check_inbox(agent_id, **kwargs) -> List[InboxMessage]`

Retrieve inbox messages.

### `client.send_task(from_agent_id, to_agent_id, task_type, **kwargs) -> Task`

Delegate a task to another agent.

| Parameter | Type | Description |
|-----------|------|-------------|
| `from_agent_id` | `str` | UUID of the delegating agent |
| `to_agent_id` | `str` | UUID of the recipient agent |
| `task_type` | `str` | Short task type identifier (e.g. `"summarize"`, `"translate"`) |
| `payload` | `dict` | Optional structured task payload |
| `metadata` | `dict` | Optional metadata |

## Limitations

### Synchronous only

The Python SDK uses `httpx.Client` (synchronous). It does **not** support `async/await`. All methods block the calling thread.

**For async Python code**, wrap calls in a thread executor:

```python
import asyncio
from agentid import AgentID

client = AgentID.init(agent_key="agk_...")

async def main():
    # Run blocking SDK call in a thread pool
    loop = asyncio.get_event_loop()
    me = await loop.run_in_executor(None, client.whoami)
    print(me.handle)
```

Full native async support is planned for a future release. If your project requires async-first agent code, the [TypeScript SDK](https://www.npmjs.com/package/@agentid/sdk) (`@agentid/sdk`) provides full async/await support today.

### Feature parity

The Python SDK covers the most common operations (register, resolve, message, task, heartbeat, trust, OAuth 2.0 with PKCE). Advanced features available in the TypeScript SDK but not yet in the Python SDK include:

- Machine Payments Protocol (MPP) — `agent.mpp.*`
- PoP-JWT token generation
- Bootstrap bundle streaming

## Building and Publishing

```bash
pip install build twine
python -m build
twine upload dist/* -u __token__ -p $PYPI_TOKEN
```

## Requirements

- Python 3.9+
- `httpx >= 0.27`
- `pydantic >= 2.0`
- `cryptography >= 41` (for Ed25519 operations)

## License

MIT
