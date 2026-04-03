import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { isRedisConfigured, getSharedRedis } from "../lib/redis";
import {
  agentsTable,
  agentCredentialsTable,
  agentKeysTable,
  agentDomainsTable,
  agentInboxesTable,
  agentOwsWalletsTable,
} from "@workspace/db/schema";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";

const CREDENTIAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function buildPaymentMethodsList(agent: {
  paymentMethods?: string[] | null;
  walletAddress?: string | null;
  paymentAuthorized?: boolean | null;
}): string[] {
  const methods = new Set<string>(agent.paymentMethods || []);
  if (agent.walletAddress) {
    methods.add("x402_usdc");
  }
  if (agent.paymentAuthorized) {
    methods.add("stripe_mpp");
  }
  return Array.from(methods);
}

let signingSecret: string | null = null;

export function getCredentialSigningSecret(): string {
  if (signingSecret) return signingSecret;

  const envSecret = env().CREDENTIAL_SIGNING_SECRET;
  if (envSecret) {
    signingSecret = envSecret;
    return signingSecret;
  }

  if (env().NODE_ENV === "production") {
    throw new Error(
      "CREDENTIAL_SIGNING_SECRET is required in production. " +
        "Credentials cannot be signed with an ephemeral key — signatures would be unverifiable after restart.",
    );
  }

  logger.warn("[credentials] CREDENTIAL_SIGNING_SECRET not set — using ephemeral secret (dev only)");
  signingSecret = randomBytes(32).toString("hex");
  return signingSecret;
}

function generateSerialNumber(): string {
  const hex = randomBytes(4).toString("hex");
  return `AID-0x${hex}`;
}

function signCredential(credentialJson: object): string {
  const secret = getCredentialSigningSecret();
  const payload = JSON.stringify(credentialJson);
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function issueCredential(agentId: string) {
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
  } catch (err) {
    logger.warn({ err }, `[credentials] Failed to fetch inbox for agent ${agentId}`);
  }

  const activeDomain = domains.find((d) => d.status === "active");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CREDENTIAL_TTL_MS);
  const serialNumber = generateSerialNumber();

  const credentialJson = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://getagent.id/credentials/v1",
    ],
    type: ["VerifiableCredential", "AgentIdentityCredential"],
    issuer: "did:web:getagent.id",
    issuanceDate: now.toISOString(),
    expirationDate: expiresAt.toISOString(),
    serialNumber,
    credentialSubject: {
      id: `did:web:getagent.id:agents:${agent.id}`,
      handle: agent.handle,
      displayName: agent.displayName,
      agentId: agent.id,
      endpoint: agent.endpointUrl || null,
      domain: activeDomain?.domain || null,
      inboxAddress: inbox?.address || null,
      capabilities: agent.capabilities || [],
      protocols: agent.protocols || [],
      authMethods: agent.authMethods || [],
      paymentMethods: buildPaymentMethodsList(agent),
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
    proof: {
      type: "AgentIDHmacCredential2024",
      created: now.toISOString(),
      proofPurpose: "assertionMethod",
      verificationMethod: "did:web:getagent.id#platform-signing-key",
    },
  };

  const signature = signCredential(credentialJson);

  await db
    .update(agentCredentialsTable)
    .set({ isActive: false, revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(agentCredentialsTable.agentId, agentId),
        eq(agentCredentialsTable.isActive, true),
      ),
    );

  const [credential] = await db
    .insert(agentCredentialsTable)
    .values({
      agentId,
      serialNumber,
      credentialJson,
      signature,
      isActive: true,
      issuedAt: now,
      expiresAt,
    })
    .returning();

  return {
    ...credentialJson,
    proof: {
      ...credentialJson.proof,
      signatureValue: signature,
    },
  };
}

const CREDENTIAL_CACHE_TTL = 120;

