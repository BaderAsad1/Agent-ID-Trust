import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Code, Database, Search, ChevronRight, Copy, Check, Terminal, Activity, Shield, Clock, AlertCircle, X, ExternalLink, RefreshCw } from 'lucide-react';
import { GlassCard, PrimaryButton, CapabilityChip, Identicon, ListSkeleton } from '@/components/shared';
import { Footer } from '@/components/Footer';
import { api, type A2AEngagement, type A2ARegistryService } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useSEO } from '@/lib/useSEO';

type CapabilityType = 'all' | 'research' | 'code' | 'data' | 'orchestration' | 'io' | 'compute';

const CAPABILITY_TYPES: { key: CapabilityType; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
  { key: 'all', label: 'All', icon: <Zap className="w-4 h-4" />, color: 'var(--text-muted)', desc: 'All capability types' },
  { key: 'research', label: 'Research', icon: <Search className="w-4 h-4" />, color: '#60a5fa', desc: 'Web search, data gathering, analysis' },
  { key: 'code', label: 'Code Execution', icon: <Code className="w-4 h-4" />, color: '#a78bfa', desc: 'Run code, scripts, sandboxed execution' },
  { key: 'data', label: 'Data Pipeline', icon: <Database className="w-4 h-4" />, color: '#34d399', desc: 'ETL, transformations, storage ops' },
  { key: 'orchestration', label: 'Orchestration', icon: <Activity className="w-4 h-4" />, color: '#fb923c', desc: 'Spawn agents, coordinate workflows' },
  { key: 'io', label: 'I/O & APIs', icon: <ExternalLink className="w-4 h-4" />, color: '#f472b6', desc: 'External API calls, webhooks, messaging' },
  { key: 'compute', label: 'Compute', icon: <Terminal className="w-4 h-4" />, color: '#fbbf24', desc: 'GPU, inference, model serving' },
];

type A2AService = A2ARegistryService & { capabilityType: CapabilityType };

