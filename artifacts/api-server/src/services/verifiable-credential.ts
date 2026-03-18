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
import { getVcSigner } from "./vc-signer";

let joseModule: typeof import("jose") | null = null;

async function getJose() {
  if (!joseModule) {
    joseModule = await import("jose");
  }
  return joseModule;
}

/**
 * getSigningKeyPair — DEPRECATED internal helper.
 *
 * Left for backward compatibility with tests that inspect the non-caching contract.
 * New code should use `getVcSigner()` from ./vc-signer instead.
 *
 * Security contract (unchanged):
 *   - Production: private key is imported fresh on every call (never stored in module memory).
 *   - Development: ephemeral Ed25519 key pair generated once per process start.
 *   - KMS migration: replace getVcSigner() in ./vc-signer.ts (see that file for instructions).
 */
export async function getSigningKeyPair() {
  const signer = await getVcSigner();
  const jose = await getJose();
  // For the public key, parse it from VC_PUBLIC_KEY (prod) or from the dev ephemeral signer JWK
  const config = env();
  let publicKey: CryptoKey;

  if (config.VC_PUBLIC_KEY) {
    publicKey = (await jose.importJWK(JSON.parse(config.VC_PUBLIC_KEY), "EdDSA")) as CryptoKey;
  } else {
    const jwk = await signer.getPublicKeyJwk();
    publicKey = (await jose.importJWK(jwk, "EdDSA")) as CryptoKey;
  }

  // Return a shape-compatible object — private key is intentionally not exposed.
  // The `privateKey` field is a sentinel that forces callers through the signer interface.
  return {
    kid: signer.kid,
    publicKey,
    /** @deprecated Use getVcSigner().sign() instead of accessing privateKey directly */
    _signer: signer,
  };
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
  const expiresAt = now + 60 * 60;

  // Use the KMS-ready signer abstraction (see ./vc-signer.ts for migration path)
  const signer = await getVcSigner();
  const jose = await getJose();

  const vcPayload = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://getagent.id/credentials/v1",
    ],
    type: ["VerifiableCredential", "AgentIdentityCredential"],
    issuer: "did:web:getagent.id",
    credentialSubject: {
      id: agent.handle ? `did:web:getagent.id:agents:${agent.handle}` : `did:agentid:${agent.id}`,
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

  const vcSubject = agent.handle
    ? `did:web:getagent.id:agents:${agent.handle}`
    : `did:agentid:${agent.id}`;

  const jwt = await signer.sign(
    new jose.SignJWT(vcPayload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: "EdDSA", kid: signer.kid, typ: "JWT" })
      .setIssuer("did:web:getagent.id")
      .setSubject(vcSubject)
      .setIssuedAt(now)
      .setExpirationTime(expiresAt),
  );

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
