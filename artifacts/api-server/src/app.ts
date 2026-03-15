import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import wellKnownRouter from "./routes/well-known";
import authOidcRouter from "./routes/auth-oidc";
import { securityHeaders } from "./middlewares/security-headers";
import { requestLogger } from "./middlewares/request-logger";
import { replitAuth } from "./middlewares/replit-auth";
import { apiKeyAuth } from "./middlewares/api-key-auth";
import { errorHandler } from "./middlewares/error-handler";
import { cliDetect, cliMarkdownRoot } from "./middlewares/cli-markdown";
import { apiRateLimiter } from "./middlewares/rate-limit";

const app: Express = express();

app.use(securityHeaders);
app.use(requestLogger);

const corsOrigins: cors.CorsOptions["origin"] = (() => {
  if (process.env.NODE_ENV !== "production") return true;
  const origins: string[] = [];
  if (process.env.REPLIT_DEV_DOMAIN) origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  if (process.env.BASE_AGENT_DOMAIN) origins.push(`https://${process.env.BASE_AGENT_DOMAIN}`);
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

app.use(wellKnownRouter);
app.use("/api", authOidcRouter);
app.use("/api", router);

app.use(errorHandler);

export default app;
