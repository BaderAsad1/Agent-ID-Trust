import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { securityHeaders } from "./middlewares/security-headers";
import { requestLogger } from "./middlewares/request-logger";
import { replitAuth } from "./middlewares/replit-auth";
import { apiKeyAuth } from "./middlewares/api-key-auth";
import { errorHandler } from "./middlewares/error-handler";

const app: Express = express();

app.use(securityHeaders);
app.use(requestLogger);

app.use(
  cors({
    origin: process.env.NODE_ENV === "production"
      ? [process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""]
      : true,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(replitAuth);
app.use(apiKeyAuth);

app.use("/api", router);

app.use(errorHandler);

export default app;
