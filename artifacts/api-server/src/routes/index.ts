import { Router, type IRouter } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import healthRouter from "./health";
import llmsTxtRouter from "./llms-txt";
import v1Router from "./v1";
import swaggerUi from "swagger-ui-express";
import yaml from "js-yaml";

const router: IRouter = Router();

router.use(healthRouter);
router.use(llmsTxtRouter);
router.use("/v1", v1Router);

try {
  const candidates = [
    resolve(process.cwd(), "../../lib/api-spec/openapi.yaml"),
    resolve(process.cwd(), "lib/api-spec/openapi.yaml"),
  ];
  const specPath = candidates.find((p) => { try { readFileSync(p); return true; } catch { return false; } });
  if (!specPath) throw new Error("openapi.yaml not found");
  const specContent = readFileSync(specPath, "utf8");
  const swaggerDoc = yaml.load(specContent) as Record<string, unknown>;
  router.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc, { customSiteTitle: "Agent ID API Docs" }));
  router.get("/docs/openapi.yaml", (_req, res) => {
    res.type("text/yaml").send(specContent);
  });
} catch {
  router.get("/docs", (req, res) => {
    const requestId = (req as unknown as { requestId?: string }).requestId || req.headers["x-request-id"] || "unknown";
    res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "API documentation not available", requestId });
  });
}

export default router;
