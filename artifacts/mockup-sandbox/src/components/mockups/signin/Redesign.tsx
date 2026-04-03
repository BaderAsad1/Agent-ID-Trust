import { useState } from "react";

const ACCENT = "#4f7df3";
const PURPLE = "#7c5bf5";
const BG = "#050711";

export function Redesign() {
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        display: "flex",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#e8e8f0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Global glow orbs */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
      }}>
        <div style={{
          position: "absolute", left: "-10%", top: "10%",
          width: 500, height: 500, borderRadius: "50%",
          background: `radial-gradient(circle, ${PURPLE}28 0%, transparent 70%)`,
        }} />
        <div style={{
          position: "absolute", left: "15%", bottom: "-10%",
          width: 400, height: 400, borderRadius: "50%",
          background: `radial-gradient(circle, ${ACCENT}22 0%, transparent 70%)`,
        }} />
        {/* Subtle grid */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.04 }}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* LEFT PANEL */}
      <div style={{
        flex: "0 0 520px",
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 56px",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}>
        {/* Background gradient for left panel */}
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(135deg, rgba(124,91,245,0.08) 0%, rgba(79,125,243,0.04) 50%, transparent 100%)`,
          pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ marginBottom: 56, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `linear-gradient(135deg, ${ACCENT}, ${PURPLE})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "white",
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: `0 0 16px ${ACCENT}55`,
            }}>
              id
            </div>
            <span style={{
              fontFamily: "'JetBrains Mono', 'Bricolage Grotesque', monospace",
              fontWeight: 700, fontSize: 16, color: "rgba(232,232,240,0.9)",
              letterSpacing: "-0.02em",
            }}>
              agent<span style={{ color: "white" }}>ID</span>
            </span>
          </div>
        </div>

        {/* Headline */}
        <div style={{ marginBottom: 40, position: "relative" }}>
          <h1 style={{
            fontFamily: "'Bricolage Grotesque', 'Inter', sans-serif",
            fontSize: 40, fontWeight: 800, lineHeight: 1.1,
            margin: "0 0 16px",
            background: "linear-gradient(135deg, #ffffff 30%, rgba(232,232,240,0.6) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: "-0.03em",
          }}>
            Your agent deserves an identity.
          </h1>
          <p style={{
            fontSize: 15, color: "rgba(232,232,240,0.5)",
            lineHeight: 1.65, margin: 0, maxWidth: 340,
          }}>
            Verified handles, trust scores, and a payment address built for autonomous AI agents.
          </p>
        </div>

        {/* Agent ID Preview Card */}
        <div style={{
          borderRadius: 16,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "20px 24px",
          marginBottom: 28,
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Card glow */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent, ${ACCENT}60, transparent)`,
          }} />

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: `linear-gradient(135deg, ${ACCENT}44, ${PURPLE}44)`,
              border: `1px solid ${ACCENT}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>
              🤖
            </div>
            <div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 15, fontWeight: 600, color: "white",
                letterSpacing: "-0.01em",
              }}>
                alice.agentid
              </div>
              <div style={{ fontSize: 12, color: "rgba(232,232,240,0.4)", marginTop: 2 }}>
                Verified Agent
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "rgba(79,125,243,0.12)", border: "1px solid rgba(79,125,243,0.25)",
                borderRadius: 20, padding: "4px 10px",
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                <span style={{ fontSize: 11, color: ACCENT, fontWeight: 600 }}>98 trust</span>
              </div>
            </div>
          </div>

          {/* Capability pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["Payments", "OAuth 2.0", "Memory", "MCP"].map((cap) => (
              <span key={cap} style={{
                fontSize: 11, fontWeight: 500,
                padding: "3px 9px", borderRadius: 99,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(232,232,240,0.55)",
              }}>
                {cap}
              </span>
            ))}
          </div>
        </div>

        {/* Social proof */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex" }}>
            {["🔵", "🟣", "🟢", "🔴"].map((c, i) => (
              <div key={i} style={{
                width: 26, height: 26, borderRadius: "50%",
                background: `hsl(${i * 60 + 220}, 60%, 45%)`,
                border: "2px solid " + BG,
                marginLeft: i === 0 ? 0 : -8,
                fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontWeight: 700, fontSize: 10,
              }}>
                {["A", "B", "C", "D"][i]}
              </div>
            ))}
          </div>
          <span style={{ fontSize: 13, color: "rgba(232,232,240,0.35)" }}>
            Trusted by <strong style={{ color: "rgba(232,232,240,0.6)" }}>2,400+</strong> agents
          </span>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{
        flex: 1,
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 48px",
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>

          {/* Heading */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{
              fontFamily: "'Bricolage Grotesque', 'Inter', sans-serif",
              fontSize: 26, fontWeight: 700, color: "#ffffff",
              margin: "0 0 8px",
              letterSpacing: "-0.02em",
            }}>
              Create your account
            </h2>
            <p style={{ fontSize: 14, color: "rgba(232,232,240,0.4)", margin: 0 }}>
              Free forever. No credit card required.
            </p>
          </div>

          {/* OAuth Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {/* GitHub */}
            <button style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "#e8e8f0", fontSize: 14, fontWeight: 500,
              cursor: "pointer", width: "100%",
              transition: "all 0.15s",
              fontFamily: "inherit",
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.09)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }}
            >
              <GitHubIcon />
              Continue with GitHub
            </button>

            {/* Google */}
            <button style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "#e8e8f0", fontSize: 14, fontWeight: 500,
              cursor: "pointer", width: "100%",
              transition: "all 0.15s",
              fontFamily: "inherit",
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.09)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }}
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            <span style={{ fontSize: 12, color: "rgba(232,232,240,0.28)", whiteSpace: "nowrap" }}>
              or continue with email
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>

          {/* Email form */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ position: "relative" }}>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "12px 44px 12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${focused ? `${ACCENT}88` : "rgba(255,255,255,0.1)"}`,
                  background: "rgba(255,255,255,0.04)",
                  color: "#f0f0f5", fontSize: 14, outline: "none",
                  fontFamily: "inherit",
                  boxShadow: focused ? `0 0 0 3px ${ACCENT}18` : "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
              />
              {email && (
                <div style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  width: 18, height: 18, borderRadius: "50%",
                  background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          <button
            style={{
              width: "100%", padding: "13px 20px", borderRadius: 10, border: "none",
              background: `linear-gradient(135deg, ${ACCENT}, ${PURPLE})`,
              color: "white", fontSize: 14, fontWeight: 600,
              cursor: "pointer", marginBottom: 24,
              fontFamily: "inherit",
              boxShadow: `0 4px 20px ${ACCENT}40`,
              letterSpacing: "0.01em",
              transition: "opacity 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = `0 6px 28px ${ACCENT}60`;
              e.currentTarget.style.opacity = "0.92";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = `0 4px 20px ${ACCENT}40`;
              e.currentTarget.style.opacity = "1";
            }}
          >
            Send magic link
          </button>

          {/* Sign in toggle */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <span style={{ fontSize: 13, color: "rgba(232,232,240,0.35)" }}>
              Already have an account?{" "}
            </span>
            <button style={{
              background: "none", border: "none", padding: 0,
              fontSize: 13, color: ACCENT, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 500,
            }}>
              Sign in
            </button>
          </div>

          {/* Trust indicators */}
          <div style={{
            borderRadius: 10,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            padding: "14px 16px",
            display: "flex", gap: 20, justifyContent: "center",
            marginBottom: 20,
          }}>
            {[
              { icon: "🔒", label: "No password" },
              { icon: "⚡", label: "Instant setup" },
              { icon: "✨", label: "Free plan" },
            ].map(({ icon, label }) => (
              <div key={label} style={{
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 13 }}>{icon}</span>
                <span style={{ fontSize: 12, color: "rgba(232,232,240,0.38)", fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Terms */}
          <p style={{
            textAlign: "center", fontSize: 11.5,
            color: "rgba(232,232,240,0.22)", lineHeight: 1.6, margin: 0,
          }}>
            By continuing, you agree to our{" "}
            <span style={{ color: "rgba(232,232,240,0.4)", textDecoration: "underline", cursor: "pointer" }}>Terms</span>
            {" "}and{" "}
            <span style={{ color: "rgba(232,232,240,0.4)", textDecoration: "underline", cursor: "pointer" }}>Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
