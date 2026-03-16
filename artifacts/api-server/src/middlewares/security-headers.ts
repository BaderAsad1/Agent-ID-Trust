import type { Request, Response, NextFunction } from "express";

export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.setHeader("X-AgentID-Platform", "getagent.id");
  res.setHeader("X-AgentID-Version", "1.0");
  res.setHeader("X-AgentID-Registration", "https://getagent.id/agent");
  res.setHeader("X-AgentID-Namespace", ".agentID");
  res.setHeader("X-AgentID-Resolve", "https://getagent.id/api/v1/resolve/{handle}");
  res.removeHeader("X-Powered-By");
  next();
}
