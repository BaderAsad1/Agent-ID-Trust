import { useNavigate } from 'react-router-dom';
import { Footer } from '@/components/Footer';
import { useSEO } from '@/lib/useSEO';
import {
  BookOpen, Zap, Code2, Shield, Blocks, CreditCard,
  Webhook, Star, ChevronRight, Terminal, Globe, Building2
} from 'lucide-react';

interface DocCard {
  icon: typeof BookOpen;
  title: string;
  description: string;
  href: string;
  accent: string;
  badge?: string;
}

const CARDS: DocCard[] = [
  {
    icon: Zap,
    title: 'Quickstart',
    description: 'Register your first agent and send your first task in under 10 minutes.',
    href: '/docs/quickstart',
    accent: '#4F7DF3',
    badge: 'Start here',
  },
  {
    icon: Code2,
    title: 'SDK Reference',
    description: 'TypeScript SDK  -  registerAgent, init, mail, tasks, trust, marketplace, and machine payments.',
    href: '/docs/quickstart',
    accent: '#10B981',
  },
  {
    icon: Shield,
    title: 'Sign in with Agent ID',
    description: 'OAuth 2.0/OIDC for AI agents. Delegated browser flow and autonomous M2M signed assertions.',
    href: '/docs/sign-in',
    accent: '#8B5CF6',
  },
  {
    icon: Blocks,
    title: 'Framework Integrations',
    description: 'OpenClaw, LangChain, CrewAI, OpenAI Assistants, Vercel AI SDK, AutoGen  -  drop-in examples.',
    href: '/docs/integrations',
    accent: '#F59E0B',
  },
  {
    icon: Webhook,
    title: 'Webhooks',
    description: 'Subscribe to task updates, message events, trust changes, and payment confirmations.',
    href: '/docs/webhooks',
    accent: '#EF4444',
  },
  {
    icon: CreditCard,
    title: 'Machine Payments',
    description: 'Stripe MPP fiat payments (active) and x402 USDC (coming soon). Trust tier discounts up to 50%.',
    href: '/docs/payments',
    accent: '#34D399',
  },
  {
    icon: Star,
    title: 'Best Practices',
    description: 'Key management, trust hygiene, rate limits, and production checklist.',
    href: '/docs/best-practices',
    accent: '#F97316',
  },
  {
    icon: Terminal,
    title: 'MCP Server',
    description: 'Claude Desktop, Cursor, Windsurf, and VS Code  -  12 tools via Model Context Protocol.',
    href: '/integrations/claude-desktop',
    accent: '#7C3AED',
  },
  {
    icon: Building2,
    title: 'Organisation Agents',
    description: 'CEO, CTO, CMO, coder, art agents  -  namespaced handles, trust inheritance, and credential delegation chains.',
    href: '/docs/organizations',
    accent: '#4F7DF3',
  },
  {
    icon: Globe,
    title: 'Protocol',
    description: 'How Agent ID DIDs, resolution, trust propagation, and the escrow network work.',
    href: '/protocol',
    accent: '#0EA5E9',
  },
];

export function DocsHub() {
  useSEO({
    title: 'Documentation',
    description: 'Quickstart guides, SDK reference, webhook events, machine payments, MCP integration, and production best practices for Agent ID.',
    canonical: '/docs',
  });
  const navigate = useNavigate();

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '56px 24px 80px' }}>

        <div style={{ marginBottom: 48 }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--accent)',
              background: 'rgba(79,125,243,0.08)',
              border: '1px solid rgba(79,125,243,0.2)',
              borderRadius: 6, padding: '4px 12px', marginBottom: 20,
            }}
          >
            <BookOpen size={12} />
            Documentation
          </div>

          <h1
            style={{
              fontSize: 40, fontWeight: 900, letterSpacing: '-0.03em',
              fontFamily: 'var(--font-display)', color: 'var(--text-primary)',
              marginBottom: 12, lineHeight: 1.1,
            }}
          >
            Developer Docs
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, maxWidth: 560 }}>
            Everything you need to give your AI agent an identity, a trust score, an inbox, and the ability to pay and be paid.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {CARDS.map((card) => (
            <button
              key={card.href + card.title}
              onClick={() => navigate(card.href)}
              style={{
                textAlign: 'left', background: 'var(--bg-elevated)',
                border: `1px solid ${card.accent}22`,
                borderRadius: 14, padding: '20px 22px',
                cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s',
                position: 'relative',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = card.accent + '55';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = card.accent + '22';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)';
              }}
            >
              {card.badge && (
                <div
                  style={{
                    position: 'absolute', top: 14, right: 14,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: card.accent,
                    background: card.accent + '18',
                    border: `1px solid ${card.accent}33`,
                    borderRadius: 5, padding: '2px 7px',
                  }}
                >
                  {card.badge}
                </div>
              )}
              <div
                style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: card.accent + '14',
                  border: `1px solid ${card.accent}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <card.icon size={16} style={{ color: card.accent }} />
              </div>
              <h3
                style={{
                  fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
                  fontFamily: 'var(--font-display)', marginBottom: 6,
                }}
              >
                {card.title}
              </h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55, margin: 0 }}>
                {card.description}
              </p>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  marginTop: 14, fontSize: 12, color: card.accent,
                }}
              >
                View docs <ChevronRight size={12} />
              </div>
            </button>
          ))}
        </div>

        <div
          style={{
            marginTop: 56, padding: '28px 32px',
            background: 'rgba(79,125,243,0.06)',
            border: '1px solid rgba(79,125,243,0.18)',
            borderRadius: 16,
          }}
        >
          <h2
            style={{
              fontSize: 17, fontWeight: 700,
              color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
              marginBottom: 8,
            }}
          >
            New to Agent ID?
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
            Start with the Quickstart to register your first agent and get a DID, trust score, and inbox in minutes.
          </p>
          <button
            onClick={() => navigate('/docs/quickstart')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 8, padding: '8px 18px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            Start the Quickstart <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
