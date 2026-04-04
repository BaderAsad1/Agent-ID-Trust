import { Router, type Request, type Response } from "express";
import { getGlossaryIndexHtml, getGlossaryTermHtml } from "../seo/glossary";
import { getGuidesIndexHtml, getGuideHtml } from "../seo/guides";
import { getUseCasesIndexHtml, getUseCaseHtml } from "../seo/use-cases";
import { getComparisonsIndexHtml, getComparisonHtml } from "../seo/comparisons";

const CACHE_HEADER = "public, max-age=86400";
const router = Router();

function sendHtml(res: Response, html: string): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", CACHE_HEADER);
  res.send(html);
}

router.get("/glossary", (_req: Request, res: Response) => {
  sendHtml(res, getGlossaryIndexHtml());
});

router.get("/glossary/:slug", (req: Request<{ slug: string }>, res: Response) => {
  const html = getGlossaryTermHtml(req.params.slug);
  if (!html) {
    res.status(404).setHeader("Cache-Control", CACHE_HEADER).send("Term not found");
    return;
  }
  sendHtml(res, html);
});

router.get("/guides", (_req: Request, res: Response) => {
  sendHtml(res, getGuidesIndexHtml());
});

router.get("/guides/:slug", (req: Request<{ slug: string }>, res: Response) => {
  const html = getGuideHtml(req.params.slug);
  if (!html) {
    res.status(404).setHeader("Cache-Control", CACHE_HEADER).send("Guide not found");
    return;
  }
  sendHtml(res, html);
});

router.get("/use-cases", (_req: Request, res: Response) => {
  sendHtml(res, getUseCasesIndexHtml());
});

router.get("/use-cases/:slug", (req: Request<{ slug: string }>, res: Response) => {
  const html = getUseCaseHtml(req.params.slug);
  if (!html) {
    res.status(404).setHeader("Cache-Control", CACHE_HEADER).send("Use case not found");
    return;
  }
  sendHtml(res, html);
});

router.get("/compare", (_req: Request, res: Response) => {
  sendHtml(res, getComparisonsIndexHtml());
});

router.get("/compare/:slug", (req: Request<{ slug: string }>, res: Response) => {
  const html = getComparisonHtml(req.params.slug);
  if (!html) {
    res.status(404).setHeader("Cache-Control", CACHE_HEADER).send("Comparison not found");
    return;
  }
  sendHtml(res, html);
});

export default router;
