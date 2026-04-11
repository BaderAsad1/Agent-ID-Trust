/**
 * SignInWithAgentID  -  embeddable button component for third-party apps.
 *
 * Usage:
 *   <SignInWithAgentID clientId="agclient_..." redirectUri="https://myapp.com/callback" scopes={['read']} />
 *
 * Or use the headless helper:
 *   import { buildAgentIDAuthUrl } from '@/components/SignInWithAgentID';
 *   const url = buildAgentIDAuthUrl({ clientId, redirectUri, scopes });
 *   window.location.href = url;
 */
import { useMemo } from 'react';

const AGENTID_BASE = typeof window !== 'undefined' ? window.location.origin : 'https://getagent.id';

export interface SignInWithAgentIDProps {
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
  agentId?: string;
  theme?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  disabled?: boolean;
  onClick?: () => void;
  /** Show "Powered by getagent.id" subtitle. Default: true */
  showBranding?: boolean;
  /** Override the Agent ID base URL (useful for self-hosted or staging). Default: current origin */
  baseUrl?: string;
  /** Stretch button to fill its container. Default: false */
  fullWidth?: boolean;
}

export function buildAgentIDAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
  agentId?: string;
  baseUrl?: string;
}): string {
  const base = params.baseUrl || AGENTID_BASE;
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
  });
  if (params.scopes?.length) p.set('scope', params.scopes.join(' '));
  if (params.state) p.set('state', params.state);
  if (params.codeChallenge) {
    p.set('code_challenge', params.codeChallenge);
    p.set('code_challenge_method', params.codeChallengeMethod || 'S256');
  }
  if (params.agentId) p.set('agent_id', params.agentId);
  return `${base}/oauth/authorize?${p.toString()}`;
}

const SIZES = {
  sm: { height: 36, fontSize: 13, gap: 8, iconSize: 16, px: 16, radius: 8 },
  md: { height: 42, fontSize: 14, gap: 10, iconSize: 18, px: 20, radius: 10 },
  lg: { height: 50, fontSize: 15, gap: 12, iconSize: 20, px: 24, radius: 12 },
};

const THEMES = {
  dark: {
    bg: 'rgba(15, 18, 30, 0.95)',
    bgHover: 'rgba(25, 30, 50, 0.98)',
    border: 'rgba(79, 125, 243, 0.4)',
    borderHover: 'rgba(79, 125, 243, 0.7)',
    text: '#ffffff',
    textDim: 'rgba(255,255,255,0.5)',
    shadow: '0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(79,125,243,0.15)',
    shadowHover: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(79,125,243,0.35)',
  },
  light: {
    bg: '#ffffff',
    bgHover: '#f8faff',
    border: 'rgba(79, 125, 243, 0.35)',
    borderHover: 'rgba(79, 125, 243, 0.6)',
    text: '#0f1220',
    textDim: 'rgba(15,18,32,0.5)',
    shadow: '0 2px 8px rgba(0,0,0,0.1), 0 0 0 1px rgba(79,125,243,0.15)',
    shadowHover: '0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(79,125,243,0.3)',
  },
};

function AgentIDMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="url(#aid-grad)"/>
      <defs>
        <linearGradient id="aid-grad" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#4f7df3"/>
          <stop offset="100%" stopColor="#7c5cf6"/>
        </linearGradient>
      </defs>
      {/* Shield/check mark representing trust */}
      <path d="M12 4L5 7v5c0 4.4 3 8.4 7 9.4 4-1 7-5 7-9.4V7L12 4z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2"/>
      <path d="M9 12l2.5 2.5 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function SignInWithAgentID({
  clientId,
  redirectUri,
  scopes = ['read'],
  state,
  codeChallenge,
  codeChallengeMethod,
  agentId,
  theme = 'dark',
  size = 'md',
  label,
  disabled = false,
  onClick,
  showBranding = true,
  baseUrl,
  fullWidth = false,
}: SignInWithAgentIDProps) {
  const authUrl = useMemo(() => buildAgentIDAuthUrl({ clientId, redirectUri, scopes, state, codeChallenge, codeChallengeMethod, agentId, baseUrl }), [clientId, redirectUri, scopes, state, codeChallenge, codeChallengeMethod, agentId, baseUrl]);

  const sz = SIZES[size];
  const th = THEMES[theme];

  function handleClick(e: React.MouseEvent) {
    if (disabled) { e.preventDefault(); return; }
    onClick?.();
    window.location.href = authUrl;
  }

  return (
    <>
      <style>{`
        .agentid-btn {
          display: ${fullWidth ? 'flex' : 'inline-flex'};
          width: ${fullWidth ? '100%' : 'auto'};
          align-items: center;
          justify-content: center;
          gap: ${sz.gap}px;
          height: ${sz.height}px;
          padding: 0 ${sz.px}px;
          background: ${th.bg};
          border: 1px solid ${th.border};
          border-radius: ${sz.radius}px;
          box-shadow: ${th.shadow};
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          opacity: ${disabled ? 0.5 : 1};
          transition: all 0.18s ease;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: ${sz.fontSize}px;
          font-weight: 600;
          color: ${th.text};
          text-decoration: none;
          white-space: nowrap;
          user-select: none;
          -webkit-font-smoothing: antialiased;
        }
        .agentid-btn:hover:not([aria-disabled="true"]) {
          background: ${th.bgHover};
          border-color: ${th.borderHover};
          box-shadow: ${th.shadowHover};
          transform: translateY(-1px);
        }
        .agentid-btn:active:not([aria-disabled="true"]) {
          transform: translateY(0);
          box-shadow: ${th.shadow};
        }
        .agentid-btn-divider {
          width: 1px;
          height: ${sz.height * 0.5}px;
          background: ${th.border};
        }
        .agentid-btn-label-wrap {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0;
        }
        .agentid-btn-sub {
          font-size: ${sz.fontSize - 3}px;
          font-weight: 400;
          color: ${th.textDim};
          letter-spacing: 0.01em;
        }
      `}</style>

      <button
        className="agentid-btn"
        onClick={handleClick}
        aria-disabled={disabled}
        type="button"
        aria-label={label || 'Sign in with Agent ID'}
      >
        <AgentIDMark size={sz.iconSize} />
        <div className="agentid-btn-divider" />
        <div className="agentid-btn-label-wrap">
          <span>{label || 'Sign in with Agent ID'}</span>
          {showBranding && <span className="agentid-btn-sub">Powered by getagent.id</span>}
        </div>
      </button>
    </>
  );
}

export default SignInWithAgentID;
