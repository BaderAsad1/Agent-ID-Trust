import { randomBytes, verify as cryptoVerify, createPublicKey } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentVerificationChallengesTable,
  agentKeysTable,
  usersTable,
} from "@workspace/db/schema";

const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000;

export async function createChallenge(
  agentId: string,
  method: string = "key_challenge",
) {
  const challenge = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MS);

  const [entry] = await db
    .insert(agentVerificationChallengesTable)
    .values({ agentId, challenge, method, expiresAt })
    .returning();

  return entry;
}

export async function verifyChallenge(
  agentId: string,
  challengeToken: string,
  signature: string,
  kid: string,
): Promise<{ success: boolean; error?: string }> {
  const agentKey = await db.query.agentKeysTable.findFirst({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.kid, kid),
      eq(agentKeysTable.status, "active"),
    ),
  });

  if (!agentKey || !agentKey.publicKey) {
    return { success: false, error: "No active key found with the provided kid for this agent" };
  }

  const challenge = await db.query.agentVerificationChallengesTable.findFirst({
    where: and(
      eq(agentVerificationChallengesTable.agentId, agentId),
      eq(agentVerificationChallengesTable.challenge, challengeToken),
      isNull(agentVerificationChallengesTable.usedAt),
    ),
  });

  if (!challenge) {
    return { success: false, error: "Challenge not found or already used" };
  }

  if (new Date() > challenge.expiresAt) {
    return { success: false, error: "Challenge has expired" };
  }

  try {
    const pubKey = createPublicKey({
      key: Buffer.from(agentKey.publicKey, "base64"),
      format: "der",
      type: "spki",
    });

    const isValid = cryptoVerify(
      null,
      Buffer.from(challengeToken),
      pubKey,
      Buffer.from(signature, "base64"),
    );

    if (!isValid) {
      return { success: false, error: "Invalid signature" };
    }
  } catch {
    return { success: false, error: "Invalid key or signature format" };
  }

  const [consumed] = await db
    .update(agentVerificationChallengesTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(agentVerificationChallengesTable.id, challenge.id),
        isNull(agentVerificationChallengesTable.usedAt),
      ),
    )
    .returning();

  if (!consumed) {
    return { success: false, error: "Challenge was consumed by a concurrent request" };
  }

  const agentRecord = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { status: true },
  });

  const statusUpdate: Record<string, unknown> = {
    verificationStatus: "verified",
    verificationMethod: "key_challenge",
    verifiedAt: new Date(),
    updatedAt: new Date(),
  };

  if (agentRecord?.status === "pending_verification") {
    statusUpdate.status = "active";
  }

  await db
    .update(agentsTable)
    .set(statusUpdate)
    .where(eq(agentsTable.id, agentId));

  try {
    const { reissueCredential } = await import("./credentials");
    await reissueCredential(agentId);
  } catch (err) {
    console.error(`[verification] Failed to reissue credential after verification:`, err instanceof Error ? err.message : err);
  }

  try {
    const fullAgent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.id, agentId),
      columns: { handle: true, displayName: true, userId: true },
    });
    if (fullAgent) {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, fullAgent.userId),
        columns: { email: true },
      });
      if (user?.email) {
        const { sendVerificationCompleteEmail } = await import("./email.js");
        await sendVerificationCompleteEmail(
          user.email,
          fullAgent.handle,
          fullAgent.displayName,
          "key_challenge",
        );
      }
    }
  } catch (err) {
    console.error(`[verification] Failed to send verification email for agent ${agentId}:`, err instanceof Error ? err.message : err);
  }

  return { success: true };
}

export async function initiateVerification(
  agentId: string,
  method: string = "key_challenge",
) {
  await db
    .update(agentsTable)
    .set({ verificationStatus: "pending", updatedAt: new Date() })
    .where(eq(agentsTable.id, agentId));

  return createChallenge(agentId, method);
}

export async function getAuthMetadata(agentId: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: {
      id: true,
      handle: true,
      verificationStatus: true,
      verificationMethod: true,
      verifiedAt: true,
      authMethods: true,
    },
  });

  if (!agent) return null;

  const keys = await db.query.agentKeysTable.findMany({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.status, "active"),
    ),
    columns: {
      id: true,
      kid: true,
      keyType: true,
      publicKey: true,
      use: true,
      createdAt: true,
    },
  });

  return {
    agentId: agent.id,
    handle: agent.handle,
    verificationStatus: agent.verificationStatus,
    verificationMethod: agent.verificationMethod,
    verifiedAt: agent.verifiedAt,
    authMethods: agent.authMethods,
    keys: keys.map((k) => ({
      kid: k.kid,
      keyType: k.keyType,
      publicKey: k.publicKey,
      use: k.use,
      createdAt: k.createdAt,
    })),
  };
}
