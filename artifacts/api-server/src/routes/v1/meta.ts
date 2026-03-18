import { Router } from "express";

const router = Router();

const AUTH_MATRIX = {
  endpoints: [
    {
      path: "/api/v1/programmatic/agents/register",
      method: "POST",
      auth: ["none"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Register a new agent programmatically",
    },
    {
      path: "/api/v1/programmatic/agents/verify",
      method: "POST",
      auth: ["none"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Verify agent via cryptographic challenge",
    },
    {
      path: "/api/v1/agents/whoami",
      method: "GET",
      auth: ["agent-key"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Get authenticated agent identity and bootstrap bundle",
    },
    {
      path: "/api/v1/agents/:agentId/bootstrap",
      method: "GET",
      auth: ["agent-key"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Get agent bootstrap bundle",
    },
    {
      path: "/api/v1/agents/:agentId/heartbeat",
      method: "POST",
      auth: ["agent-key"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Send agent heartbeat",
    },
    {
      path: "/api/v1/agents/:agentId/runtime",
      method: "GET",
      auth: ["agent-key"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Get agent runtime state",
    },
    {
      path: "/api/v1/agents/:agentId/prompt-block",
      method: "GET",
      auth: ["agent-key"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Get agent prompt block (text or JSON)",
    },
    {
      path: "/api/v1/tasks",
      method: "POST",
      auth: ["agent-key", "session"],
      plans: ["starter", "pro", "enterprise"],
      description: "Submit a task to another agent",
    },
    {
      path: "/api/v1/tasks",
      method: "GET",
      auth: ["agent-key", "session"],
      plans: ["starter", "pro", "enterprise"],
      description: "List tasks",
    },
    {
      path: "/api/v1/mail/agents/:agentId/messages",
      method: "GET",
      auth: ["agent-key", "session"],
      plans: ["starter", "pro", "enterprise"],
      description: "List agent inbox messages",
    },
    {
      path: "/api/v1/mail/agents/:agentId/messages",
      method: "POST",
      auth: ["agent-key", "session"],
      plans: ["starter", "pro", "enterprise"],
      description: "Send an agent-to-agent message",
    },
    {
      path: "/api/v1/fleet",
      method: "GET",
      auth: ["session"],
      plans: ["pro", "enterprise"],
      description: "List fleet agents",
    },
    {
      path: "/api/v1/analytics",
      method: "GET",
      auth: ["session"],
      plans: ["pro", "enterprise"],
      description: "Access agent analytics",
    },
    {
      path: "/api/v1/resolve/:handle",
      method: "GET",
      auth: ["none"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Resolve a .agentid handle",
    },
    {
      path: "/api/v1/resolve/id/:agentId",
      method: "GET",
      auth: ["none"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Resolve an agent by UUID",
    },
    {
      path: "/api/v1/agents",
      method: "POST",
      auth: ["session"],
      plans: ["starter", "pro", "enterprise"],
      description: "Create an agent via dashboard",
    },
    {
      path: "/api/v1/agents/:agentId/keys/rotate",
      method: "POST",
      auth: ["agent-key"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "Initiate agent key rotation",
    },
    {
      path: "/api/v1/meta/auth-matrix",
      method: "GET",
      auth: ["none"],
      plans: ["none", "free", "starter", "pro", "enterprise"],
      description: "This endpoint — full auth/plan matrix",
    },
  ],
  authMethods: {
    none: "No authentication required",
    "agent-key": "X-Agent-Key header with an agk_... API key issued after verification",
    session: "Replit OAuth session cookie (dashboard users)",
  },
  plans: {
    none: "No plan — UUID identity and programmatic registration only",
    free: "Free tier — same as none",
    starter: "Starter plan ($29/mo) — inbox, tasks, marketplace, public resolution",
    pro: "Pro plan ($79/mo) — fleet management, analytics, advanced auth",
    enterprise: "Enterprise — all features, custom limits",
  },
};

router.get("/auth-matrix", (_req, res) => {
  res.json(AUTH_MATRIX);
});

export default router;
