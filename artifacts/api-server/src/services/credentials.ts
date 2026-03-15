import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentCredentialsTable,
  agentKeysTable,
  agentDomainsTable,
  agentInboxesTable,
} from "@workspace/db/schema";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";

const CREDENTIAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

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
    proof: {
      type: "HmacSha256Signature2024",
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

export async function getActiveCredential(agentId: string) {
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
  return {
    ...credJson,
    proof: {
      ...((credJson.proof as Record<string, unknown>) || {}),
      signatureValue: credential.signature,
    },
  };
}

export async function reissueCredential(agentId: string) {
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

export async function buildErc8004(handle: string) {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.handle, handle.toLowerCase()),
  });
  if (!agent || !agent.isPublic || agent.status !== "active") return null;

  const keys = await db.query.agentKeysTable.findMany({
    where: and(
      eq(agentKeysTable.agentId, agent.id),
      eq(agentKeysTable.status, "active"),
    ),
  });

  const domains = await db.query.agentDomainsTable.findMany({
    where: eq(agentDomainsTable.agentId, agent.id),
  });

  const activeDomain = domains.find((d) => d.status === "active");
  const baseUrl = env().API_BASE_URL;

  const services: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }> = [];

  if (agent.endpointUrl) {
    services.push({
      id: `did:web:getagent.id:agents:${agent.handle}#agent-endpoint`,
      type: "AgentEndpoint",
      serviceEndpoint: agent.endpointUrl,
    });
  }

  services.push({
    id: `did:web:getagent.id:agents:${agent.handle}#credential`,
    type: "AgentCredential",
    serviceEndpoint: `${baseUrl}/p/${agent.handle}/credential`,
  });

  services.push({
    id: `did:web:getagent.id:agents:${agent.handle}#profile`,
    type: "AgentProfile",
    serviceEndpoint: `${baseUrl}/p/${agent.handle}`,
  });

  if (activeDomain) {
    services.push({
      id: `did:web:getagent.id:agents:${agent.handle}#domain`,
      type: "AgentDomain",
      serviceEndpoint: `https://${activeDomain.domain}`,
    });
  }

  const verificationMethod = keys.map((k) => ({
    id: `did:web:getagent.id:agents:${agent.handle}#${k.kid}`,
    type: k.keyType === "ed25519" ? "Ed25519VerificationKey2020" : "JsonWebKey2020",
    controller: `did:web:getagent.id:agents:${agent.handle}`,
    publicKeyBase64: k.publicKey || undefined,
    publicKeyJwk: k.jwk || undefined,
  }));

  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1",
      "https://eips.ethereum.org/EIPS/eip-8004",
    ],
    id: `did:web:getagent.id:agents:${agent.handle}`,
    controller: "did:web:getagent.id",
    verificationMethod,
    authentication: verificationMethod.map((vm) => vm.id),
    service: services,
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
