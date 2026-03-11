import { Router, type IRouter } from "express";
import healthRouter from "./health";
import llmsTxtRouter from "./llms-txt";
import v1Router from "./v1";

const router: IRouter = Router();

router.use(healthRouter);
router.use(llmsTxtRouter);
router.use("/v1", v1Router);

export default router;
