/**
 * NDR end-to-end test — verifies that undeliverable inbound emails produce a
 * Non-Delivery Report (NDR) bounce back to the original sender via the Resend
 * transport boundary, while sender loops (getagent.id, mailer-daemon@,
 * postmaster@) are suppressed.
 *
 * Mocks: @workspace/db, mail/mail-templates/webhook-delivery services, and
 * deliverOutbound from mail-transport (the SDK boundary). The real route
 * handler at /webhooks/resend/inbound and the real routeInboundEmail logic
 * are exercised end-to-end with a signed Svix payload.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { createHmac } from "crypto";

const TEST_SECRET = "whsec_" + Buffer.from("ndr-test-secret-bytes-32characters!!").toString("base64");

beforeAll(async () => {
  process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
  process.env.RESEND_API_KEY = "test-resend-api-key";
  process.env.FROM_EMAIL = "mailer-daemon@getagent.id";
  process.env.MAIL_BASE_DOMAIN = "getagent.id";
  const { _resetEnvCacheForTests } = await import("../lib/env");
  _resetEnvCacheForTests();
});

const inboxLookup = vi.fn();
const agentLookup = vi.fn();
const subscriptionLookup = vi.fn();
const messageLookup = vi.fn();
const userLookup = vi.fn();

const insertedRows: Array<{ table: unknown; values: unknown }> = [];

vi.mock("@workspace/db", () => {
  const insertChain = (table: unknown) => ({
    values: vi.fn().mockImplementation(async (values: unknown) => {
      insertedRows.push({ table, values });
      return undefined;
    }),
  });
  const updateChain = () => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
  return {
    db: {
      query: {
        agentInboxesTable: { findFirst: (...a: unknown[]) => inboxLookup(...a) },
        agentsTable: { findFirst: (...a: unknown[]) => agentLookup(...a) },
        agentSubscriptionsTable: { findFirst: (...a: unknown[]) => subscriptionLookup(...a) },
        agentMessagesTable: { findFirst: (...a: unknown[]) => messageLookup(...a) },
        usersTable: { findFirst: (...a: unknown[]) => userLookup(...a) },
      },
      insert: (table: unknown) => insertChain(table),
      update: () => updateChain(),
    },
  };
});

const mockDeliverOutbound = vi.fn();

vi.mock("../services/mail-transport", () => ({
  deliverOutbound: (...args: unknown[]) => mockDeliverOutbound(...args),
}));

vi.mock("../services/mail", () => ({
  getOrCreateInbox: vi.fn().mockResolvedValue(null),
  sendMessage: vi.fn(),
  recordInboundTransport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/mail-templates", () => ({
  queueMessageNotification: vi.fn(),
}));

vi.mock("../services/webhook-delivery", () => ({
  deliverWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

function signPayload(payload: object): {
  rawBody: string;
  headers: Record<string, string>;
} {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const svixId = `msg_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const secretBytes = Buffer.from(TEST_SECRET.slice(6), "base64");
  const toSign = `${svixId}.${timestamp}.${rawBody}`;
  const signature = createHmac("sha256", secretBytes).update(toSign).digest("base64");
  return {
    rawBody,
    headers: {
      "svix-id": svixId,
      "svix-timestamp": String(timestamp),
      "svix-signature": `v1,${signature}`,
    },
  };
}

async function buildApp() {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  const { default: resendRouter } = await import("../routes/v1/resend-webhooks");
  app.use("/webhooks", resendRouter);
  return app;
}

function buildPayload(overrides: {
  from: string;
  to: string;
  subject?: string;
  text?: string;
  message_id?: string;
}) {
  return {
    type: "email.received",
    created_at: new Date().toISOString(),
    data: {
      from: overrides.from,
      to: overrides.to,
      subject: overrides.subject ?? "Hello there",
      text: overrides.text ?? "This is a test email body.",
      ...(overrides.message_id ? { message_id: overrides.message_id } : {}),
    },
  };
}

async function postSigned(app: express.Express, payload: object) {
  const { rawBody, headers } = signPayload(payload);
  return request(app)
    .post("/webhooks/resend/inbound")
    .set("Content-Type", "application/json")
    .set("svix-id", headers["svix-id"])
    .set("svix-timestamp", headers["svix-timestamp"])
    .set("svix-signature", headers["svix-signature"])
    .send(rawBody);
}

describe("Inbound NDR — end-to-end via /webhooks/resend/inbound", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    insertedRows.length = 0;
    mockDeliverOutbound.mockResolvedValue({
      success: true,
      providerName: "resend",
      providerMessageId: "mock-msg-id",
    });
    inboxLookup.mockResolvedValue(null);
    agentLookup.mockResolvedValue(null);
    subscriptionLookup.mockResolvedValue(null);
    messageLookup.mockResolvedValue(null);
    userLookup.mockResolvedValue(null);
    app = await buildApp();
  });

  it("sends an NDR with correct sender, subject, and reason for unknown_recipient", async () => {
    inboxLookup.mockResolvedValue(null);
    agentLookup.mockResolvedValue(null);

    const res = await postSigned(
      app,
      buildPayload({
        from: "alice@external.example",
        to: "ghost@getagent.id",
        subject: "Project sync",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, undeliverable: 1 });

    expect(mockDeliverOutbound).toHaveBeenCalledTimes(1);
    const envelope = mockDeliverOutbound.mock.calls[0][0];
    expect(envelope.to).toBe("alice@external.example");
    expect(envelope.subject).toBe("Undelivered: Project sync");
    expect(envelope.body).toContain("ghost@getagent.id");
    expect(envelope.body).toContain("does not exist on getagent.id");
    expect(envelope.isSystemNotification).toBe(true);
    expect(envelope.noRetry).toBe(true);
    expect(envelope.from).toMatch(/@getagent\.id$/);
  });

  it("sends an NDR for plan_not_eligible with the right reason text", async () => {
    inboxLookup.mockResolvedValue(null);
    agentLookup.mockResolvedValue({ id: "agent-no-plan", trustScore: 0 });
    subscriptionLookup.mockResolvedValue(null);

    const res = await postSigned(
      app,
      buildPayload({
        from: "carol@external.example",
        to: "noplan@getagent.id",
        subject: "Quick question",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.undeliverable).toBe(1);

    expect(mockDeliverOutbound).toHaveBeenCalledTimes(1);
    const envelope = mockDeliverOutbound.mock.calls[0][0];
    expect(envelope.to).toBe("carol@external.example");
    expect(envelope.subject).toBe("Undelivered: Quick question");
    expect(envelope.body).toContain("noplan@getagent.id");
    expect(envelope.body).toContain("not currently accepting email");
  });

  it("sends an NDR for inbox_inactive with the right reason text", async () => {
    inboxLookup.mockResolvedValue({
      id: "inbox-disabled",
      agentId: "agent-disabled",
      address: "disabled@getagent.id",
      status: "disabled",
    });

    const res = await postSigned(
      app,
      buildPayload({
        from: "dan@external.example",
        to: "disabled@getagent.id",
        subject: "Trying to reach you",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.undeliverable).toBe(1);

    expect(mockDeliverOutbound).toHaveBeenCalledTimes(1);
    const envelope = mockDeliverOutbound.mock.calls[0][0];
    expect(envelope.to).toBe("dan@external.example");
    expect(envelope.subject).toBe("Undelivered: Trying to reach you");
    expect(envelope.body).toContain("disabled@getagent.id");
    expect(envelope.body).toContain("currently disabled");
  });

  it("uses generic NDR subject when the original message has no subject", async () => {
    inboxLookup.mockResolvedValue(null);
    agentLookup.mockResolvedValue(null);

    const payload = buildPayload({
      from: "eve@external.example",
      to: "missing@getagent.id",
    });
    delete (payload.data as { subject?: string }).subject;

    const res = await postSigned(app, payload);
    expect(res.status).toBe(200);
    expect(mockDeliverOutbound).toHaveBeenCalledTimes(1);
    const envelope = mockDeliverOutbound.mock.calls[0][0];
    expect(envelope.subject).toBe("Undelivered Mail Returned to Sender");
  });

  it("dispatches one NDR per undeliverable recipient when the email has multiple recipients", async () => {
    inboxLookup.mockResolvedValue(null);
    agentLookup.mockResolvedValue(null);

    const payload = {
      type: "email.received",
      created_at: new Date().toISOString(),
      data: {
        from: "bulk@external.example",
        to: ["ghost-a@getagent.id", "ghost-b@getagent.id"],
        subject: "Mass mail",
        text: "Hi everyone",
      },
    };

    const res = await postSigned(app, payload);
    expect(res.status).toBe(200);
    expect(res.body.undeliverable).toBe(2);

    expect(mockDeliverOutbound).toHaveBeenCalledTimes(2);
    const recipientsContacted = mockDeliverOutbound.mock.calls.map((c) => c[0].body);
    expect(recipientsContacted.some((b) => b.includes("ghost-a@getagent.id"))).toBe(true);
    expect(recipientsContacted.some((b) => b.includes("ghost-b@getagent.id"))).toBe(true);
    for (const call of mockDeliverOutbound.mock.calls) {
      expect(call[0].to).toBe("bulk@external.example");
    }
  });

  it("does NOT send an NDR when the original sender is on getagent.id (loop protection)", async () => {
    inboxLookup.mockResolvedValue(null);
    agentLookup.mockResolvedValue(null);

    const res = await postSigned(
      app,
      buildPayload({
        from: "loopbot@getagent.id",
        to: "ghost@getagent.id",
        subject: "Loop test",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.undeliverable).toBe(1);
    expect(mockDeliverOutbound).not.toHaveBeenCalled();
  });

  it("does NOT send an NDR when the original sender is mailer-daemon@", async () => {
    inboxLookup.mockResolvedValue(null);
    agentLookup.mockResolvedValue(null);

    const res = await postSigned(
      app,
      buildPayload({
        from: "mailer-daemon@some-mta.example",
        to: "ghost@getagent.id",
        subject: "Returned mail",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.undeliverable).toBe(1);
    expect(mockDeliverOutbound).not.toHaveBeenCalled();
  });

  it("does NOT send an NDR when the original sender is postmaster@", async () => {
    inboxLookup.mockResolvedValue(null);
    agentLookup.mockResolvedValue(null);

    const res = await postSigned(
      app,
      buildPayload({
        from: "postmaster@some-mta.example",
        to: "ghost@getagent.id",
        subject: "Delivery status",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.undeliverable).toBe(1);
    expect(mockDeliverOutbound).not.toHaveBeenCalled();
  });
});
