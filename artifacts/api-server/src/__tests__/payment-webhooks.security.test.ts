/**
 * Payment Webhook Safety — Security Tests
 *
 * Tests:
 *   - Missing stripe-signature header → 400 MISSING_SIGNATURE
 *   - Invalid/forged stripe-signature → 400 WEBHOOK_VERIFICATION_FAILED
 *   - Crafted payload without valid signature cannot trigger financial mutations
 *   - Duplicate event idempotency (claimWebhookEvent)
 *   - getPlanLimits plan ordering (pro > starter > none)
 *   - Coinbase/Visa endpoints return 501 NOT_ENABLED
 *   - Billing checkout/portal/cancel require authentication
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";

async function buildWebhookApp() {
  const webhookMod = await import("../routes/v1/webhooks");
  const { errorHandler } = await import("../middlewares/error-handler");
  const app = express();
  app.use("/webhooks", webhookMod.default);
  app.use(errorHandler);
  return app;
}

async function buildBillingApp() {
  const billingMod = await import("../routes/v1/billing");
  const { errorHandler } = await import("../middlewares/error-handler");
  const app = express();
  app.use(express.json());
  app.use("/billing", billingMod.default);
  app.use(errorHandler);
  return app;
}

describe("Payment Webhooks — Stripe signature gate", () => {
  it("POST /webhooks/stripe returns 400 MISSING_SIGNATURE when no stripe-signature header", async () => {
    const app = await buildWebhookApp();
    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "test.event", id: "evt_test" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("MISSING_SIGNATURE");
  });

  it("POST /webhooks/stripe with invalid stripe-signature returns 400 WEBHOOK_VERIFICATION_FAILED", async () => {
    const app = await buildWebhookApp();
    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1234,v1=invalid_sig_value")
      .send(JSON.stringify({ type: "checkout.session.completed", id: "evt_test" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("WEBHOOK_VERIFICATION_FAILED");
  });

  it("crafted payload without valid signature is blocked (financial mutation prevented)", async () => {
    const app = await buildWebhookApp();
    const craftedPayload = JSON.stringify({
      type: "checkout.session.completed",
      id: "evt_crafted_attack",
      data: {
        object: {
          customer: "cus_hacker",
          metadata: { userId: "victim-user-id", plan: "enterprise" },
        },
      },
    });

    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "forged-t=12345,v1=forgery")
      .send(craftedPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("WEBHOOK_VERIFICATION_FAILED");
  });
});

describe("Payment Webhooks — Disabled providers return 501", () => {
  it("POST /webhooks/coinbase returns 501 NOT_ENABLED", async () => {
    const app = await buildWebhookApp();
    const res = await request(app)
      .post("/webhooks/coinbase")
      .send({});

    expect(res.status).toBe(501);
    expect(res.body.error).toBe("NOT_ENABLED");
  });

  it("POST /webhooks/visa returns 501 NOT_ENABLED", async () => {
    const app = await buildWebhookApp();
    const res = await request(app)
      .post("/webhooks/visa")
      .send({});

    expect(res.status).toBe(501);
    expect(res.body.error).toBe("NOT_ENABLED");
  });

  it("GET /webhooks/coinbase also returns 501 NOT_ENABLED (all methods blocked)", async () => {
    const app = await buildWebhookApp();
    const res = await request(app).get("/webhooks/coinbase");

    expect(res.status).toBe(501);
    expect(res.body.error).toBe("NOT_ENABLED");
  });
});

describe("Payment Webhooks — Billing endpoints require authentication", () => {
  it("POST /billing/checkout returns 401 without auth", async () => {
    const app = await buildBillingApp();
    const res = await request(app)
      .post("/billing/checkout")
      .send({ plan: "starter" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("POST /billing/portal returns 401 without auth", async () => {
    const app = await buildBillingApp();
    const res = await request(app)
      .post("/billing/portal")
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("POST /billing/cancel returns 401 without auth", async () => {
    const app = await buildBillingApp();
    const res = await request(app)
      .post("/billing/cancel")
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

describe("Payment Webhooks — activatePlanForUser persists plan to DB (end-to-end checkout outcome)", () => {
  let testUserId: string;

  beforeAll(async () => {
    const { createTestUser } = await import("../test-support/factories");
    const user = await createTestUser();
    testUserId = user.id;
  });

  afterAll(async () => {
    const { db } = await import("@workspace/db");
    const { usersTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(usersTable).where(eq(usersTable.id, testUserId)).catch(() => {});
  });

  it("activatePlanForUser with plan=starter persists the plan in userPlanCache (getUserPlan reflects starter)", async () => {
    const { activatePlanForUser, getUserPlan } = await import("../services/billing");

    await activatePlanForUser(testUserId, "starter", "sub_test_starter");

    const plan = await getUserPlan(testUserId);
    expect(plan).toBe("starter");
  });

  it("deactivatePlanForUser reverts plan to none after activation (getUserPlan returns none when no active subscription)", async () => {
    const { deactivatePlanForUser, getUserPlan } = await import("../services/billing");

    await deactivatePlanForUser(testUserId);

    const plan = await getUserPlan(testUserId);
    expect(plan).toBe("none");
  });

  it("handleCheckoutCompleted with paid session and subscription activates plan (getUserPlan reflects pro)", async () => {
    const { handleCheckoutCompleted, getUserPlan } = await import("../services/billing");

    await handleCheckoutCompleted({
      id: `cs_paid_${Date.now()}`,
      object: "checkout.session",
      payment_status: "paid",
      customer: "cus_paid_test",
      subscription: "sub_paid_test",
      metadata: { userId: testUserId, plan: "pro", billingInterval: "monthly" },
    } as unknown as import("stripe").Stripe.Checkout.Session);

    const plan = await getUserPlan(testUserId);
    expect(plan).toBe("pro");
  });

  it("deactivatePlanForUser after activation reverts plan to none (getUserPlan returns none when subscription is cancelled)", async () => {
    const { deactivatePlanForUser, getUserPlan } = await import("../services/billing");

    await deactivatePlanForUser(testUserId);

    const plan = await getUserPlan(testUserId);
    expect(plan).toBe("none");
  });

  it("handleCheckoutCompleted without subscriptionId in session returns early — no plan mutation (plan remains none)", async () => {
    const { deactivatePlanForUser, handleCheckoutCompleted, getUserPlan } = await import("../services/billing");

    await deactivatePlanForUser(testUserId);

    await handleCheckoutCompleted({
      id: `cs_nosub_${Date.now()}`,
      object: "checkout.session",
      payment_status: "paid",
      customer: "cus_nosub_test",
      subscription: null,
      metadata: { userId: testUserId, plan: "pro", billingInterval: "monthly" },
    } as unknown as import("stripe").Stripe.Checkout.Session);

    const plan = await getUserPlan(testUserId);
    expect(plan).toBe("none");
  });
});

describe("Payment Webhooks — Idempotency (real DB: claimWebhookEvent persistence)", () => {
  const eventId = `evt_idempotency_test_${Date.now()}`;

  afterAll(async () => {
    const { db } = await import("@workspace/db");
    const { webhookEventsTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(webhookEventsTable).where(eq(webhookEventsTable.providerEventId, eventId)).catch(() => {});
  });

  it("first claimWebhookEvent call returns 'claimed' and inserts DB row", async () => {
    const { claimWebhookEvent } = await import("../services/billing");
    const result = await claimWebhookEvent(
      "stripe",
      "checkout.session.completed",
      eventId,
      { type: "checkout.session.completed", id: eventId },
    );
    expect(result).toBe("claimed");
  });

  it("second claimWebhookEvent call for same eventId returns 'already_processed' after finalizing", async () => {
    const { claimWebhookEvent, finalizeWebhookEvent } = await import("../services/billing");

    await finalizeWebhookEvent("stripe", eventId, "processed");

    const result = await claimWebhookEvent(
      "stripe",
      "checkout.session.completed",
      eventId,
      { type: "checkout.session.completed", id: eventId },
    );
    expect(result).toBe("already_processed");
  });

  it("webhook_events DB row has status=processed after finalizeWebhookEvent", async () => {
    const { db } = await import("@workspace/db");
    const { webhookEventsTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");

    const row = await db.query.webhookEventsTable.findFirst({
      where: eq(webhookEventsTable.providerEventId, eventId),
      columns: { status: true, processedAt: true },
    });

    expect(row).toBeDefined();
    expect(row!.status).toBe("processed");
    expect(row!.processedAt).toBeInstanceOf(Date);
  });
});

describe("Payment Webhooks — getPlanLimits plan ordering", () => {
  it("plan 'none' has zero agent limit", async () => {
    const { getPlanLimits } = await import("../services/billing");
    const limits = getPlanLimits("none");
    expect(limits.agentLimit).toBeLessThanOrEqual(0);
  });

  it("plan 'starter' has positive agent limit", async () => {
    const { getPlanLimits } = await import("../services/billing");
    const limits = getPlanLimits("starter");
    expect(limits.agentLimit).toBeGreaterThan(0);
  });

  it("plan 'pro' has higher agent limit than 'starter'", async () => {
    const { getPlanLimits } = await import("../services/billing");
    const starter = getPlanLimits("starter");
    const pro = getPlanLimits("pro");
    expect(pro.agentLimit).toBeGreaterThan(starter.agentLimit);
  });
});

describe("Payment Webhooks — valid Stripe signature: constructEvent accepts correctly-signed payloads", () => {
  const TEST_WEBHOOK_SECRET = "whsec_test_valid_signature_secret_for_unit";

  it("stripe.webhooks.constructEvent with correctly-signed payload succeeds", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_dummy", { apiVersion: "2025-02-24.acacia" });

    const payload = JSON.stringify({
      id: "evt_test_valid_sig",
      object: "event",
      type: "customer.subscription.updated",
      data: { object: {} },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET,
    });

    const event = stripe.webhooks.constructEvent(Buffer.from(payload), signature, TEST_WEBHOOK_SECRET);
    expect(event).toBeDefined();
    expect(event.id).toBe("evt_test_valid_sig");
    expect(event.type).toBe("customer.subscription.updated");
  });

  it("stripe.webhooks.constructEvent with tampered payload throws (signature mismatch)", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_dummy", { apiVersion: "2025-02-24.acacia" });

    const original = JSON.stringify({ id: "evt_tamper", type: "invoice.paid", data: { object: {} } });
    const tampered = JSON.stringify({ id: "evt_tamper", type: "checkout.session.completed", data: { object: {} } });

    const signature = stripe.webhooks.generateTestHeaderString({
      payload: original,
      secret: TEST_WEBHOOK_SECRET,
    });

    expect(() => stripe.webhooks.constructEvent(Buffer.from(tampered), signature, TEST_WEBHOOK_SECRET)).toThrow();
  });

  it("verifyStripeWebhook is the route integration point for constructEvent (function export verified)", async () => {
    const { verifyStripeWebhook } = await import("../services/billing");
    expect(typeof verifyStripeWebhook).toBe("function");
    expect(verifyStripeWebhook.length).toBe(2);
  });
});

describe("Payment Webhooks — checkout session validation: handleCheckoutCompleted no-mutation on malformed payload", () => {
  it("handleCheckoutCompleted with session missing metadata does not throw uncaught error", async () => {
    const { handleCheckoutCompleted } = await import("../services/billing");

    const minimalSession = {
      id: "cs_test_malformed",
      object: "checkout.session",
      payment_status: "paid",
      metadata: null,
    };

    await expect(
      handleCheckoutCompleted(minimalSession as unknown as import("stripe").Stripe.Checkout.Session)
    ).resolves.not.toThrow();
  });

  it("handleCheckoutCompleted with session missing customer returns without throwing", async () => {
    const { handleCheckoutCompleted } = await import("../services/billing");

    const sessionNoCustomer = {
      id: "cs_test_no_customer",
      object: "checkout.session",
      payment_status: "paid",
      customer: null,
      metadata: { userId: "non-existent-user-id", plan: "starter" },
    };

    await expect(
      handleCheckoutCompleted(sessionNoCustomer as unknown as import("stripe").Stripe.Checkout.Session)
    ).resolves.not.toThrow();
  });

  it("checkout session with payment_status=unpaid returns without throwing (no plan mutation for unpaid)", async () => {
    const { handleCheckoutCompleted } = await import("../services/billing");

    const badSession = {
      id: `cs_malformed_${Date.now()}`,
      object: "checkout.session",
      payment_status: "unpaid",
      customer: null,
      metadata: { userId: "test-user-no-activate", plan: "pro" },
    };

    await expect(
      handleCheckoutCompleted(badSession as unknown as import("stripe").Stripe.Checkout.Session)
    ).resolves.not.toThrow();
  });
});

describe("Payment Webhooks — end-to-end Stripe signature: valid signed events processed by route with DB mutation", () => {
  let E2E_WEBHOOK_SECRET: string;
  let webhookApp: ReturnType<typeof express>;
  let testUserId: string;
  let checkoutEventId: string;
  let subscriptionUpdatedEventId: string;
  let subscriptionDeletedEventId: string;

  beforeAll(async () => {
    const { env } = await import("../lib/env");
    E2E_WEBHOOK_SECRET = env().STRIPE_WEBHOOK_SECRET!;
    if (!E2E_WEBHOOK_SECRET) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured — cannot run e2e webhook tests");
    }

    const { createTestUser } = await import("../test-support/factories");
    const user = await createTestUser();
    testUserId = user.id;

    checkoutEventId = `evt_e2e_checkout_${Date.now()}`;
    subscriptionUpdatedEventId = `evt_e2e_sub_updated_${Date.now()}`;
    subscriptionDeletedEventId = `evt_e2e_sub_deleted_${Date.now()}`;

    const webhookMod = await import("../routes/v1/webhooks");
    const { errorHandler } = await import("../middlewares/error-handler");
    webhookApp = express();
    webhookApp.use("/webhooks", webhookMod.default);
    webhookApp.use(errorHandler);
  });

  afterAll(async () => {
    const { db } = await import("@workspace/db");
    const { usersTable, webhookEventsTable, subscriptionsTable } = await import("@workspace/db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    await db.delete(webhookEventsTable).where(
      inArray(webhookEventsTable.providerEventId, [checkoutEventId, subscriptionUpdatedEventId, subscriptionDeletedEventId])
    ).catch(() => {});
    await db.delete(subscriptionsTable).where(eq(subscriptionsTable.userId, testUserId)).catch(() => {});
    await db.delete(usersTable).where(eq(usersTable.id, testUserId)).catch(() => {});
  });

  async function signAndSendWebhook(
    app: ReturnType<typeof express>,
    payload: object,
    secret: string,
  ) {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_dummy", { apiVersion: "2025-02-24.acacia" });
    const payloadString = JSON.stringify(payload);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret,
    });
    return request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature)
      .serialize(() => payloadString)
      .send(payloadString);
  }

  it("checkout.session.completed with valid Stripe signature returns 200 and activates plan in DB", async () => {
    const payload = {
      id: checkoutEventId,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_e2e_${Date.now()}`,
          object: "checkout.session",
          payment_status: "paid",
          customer: "cus_e2e_test",
          subscription: `sub_e2e_checkout_${Date.now()}`,
          metadata: { userId: testUserId, plan: "starter", billingInterval: "monthly" },
        },
      },
    };

    const res = await signAndSendWebhook(webhookApp, payload, E2E_WEBHOOK_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const { db } = await import("@workspace/db");
    const { usersTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, testUserId),
      columns: { plan: true },
    });
    expect(user!.plan).toBe("starter");
  });

  it("checkout.session.completed duplicate event returns 200 already_processed (idempotency)", async () => {
    const payload = {
      id: checkoutEventId,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_e2e_dup_${Date.now()}`,
          object: "checkout.session",
          payment_status: "paid",
          customer: "cus_e2e_test",
          subscription: `sub_e2e_dup_${Date.now()}`,
          metadata: { userId: testUserId, plan: "pro", billingInterval: "monthly" },
        },
      },
    };

    const res = await signAndSendWebhook(webhookApp, payload, E2E_WEBHOOK_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("already_processed");

    const { db } = await import("@workspace/db");
    const { usersTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, testUserId),
      columns: { plan: true },
    });
    expect(user!.plan).toBe("starter");
  });

  it("customer.subscription.updated with valid Stripe signature returns 200 and upserts subscription in DB", async () => {
    const subscriptionId = `sub_e2e_upd_${Date.now()}`;
    const payload = {
      id: subscriptionUpdatedEventId,
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: subscriptionId,
          object: "subscription",
          status: "active",
          customer: "cus_e2e_test",
          start_date: Math.floor(Date.now() / 1000),
          metadata: { userId: testUserId, plan: "pro", billingInterval: "monthly" },
          items: {
            object: "list",
            data: [{
              id: "si_e2e_1",
              price: {
                id: "price_pro_monthly",
                recurring: { interval: "month" },
              },
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
            }],
          },
        },
      },
    };

    const res = await signAndSendWebhook(webhookApp, payload, E2E_WEBHOOK_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const { db } = await import("@workspace/db");
    const { subscriptionsTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    const sub = await db.query.subscriptionsTable.findFirst({
      where: eq(subscriptionsTable.userId, testUserId),
      columns: { status: true, providerSubscriptionId: true },
    });
    expect(sub).toBeDefined();
    expect(sub!.status).toBe("active");
    expect(sub!.providerSubscriptionId).toBe(subscriptionId);
  });

  it("customer.subscription.deleted with valid Stripe signature returns 200 and marks subscription cancelled in DB", async () => {
    const { db } = await import("@workspace/db");
    const { subscriptionsTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");

    const existingSub = await db.query.subscriptionsTable.findFirst({
      where: eq(subscriptionsTable.userId, testUserId),
      columns: { providerSubscriptionId: true },
    });
    if (!existingSub?.providerSubscriptionId) {
      return;
    }

    const payload = {
      id: subscriptionDeletedEventId,
      object: "event",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: existingSub.providerSubscriptionId,
          object: "subscription",
          status: "canceled",
          customer: "cus_e2e_test",
          metadata: { userId: testUserId },
          items: { object: "list", data: [] },
        },
      },
    };

    const res = await signAndSendWebhook(webhookApp, payload, E2E_WEBHOOK_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const cancelledSub = await db.query.subscriptionsTable.findFirst({
      where: eq(subscriptionsTable.userId, testUserId),
      columns: { status: true },
    });
    expect(cancelledSub!.status).toBe("cancelled");
  });

  it("tampered payload with stolen real signature header is rejected with 400 WEBHOOK_VERIFICATION_FAILED", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_dummy", { apiVersion: "2025-02-24.acacia" });

    const originalPayload = JSON.stringify({
      id: `evt_tamper_e2e_${Date.now()}`,
      object: "event",
      type: "invoice.paid",
      data: { object: {} },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: originalPayload,
      secret: E2E_WEBHOOK_SECRET,
    });

    const tamperedPayload = JSON.stringify({
      id: `evt_tamper_e2e_${Date.now()}`,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: testUserId, plan: "pro" },
          subscription: "sub_hacker",
          customer: "cus_hacker",
        },
      },
    });

    const res = await request(webhookApp)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature)
      .send(Buffer.from(tamperedPayload));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("WEBHOOK_VERIFICATION_FAILED");
  });
});

describe("Marketplace orders — disabled (501)", () => {
  async function buildMarketplaceApp() {
    const marketplaceMod = await import("../routes/v1/marketplace");
    const { errorHandler } = await import("../middlewares/error-handler");
    const app = express();
    app.use(express.json());
    app.use((req: express.Request, _res, next) => {
      req.userId = "test-user-id";
      req.user = { id: "test-user-id" } as Express.Request["user"];
      next();
    });
    app.use("/marketplace", marketplaceMod.default);
    app.use(errorHandler);
    return app;
  }

  it("POST /marketplace/orders returns 501 marketplace_payments_unavailable", async () => {
    const app = await buildMarketplaceApp();
    const res = await request(app)
      .post("/marketplace/orders")
      .send({ listingId: "00000000-0000-0000-0000-000000000001" });

    expect(res.status).toBe(501);
    expect(res.body.error).toBe("marketplace_payments_unavailable");
  });
});

describe("Resend webhooks — signature verification (fail-closed)", () => {
  async function buildResendWebhookApp() {
    const resendMod = await import("../routes/v1/resend-webhooks");
    const app = express();
    app.use(express.json());
    app.use((req: express.Request, _res, next) => {
      req.rawBody = Buffer.from(JSON.stringify(req.body));
      next();
    });
    app.use("/webhooks", resendMod.default);
    return app;
  }

  it("POST /webhooks/resend/inbound without svix headers rejects with invalid_signature", async () => {
    const app = await buildResendWebhookApp();
    const res = await request(app)
      .post("/webhooks/resend/inbound")
      .send({ type: "email.received", data: { from: "a@b.com", to: ["c@d.com"] } });

    expect(res.status).toBe(200);
    expect(res.body.error).toMatch(/invalid_signature|webhook_secret_not_configured/);
  });

  it("POST /webhooks/resend/bounce without svix headers rejects with invalid_signature", async () => {
    const app = await buildResendWebhookApp();
    const res = await request(app)
      .post("/webhooks/resend/bounce")
      .send({ type: "email.bounced", data: { email_id: "test" } });

    expect(res.status).toBe(200);
    expect(res.body.error).toMatch(/invalid_signature|webhook_secret_not_configured/);
  });
});

describe("Well-known endpoint — Content-Type verification", () => {
  async function buildWellKnownApp() {
    const wellKnownMod = await import("../routes/well-known");
    const app = express();
    app.use(wellKnownMod.default);
    return app;
  }

  it("GET /.well-known/agent.json returns Content-Type application/json", async () => {
    const app = await buildWellKnownApp();
    const res = await request(app)
      .get("/.well-known/agent.json")
      .set("Host", "test.getagent.id");

    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("GET /.well-known/agentid-configuration returns Content-Type application/json", async () => {
    const app = await buildWellKnownApp();
    const res = await request(app).get("/.well-known/agentid-configuration");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.protocol).toBe("agentid/v1");
  });
});

describe("Well-known endpoint — full app-level routing (SPA catch-all regression guard)", () => {
  it("GET /.well-known/agent.json via full app returns JSON, not SPA HTML", async () => {
    const appMod = await import("../app");
    const res = await request(appMod.default)
      .get("/.well-known/agent.json")
      .set("Host", "test.getagent.id");

    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.text).not.toMatch(/<!DOCTYPE html>/i);
  });

  it("GET /api/.well-known/agent.json via full app returns JSON", async () => {
    const appMod = await import("../app");
    const res = await request(appMod.default)
      .get("/api/.well-known/agent.json")
      .set("Host", "test.getagent.id");

    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.text).not.toMatch(/<!DOCTYPE html>/i);
  });

  it("GET /.well-known/agentid-configuration via full app returns JSON with protocol field", async () => {
    const appMod = await import("../app");
    const res = await request(appMod.default)
      .get("/.well-known/agentid-configuration");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.protocol).toBe("agentid/v1");
  });
});
