import type { Request, Response, NextFunction } from "express";
import { LLMS_TXT } from "../routes/llms-txt";

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

function isCliClient(req: Request): boolean {
  const ua = (req.headers["user-agent"] || "").toLowerCase();

  for (const pattern of CLI_USER_AGENTS) {
    if (ua.includes(pattern)) return true;
  }

  const accept = req.headers["accept"] || "";
  if (!accept || accept === "*/*") {
    if (ua && !ua.includes("mozilla") && !ua.includes("chrome") && !ua.includes("safari") && !ua.includes("edge") && !ua.includes("opera")) {
      return true;
    }
  }

  return false;
}

export function cliMarkdown(req: Request, res: Response, next: NextFunction): void {
  if (req.path !== "/" && req.path !== "") {
    next();
    return;
  }

  if (!isCliClient(req)) {
    next();
    return;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(LLMS_TXT);
}
