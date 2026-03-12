import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { securityHeaders } from "./middlewares/security-headers";
import { requestLogger } from "./middlewares/request-logger";
import { replitAuth } from "./middlewares/replit-auth";
import { apiKeyAuth } from "./middlewares/api-key-auth";
import { errorHandler } from "./middlewares/error-handler";
import { cliDetect, cliMarkdownRoot } from "./middlewares/cli-markdown";

const app: Express = express();

app.use(securityHeaders);
app.use(requestLogger);

const corsOrigins: cors.CorsOptions["origin"] =
  process.env.NODE_ENV === "production" && process.env.REPLIT_DEV_DOMAIN
    ? [`https://${process.env.REPLIT_DEV_DOMAIN}`]
    : true;

app.use(cors({ origin: corsOrigins, credentials: true }));

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

app.use("/api", router);

app.use(errorHandler);

export default app;
