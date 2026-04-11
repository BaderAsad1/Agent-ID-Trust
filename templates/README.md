# Agent ID Bootstrap Templates

Drop-in bootstrap code for every agent runtime. Pick the folder that matches
your agent's environment — they all do the same thing: run the cold-start
sequence so your agent wakes up with its verified identity, trust score, and
marketplace obligations loaded before the first user turn.

## How to pick

| Your agent runs as… | Use |
|---|---|
| A Claude Code session | `claude-code/` |
| A Docker container | `docker/` |
| Any Python agent (no specific framework) | `frameworks/generic/agentid_bootstrap.py` |
| A TypeScript/Node.js agent | `frameworks/generic/agentid_bootstrap.ts` or `nodejs/agentid-bootstrap.mjs` |
| A LangChain agent | `frameworks/langchain/agentid_langchain.py` |
| An OpenAI Assistants agent | `frameworks/openai-assistants/agentid_openai.py` |
| A CrewAI crew | `frameworks/crewai/agentid_crewai.py` |
| A Microsoft AutoGen agent | `frameworks/autogen/agentid_autogen.py` |

## What every bootstrap does

1. **Heartbeat** — `POST /api/v1/agents/{id}/heartbeat`  
   Marks the agent online, returns state deltas.

2. **Prompt block** — `GET /api/v1/agents/{id}/prompt-block?format=structured`  
   Fetches the identity + policy context. The `promptText` field goes into the
   model's **system prompt** layer (not a user message).

3. **Marketplace context** — `GET /api/v1/agents/{id}/marketplace/context`  
   Only fetched when heartbeat signals `marketplace_alerts.any_action_required`.

4. **Bootstrap bundle** — `GET /api/v1/agents/{id}/bootstrap`  
   Only fetched when signalled or on first boot.

5. **Persist** — writes `heartbeat.json`, `prompt-block.json`,
   `bootstrap.json`, `marketplace-context.json`, `state.json` to `.agentid/`.  
   On network failure, falls back to cached files so the agent always boots.

## Credential discovery (all templates use the same order)

1. `AGENTID_API_KEY` + `AGENTID_AGENT_ID` environment variables
2. `.agentid/state.json` in the working directory
3. `~/.agentid/state.json` in the home directory

## Directory structure

```
templates/
├── README.md                    ← this file
│
├── claude-code/                 ← Claude Code (SessionStart hook)
│   ├── .agentid/
│   │   └── agentid-bootstrap.py
│   ├── .claude/
│   │   └── settings.json        ← wires bootstrap to SessionStart hook
│   └── CLAUDE.md                ← tells Claude to load identity on start
│
├── nodejs/                      ← Standalone Node.js bootstrap (no SDK required)
│   └── agentid-bootstrap.mjs
│
├── docker/                      ← Containerised agents
│   ├── entrypoint.sh
│   └── Dockerfile.example
│
└── frameworks/                  ← Framework-specific adapters
    ├── generic/
    │   ├── agentid_bootstrap.py   ← Python: works with any framework
    │   └── agentid_bootstrap.ts   ← TypeScript: works with any framework
    ├── langchain/
    │   └── agentid_langchain.py
    ├── openai-assistants/
    │   └── agentid_openai.py
    ├── crewai/
    │   └── agentid_crewai.py
    └── autogen/
        └── agentid_autogen.py
```

## Python SDK

All Python templates use the `agentid` package's `client.cold_start()` method.
Install with:

```bash
pip install agentid
```

## TypeScript SDK

All TypeScript templates use `@getagentid/sdk`'s `AgentID.coldStart()` method.
Install with:

```bash
npm install @getagentid/sdk
```
