import { createHash } from "crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import { env } from "../lib/env";

export const logger = pino({
  level: env().LOG_LEVEL || "info",
  transport:
    env().NODE_ENV !== "production"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});

function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export const requestLogger = pinoHttp({
  logger,
  autoLogging: true,
  genReqId(req) {
    const rid = (req as unknown as { requestId?: string }).requestId ?? req.headers["x-request-id"];
    return (Array.isArray(rid) ? rid[0] : rid) || "unknown";
  },
  customProps(req) {
    const r = req as unknown as { requestId?: string; userId?: string; authenticatedAgent?: { id: string }; ip?: string | string[] };
    return {
      requestId: r.requestId,
      userId: r.userId ?? undefined,
      agentId: r.authenticatedAgent?.id ?? undefined,
      hashedIp: hashIp(Array.isArray(r.ip) ? r.ip[0] : r.ip),
    };
  },
  customLogLevel(_req, res, err) {
    if (err || (res.statusCode && res.statusCode >= 500)) return "error";
    if (res.statusCode && res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage(req, _res, err) {
    return `${req.method} ${req.url} ${err.message}`;
  },
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        requestId: req.raw?.requestId,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});
