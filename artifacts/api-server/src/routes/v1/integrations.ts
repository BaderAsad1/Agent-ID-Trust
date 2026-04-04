import { Router } from "express";

const router = Router();

interface FrameworkGuide {
  name: string;
  slug: string;
  description: string;
  language: string;
  installCommand?: string;
  markdown: string;
}

const FRAMEWORK_GUIDES: Record<string, FrameworkGuide> = {
  langchain: {
    name: "LangChain",
    slug: "langchain",
    description:
      "Integrate Agent ID resolution into your LangChain agents and tools for identity-aware orchestration.",
    language: "typescript",
    installCommand: "npm install @agentid/resolver @langchain/openai langchain",
    markdown: `# LangChain Integration

Resolve \`.agentid\` names and discover agents directly from your LangChain pipelines.

## Install

\`\`\`bash
npm install @agentid/resolver @langchain/openai langchain
\`\`\`

## Quick Start

\`\`\`typescript
import { AgentResolver } from '@agentid/resolver';
import { ChatOpenAI } from '@langchain/openai';

const resolver = new AgentResolver();

// Resolve a .agentid name to get the endpoint
const { agent } = await resolver.resolve('research-agent');

// Use the resolved endpoint in your LangChain tool
const researchTool = {
  name: 'agent_id_research',
  description: \`Delegate research tasks to \${agent.displayName} (trust: \${agent.trustScore}/100)\`,
  func: async (query: string) => {
    const response = await fetch(agent.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: query }),
    });
    return response.json();
  },
};

// Find all research agents with high trust
const { agents } = await resolver.findAgents({
  capability: 'research',
  minTrust: 80,
  verifiedOnly: true,
});

console.log(\`Found \${agents.length} trusted research agents\`);

// Build your LangChain agent with .agentid-resolved tools
const model = new ChatOpenAI({ modelName: 'gpt-4' });
// ... create agent with researchTool
\`\`\`

## Key Concepts

- **Resolve before dispatch**: Always resolve the \`.agentid\` name to get the latest endpoint and trust score.
- **Trust-gated tools**: Check \`agent.trustScore\` before delegating sensitive tasks.
- **Dynamic discovery**: Use \`resolver.findAgents()\` to find the best agent for any capability at runtime.
`,
  },
  crewai: {
    name: "CrewAI",
    slug: "crewai",
    description:
      "Use Agent ID resolution in CrewAI crews to delegate tasks to verified, trusted agents.",
    language: "python",
    installCommand: "pip install crewai httpx",
    markdown: `# CrewAI Integration

Resolve \`.agentid\` names and discover agents from your CrewAI crews using the REST API.

## Install

\`\`\`bash
pip install crewai httpx
\`\`\`

## Quick Start

\`\`\`python
import httpx
from crewai import Agent, Task, Crew

RESOLVE_URL = "https://getagent.id/api/v1"

def resolve_agent(handle: str) -> dict:
    """Resolve a .agentid handle to its identity."""
    response = httpx.get(f"{RESOLVE_URL}/resolve/{handle}")
    response.raise_for_status()
    return response.json()["agent"]

def find_agents(capability: str, min_trust: int = 0) -> list:
    """Discover agents by capability."""
    response = httpx.get(f"{RESOLVE_URL}/agents", params={
        "capability": capability,
        "minTrust": min_trust,
    })
    response.raise_for_status()
    return response.json()["agents"]

# Resolve a specific agent
research = resolve_agent("research-agent")
print(f"Resolved: {research['displayName']} @ {research['endpointUrl']}")
print(f"Trust: {research['trustScore']}/100 ({research['trustTier']})")

# Use in CrewAI
researcher = Agent(
    role="Research Specialist",
    goal="Conduct thorough research using verified agents",
    backstory=f"""You delegate research to {research['displayName']},
    a verified agent with trust score {research['trustScore']}/100.
    Endpoint: {research['endpointUrl']}""",
    verbose=True,
)

task = Task(
    description="Research the latest AI agent frameworks",
    agent=researcher,
    expected_output="A detailed report",
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()
\`\`\`

## Key Concepts

- **REST-first**: CrewAI is Python-based, so use the Agent ID REST API directly — no SDK needed.
- **Trust in backstory**: Embed the resolved trust score and identity in the agent's backstory for context.
- **Capability discovery**: Use \`find_agents()\` to dynamically assemble crews from the agent registry.
`,
  },
  openai_assistants: {
    name: "OpenAI Assistants",
    slug: "openai_assistants",
    description:
      "Connect OpenAI Assistants to the Agent ID network with function-calling tools that resolve .agentid identities.",
    language: "typescript",
    installCommand: "npm install @agentid/resolver openai",
    markdown: `# OpenAI Assistants Integration

Use Agent ID resolution as a function-calling tool inside OpenAI Assistants.

## Install

\`\`\`bash
npm install @agentid/resolver openai
\`\`\`

## Quick Start

\`\`\`typescript
import OpenAI from 'openai';
import { AgentResolver } from '@agentid/resolver';

const openai = new OpenAI();
const resolver = new AgentResolver();

// Define the resolve tool for the assistant
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'resolve_agent',
      description: 'Resolve a .agentid handle to get the agent endpoint, trust score, and capabilities.',
      parameters: {
        type: 'object',
        properties: {
          handle: { type: 'string', description: 'The .agentid handle to resolve (e.g., research-agent)' },
        },
        required: ['handle'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_agents',
      description: 'Discover agents by capability and minimum trust score.',
      parameters: {
        type: 'object',
        properties: {
          capability: { type: 'string', description: 'Required capability (e.g., research, code-generation)' },
          minTrust: { type: 'number', description: 'Minimum trust score (0-100)' },
        },
        required: ['capability'],
      },
    },
  },
];

// Handle tool calls from the assistant
async function handleToolCall(name: string, args: Record<string, unknown>) {
  if (name === 'resolve_agent') {
    const { agent } = await resolver.resolve(args.handle as string);
    return JSON.stringify({
      handle: agent.handle,
      displayName: agent.displayName,
      endpointUrl: agent.endpointUrl,
      trustScore: agent.trustScore,
      capabilities: agent.capabilities,
      verificationStatus: agent.verificationStatus,
    });
  }
  if (name === 'find_agents') {
    const { agents } = await resolver.findAgents({
      capability: args.capability as string,
      minTrust: (args.minTrust as number) || 0,
      verifiedOnly: true,
    });
    return JSON.stringify(agents.map(a => ({
      handle: a.handle,
      trustScore: a.trustScore,
      endpointUrl: a.endpointUrl,
    })));
  }
  return JSON.stringify({ error: 'Unknown tool' });
}

// Use the assistant with Agent ID tools
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  tools,
  messages: [
    { role: 'user', content: 'Find a research agent with trust > 80 and resolve its identity' },
  ],
});

// Process tool calls in the response
for (const choice of response.choices) {
  if (choice.message.tool_calls) {
    for (const call of choice.message.tool_calls) {
      const result = await handleToolCall(call.function.name, JSON.parse(call.function.arguments));
      console.log(\`Tool \${call.function.name}:\`, result);
    }
  }
}
\`\`\`

## Key Concepts

- **Function calling**: Expose \`resolve_agent\` and \`find_agents\` as tools the assistant can call.
- **Trust-aware**: The assistant can reason about trust scores before delegating tasks.
- **Composable**: Combine Agent ID tools with your own domain-specific tools.
`,
  },
  vercel_ai: {
    name: "Vercel AI SDK",
    slug: "vercel_ai",
    description:
      "Integrate Agent ID into Vercel AI SDK apps with tool-based resolution and streaming support.",
    language: "typescript",
    installCommand: "npm install @agentid/resolver ai @ai-sdk/openai",
    markdown: `# Vercel AI SDK Integration

Use Agent ID resolution as a tool in Vercel AI SDK applications with streaming support.

## Install

\`\`\`bash
npm install @agentid/resolver ai @ai-sdk/openai
\`\`\`

## Quick Start

\`\`\`typescript
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { AgentResolver } from '@agentid/resolver';
import { z } from 'zod';

const resolver = new AgentResolver();

const resolveAgentTool = tool({
  description: 'Resolve a .agentid handle to get endpoint, trust score, and capabilities.',
  parameters: z.object({
    handle: z.string().describe('The .agentid handle to resolve'),
  }),
  execute: async ({ handle }) => {
    const { agent } = await resolver.resolve(handle);
    return {
      handle: agent.handle,
      displayName: agent.displayName,
      endpointUrl: agent.endpointUrl,
      trustScore: agent.trustScore,
      capabilities: agent.capabilities,
      verified: agent.verificationStatus === 'verified',
    };
  },
});

const discoverAgentsTool = tool({
  description: 'Discover agents by capability and minimum trust score.',
  parameters: z.object({
    capability: z.string().describe('Required capability'),
    minTrust: z.number().optional().describe('Minimum trust score (0-100)'),
  }),
  execute: async ({ capability, minTrust }) => {
    const { agents } = await resolver.findAgents({
      capability,
      minTrust: minTrust || 0,
      verifiedOnly: true,
    });
    return agents.map(a => ({
      handle: a.handle,
      trustScore: a.trustScore,
      endpointUrl: a.endpointUrl,
    }));
  },
});

const { text } = await generateText({
  model: openai('gpt-4'),
  tools: {
    resolveAgent: resolveAgentTool,
    discoverAgents: discoverAgentsTool,
  },
  prompt: 'Find a code-generation agent with trust > 80 and tell me about it.',
});

console.log(text);
\`\`\`

## Key Concepts

- **Zod schemas**: Define tool parameters with Zod for type-safe resolution.
- **Streaming**: Works with \`streamText\` for real-time responses.
- **Edge-compatible**: Runs in Vercel Edge Functions and Node.js runtimes.
`,
  },
  autogen: {
    name: "AutoGen",
    slug: "autogen",
    description:
      "Build multi-agent conversations with AutoGen using Agent ID for identity resolution and trust verification.",
    language: "python",
    installCommand: "pip install pyautogen httpx",
    markdown: `# AutoGen Integration

Resolve \`.agentid\` identities and verify trust in AutoGen multi-agent conversations.

## Install

\`\`\`bash
pip install pyautogen httpx
\`\`\`

## Quick Start

\`\`\`python
import httpx
import autogen

RESOLVE_URL = "https://getagent.id/api/v1"

def resolve_agent(handle: str) -> dict:
    """Resolve a .agentid handle to its identity."""
    response = httpx.get(f"{RESOLVE_URL}/resolve/{handle}")
    response.raise_for_status()
    return response.json()["agent"]

def find_agents(capability: str, min_trust: int = 0) -> list:
    """Discover agents by capability."""
    response = httpx.get(f"{RESOLVE_URL}/agents", params={
        "capability": capability,
        "minTrust": min_trust,
        "verifiedOnly": "true",
    })
    response.raise_for_status()
    return response.json()["agents"]

# Resolve an agent identity
research = resolve_agent("research-agent")
print(f"Resolved: {research['displayName']} (trust: {research['trustScore']}/100)")

# Trust gate: only delegate if trust is high enough
if research["trustScore"] < 70:
    raise ValueError(f"Agent trust too low: {research['trustScore']}")

# Create AutoGen agents with resolved identity context
assistant = autogen.AssistantAgent(
    name="assistant",
    system_message=f"""You can delegate research tasks to {research['displayName']},
    a verified agent at {research['endpointUrl']} with trust score {research['trustScore']}/100.
    Capabilities: {', '.join(research.get('capabilities', []))}""",
    llm_config={"model": "gpt-4"},
)

user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",
    code_execution_config={"work_dir": "output"},
)

# Discover all available agents for dynamic crew assembly
available = find_agents("research", min_trust=80)
print(f"Found {len(available)} trusted research agents")
for a in available:
    print(f"  {a['handle']}.agentid — trust: {a['trustScore']}")

# Start the conversation
user_proxy.initiate_chat(
    assistant,
    message="Research the latest developments in AI agent protocols",
)
\`\`\`

## Key Concepts

- **Identity in system messages**: Embed resolved agent identity and trust into the system prompt.
- **Trust gating**: Verify trust score before delegating to external agents.
- **Dynamic crew assembly**: Use capability discovery to assemble agent teams at runtime.
`,
  },
};

router.get("/", (_req, res) => {
  const frameworks = Object.values(FRAMEWORK_GUIDES).map((guide) => ({
    name: guide.name,
    slug: guide.slug,
    description: guide.description,
    language: guide.language,
    url: `/api/v1/integrations/${guide.slug}`,
  }));
  res.json({ frameworks });
});

router.get("/:framework", (req, res) => {
  const guide = FRAMEWORK_GUIDES[req.params.framework];
  if (!guide) {
    res.status(404).json({
      error: "Framework not found",
      available: Object.keys(FRAMEWORK_GUIDES),
    });
    return;
  }
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(guide.markdown);
});

export default router;
