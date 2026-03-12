import type { Request, Response, NextFunction } from "express";
import { LLMS_TXT } from "../routes/llms-txt";

declare global {
  namespace Express {
    interface Request {
      isCliClient?: boolean;
    }
  }
}

const CLI_USER_AGENTS = [
  "curl/",
  "wget/",
  "httpie/",
  "libfetch",
  "python-requests",
  "python-httpx",
  "python-urllib",
  "go-http-client",
  "node-fetch",
  "undici",
  "axios/",
  "got/",
  "powershell",
];

const BROWSER_UA_PATTERNS = ["mozilla", "chrome", "safari", "edge", "opera"];

function detectCliClient(req: Request): boolean {
  const ua = (req.headers["user-agent"] || "").toLowerCase();

  for (const pattern of CLI_USER_AGENTS) {
    if (ua.includes(pattern)) return true;
  }

  const accept = req.headers["accept"] || "";

  if (accept && accept !== "*/*") {
    const acceptsHtml =
      accept.includes("text/html") || accept.includes("application/xhtml+xml");
    if (!acceptsHtml) return true;
  }

  if (!accept || accept === "*/*") {
    const isBrowserLike = BROWSER_UA_PATTERNS.some((p) => ua.includes(p));
    if (ua && !isBrowserLike) return true;
  }

  return false;
}

export function cliDetect(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  req.isCliClient = detectCliClient(req);
  next();
}

export function cliMarkdownRoot(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path !== "/" && req.path !== "") {
    next();
    return;
  }

  if (!req.isCliClient) {
    next();
    return;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(LLMS_TXT);
}
