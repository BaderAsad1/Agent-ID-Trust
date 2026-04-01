import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const linkStyle = {
  color: 'rgba(232,232,240,0.4)',
  textDecoration: 'none',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  lineHeight: '1.4',
  transition: 'color 0.15s ease',
} as const;

const headingStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'rgba(232,232,240,0.25)',
  marginBottom: 8,
};

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      style={linkStyle}
      className="hover:opacity-80 transition-opacity"
    >
      {children}
    </Link>
  );
}

function FooterExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={linkStyle}
      className="hover:opacity-80 transition-opacity"
    >
      {children}
    </a>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'var(--bg-base)' }}>
      <div className="max-w-[1100px] mx-auto px-6 md:px-12 py-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <img
                src={`${import.meta.env.BASE_URL}app-icon.png`}
                alt="Agent ID"
                style={{ width: 22, height: 22, borderRadius: 5 }}
              />
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}>Agent ID</span>
            </div>
            <p style={{ color: 'rgba(232,232,240,0.25)', fontSize: 12, lineHeight: 1.65, maxWidth: 180 }}>
              Identity, Trust, and Routing for the Agent Internet.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <FooterExternalLink href="https://x.com/getagentid">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block', opacity: 0.5 }}>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.851L1.254 2.25H8.08l4.254 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
                </svg>
              </FooterExternalLink>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p style={headingStyle}>Product</p>
            <FooterLink to="/marketplace">Marketplace</FooterLink>
            <FooterLink to="/jobs">Jobs</FooterLink>
            <FooterLink to="/pricing">Pricing</FooterLink>
          </div>

          <div className="flex flex-col gap-1.5">
            <p style={headingStyle}>Developers</p>
            <FooterLink to="/docs">Docs</FooterLink>
            <FooterLink to="/docs/quickstart">Quickstart</FooterLink>
            <FooterLink to="/docs/webhooks">Webhooks</FooterLink>
            <FooterLink to="/changelog">Changelog</FooterLink>
            <FooterExternalLink href="https://status.getagent.id">Status</FooterExternalLink>
          </div>

          <div className="flex flex-col gap-1.5">
            <p style={headingStyle}>Company</p>
            <FooterLink to="/protocol">About / Protocol</FooterLink>
            <FooterLink to="/security">Security</FooterLink>
            <FooterLink to="/bug-bounty">Bug Bounty</FooterLink>
          </div>

          <div className="flex flex-col gap-1.5">
            <p style={headingStyle}>Legal</p>
            <FooterLink to="/privacy">Privacy</FooterLink>
            <FooterLink to="/terms">Terms</FooterLink>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontSize: 11, color: 'rgba(232,232,240,0.2)', fontFamily: 'var(--font-body)' }}>
            &copy; {new Date().getFullYear()} Agent ID. All rights reserved.
          </p>
          <p style={{ fontSize: 11, color: 'rgba(232,232,240,0.15)', fontFamily: 'var(--font-body)' }}>
            Identity infrastructure for the agentic web
          </p>
        </div>
      </div>
    </footer>
  );
}
