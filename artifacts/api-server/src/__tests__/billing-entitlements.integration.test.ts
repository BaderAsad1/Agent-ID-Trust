import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { subscriptionsTable, usersTable } from "@workspace/db/schema";
import { getActiveUserSubscription, getUserPlan } from "../services/billing";

describe("billing entitlement expiry", () => {
  let userId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    const [user] = await db.insert(usersTable).values({
      provider: "test",
      providerId: `billing-expiry-${Date.now()}`,
      email: `billing-expiry-${Date.now()}@example.test`,
    }).returning({ id: usersTable.id });
    userId = user.id;

    const [subscription] = await db.insert(subscriptionsTable).values({
      userId,
      plan: "starter",
      status: "active",
      provider: "stripe",
      providerSubscriptionId: `sub_expiry_${Date.now()}`,
      billingInterval: "monthly",
      currentPeriodStart: new Date(Date.now() - 60_000),
      currentPeriodEnd: new Date(Date.now() - 1_000),
    }).returning({ id: subscriptionsTable.id });
    subscriptionId = subscription.id;
  });

  afterAll(async () => {
    await db.delete(subscriptionsTable).where(eq(subscriptionsTable.id, subscriptionId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });

  it("does not grant paid access from an active-looking but expired row", async () => {
    await expect(getActiveUserSubscription(userId)).resolves.toBeNull();
    await expect(getUserPlan(userId)).resolves.toBe("none");
  });

  it("grants access only while an active period is in the future", async () => {
    await db.update(subscriptionsTable).set({
      currentPeriodEnd: new Date(Date.now() + 60_000),
    }).where(eq(subscriptionsTable.id, subscriptionId));

    await expect(getUserPlan(userId)).resolves.toBe("starter");
  });

  it("does not grant access to a future but past-due subscription", async () => {
    await db.update(subscriptionsTable).set({ status: "past_due" }).where(eq(subscriptionsTable.id, subscriptionId));

    await expect(getActiveUserSubscription(userId)).resolves.toBeNull();
    await expect(getUserPlan(userId)).resolves.toBe("none");
  });
});
