import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import wellKnownRouter from "./routes/well-known";
import authOidcRouter from "./routes/auth-oidc";
import { securityHeaders } from "./middlewares/security-headers";
import { requestIdMiddleware } from "./middlewares/request-id";
import { requestLogger } from "./middlewares/request-logger";
import { replitAuth } from "./middlewares/replit-auth";
import { apiKeyAuth } from "./middlewares/api-key-auth";
import { errorHandler } from "./middlewares/error-handler";
import { cliDetect, cliMarkdownRoot } from "./middlewares/cli-markdown";
import { apiRateLimiter } from "./middlewares/rate-limit";
import { generateAgentRegistrationMarkdown } from "./services/agent-markdown";
import { env } from "./lib/env";

const config = env();

const app: Express = express();

app.use(requestIdMiddleware);
app.use(securityHeaders);
app.use(requestLogger);

const corsOrigins: cors.CorsOptions["origin"] = (() => {
  if (config.NODE_ENV !== "production") return true;
  const origins: string[] = [];
  if (config.REPLIT_DEV_DOMAIN) origins.push(`https://${config.REPLIT_DEV_DOMAIN}`);
  if (config.BASE_AGENT_DOMAIN) origins.push(`https://${config.BASE_AGENT_DOMAIN}`);
  origins.push("https://getagent.id");
  return origins.length > 0 ? origins : true;
})();

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(cookieParser());

app.use(cliDetect);
app.use(cliMarkdownRoot);

app.use((req, res, next) => {
  if (req.path === "/api/v1/webhooks/stripe") {
    next();
    return;
  }
  express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

app.use(replitAuth);
app.use(apiKeyAuth);
app.use("/api", apiRateLimiter);

app.get("/agent", (_req, res) => {
  const md = generateAgentRegistrationMarkdown();
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(md);
});

app.use(wellKnownRouter);
app.use("/api", authOidcRouter);
app.use("/api", router);

app.use(errorHandler);

export default app;
