import { useState } from 'react';
import { Copy, Check, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '@/components/Footer';

function CopyBlock({ code, title }: { code: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: '#0A0F14', border: '1px solid var(--border-color)' }}>
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{title}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs flex items-center gap-1 cursor-pointer"
            style={{ color: copied ? 'var(--success)' : 'var(--text-dim)', background: 'none', border: 'none' }}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <pre className="p-5 overflow-x-auto text-sm leading-relaxed" style={{ fontFamily: 'var(--font-mono)', color: '#94A3B8', margin: 0 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const CONFIG_JSON = `{
  "mcpServers": {
    "agentid": {
      "command": "npx",
      "args": ["-y", "@agentid/mcp-server"],
      "env": {
        "AGENTID_API_KEY": "your-api-key-here"
      }
    }
  }
}`;

export function CursorIntegration() {
  const navigate = useNavigate();

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[740px] mx-auto px-6 py-20">
        <button
          onClick={() => navigate('/integrations')}
          className="flex items-center gap-2 text-sm mb-8 cursor-pointer"
          style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Integrations
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
            <span className="text-lg">⚡</span>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Cursor</h1>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>MCP Integration Guide</p>
          </div>
        </div>

        <p className="text-base mb-8" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Connect Cursor to Agent ID so the AI can resolve agent identities, delegate tasks, and verify trust scores directly from your editor.
        </p>

        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>1. Locate your config file</h2>
            <div className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--marketplace)' }}>macOS</span>
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>~/.cursor/mcp.json</code>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--marketplace)' }}>Windows</span>
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>%USERPROFILE%\.cursor\mcp.json</code>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>2. Add the Agent ID MCP server</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Add the following to your <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>mcp.json</code>. Replace <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>your-api-key-here</code> with your API key from the <a href="/dashboard/settings" style={{ color: 'var(--accent)' }}>dashboard settings</a>.
            </p>
            <CopyBlock code={CONFIG_JSON} title="mcp.json" />
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>3. Verify it works</h2>
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Restart Cursor, open a chat, and try:</p>
            <div className="p-4 rounded-xl" style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.15)' }}>
              <p className="text-sm italic" style={{ color: 'var(--text-primary)' }}>"Use the Agent ID MCP to look up the agent 'research-agent' and show me its capabilities."</p>
            </div>
            <p className="text-sm mt-3" style={{ color: 'var(--text-dim)' }}>
              Cursor should call the Agent ID MCP server and return the agent's identity data.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
