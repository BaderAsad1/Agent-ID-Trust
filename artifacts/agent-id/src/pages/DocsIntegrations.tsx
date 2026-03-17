import { useState } from 'react';
import { Copy, Check, Code2, Blocks, Bot, Zap, Sparkles, ArrowRight } from 'lucide-react';
import { GlassCard } from '@/components/shared';
import { Footer } from '@/components/Footer';

const FRAMEWORK_CARDS = [
  {
    slug: 'langchain',
    name: 'LangChain',
    icon: Blocks,
    description: 'Integrate Agent ID resolution into your LangChain agents and tools for identity-aware orchestration.',
    language: 'TypeScript',
    color: '#10B981',
  },
  {
    slug: 'crewai',
    name: 'CrewAI',
    icon: Bot,
    description: 'Use Agent ID resolution in CrewAI crews to delegate tasks to verified, trusted agents.',
    language: 'Python',
    color: '#8B5CF6',
  },
  {
    slug: 'openai_assistants',
    name: 'OpenAI Assistants',
    icon: Sparkles,
    description: 'Connect OpenAI Assistants to the Agent ID network with function-calling tools.',
    language: 'TypeScript',
    color: '#3B82F6',
  },
  {
    slug: 'vercel_ai',
    name: 'Vercel AI SDK',
    icon: Zap,
    description: 'Integrate Agent ID into Vercel AI SDK apps with tool-based resolution and streaming.',
    language: 'TypeScript',
    color: '#F59E0B',
  },
  {
    slug: 'autogen',
    name: 'AutoGen',
    icon: Code2,
    description: 'Build multi-agent conversations with AutoGen using Agent ID for identity and trust verification.',
    language: 'Python',
    color: '#EF4444',
  },
];

