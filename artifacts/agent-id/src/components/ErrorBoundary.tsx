import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          position: 'fixed', inset: 0, zIndex: 99998,
          background: '#050711',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 16,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            marginBottom: 24,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 24, fontWeight: 700, color: '#e8e8f0',
            margin: '0 0 12px',
          }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: '#8690a8', lineHeight: 1.6, margin: '0 0 32px' }}>
            An unexpected error occurred. This has been logged.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.history.back()}
              style={{
                padding: '12px 32px', fontSize: 14, fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
                background: 'transparent',
                color: '#e8e8f0', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 12, cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Go back
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 32px', fontSize: 14, fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
                background: 'linear-gradient(135deg, #4f7df3, #6366f1)',
                color: '#fff', border: 'none', borderRadius: 12,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Refresh page
            </button>
          </div>
          {this.state.error && process.env.NODE_ENV !== 'production' && (
            <pre style={{
              marginTop: 32, padding: 16, borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              fontSize: 11, color: '#8690a8', textAlign: 'left',
              overflow: 'auto', maxHeight: 200,
            }}>
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
