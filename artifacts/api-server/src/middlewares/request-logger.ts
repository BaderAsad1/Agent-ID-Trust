import { createHash } from "crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import { env } from "../lib/env";
import { redactSecrets } from "../lib/redact";

const REDACT_PATHS = [
  "req.headers.authorization",
  'req.headers["x-agent-key"]',
  'req.headers["x-api-key"]',
  'req.headers["x-admin-key"]',
  'req.headers["x-introspection-secret"]',
  "*.apiKey",
  "*.api_key",
  "*.hashedKey",
  "*.rawKey",
  "*.signature",
  "*.privateKey",
  "*.private_key",
  "*.secretKey",
  "*.secret_key",
  "*.stripePaymentMethodId",
  "*.webhookSecret",
];

const PG_ERROR_FIELDS = [
  "code",
  "detail",
  "severity",
  "hint",
  "routine",
  "schema",
  "table",
  "column",
  "constraint",
  "dataType",
  "where",
  "position",
  "internalPosition",
  "internalQuery",
  "file",
  "line",
] as const;

const MAX_CAUSE_DEPTH = 5;
const MAX_QUERY_LENGTH = 2000;

interface SerializedError {
  type?: string;
  message?: string;
  stack?: string;
  query?: string;
  cause?: SerializedError | string;
  errors?: Array<SerializedError | string>;
  [key: string]: unknown;
}

function serializeErrorInner(
  err: unknown,
  depth: number,
  seen: WeakSet<object>,
): SerializedError | string | undefined {
  if (err === null || err === undefined) return undefined;
  if (typeof err !== "object") return String(err);
  if (depth > MAX_CAUSE_DEPTH) return "[CAUSE_DEPTH_LIMIT]";
  if (seen.has(err as object)) return "[CIRCULAR]";
  seen.add(err as object);

  const e = err as Record<string, unknown> & { constructor?: { name?: string } };
  const out: SerializedError = {};

  out.type = (typeof e.name === "string" && e.name) || e.constructor?.name || "Error";
  if (typeof e.message === "string") out.message = e.message;
  // Only attach stack at the top of the chain to avoid log bloat from
  // duplicated frames at every cause level.
  if (depth === 0 && typeof e.stack === "string") out.stack = e.stack;

  for (const field of PG_ERROR_FIELDS) {
    const v = e[field];
    if (v !== undefined && v !== null) {
      out[field] = typeof v === "object" ? String(v) : v;
    }
  }

  if (typeof e.query === "string") {
    out.query = e.query.length > MAX_QUERY_LENGTH ? `${e.query.slice(0, MAX_QUERY_LENGTH)}...[TRUNCATED]` : e.query;
  }

  // AggregateError-style errors (Promise.any, batched ops): include child errors.
  if (Array.isArray((e as { errors?: unknown }).errors)) {
    const arr = (e as { errors: unknown[] }).errors.slice(0, 10);
    out.errors = arr.map(
      (child) => serializeErrorInner(child, depth + 1, seen) as SerializedError | string,
    );
  }

  if (e.cause !== undefined && e.cause !== null) {
    out.cause = serializeErrorInner(e.cause, depth + 1, seen) as SerializedError | string;
  }

  return out;
}

export function serializeError(err: unknown): SerializedError | string | undefined {
  return serializeErrorInner(err, 0, new WeakSet());
}

export const logger = pino({
  level: env().LOG_LEVEL || "info",
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  serializers: {
    err: (err) => serializeError(err) ?? {},
    error: (err) => serializeError(err) ?? {},
  },
  formatters: {
    log(object) {
      return redactSecrets(object) as Record<string, unknown>;
    },
  },
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
    err: (err) => serializeError(err) ?? {},
  },
});