async function getCredentialFromCache(agentId: string): Promise<Record<string, unknown> | null> {
  if (!isRedisConfigured()) return null;
  try {
    const redis = getSharedRedis();
    const raw = await redis.get(`credential:${agentId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCredentialCache(agentId: string, data: Record<string, unknown>): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = getSharedRedis();
    await redis.set(`credential:${agentId}`, JSON.stringify(data), "EX", CREDENTIAL_CACHE_TTL);
  } catch {
  }
}

export async function invalidateCredentialCache(agentId: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = getSharedRedis();
    await redis.del(`credential:${agentId}`);
  } catch {
  }
}

export async function getActiveCredential(agentId: string) {
  const cached = await getCredentialFromCache(agentId);
  if (cached) return cached;

  const credential = await db.query.agentCredentialsTable.findFirst({
    where: and(
      eq(agentCredentialsTable.agentId, agentId),
      eq(agentCredentialsTable.isActive, true),
    ),
  });

  if (!credential) return null;

  if (credential.expiresAt < new Date()) {
    await db
      .update(agentCredentialsTable)
      .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentCredentialsTable.id, credential.id));
    return null;
  }

  const credJson = credential.credentialJson as Record<string, unknown>;
  const result = {
    ...credJson,
    proof: {
      ...((credJson.proof as Record<string, unknown>) || {}),
      signatureValue: credential.signature,
    },
  };

  await setCredentialCache(agentId, result);
  return result;
}

export async function reissueCredential(agentId: string) {
  await invalidateCredentialCache(agentId);
  return issueCredential(agentId);
}

export function verifyCredentialSignature(
  credentialBody: Record<string, unknown>,
): { valid: boolean; reason?: string } {
  try {
    const { proof, ...rest } = credentialBody;
    if (!proof || typeof proof !== "object") {
      return { valid: false, reason: "Missing proof object" };
    }

    const proofObj = proof as Record<string, unknown>;
    const providedSignature = proofObj.signatureValue;
    if (!providedSignature || typeof providedSignature !== "string") {
      return { valid: false, reason: "Missing signatureValue in proof" };
    }

    const credentialWithoutSignatureValue = {
      ...rest,
      proof: Object.fromEntries(
        Object.entries(proofObj).filter(([k]) => k !== "signatureValue"),
      ),
    };

    const expectedSignature = signCredential(credentialWithoutSignatureValue);

    const expectedBuf = Buffer.from(expectedSignature, "hex");
    const providedBuf = Buffer.from(providedSignature, "hex");
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      return { valid: false, reason: "Invalid signature" };
    }

    const expirationDate = credentialBody.expirationDate;
    if (
      expirationDate &&
      typeof expirationDate === "string" &&
      new Date(expirationDate) < new Date()
    ) {
      return { valid: false, reason: "Credential has expired" };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Failed to verify credential" };
  }
}

export function isCredentialExpired(
  credentialBody: Record<string, unknown>,
): boolean {
  const expirationDate = credentialBody.expirationDate;
  if (!expirationDate || typeof expirationDate !== "string") return false;
  return new Date(expirationDate) < new Date();
}

function buildCaip10Address(network: string, address: string): string {
  const chainIdMap: Record<string, string> = {
    "base": "eip155:8453",
    "base-mainnet": "eip155:8453",
    "base-sepolia": "eip155:84532",
    "ethereum": "eip155:1",
    "mainnet": "eip155:1",
    "polygon": "eip155:137",
    "arbitrum": "eip155:42161",
    "tron": "tron:mainnet",
  };
  const chainId = chainIdMap[network.toLowerCase()] || `eip155:1`;
  return `${chainId}:${address}`;
}

function parseChainRegistrations(
  chainRegistrations: Record<string, unknown>[] | null | undefined,
): Array<Record<string, unknown>> {
  if (chainRegistrations && Array.isArray(chainRegistrations) && chainRegistrations.length > 0) {
    return chainRegistrations as Array<Record<string, unknown>>;
  }
  return [];
}

export async function buildErc8004(handle: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.handle, handle.toLowerCase()),
  });
  if (!agent || !agent.isPublic || agent.status !== "active") return null;

  const [keys, domains, owsWallets] = await Promise.all([
    db.query.agentKeysTable.findMany({
      where: and(
        eq(agentKeysTable.agentId, agent.id),
        eq(agentKeysTable.status, "active"),
      ),
    }),
    db.query.agentDomainsTable.findMany({
      where: eq(agentDomainsTable.agentId, agent.id),
    }),
    db.query.agentOwsWalletsTable.findMany({
      where: and(
        eq(agentOwsWalletsTable.agentId, agent.id),
        eq(agentOwsWalletsTable.status, "active"),
      ),
    }),
  ]);

  const activeDomain = domains.find((d) => d.status === "active");
  const baseUrl = env().API_BASE_URL;
  const appUrl = env().APP_URL;

  // Canonical DID is UUID-rooted. Handle alias is `did:agentid:<handle>` (secondary).
  const canonicalDid = `did:web:getagent.id:agents:${agent.id}`;

  const services: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }> = [];

  if (agent.endpointUrl) {
    services.push({
      id: `${canonicalDid}#agent-endpoint`,
      type: "AgentEndpoint",
      serviceEndpoint: agent.endpointUrl,
    });
  }

  services.push({
    id: `${canonicalDid}#credential`,
    type: "AgentCredential",
    serviceEndpoint: `${baseUrl}/p/${agent.handle}/credential`,
  });

  services.push({
    id: `${canonicalDid}#profile`,
    type: "AgentProfile",
    serviceEndpoint: `${appUrl}/p/${agent.handle}`,
  });

  if (activeDomain) {
    services.push({
      id: `${canonicalDid}#domain`,
      type: "AgentDomain",
      serviceEndpoint: `https://${activeDomain.domain}`,
    });
  }

  if (agent.walletAddress) {
    services.push({
      id: `${canonicalDid}#wallet`,
      type: "EVMPaymentMethod",
      serviceEndpoint: `ethereum:${agent.walletAddress}@8453`,
    });

    services.push({
      id: `${canonicalDid}#x402`,
      type: "X402PaymentEndpoint",
      serviceEndpoint: `${baseUrl}/pay/upgrade/x402`,
    });
  }

  if (agent.paymentAuthorized) {
    services.push({
      id: `${canonicalDid}#mpp`,
      type: "StripeMppPaymentEndpoint",
      serviceEndpoint: `${baseUrl}/mpp/premium-resolve/${agent.handle}`,
    });
  }

  const verificationMethod = keys.map((k) => ({
    id: `${canonicalDid}#${k.kid}`,
    type: k.keyType === "ed25519" ? "Ed25519VerificationKey2020" : "JsonWebKey2020",
    controller: canonicalDid,
    publicKeyBase64: k.publicKey || undefined,
    publicKeyJwk: k.jwk || undefined,
  }));

  const chainRegistrations = parseChainRegistrations(
    (agent as unknown as { chainRegistrations?: Record<string, unknown>[] }).chainRegistrations,
  );

  const owsEvmWallets = owsWallets
    .filter(w => w.network.toLowerCase() !== "tron")
    .map(w => buildCaip10Address(w.network, w.address));

  const owsTronWallets = owsWallets
    .filter(w => w.network.toLowerCase() === "tron")
    .map(w => buildCaip10Address(w.network, w.address));

  const allOwsWalletAddresses = owsWallets.map(w => buildCaip10Address(w.network, w.address));

  const x402Support = !!(agent.walletAddress || owsEvmWallets.length > 0);

  const APP_URL = env().APP_URL;

  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1",
      "https://eips.ethereum.org/EIPS/eip-8004",
    ],
    spec: "registration-v1",
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    id: canonicalDid,
    controller: "did:web:getagent.id",
    alsoKnownAs: agent.handle ? [`did:agentid:${agent.handle}`] : undefined,
    name: agent.displayName,
    description: agent.description || null,
    image: agent.avatarUrl || (agent.handle ? `${APP_URL}/api/v1/handles/${agent.handle}/image.svg` : null),
    active: agent.status === "active",
    x402Support,
    supportedTrust: ["unverified", "basic", "verified", "trusted"],
    registrations: chainRegistrations,
    verificationMethod,
    authentication: verificationMethod.map((vm) => vm.id),
    services,
    agentid: {
      handle: agent.handle,
      did: canonicalDid,
      handleAlias: agent.handle ? `did:agentid:${agent.handle}` : undefined,
      trustScore: agent.trustScore,
      trustTier: agent.trustTier,
      owsWallets: {
        evm: owsEvmWallets,
        tron: owsTronWallets,
        all: allOwsWalletAddresses,
      },
      profile: {
        displayName: agent.displayName,
        description: agent.description,
        avatarUrl: agent.avatarUrl,
        capabilities: agent.capabilities || [],
        protocols: agent.protocols || [],
      },
    },
    metadata: {
      handle: agent.handle,
      displayName: agent.displayName,
      description: agent.description,
      trustScore: agent.trustScore,
      trustTier: agent.trustTier,
      verificationStatus: agent.verificationStatus,
      capabilities: agent.capabilities || [],
      protocols: agent.protocols || [],
      createdAt: agent.createdAt.toISOString(),
    },
  };
}