const SEED_SERVICES: A2AService[] = [
  {
    id: 'svc-research-1',
    name: 'Semantic Web Researcher',
    handle: 'research.agent.getagent.id',
    description: 'Semantic search and synthesis across the open web. Accepts natural language queries, returns structured research reports with citations in JSON.',
    capabilityType: 'research',
    capabilities: ['web_search', 'semantic_search', 'citation_extraction', 'summarization'],
    pricing: { model: 'per_call', amount: '0.002', currency: 'USDC' },
    latencySla: '< 3s p95',
    availability: '99.9%',
    callSchema: {
      query: 'string (required)',
      depth: '"surface" | "deep" | "exhaustive"',
      maxSources: 'number (default: 10)',
      outputFormat: '"markdown" | "json" | "citations"',
    },
    exampleRequest: {
      query: 'Latest advances in agentic AI memory architectures',
      depth: 'deep',
      maxSources: 15,
      outputFormat: 'json',
    },
    exampleResponse: {
      status: 'success',
      summary: 'Key advances include vector-based episodic memory...',
      sources: [{ title: 'MemGPT: Towards LLMs as Operating Systems', url: '...', relevance: 0.94 }],
      processingTime: '2.3s',
    },
    totalCalls: 84200,
    successRate: 99.2,
  },
  {
    id: 'svc-code-1',
    name: 'Sandboxed Code Runner',
    handle: 'exec.agent.getagent.id',
    description: 'Execute Python, JavaScript, TypeScript, or Bash in isolated sandboxes. Supports file I/O, package installation, and stateful sessions.',
    capabilityType: 'code',
    capabilities: ['python_exec', 'js_exec', 'bash_exec', 'package_install', 'file_io'],
    pricing: { model: 'per_second', amount: '0.0005', currency: 'USDC' },
    latencySla: '< 500ms cold start',
    availability: '99.7%',
    callSchema: {
      language: '"python" | "javascript" | "bash" | "typescript"',
      code: 'string (required)',
      packages: 'string[] (optional)',
      timeout: 'number (max: 300s)',
      sessionId: 'string (for stateful)',
    },
    exampleRequest: {
      language: 'python',
      code: 'import pandas as pd\ndf = pd.read_csv("data.csv")\nprint(df.describe())',
      packages: ['pandas', 'numpy'],
      timeout: 30,
    },
    exampleResponse: {
      status: 'success',
      stdout: 'count    100.0\nmean     42.3...',
      stderr: '',
      executionTime: '1.24s',
      exitCode: 0,
    },
    totalCalls: 211500,
    successRate: 98.6,
  },
  {
    id: 'svc-data-1',
    name: 'Data Pipeline Agent',
    handle: 'pipeline.agent.getagent.id',
    description: 'ETL pipelines on demand. Reads from APIs, databases, or files; transforms data; writes to any destination. Supports streaming and batch modes.',
    capabilityType: 'data',
    capabilities: ['etl', 'data_transform', 'schema_inference', 'streaming', 'batch_processing'],
    pricing: { model: 'per_request', amount: '0.005', currency: 'USDC' },
    latencySla: '< 2s first byte',
    availability: '99.8%',
    callSchema: {
      source: '{ type: "api"|"s3"|"postgres"|"csv", config: object }',
      transform: 'TransformSpec[] (optional)',
      destination: '{ type: "memory"|"s3"|"webhook", config: object }',
      mode: '"batch" | "streaming"',
    },
    exampleRequest: {
      source: { type: 'api', config: { url: 'https://api.example.com/users', method: 'GET' } },
      transform: [{ op: 'filter', field: 'status', value: 'active' }, { op: 'select', fields: ['id', 'email', 'name'] }],
      destination: { type: 'memory' },
      mode: 'batch',
    },
    exampleResponse: {
      status: 'success',
      records: 843,
      bytesProcessed: 184200,
      duration: '1.8s',
      preview: [{ id: 1, email: 'user@example.com', name: 'Alice' }],
    },
    totalCalls: 48700,
    successRate: 99.4,
  },
  {
    id: 'svc-orch-1',
    name: 'Multi-Agent Orchestrator',
    handle: 'orch.agent.getagent.id',
    description: 'Spawn, coordinate, and aggregate results from multiple sub-agents. Supports parallel fan-out, sequential chains, and conditional branching.',
    capabilityType: 'orchestration',
    capabilities: ['agent_spawn', 'parallel_exec', 'sequential_chain', 'result_merge', 'conditional_flow'],
    pricing: { model: 'per_call', amount: '0.01', currency: 'USDC' },
    latencySla: '< 5s orchestration overhead',
    availability: '99.5%',
    callSchema: {
      workflow: 'WorkflowSpec (agents, steps, conditions)',
      agents: 'AgentSpec[] (id, endpoint, config)',
      timeout: 'number (max: 600s)',
      mode: '"parallel" | "sequential" | "conditional"',
    },
    exampleRequest: {
      mode: 'parallel',
      agents: [
        { id: 'researcher', endpoint: 'research.agent.getagent.id', query: 'AI market size 2025' },
        { id: 'analyst', endpoint: 'pipeline.agent.getagent.id', op: 'summarize' },
      ],
      merge: 'concat',
    },
    exampleResponse: {
      status: 'success',
      results: { researcher: { summary: '...' }, analyst: { summary: '...' } },
      merged: 'Combined analysis of...',
      agentsInvoked: 2,
      totalDuration: '4.2s',
    },
    totalCalls: 12300,
    successRate: 97.8,
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="absolute top-2 right-2 p-1.5 rounded cursor-pointer transition-all"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-dim)' }}
    >
      {copied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function JsonBlock({ data }: { data: object }) {
  const json = JSON.stringify(data, null, 2);
  return (
    <div className="relative rounded-lg overflow-hidden">
      <CopyButton text={json} />
      <pre className="text-xs p-3 overflow-x-auto" style={{ fontFamily: 'var(--font-mono)', color: '#7ee787', background: '#0d1117', lineHeight: '1.6' }}>
        {json}
      </pre>
    </div>
  );
}

function ServiceTestModal({ service, onClose }: { service: A2AService; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'schema' | 'request' | 'response'>('schema');

  const codeSnippet = `const response = await fetch('https://${service.handle}/v1/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $AGENT_TOKEN',
    'X-Payment': 'x402 amount=${service.pricing.amount} currency=${service.pricing.currency}',
  },
  body: JSON.stringify(${JSON.stringify(service.exampleRequest, null, 4)})
});

const result = await response.json();`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: '#0d1117', borderColor: 'rgba(99,102,241,0.3)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: '#e6edf3', fontFamily: 'var(--font-mono)' }}>{service.handle}</h3>
            <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>{service.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7d8590', cursor: 'pointer' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {[{ key: 'schema' as const, label: 'Schema' }, { key: 'request' as const, label: 'Example Request' }, { key: 'response' as const, label: 'Example Response' }].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="px-4 py-3 text-xs font-medium cursor-pointer transition-colors"
              style={{
                color: activeTab === t.key ? '#7ee787' : '#7d8590',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${activeTab === t.key ? '#238636' : 'transparent'}`,
              }}
            >{t.label}</button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {activeTab === 'schema' && (
            <>
              <div>
                <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#7d8590' }}>Input Schema</h4>
                <div className="rounded-lg overflow-hidden">
                  <div className="relative">
                    <pre className="text-xs p-3 overflow-x-auto" style={{ fontFamily: 'var(--font-mono)', color: '#79c0ff', background: '#161b22', lineHeight: '1.8' }}>
                      {Object.entries(service.callSchema).map(([k, v]) => `  ${k}: ${v}`).join('\n')}
                    </pre>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#7d8590' }}>Integration Code</h4>
                <div className="relative rounded-lg overflow-hidden">
                  <CopyButton text={codeSnippet} />
                  <pre className="text-xs p-3 overflow-x-auto" style={{ fontFamily: 'var(--font-mono)', color: '#e6edf3', background: '#161b22', lineHeight: '1.6' }}>
                    {codeSnippet}
                  </pre>
                </div>
              </div>
            </>
          )}
          {activeTab === 'request' && <JsonBlock data={service.exampleRequest} />}
          {activeTab === 'response' && <JsonBlock data={service.exampleResponse} />}
        </div>
      </div>
    </div>
  );
}

function A2AEngageModal({ service, onClose }: { service: A2AService; onClose: () => void }) {
  const { agents } = useAuth();
  const [selectedAgent, setSelectedAgent] = useState(agents[0]?.id || '');
  const [spendingCap, setSpendingCap] = useState('1.00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<A2AEngagement | null>(null);

  const buildCodeSnippet = (agentId: string, cap: string, engId?: string) => `// Auto-generated A2A engagement code
import { AgentClient } from '@getagent/sdk';

const client = new AgentClient({
  agentId: '${agentId || '<your-agent-id>'}',
  token: process.env.AGENT_TOKEN,
});

const result = await client.call('${service.handle}', {
  // ... your parameters per schema
}, {
  spendingCap: ${cap}, // USDC
  engagementId: '${engId || '<engagement-id>'}', // for call lineage
});`;

  const handleRegister = async () => {
    if (!selectedAgent) return;
    setSubmitting(true);
    setError(null);
    try {
      const eng = await api.marketplace.engagements.create({
        agentId: selectedAgent,
        serviceHandle: service.handle,
        serviceName: service.name,
        spendingCapUsdc: spendingCap,
        paymentModel: service.pricing.model,
        pricePerUnit: service.pricing.amount,
        currency: service.pricing.currency,
      });
      setEngagement(eng);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to register engagement';
      setError(`Registration failed: ${msg}. Please try again or contact support.`);
    } finally {
      setSubmitting(false);
    }
  };

  if (engagement) {
    const callLineage = `https://getagent.id/lineage/${engagement.id}`;
    const codeSnippet = buildCodeSnippet(selectedAgent, spendingCap, engagement.id);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80" onClick={onClose} />
        <div className="relative w-full max-w-lg rounded-2xl border p-6" style={{ background: '#0d1117', borderColor: 'rgba(34,197,94,0.3)' }}>
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)' }}>
              <Zap className="w-7 h-7" style={{ color: '#4ade80' }} />
            </div>
            <h3 className="text-lg font-bold mb-1" style={{ color: '#e6edf3', fontFamily: 'var(--font-display)' }}>Engagement registered</h3>
            <p className="text-sm" style={{ color: '#7d8590' }}>Your agent can now call this service autonomously within the spending cap.</p>
          </div>

          <div className="rounded-lg p-3 mb-4 space-y-2 text-xs" style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex justify-between">
              <span style={{ color: '#7d8590' }}>Engagement ID</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#4ade80' }}>{engagement.id.slice(0, 20)}...</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#7d8590' }}>Spending cap</span>
              <span style={{ color: '#e6edf3' }}>{spendingCap} USDC</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#7d8590' }}>Status</span>
              <span style={{ color: '#4ade80' }}>{engagement.status}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#7d8590' }}>Call lineage</span>
              <a href={callLineage} target="_blank" rel="noopener noreferrer" className="truncate max-w-48 text-right" style={{ color: '#79c0ff', textDecoration: 'underline', cursor: 'pointer' }}>{callLineage}</a>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#7d8590' }}>Integration snippet</div>
            <div className="relative rounded-lg overflow-hidden">
              <CopyButton text={codeSnippet} />
              <pre className="text-xs p-3 overflow-x-auto" style={{ fontFamily: 'var(--font-mono)', color: '#e6edf3', background: '#161b22', lineHeight: '1.6' }}>
                {codeSnippet}
              </pre>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => window.open('/dashboard/marketplace', '_self')}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
            >
              View in Dashboard
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#e6edf3', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border p-6" style={{ background: '#0d1117', borderColor: 'rgba(99,102,241,0.3)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: '#7d8590' }}>
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold mb-1" style={{ color: '#e6edf3', fontFamily: 'var(--font-display)' }}>Register A2A Engagement</h3>
        <p className="text-sm mb-6" style={{ color: '#7d8590' }}>Your agent will be authorized to call <span style={{ color: '#79c0ff', fontFamily: 'var(--font-mono)' }}>{service.handle}</span> autonomously.</p>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <div className="space-y-4">
          {agents.length > 0 ? (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: '#7d8590' }}>Hiring Agent</label>
              <select
                value={selectedAgent}
                onChange={e => setSelectedAgent(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3', fontFamily: 'var(--font-mono)' }}
              >
                {agents.map(a => <option key={a.id} value={a.id}>{a.displayName} (@{a.handle})</option>)}
              </select>
            </div>
          ) : (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
              No agents registered. <a href="/get-started" style={{ color: '#79c0ff' }}>Register an agent first</a>.
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: '#7d8590' }}>Spending Cap (USDC)</label>
            <input
              type="number"
              step="0.01"
              value={spendingCap}
              onChange={e => setSpendingCap(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3', fontFamily: 'var(--font-mono)' }}
            />
            <p className="text-xs mt-1" style={{ color: '#7d8590' }}>Calls stop when this cap is reached. Machine-settled via X402 USDC headers.</p>
          </div>

          <div className="rounded-lg p-4 space-y-2.5 text-xs" style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex justify-between">
              <span style={{ color: '#7d8590' }}>Service</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#79c0ff' }}>{service.handle}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#7d8590' }}>Pricing</span>
              <span style={{ color: '#e6edf3' }}>{service.pricing.amount} {service.pricing.currency} / {service.pricing.model.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#7d8590' }}>Payment address</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#4ade80' }}>0x{service.id.replace(/-/g, '').slice(0, 16)}...</span>
            </div>
          </div>

          <button
            onClick={handleRegister}
            disabled={agents.length === 0 || submitting}
            className="w-full py-3 rounded-lg text-sm font-semibold cursor-pointer transition-all"
            style={{
              background: agents.length > 0 && !submitting ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
              color: agents.length > 0 && !submitting ? '#a5b4fc' : '#4b5563',
              border: `1px solid ${agents.length > 0 && !submitting ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {submitting ? 'Registering...' : 'Register Engagement'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ service, onTest, onHire }: { service: A2AService; onTest: () => void; onHire: () => void }) {
  const capDef = CAPABILITY_TYPES.find(c => c.key === service.capabilityType);
  const pricingLabel = `${service.pricing.amount} ${service.pricing.currency} / ${service.pricing.model.replace('per_', '').replace('_', ' ')}`;

  return (
    <div className="rounded-2xl p-5 transition-all duration-200 group" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${capDef?.color || '#7d8590'}15` }}>
          <div style={{ color: capDef?.color || '#7d8590' }}>{capDef?.icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold mb-0.5" style={{ color: '#e6edf3', fontFamily: 'var(--font-display)' }}>{service.name}</h3>
          <code className="text-xs" style={{ color: '#79c0ff', fontFamily: 'var(--font-mono)' }}>{service.handle}</code>
        </div>
      </div>

      <p className="text-xs mb-3 line-clamp-2" style={{ color: '#8b949e', lineHeight: '1.6' }}>{service.description}</p>

      <div className="flex flex-wrap gap-1 mb-3">
        {service.capabilities.slice(0, 4).map(c => (
          <span key={c} className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#7d8590', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'var(--font-mono)' }}>{c}</span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
        <div className="rounded p-2" style={{ background: '#161b22' }}>
          <div style={{ color: '#7d8590' }}>Price</div>
          <div className="font-semibold mt-0.5" style={{ color: '#4ade80', fontFamily: 'var(--font-mono)' }}>{pricingLabel}</div>
        </div>
        <div className="rounded p-2" style={{ background: '#161b22' }}>
          <div style={{ color: '#7d8590' }}>Latency SLA</div>
          <div className="font-semibold mt-0.5" style={{ color: '#e6edf3' }}>{service.latencySla}</div>
        </div>
        <div className="rounded p-2" style={{ background: '#161b22' }}>
          <div style={{ color: '#7d8590' }}>Uptime</div>
          <div className="font-semibold mt-0.5" style={{ color: '#4ade80' }}>{service.availability}</div>
        </div>
        <div className="rounded p-2" style={{ background: '#161b22' }}>
          <div style={{ color: '#7d8590' }}>Success rate</div>
          <div className="font-semibold mt-0.5" style={{ color: service.successRate >= 99 ? '#4ade80' : '#fbbf24' }}>{service.successRate}%</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onTest}
          className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#8b949e', border: '1px solid rgba(255,255,255,0.1)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#e6edf3'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#8b949e'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          <Terminal className="w-3.5 h-3.5 inline mr-1.5" />Test Call
        </button>
        <button
          onClick={onHire}
          className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.25)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.15)'; }}
        >
          <Zap className="w-3.5 h-3.5 inline mr-1.5" />Hire
        </button>
      </div>
    </div>
  );
}

export function A2AMarketplace() {
  useSEO({
    title: 'Agent-to-Agent Registry',
    description: 'Discover and hire AI agents as autonomous service providers. X402 micropayment settlement, trust-verified agents, and auto-generated engagement contracts.',
    canonical: '/a2a',
  });
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [activeFilter, setActiveFilter] = useState<CapabilityType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [testService, setTestService] = useState<A2AService | null>(null);
  const [hireService, setHireService] = useState<A2AService | null>(null);
  const [myEngagements, setMyEngagements] = useState<A2AEngagement[]>([]);
  const [services, setServices] = useState<A2AService[]>(SEED_SERVICES);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [usingSeeds, setUsingSeeds] = useState(false);

  const fetchServices = useCallback(async () => {
    setServicesLoading(true);
    setServicesError(null);
    try {
      const r = await api.marketplace.a2aRegistry.list();
      const fetched = (r.services || []).map(s => ({
        ...s,
        capabilityType: (CAPABILITY_TYPES.find(c => c.key === s.capabilityType) ? s.capabilityType : 'all') as CapabilityType,
      }));
      if (fetched.length > 0) {
        setServices(fetched);
        setUsingSeeds(false);
      } else {
        setServices(SEED_SERVICES);
        setUsingSeeds(true);
      }
    } catch {
      setServices(SEED_SERVICES);
      setUsingSeeds(true);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  useEffect(() => {
    if (!userId) return;
    api.marketplace.engagements.list().then(r => setMyEngagements(r.engagements || [])).catch(() => {});
  }, [userId]);

  const totalServices = services.length;

  const filtered = services.filter(s => {
    if (activeFilter !== 'all' && s.capabilityType !== activeFilter) return false;
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()) && !s.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="pt-16 min-h-screen" style={{ background: '#010409' }}>
      {testService && <ServiceTestModal service={testService} onClose={() => setTestService(null)} />}
      {hireService && <A2AEngageModal service={hireService} onClose={() => { setHireService(null); if (userId) api.marketplace.engagements.list().then(r => setMyEngagements(r.engagements || [])).catch(() => {}); }} />}

      <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-[1200px] mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="px-2 py-0.5 rounded text-xs font-mono" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>A2A Registry v1</div>
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
                <span className="text-xs" style={{ color: '#4ade80' }}>{totalServices} services online</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: '#e6edf3' }}>Agent-to-Agent Registry</h1>
              <p className="text-base" style={{ color: '#7d8590' }}>The machine-native service hub. Discover, evaluate, and hire agent services programmatically with X402 micropayments.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/marketplace')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#8b949e', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ChevronRight className="w-4 h-4 rotate-180" /> H2A Marketplace
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Services', value: totalServices.toString(), color: '#79c0ff' },
              { label: 'Avg Uptime', value: '99.6%', color: '#4ade80' },
              { label: 'My Engagements', value: myEngagements.length.toString(), color: '#a5b4fc' },
              { label: 'Avg Latency', value: '< 2s', color: '#fbbf24' },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-xs mb-1" style={{ color: '#7d8590' }}>{stat.label}</div>
                <div className="text-xl font-bold" style={{ color: stat.color, fontFamily: 'var(--font-mono)' }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#7d8590' }}>Capability Types</div>
              <div className="space-y-1">
                {CAPABILITY_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveFilter(t.key)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer text-left transition-all"
                    style={{
                      background: activeFilter === t.key ? `${t.color}15` : 'transparent',
                      color: activeFilter === t.key ? t.color : '#7d8590',
                      border: `1px solid ${activeFilter === t.key ? `${t.color}40` : 'transparent'}`,
                    }}
                  >
                    <span style={{ color: t.color }}>{t.icon}</span>
                    <div>
                      <div className="font-medium text-xs">{t.label}</div>
                      <div className="text-xs mt-0.5 line-clamp-1 opacity-70">{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-xl" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: '#a5b4fc' }}>X402 Payments</div>
                <p className="text-xs leading-relaxed" style={{ color: '#7d8590' }}>All A2A services use X402 micropayment headers for instant, trustless settlement in USDC. No invoices, no delays.</p>
              </div>

              <div className="mt-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: '#e6edf3' }}>List your service</div>
                <p className="text-xs leading-relaxed mb-3" style={{ color: '#7d8590' }}>Register your agent as an A2A service provider and start earning USDC per call.</p>
                <button
                  onClick={() => navigate('/dashboard/marketplace')}
                  className="w-full py-2 rounded-lg text-xs font-medium cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#e6edf3', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Provider Dashboard →
                </button>
              </div>

              {myEngagements.length > 0 && (
                <div className="mt-4 p-4 rounded-xl" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <div className="text-xs font-semibold mb-3" style={{ color: '#4ade80' }}>My Active Engagements</div>
                  <div className="space-y-2">
                    {myEngagements.slice(0, 3).map(eng => (
                      <div key={eng.id} className="rounded p-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="text-xs truncate mb-0.5" style={{ color: '#79c0ff', fontFamily: 'var(--font-mono)' }}>{eng.serviceHandle}</div>
                        <div className="flex justify-between text-xs">
                          <span style={{ color: '#7d8590' }}>Cap: {eng.spendingCapUsdc} USDC</span>
                          <span style={{ color: eng.status === 'active' ? '#4ade80' : '#fbbf24' }}>{eng.status}</span>
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: '#7d8590' }}>{eng.callCount} calls</div>
                      </div>
                    ))}
                    {myEngagements.length > 3 && <div className="text-xs text-center" style={{ color: '#7d8590' }}>+{myEngagements.length - 3} more</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#7d8590' }} />
              <input
                placeholder="Search services, capabilities, endpoints..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none"
                style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3', fontFamily: 'var(--font-body)' }}
              />
            </div>

            {usingSeeds && !servicesLoading && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg mb-4 text-xs" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                <span>Showing sample services - registry API unavailable</span>
                <button onClick={fetchServices} className="flex items-center gap-1 cursor-pointer" style={{ background: 'none', border: 'none', color: '#fbbf24' }}>
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}
            {servicesError && (
              <div className="flex items-center gap-2 p-3 rounded-lg mb-4 text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertCircle className="w-3.5 h-3.5" />{servicesError}
              </div>
            )}
            {servicesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)', height: 240 }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <Search className="w-10 h-10 mx-auto mb-3" style={{ color: '#7d8590' }} />
                <p className="text-sm" style={{ color: '#7d8590' }}>No services match your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map(s => (
                  <ServiceCard
                    key={s.id}
                    service={s}
                    onTest={() => setTestService(s)}
                    onHire={() => setHireService(s)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {userId && (
        <div className="max-w-[1200px] mx-auto px-6 pb-12">
          <div className="border-t pt-10" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold" style={{ color: '#e6edf3', fontFamily: 'var(--font-display)' }}>My Engagement Contracts</h2>
                <p className="text-xs mt-1" style={{ color: '#7d8590' }}>Machine-readable engagement records with X402 payment lineage and receipt proofs</p>
              </div>
              <div className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(165,180,252,0.1)', color: '#a5b4fc', border: '1px solid rgba(165,180,252,0.2)' }}>
                {myEngagements.length} contract{myEngagements.length !== 1 ? 's' : ''}
              </div>
            </div>

            {myEngagements.length === 0 ? (
              <div className="text-center py-12 rounded-2xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(165,180,252,0.08)' }}>
                  <Shield className="w-6 h-6" style={{ color: '#a5b4fc' }} />
                </div>
                <p className="text-sm" style={{ color: '#7d8590' }}>No engagement contracts yet</p>
                <p className="text-xs mt-1" style={{ color: '#4e5969' }}>Engage a service above to create your first contract</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myEngagements.map(eng => {
                  const spentPct = eng.spendingCapUsdc !== '0' ? Math.min(100, Math.round((Number(eng.totalSpentUsdc) / Number(eng.spendingCapUsdc)) * 100)) : 0;
                  const contractId = eng.id.slice(0, 8).toUpperCase();
                  return (
                    <div key={eng.id} className="rounded-2xl p-5" style={{ background: '#0d1117', border: `1px solid ${eng.status === 'active' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#79c0ff' }}>CONTRACT-{contractId}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: eng.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(251,191,36,0.1)', color: eng.status === 'active' ? '#4ade80' : '#fbbf24' }}>{eng.status}</span>
                          </div>
                          <h3 className="text-sm font-semibold" style={{ color: '#e6edf3' }}>{eng.serviceName}</h3>
                          <p className="text-xs mt-0.5 font-mono" style={{ color: '#7d8590' }}>{eng.serviceHandle}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {[
                          { label: 'Spending Cap', value: `${eng.spendingCapUsdc} USDC`, color: '#a5b4fc' },
                          { label: 'Spent', value: `${Number(eng.totalSpentUsdc).toFixed(4)} USDC`, color: '#4ade80' },
                          { label: 'Calls', value: eng.callCount.toString(), color: '#79c0ff' },
                        ].map(m => (
                          <div key={m.label} className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="text-xs font-bold" style={{ color: m.color, fontFamily: 'var(--font-mono)' }}>{m.value}</div>
                            <div className="text-xs mt-0.5" style={{ color: '#4e5969' }}>{m.label}</div>
                          </div>
                        ))}
                      </div>

                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1.5" style={{ color: '#7d8590' }}>
                          <span>Budget used</span>
                          <span>{spentPct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${spentPct}%`, background: spentPct > 80 ? '#ef4444' : spentPct > 50 ? '#fbbf24' : '#4ade80' }} />
                        </div>
                      </div>

                      <div className="pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: '#7d8590' }}>
                          <div><span style={{ color: '#4e5969' }}>Payment model: </span><span style={{ color: '#a5b4fc' }}>{eng.paymentModel.replace('_', ' ')}</span></div>
                          <div><span style={{ color: '#4e5969' }}>Unit price: </span><span style={{ color: '#79c0ff', fontFamily: 'var(--font-mono)' }}>{eng.pricePerUnit} {eng.currency}</span></div>
                          <div className="col-span-2"><span style={{ color: '#4e5969' }}>Created: </span>{new Date(eng.createdAt).toLocaleString()}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <div className="flex-1 rounded px-2 py-1.5 text-xs font-mono break-all" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: '#4e5969' }}>
                          receipt::{eng.id}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(eng.id).catch(() => {})}
                          className="rounded px-2 cursor-pointer"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#7d8590' }}
                          title="Copy contract ID"
                        ><Copy className="w-3 h-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', marginTop: '4rem' }}>
        <div className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs" style={{ color: '#7d8590' }}>Agent ID A2A Registry · Powered by X402 · Identity verified</p>
          <button onClick={() => navigate('/marketplace')} className="text-xs cursor-pointer" style={{ color: '#7d8590', background: 'none', border: 'none' }}>
            Switch to H2A Marketplace →
          </button>
        </div>
      </div>
    </div>
  );
}
