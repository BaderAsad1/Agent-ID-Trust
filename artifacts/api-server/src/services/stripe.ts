import { getStripe, isStripeAvailable, bootstrapStripeEnv } from "./stripe-client";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

export { getStripe, isStripeAvailable, bootstrapStripeEnv };

export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, stripeCustomerId: true, email: true, displayName: true },
  });

  if (!user) throw new Error("USER_NOT_FOUND");

  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.displayName ?? undefined,
    metadata: { userId: user.id },
  });

  await db.update(usersTable)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  return customer.id;
}

export async function getCustomerById(customerId: string): Promise<Stripe.Customer | null> {
  try {
    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return customer as Stripe.Customer;
  } catch {
    return null;
  }
}
