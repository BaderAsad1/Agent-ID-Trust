import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      agentUa?: {
        raw: string;
        isAgentIdClient: boolean;
        platform: string | null;
      };
    }
  }
}

const AGENTID_CLIENT_PREFIX = "AgentID-Client/";

function parsePlatform(ua: string): string | null {
  const parts = ua.split(/\s+/);
  for (const part of parts) {
    if (part.startsWith(AGENTID_CLIENT_PREFIX)) continue;
    const slashIndex = part.indexOf("/");
    if (slashIndex > 0) {
      return part.substring(0, slashIndex);
    }
    if (part.length > 0) {
      return part;
    }
  }
  return null;
}

export function agentUserAgentMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const rawUa = req.headers["user-agent"];
  const ua = Array.isArray(rawUa) ? rawUa.join(" ") : rawUa ?? "";
  const isAgentIdClient = ua.includes(AGENTID_CLIENT_PREFIX);

  req.agentUa = {
    raw: ua,
    isAgentIdClient,
    platform: isAgentIdClient ? parsePlatform(ua) : null,
  };

  next();
}
