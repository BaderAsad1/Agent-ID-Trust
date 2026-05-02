/**
 * E2E test for the Agent ID Mail compose-modal attachment upload flow.
 *
 * Positive test (T1):
 *   Open Compose, attach a small text/plain file via a *real* drag-and-drop
 *   onto the dropzone (synthesized DataTransfer + dispatchEvent), verify the
 *   chip renders, click Send, and assert the attachment row both
 *     (a) persists in the database (canonical source of truth), and
 *     (b) is observable through the public mail API
 *         (`GET /v1/mail/agents/:agentId/messages` and the per-message
 *         endpoint that includes the `attachments[]` array).
 *
 * Negative test (T2 — disallowed MIME):
 *   Attach an .exe (application/x-msdownload) via the file input, assert the
 *   client-side validation banner fires and that no chip is rendered.
 *
 * Negative test (T3 — oversize):
 *   Always run, regardless of whether the server is in inline (~500 KB) or
 *   R2-backed (~100 MB) mode. We allocate `maxFileSizeBytes + 1 KiB` and
 *   verify the client-side validator surfaces the "exceeds … limit" banner
 *   and does not add a chip. A 100 MB Buffer.alloc is cheap (allocUnsafe-ish)
 *   and well within Node default heap.
 *
 * --- Auth ---
 * The api-server uses session-cookie auth (`sid` = 64-char hex; the session
 * row in `sessions` is JSON of shape `{ user: {...} }`). Real login goes
 * through `/api/auth/{github,google,magic-link,agentid}` — none of these have
 * a programmatic test bypass exposed by the application server.
 *
 * The Replit Auth testing harness's `testReplitAuth: true` flag (see
 * `.local/skills/testing/replit-auth.md`) only applies inside the `runTest()`
 * subagent. It overrides `ISSUER_URL` for that subagent's process — it is NOT
 * available to a standalone Playwright spec invoked via `pnpm test:e2e`,
 * because the running api-server is not started by the test runner.
 *
 * To exercise the real production auth code path (`replitAuth` middleware →
 * `loadUserFromSession` → cookie → `sessions` table → `users` row), the
 * spec seeds a session row directly via Postgres and sets the `sid` cookie
 * on the browser context. This is the standard pattern for cookie-session
 * apps that lack a test-fixture login endpoint, and it exercises every
 * branch of the auth middleware that an OIDC redirect would land in.
 *
 * Plan gating: getUserPlan() reads `subscriptions`, NOT `users.plan`.
 * Without an active subscription, mail endpoints return 429.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanupSeededUser,
  fetchLatestOutboundAttachments,
  seedPaidUserWithAgent,
  type SeededTestUser,
} from "./helpers/db";

let seeded: SeededTestUser;

/**
 * Open the Compose modal and return a locator scoped to the dialog.
 *
 * The fixed top nav can intercept normal Playwright clicks, so we fall back
 * to a programmatic click on the underlying button element.
 */
async function openComposeModal(page: import("@playwright/test").Page) {
  await page.goto("/mail", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/sign-in/);

  const composeButton = page.getByRole("button", { name: /^Compose$/i }).first();
  await expect(composeButton).toBeVisible();
  await composeButton.evaluate((el) => (el as HTMLButtonElement).click());

  const dialog = page
    .getByRole("heading", { name: "Compose Message" })
    .locator("..")
    .locator("..");
  await expect(dialog.getByRole("heading", { name: "Compose Message" })).toBeVisible();
  return dialog;
}

/**
 * Dispatch a real drag-and-drop sequence onto the dropzone.
 *
 * Playwright's `setInputFiles` is convenient but does NOT exercise the
 * `onDragEnter`/`onDragOver`/`onDrop` handlers that real users hit. The
 * `AttachmentDropzone` component (artifacts/agent-id/src/pages/Mail.tsx)
 * keeps drag state internally and reads `e.dataTransfer.files` in onDrop;
 * we reproduce that contract here by constructing a `DataTransfer` in the
 * page context and dispatching the three drag events with it.
 */
async function dropFileOnDropzone(
  dialog: import("@playwright/test").Locator,
  file: { name: string; mimeType: string; bytes: Buffer },
) {
  const dropzone = dialog
    .locator('[role="button"]')
    .filter({ hasText: /Drop files|click to attach/i })
    .first();
  await expect(dropzone).toBeVisible();

  await dropzone.evaluate(
    (el, payload: { name: string; mimeType: string; base64: string }) => {
      const bin = atob(payload.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], payload.name, { type: payload.mimeType });

      const dt = new DataTransfer();
      dt.items.add(file);

      const fire = (type: string) => {
        const ev = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        el.dispatchEvent(ev);
      };
      fire("dragenter");
      fire("dragover");
      fire("drop");
    },
    {
      name: file.name,
      mimeType: file.mimeType,
      base64: file.bytes.toString("base64"),
    },
  );
}

/**
 * Verify (via the public mail API) that the latest outbound message for the
 * agent has an attachment with the expected filename + mime + size.
 */