function CodeBlock({ code, lang = 'typescript', title }: { code: string; lang?: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: '#0A0F14', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: '#FF5F56' }} />
            <span className="w-3 h-3 rounded-full" style={{ background: '#FFBD2E' }} />
            <span className="w-3 h-3 rounded-full" style={{ background: '#27C93F' }} />
          </div>
          {title && <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{title}</span>}
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-xs flex items-center gap-1 cursor-pointer"
          style={{ color: copied ? 'var(--success)' : 'var(--text-dim)', background: 'none', border: 'none' }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-5 overflow-x-auto text-sm leading-relaxed" style={{ fontFamily: 'var(--font-mono)', color: '#94A3B8', margin: 0 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const LANGCHAIN_EXAMPLE = `import { AgentResolver } from '@agentid/resolver';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';

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
// ... create agent with researchTool`;

const CREWAI_EXAMPLE = `import httpx
from crewai import Agent, Task, Crew

# Resolve the .agentid name via the REST API
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

# Discover all agents with a capability
support_agents = find_agents("customer-support", min_trust=70)
for a in support_agents:
    print(f"  {a['handle']}.agentid — trust: {a['trustScore']}")

task = Task(
    description="Research the latest AI agent frameworks",
    agent=researcher,
    expected_output="A detailed report",
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()`;

const OPENAI_ASSISTANTS_EXAMPLE = `import OpenAI from 'openai';
import { AgentResolver } from '@agentid/resolver';

const openai = new OpenAI();
const resolver = new AgentResolver();

// Define the resolve tool for the assistant
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'resolve_agent',
      description: 'Resolve a .agentid handle to get endpoint and trust.',
      parameters: {
        type: 'object',
        properties: {
          handle: { type: 'string', description: 'The .agentid handle' },
        },
        required: ['handle'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_agents',
      description: 'Discover agents by capability and trust.',
      parameters: {
        type: 'object',
        properties: {
          capability: { type: 'string' },
          minTrust: { type: 'number' },
        },
        required: ['capability'],
      },
    },
  },
];

// Handle tool calls
async function handleToolCall(name: string, args: Record<string, unknown>) {
  if (name === 'resolve_agent') {
    const { agent } = await resolver.resolve(args.handle as string);
    return JSON.stringify({
      handle: agent.handle,
      endpointUrl: agent.endpointUrl,
      trustScore: agent.trustScore,
      capabilities: agent.capabilities,
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
    })));
  }
  return JSON.stringify({ error: 'Unknown tool' });
}

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  tools,
  messages: [
    { role: 'user', content: 'Find a research agent with trust > 80' },
  ],
});`;

const VERCEL_AI_EXAMPLE = `import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { AgentResolver } from '@agentid/resolver';
import { z } from 'zod';

const resolver = new AgentResolver();

const resolveAgentTool = tool({
  description: 'Resolve a .agentid handle to get endpoint and trust.',
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
  description: 'Discover agents by capability and trust score.',
  parameters: z.object({
    capability: z.string().describe('Required capability'),
    minTrust: z.number().optional().describe('Min trust (0-100)'),
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
  prompt: 'Find a code-generation agent with trust > 80',
});

console.log(text);`;

const AUTOGEN_EXAMPLE = `import httpx
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
    system_message=f"""You can delegate research tasks to
    {research['displayName']}, a verified agent at
    {research['endpointUrl']} with trust {research['trustScore']}/100.""",
    llm_config={"model": "gpt-4"},
)

user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",
    code_execution_config={"work_dir": "output"},
)

# Discover available agents
available = find_agents("research", min_trust=80)
print(f"Found {len(available)} trusted research agents")

user_proxy.initiate_chat(
    assistant,
    message="Research the latest AI agent protocols",
)`;

const RAW_FETCH_EXAMPLE = `// Forward Resolution — resolve a .agentid name
const resolveRes = await fetch(
  'https://getagent.id/api/v1/resolve/research-agent'
);
const { agent } = await resolveRes.json();

console.log(agent.handle);        // "research-agent"
console.log(agent.domain);        // "research-agent.getagent.id"
console.log(agent.endpointUrl);   // "https://research-agent.getagent.id/v1/tasks"
console.log(agent.trustScore);    // 94
console.log(agent.capabilities);  // ["research", "web-search", ...]

// Reverse Resolution — verify an endpoint
const reverseRes = await fetch(
  'https://getagent.id/api/v1/reverse',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpointUrl: 'https://research-agent.getagent.id/v1/tasks',
    }),
  }
);
const identity = await reverseRes.json();
console.log(identity.agent.handle); // "research-agent"

// Capability Discovery — find agents by capability
const searchRes = await fetch(
  'https://getagent.id/api/v1/agents?capability=research&minTrust=80&verifiedOnly=true'
);
const { agents, total } = await searchRes.json();
console.log(\`Found \${total} research agents\`);

for (const a of agents) {
  console.log(\`  \${a.handle}.agentid — trust: \${a.trustScore}\`);
}`;

const PYTHON_EXAMPLE = `import httpx

BASE = "https://getagent.id/api/v1"

# Forward Resolution
res = httpx.get(f"{BASE}/resolve/research-agent")
agent = res.json()["agent"]
print(f"{agent['handle']}.agentid -> {agent['endpointUrl']}")
print(f"Trust: {agent['trustScore']}/100")

# Reverse Resolution
res = httpx.post(f"{BASE}/reverse", json={
    "endpointUrl": "https://research-agent.getagent.id/v1/tasks"
})
identity = res.json()["agent"]
print(f"Endpoint verified: {identity['handle']}.agentid")

# Capability Discovery
res = httpx.get(f"{BASE}/agents", params={
    "capability": "research",
    "minTrust": 80,
    "verifiedOnly": "true",
})
data = res.json()
print(f"Found {data['total']} agents")
for a in data["agents"]:
    print(f"  {a['handle']}.agentid (trust: {a['trustScore']})")`;

type Tab = 'langchain' | 'crewai' | 'openai_assistants' | 'vercel_ai' | 'autogen' | 'fetch' | 'python';

const TABS: { id: Tab; label: string; icon: typeof Code2; lang: string }[] = [
  { id: 'langchain', label: 'LangChain', icon: Blocks, lang: 'typescript' },
  { id: 'crewai', label: 'CrewAI', icon: Bot, lang: 'python' },
  { id: 'openai_assistants', label: 'OpenAI Assistants', icon: Sparkles, lang: 'typescript' },
  { id: 'vercel_ai', label: 'Vercel AI SDK', icon: Zap, lang: 'typescript' },
  { id: 'autogen', label: 'AutoGen', icon: Code2, lang: 'python' },
  { id: 'fetch', label: 'Raw Fetch', icon: Code2, lang: 'typescript' },
  { id: 'python', label: 'Python', icon: Code2, lang: 'python' },
];

const CODE_MAP: Record<Tab, string> = {
  langchain: LANGCHAIN_EXAMPLE,
  crewai: CREWAI_EXAMPLE,
  openai_assistants: OPENAI_ASSISTANTS_EXAMPLE,
  vercel_ai: VERCEL_AI_EXAMPLE,
  autogen: AUTOGEN_EXAMPLE,
  fetch: RAW_FETCH_EXAMPLE,
  python: PYTHON_EXAMPLE,
};

export function DocsIntegrations() {
  const [activeTab, setActiveTab] = useState<Tab>('langchain');

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[920px] mx-auto px-6 py-20">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full mb-6" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            <Code2 className="w-3.5 h-3.5" /> INTEGRATION DOCS
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Framework Integrations
          </h1>
          <p className="text-xl leading-relaxed max-w-2xl" style={{ color: 'var(--text-muted)' }}>
            Drop-in examples for resolving <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--domain)' }}>.agentid</span> protocol addresses from any orchestration framework. <span style={{ fontFamily: 'var(--font-mono)' }}>.agentid</span> resolves through the Agent ID protocol, like <span style={{ fontFamily: 'var(--font-mono)' }}>.eth</span> resolves through ENS. Copy, paste, ship.
          </p>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Supported Frameworks</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FRAMEWORK_CARDS.map(fw => (
              <div key={fw.slug} className="rounded-xl border p-5 transition-all hover:border-opacity-60" style={{ background: 'var(--bg-elevated)', borderColor: fw.color + '33' }}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: fw.color + '15', border: `1px solid ${fw.color}33` }}>
                    <fw.icon className="w-4.5 h-4.5" style={{ color: fw.color }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{fw.name}</h3>
                    <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{fw.language}</span>
                  </div>
                </div>
                <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>{fw.description}</p>
                <a
                  href={`/api/v1/integrations/${fw.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
                  style={{ color: fw.color, textDecoration: 'none' }}
                >
                  View Quickstart <ArrowRight className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>IDE Integrations</h2>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Connect Agent ID to your development environment via MCP.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { name: 'Claude Desktop', href: '/integrations/claude-desktop', emoji: '🖥️', color: '#4F7DF3' },
              { name: 'Cursor', href: '/integrations/cursor', emoji: '⚡', color: '#8B5CF6' },
              { name: 'VS Code', href: '/integrations/vscode', emoji: '💎', color: '#3B82F6' },
            ].map(ide => (
              <a key={ide.name} href={ide.href} className="block rounded-xl p-4 transition-colors hover:opacity-90" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', textDecoration: 'none' }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xl">{ide.emoji}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{ide.name}</span>
                </div>
                <span className="text-xs flex items-center gap-1" style={{ color: ide.color }}>Setup guide <ArrowRight className="w-3 h-3" /></span>
              </a>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          <GlassCard className="!p-5">
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Using the SDK (recommended)</h3>
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
              Install <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>@agentid/resolver</code> for TypeScript/JavaScript projects. Includes full type definitions and built-in retry logic.
            </p>
            <code className="text-xs px-3 py-1.5 rounded-lg block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--success)', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
              npm install @agentid/resolver
            </code>
          </GlassCard>
          <GlassCard className="!p-5">
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Using the REST API directly</h3>
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
              For Python or any language, call the resolution endpoints directly. No SDK required &mdash; just HTTP.
            </p>
            <code className="text-xs px-3 py-1.5 rounded-lg block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
              GET https://getagent.id/api/v1/agents?capability=...
            </code>
          </GlassCard>
        </div>

        <div className="mb-8">
          <div className="flex gap-2 border-b flex-wrap" style={{ borderColor: 'var(--border-color)' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="pb-3 px-4 text-sm font-medium cursor-pointer transition-colors flex items-center gap-2"
                style={{
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-dim)',
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-12">
          <CodeBlock
            code={CODE_MAP[activeTab]}
            lang={TABS.find(t => t.id === activeTab)?.lang || 'typescript'}
            title={`${TABS.find(t => t.id === activeTab)?.label} Integration`}
          />
        </div>

        <div className="space-y-8 mb-12">
          <div>
            <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Common Patterns</h2>
          </div>

          <GlassCard className="!p-6">
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Trust-gated delegation</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Always check the trust score before delegating sensitive tasks to an agent. The trust score is computed from verification status, longevity, activity, and community reputation.
            </p>
            <CodeBlock
              code={`const { agent } = await resolver.resolve('target-agent');

if (agent.trustScore < 70) {
  console.warn('Agent trust too low for this task');
  return;
}

if (agent.verificationStatus !== 'verified') {
  console.warn('Agent not verified — proceed with caution');
}

// Safe to delegate
await fetch(agent.endpointUrl, { ... });`}
              lang="typescript"
              title="Trust-gated delegation"
            />
          </GlassCard>

          <GlassCard className="!p-6">
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Dynamic agent selection</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Use capability discovery to dynamically select the best agent for a task based on capability, trust, and protocol support.
            </p>
            <CodeBlock
              code={`const { agents } = await resolver.findAgents({
  capability: 'data-analysis',
  minTrust: 80,
  verifiedOnly: true,
});

// Sort by trust and pick the best
const best = agents.sort((a, b) => b.trustScore - a.trustScore)[0];

if (best) {
  console.log(\`Delegating to \${best.handle}.agentid (trust: \${best.trustScore})\`);
  await fetch(best.endpointUrl, { ... });
}`}
              lang="typescript"
              title="Dynamic agent selection"
            />
          </GlassCard>

          <GlassCard className="!p-6">
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Endpoint verification</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Before calling an unknown endpoint, reverse-resolve it to verify the agent identity behind it.
            </p>
            <CodeBlock
              code={`// Verify an endpoint before calling it
const { agent } = await resolver.reverse(
  'https://api.unknown-agent.com/v1/tasks'
);

if (agent) {
  console.log(\`Endpoint verified: \${agent.handle}.agentid\`);
  console.log(\`Trust: \${agent.trustScore}/100\`);
} else {
  console.warn('Endpoint not registered — unknown identity');
}`}
              lang="typescript"
              title="Endpoint verification"
            />
          </GlassCard>
        </div>

        <div className="rounded-xl border p-6" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>API Collections</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            Download ready-to-use API collections covering all endpoints with example requests and environment variable placeholders.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/docs/agent-id-postman-collection.json"
              download="agent-id-postman-collection.json"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:opacity-80"
              style={{ background: 'var(--accent)', color: '#fff', textDecoration: 'none' }}
            >
              Download Postman Collection
            </a>
            <a
              href="/docs/agent-id-insomnia-collection.json"
              download="agent-id-insomnia-collection.json"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors hover:opacity-80"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)', textDecoration: 'none' }}
            >
              Download Insomnia Collection
            </a>
          </div>
        </div>

        <div className="rounded-xl border p-6" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Full Protocol Specification</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            For the complete resolution protocol spec, response schemas, JSON Schema definitions, and error codes, see the protocol documentation.
          </p>
          <a
            href="/protocol"
            className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}
          >
            View Protocol Spec &rarr;
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}
