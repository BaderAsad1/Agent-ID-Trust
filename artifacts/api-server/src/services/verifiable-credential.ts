import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentKeysTable,
  agentDomainsTable,
  agentInboxesTable,
  agentCredentialsTable,
} from "@workspace/db/schema";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";

let joseModule: typeof import("jose") | null = null;

async function getJose() {
  if (!joseModule) {
    joseModule = await import("jose");
  }
  return joseModule;
}

let cachedKeyPair: { privateKey: CryptoKey; publicKey: CryptoKey; kid: string } | null = null;

export async function getSigningKeyPair() {
  if (cachedKeyPair) return cachedKeyPair;

  const jose = await getJose();
  const config = env();
  const kid = config.VC_KEY_ID;

  if (config.VC_SIGNING_KEY && config.VC_PUBLIC_KEY) {
    try {
      const privateKey = await jose.importJWK(
        JSON.parse(config.VC_SIGNING_KEY),
        "EdDSA",
      );
      const publicKey = await jose.importJWK(
        JSON.parse(config.VC_PUBLIC_KEY),
        "EdDSA",
      );
      cachedKeyPair = { privateKey: privateKey as CryptoKey, publicKey: publicKey as CryptoKey, kid };
      return cachedKeyPair;
    } catch (err) {
      logger.error({ err }, "[verifiable-credential] Failed to import VC keys from env");
    }
  }

  if (config.NODE_ENV === "production") {
    throw new Error("VC_SIGNING_KEY and VC_PUBLIC_KEY are required in production for W3C VC issuance.");
  }

  logger.warn("[verifiable-credential] Generating ephemeral Ed25519 key pair (dev only)");
  const { privateKey, publicKey } = await jose.generateKeyPair("EdDSA", {
    crv: "Ed25519",
  });
  cachedKeyPair = { privateKey, publicKey, kid };
  return cachedKeyPair;
}

const vcCache = new Map<string, { jwt: string; expiresAt: number }>();
const VC_CACHE_TTL_MS = 60 * 60 * 1000;

export async function issueVerifiableCredential(agentId: string): Promise<string> {
  const cached = vcCache.get(agentId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.jwt;
  }

  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
  });
  if (!agent) throw new Error("Agent not found");

  const keys = await db.query.agentKeysTable.findMany({
    where: and(
      eq(agentKeysTable.agentId, agentId),
      eq(agentKeysTable.status, "active"),
    ),
  });

  const domains = await db.query.agentDomainsTable.findMany({
    where: eq(agentDomainsTable.agentId, agentId),
  });

  let inbox = null;
  try {
    inbox = await db.query.agentInboxesTable.findFirst({
      where: eq(agentInboxesTable.agentId, agentId),
    });
  } catch {}

  const activeDomain = domains.find((d) => d.status === "active");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 365 * 24 * 60 * 60;

  const { privateKey, kid } = await getSigningKeyPair();
  const jose = await getJose();

  const vcPayload = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://getagent.id/credentials/v1",
    ],
    type: ["VerifiableCredential", "AgentIdentityCredential"],
    issuer: "did:web:getagent.id",
    credentialSubject: {
      id: `did:web:getagent.id:agents:${agent.handle}`,
      handle: agent.handle,
      displayName: agent.displayName,
      agentId: agent.id,
      endpoint: agent.endpointUrl || null,
      domain: activeDomain?.domain || null,
      inboxAddress: inbox?.address || null,
      capabilities: agent.capabilities || [],
      protocols: agent.protocols || [],
      authMethods: agent.authMethods || [],
      paymentMethods: agent.paymentMethods || [],
      verificationStatus: agent.verificationStatus,
      verificationMethod: agent.verificationMethod || null,
      verifiedAt: agent.verifiedAt?.toISOString() || null,
      trustScore: agent.trustScore,
      trustTier: agent.trustTier,
      trustBreakdown: agent.trustBreakdown || {},
      keys: keys.map((k) => ({
        kid: k.kid,
        keyType: k.keyType,
        publicKey: k.publicKey,
        use: k.use,
      })),
    },
  };

  const jwt = await new jose.SignJWT(vcPayload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "EdDSA", kid, typ: "JWT" })
    .setIssuer("did:web:getagent.id")
    .setSubject(`did:web:getagent.id:agents:${agent.handle}`)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(privateKey);

  vcCache.set(agentId, { jwt, expiresAt: Date.now() + VC_CACHE_TTL_MS });

  return jwt;
}

export async function verifyVerifiableCredential(jwt: string): Promise<{
  valid: boolean;
  payload?: Record<string, unknown>;
  reason?: string;
}> {
  try {
    const jose = await getJose();
    const { publicKey, kid } = await getSigningKeyPair();

    const { payload } = await jose.jwtVerify(jwt, publicKey, {
      issuer: "did:web:getagent.id",
    });

    return { valid: true, payload: payload as Record<string, unknown> };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return { valid: false, reason: message };
  }
}

export async function getJwks(): Promise<{
  keys: Array<Record<string, unknown>>;
}> {
  const jose = await getJose();
  const { publicKey, kid } = await getSigningKeyPair();

  const jwk = await jose.exportJWK(publicKey);

  return {
    keys: [
      {
        ...jwk,
        kid,
        use: "sig",
        alg: "EdDSA",
        key_ops: ["verify"],
        purpose: "sig",
      },
    ],
  };
}

export function clearVcCache(agentId?: string) {
  if (agentId) {
    vcCache.delete(agentId);
  } else {
    vcCache.clear();
  }
}
