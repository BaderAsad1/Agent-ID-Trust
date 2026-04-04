import pino from "pino";
import pinoHttp from "pino-http";

const level = process.env.LOG_LEVEL || "info";

export const logger = pino({
  level,
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});

export const requestLogger = pinoHttp({
  logger,
  autoLogging: true,
  genReqId(req) {
    const rid = req.headers["x-request-id"];
    return (Array.isArray(rid) ? rid[0] : rid) || "unknown";
  },
  customLogLevel(_req, res, err) {
    if (err || (res.statusCode && res.statusCode >= 500)) return "error";
    if (res.statusCode && res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req(req) {
      return { method: req.method, url: req.url };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});