async function verifyAttachmentViaApi(
  api: APIRequestContext,
  agentId: string,
  expected: { filename: string; mimeType: string; sizeBytes: number },
): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastBody: unknown = null;

  while (Date.now() < deadline) {
    const listRes = await api.get(
      `/api/v1/mail/agents/${agentId}/messages?direction=outbound&limit=10`,
    );
    expect(
      listRes.status(),
      `messages list returned ${listRes.status()}`,
    ).toBeLessThan(400);

    const listBody = (await listRes.json()) as {
      messages?: Array<{ id: string }>;
    };
    lastBody = listBody;
    const messages = Array.isArray(listBody.messages) ? listBody.messages : [];

    for (const msg of messages) {
      const detailRes = await api.get(
        `/api/v1/mail/agents/${agentId}/messages/${msg.id}`,
      );
      if (detailRes.status() >= 400) continue;
      const detail = (await detailRes.json()) as {
        attachments?: Array<{ filename: string; contentType: string; size: number }>;
      };
      const found = (detail.attachments ?? []).find(
        (a) => a.filename === expected.filename,
      );
      if (found) {
        expect(found.contentType).toBe(expected.mimeType);
        expect(found.size).toBe(expected.sizeBytes);
        return;
      }
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `expected attachment ${expected.filename} to appear via API within 30s; last response: ${JSON.stringify(lastBody)}`,
  );
}

test.describe("Mail compose modal — attachment upload", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    seeded = await seedPaidUserWithAgent();

    if (!baseURL) throw new Error("E2E_BASE_URL or REPLIT_DEV_DOMAIN must be set");
    const url = new URL(baseURL);
    await context.addCookies([
      {
        name: "sid",
        value: seeded.sid,
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
  });

  test.afterEach(async () => {
    if (seeded) await cleanupSeededUser(seeded);
  });

  test("positive — drag-drop attachment uploads, persists in DB, and is observable via API", async ({ page }) => {
    const dialog = await openComposeModal(page);

    await dialog.getByPlaceholder("or enter address...").fill("qa-recipient@example.com");
    await dialog.getByPlaceholder("Subject...").fill(`QA mail attachment ${seeded.suffix}`);
    await dialog
      .getByPlaceholder("Type your message...")
      .fill(`Hello from automated QA ${seeded.suffix}`);

    const fileName = `hello-${seeded.suffix}.txt`;
    const fileBody = "hello world from QA";
    const fileBytes = Buffer.from(fileBody, "utf-8");

    // Real drag-and-drop, not setInputFiles — this exercises the onDrop
    // handler the user actually hits.
    await dropFileOnDropzone(dialog, {
      name: fileName,
      mimeType: "text/plain",
      bytes: fileBytes,
    });

    // Chip renders with filename.
    await expect(dialog.getByText(fileName, { exact: false })).toBeVisible();

    const sendButton = dialog.getByRole("button", { name: /^Send$/i });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // Persistence — DB (canonical) ...
    let dbAttachments = await fetchLatestOutboundAttachments(seeded.agentId);
    const dbDeadline = Date.now() + 30_000;
    while (
      dbAttachments.find((a) => a.fileName === fileName) === undefined &&
      Date.now() < dbDeadline
    ) {
      await page.waitForTimeout(500);
      dbAttachments = await fetchLatestOutboundAttachments(seeded.agentId);
    }
    const persisted = dbAttachments.find((a) => a.fileName === fileName);
    expect(
      persisted,
      `expected ${fileName} in message_attachments within 30s; saw ${JSON.stringify(dbAttachments)}`,
    ).toBeDefined();
    expect(persisted!.mimeType).toBe("text/plain");
    expect(persisted!.sizeBytes).toBe(fileBytes.byteLength);

    // ... and through the public mail API.
    await verifyAttachmentViaApi(page.context().request, seeded.agentId, {
      filename: fileName,
      mimeType: "text/plain",
      sizeBytes: fileBytes.byteLength,
    });
  });

  test("negative — disallowed MIME is rejected client-side", async ({ page }) => {
    const dialog = await openComposeModal(page);

    await dialog
      .getByPlaceholder("Type your message...")
      .fill(`negative case ${seeded.suffix}`);

    const exeName = `evil-${seeded.suffix}.exe`;
    await dialog.locator('input[type="file"]').setInputFiles({
      name: exeName,
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("MZfake", "utf-8"),
    });

    await expect(
      dialog.getByText(`file type "application/x-msdownload" is not allowed`),
    ).toBeVisible();

    // No chip should have been added for the rejected file.
    await expect(dialog.locator("span", { hasText: exeName })).toHaveCount(0);
  });

  test("negative — oversize file is rejected client-side", async ({ page }) => {
    const limitsRes = await page
      .context()
      .request.get("/api/v1/mail/attachment-limits");
    expect(
      limitsRes.status(),
      `attachment-limits returned ${limitsRes.status()}`,
    ).toBeLessThan(400);
    const limitsBody = (await limitsRes.json()) as { maxFileSizeBytes?: number };
    const maxFileSizeBytes = limitsBody.maxFileSizeBytes;
    expect(typeof maxFileSizeBytes, "server must return numeric maxFileSizeBytes").toBe("number");

    const dialog = await openComposeModal(page);

    await dialog
      .getByPlaceholder("Type your message...")
      .fill(`oversize case ${seeded.suffix}`);

    const bigName = `big-${seeded.suffix}.bin`;
    // Always run, regardless of inline (~500 KB) or R2 (~100 MB) mode.
    // Playwright's `setInputFiles({ buffer })` caps payloads at ~50 MB, so
    // for the R2 case we materialize the oversize buffer to a temp file on
    // disk and feed the file path instead — this is unaffected by the cap
    // and exercises the same client-side validator branch (`f.size > limit`).
    const oversizeBytes = (maxFileSizeBytes as number) + 1024;
    const tmpDir = mkdtempSync(join(tmpdir(), "mail-e2e-"));
    const tmpPath = join(tmpDir, bigName);
    try {
      writeFileSync(tmpPath, Buffer.alloc(oversizeBytes));
      await dialog.locator('input[type="file"]').setInputFiles(tmpPath);

      const banner = dialog.locator("div", { hasText: /exceeds/i }).first();
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/limit/i);
      await expect(dialog.locator("span", { hasText: bigName })).toHaveCount(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
