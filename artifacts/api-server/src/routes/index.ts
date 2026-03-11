import { Router, type IRouter } from "express";
import healthRouter from "./health";
import llmsTxtRouter from "./llms-txt";

const router: IRouter = Router();

router.use(healthRouter);
router.use(llmsTxtRouter);

export default router;
