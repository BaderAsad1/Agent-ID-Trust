/**
 * SignInWithAgentID  —  embeddable button component for third-party apps.
 *
 * Usage:
 *   <SignInWithAgentID clientId="agclient_..." redirectUri="https://myapp.com/callback" />
 *
 * Headless:
 *   import { buildAgentIDAuthUrl } from '@/components/SignInWithAgentID';
 *   window.location.href = buildAgentIDAuthUrl({ clientId, redirectUri, scopes });
 */
import { useMemo, useId } from 'react';

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
  /** Override the Agent ID base URL. Default: current origin */
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

// ── Icon ──────────────────────────────────────────────────────────────────────

function AgentIDMark({ size, gradientId }: { size: number; gradientId: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4f7df3" />
          <stop offset="100%" stopColor="#7c5bf5" />
        </linearGradient>
      </defs>

      {/* Rounded square background */}
      <rect width="24" height="24" rx="7" fill={`url(#${gradientId})`} />

      {/* Agent network mark: three nodes connected — identity + connections */}
      {/* Center node */}
      <circle cx="12" cy="12" r="2.2" fill="white" />
      {/* Top-left node */}
      <circle cx="6.5" cy="7.5" r="1.4" fill="white" fillOpacity="0.75" />
      {/* Top-right node */}
      <circle cx="17.5" cy="7.5" r="1.4" fill="white" fillOpacity="0.75" />
      {/* Bottom node */}
      <circle cx="12" cy="18" r="1.4" fill="white" fillOpacity="0.75" />

      {/* Edges */}
      <line x1="7.5"  y1="8.5"  x2="10.5" y2="11"   stroke="white" strokeWidth="1.1" strokeOpacity="0.55" strokeLinecap="round" />
      <line x1="16.5" y1="8.5"  x2="13.5" y2="11"   stroke="white" strokeWidth="1.1" strokeOpacity="0.55" strokeLinecap="round" />
      <line x1="12"   y1="14.2" x2="12"   y2="16.6" stroke="white" strokeWidth="1.1" strokeOpacity="0.55" strokeLinecap="round" />
    </svg>
  );
}

// ── Sizes + themes ────────────────────────────────────────────────────────────

const SIZES = {
  sm: { h: 36,  fs: 13, gap: 9,  icon: 17, px: 14, r: 8  },
  md: { h: 42,  fs: 14, gap: 10, icon: 19, px: 18, r: 10 },
  lg: { h: 50,  fs: 15, gap: 11, icon: 21, px: 22, r: 12 },
};

// ── Component ─────────────────────────────────────────────────────────────────

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
  baseUrl,
  fullWidth = false,
}: SignInWithAgentIDProps) {
  const uid = useId().replace(/:/g, '');
  const gradientId = `aid-g-${uid}`;

  const authUrl = useMemo(
    () => buildAgentIDAuthUrl({ clientId, redirectUri, scopes, state, codeChallenge, codeChallengeMethod, agentId, baseUrl }),
    [clientId, redirectUri, scopes, state, codeChallenge, codeChallengeMethod, agentId, baseUrl],
  );

  const sz = SIZES[size];

  function handleClick(e: React.MouseEvent) {
    if (disabled) { e.preventDefault(); return; }
    onClick?.();
    window.location.href = authUrl;
  }

  // ── Dark theme (default) ───────────────────────────────────────────────────
  if (theme === 'dark') {
    return (
      <>
        <style>{`
          .aid-btn-${uid} {
            display: ${fullWidth ? 'flex' : 'inline-flex'};
            width: ${fullWidth ? '100%' : 'auto'};
            align-items: center;
            justify-content: center;
            gap: ${sz.gap}px;
            height: ${sz.h}px;
            padding: 0 ${sz.px}px;
            background: #0d1117;
            border: 1px solid rgba(255,255,255,0.10);
            border-radius: ${sz.r}px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04);
            cursor: ${disabled ? 'not-allowed' : 'pointer'};
            opacity: ${disabled ? 0.45 : 1};
            transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: ${sz.fs}px;
            font-weight: 600;
            color: #f0f0f0;
            letter-spacing: -0.01em;
            text-decoration: none;
            white-space: nowrap;
            user-select: none;
            -webkit-font-smoothing: antialiased;
            outline: none;
            position: relative;
            overflow: hidden;
          }
          .aid-btn-${uid}::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(79,125,243,0.07), rgba(124,91,245,0.04));
            opacity: 0;
            transition: opacity 0.15s;
            pointer-events: none;
          }
          .aid-btn-${uid}:hover:not([aria-disabled="true"])::before {
            opacity: 1;
          }
          .aid-btn-${uid}:hover:not([aria-disabled="true"]) {
            border-color: rgba(79,125,243,0.45);
            box-shadow: 0 2px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,125,243,0.2), inset 0 1px 0 rgba(255,255,255,0.06);
            transform: translateY(-1px);
          }
          .aid-btn-${uid}:active:not([aria-disabled="true"]) {
            transform: translateY(0);
            box-shadow: 0 1px 2px rgba(0,0,0,0.5);
          }
          .aid-btn-${uid}:focus-visible {
            outline: 2px solid rgba(79,125,243,0.6);
            outline-offset: 2px;
          }
        `}</style>

        <button
          className={`aid-btn-${uid}`}
          onClick={handleClick}
          aria-disabled={disabled}
          type="button"
          aria-label={label || 'Sign in with Agent ID'}
        >
          <AgentIDMark size={sz.icon} gradientId={gradientId} />
          <span>{label || 'Sign in with Agent ID'}</span>
        </button>
      </>
    );
  }

  // ── Light theme ────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .aid-btn-${uid} {
          display: ${fullWidth ? 'flex' : 'inline-flex'};
          width: ${fullWidth ? '100%' : 'auto'};
          align-items: center;
          justify-content: center;
          gap: ${sz.gap}px;
          height: ${sz.h}px;
          padding: 0 ${sz.px}px;
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.14);
          border-radius: ${sz.r}px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 1px rgba(0,0,0,0.05);
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          opacity: ${disabled ? 0.45 : 1};
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s, transform 0.1s;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: ${sz.fs}px;
          font-weight: 600;
          color: #1a1a2e;
          letter-spacing: -0.01em;
          text-decoration: none;
          white-space: nowrap;
          user-select: none;
          -webkit-font-smoothing: antialiased;
          outline: none;
        }
        .aid-btn-${uid}:hover:not([aria-disabled="true"]) {
          background: #f7f8ff;
          border-color: rgba(79,125,243,0.35);
          box-shadow: 0 2px 8px rgba(79,125,243,0.12), 0 1px 2px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }
        .aid-btn-${uid}:active:not([aria-disabled="true"]) {
          transform: translateY(0);
          box-shadow: 0 1px 2px rgba(0,0,0,0.08);
        }
        .aid-btn-${uid}:focus-visible {
          outline: 2px solid rgba(79,125,243,0.5);
          outline-offset: 2px;
        }
      `}</style>

      <button
        className={`aid-btn-${uid}`}
        onClick={handleClick}
        aria-disabled={disabled}
        type="button"
        aria-label={label || 'Sign in with Agent ID'}
      >
        <AgentIDMark size={sz.icon} gradientId={gradientId} />
        <span>{label || 'Sign in with Agent ID'}</span>
      </button>
    </>
  );
}

export default SignInWithAgentID;
