/**
 * OAuth Client (Relying Party) Management Routes — Phase 2
 *
 * GET    /v1/clients          — List user's RP clients
 * POST   /v1/clients          — Register a new RP client
 * GET    /v1/clients/:id      — Get a specific RP client
 * PATCH  /v1/clients/:id      — Update an RP client
 * DELETE /v1/clients/:id      — Revoke/delete an RP client
 * POST   /v1/clients/:id/rotate-secret — Rotate client secret
 */
import { Router } from "express";
import { z } from "zod/v4";
import { randomBytes, createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { oauthClientsTable } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/replit-auth";
import { AppError } from "../../middlewares/error-handler";
import { writeAuditEvent } from "../../services/auth-session";

const router = Router();

router.use(requireAuth);

const createClientSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  redirectUris: z.array(z.string().url()).max(20).default([]),
  allowedScopes: z.array(z.string()).max(50).default(["read"]),
  grantTypes: z.array(z.enum([
    "authorization_code",
    "urn:agentid:grant-type:signed-assertion",
  ])).default(["authorization_code"]),
  clientType: z.enum(["public", "confidential"]).optional(),
});

const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(20).optional(),
  allowedScopes: z.array(z.string()).max(50).optional(),
});

function generateClientId(): string {
  return "agclient_" + randomBytes(16).toString("hex");
}

function generateClientSecret(): string {
  return "agcs_" + randomBytes(32).toString("hex");
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function sanitizeClient(client: typeof oauthClientsTable.$inferSelect) {
  return {
    id: client.id,
    clientId: client.clientId,
    name: client.name,
    description: client.description,
    redirectUris: client.redirectUris,
    allowedScopes: client.allowedScopes,
    grantTypes: client.grantTypes,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    lastUsedAt: client.lastUsedAt,
    revokedAt: client.revokedAt,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const clients = await db.query.oauthClientsTable.findMany({
      where: and(
        eq(oauthClientsTable.ownerUserId, userId),
        isNull(oauthClientsTable.revokedAt),
      ),
    });

    res.json({ clients: clients.map(sanitizeClient) });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createClientSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const { name, description, redirectUris, allowedScopes, grantTypes, clientType } = parsed.data;
    const clientId = generateClientId();
    const userId = req.user!.id;

    const isSignedAssertionOnly = grantTypes.includes("urn:agentid:grant-type:signed-assertion") &&
      !grantTypes.includes("authorization_code");
    const isPublic = clientType === "public" || isSignedAssertionOnly;

    let clientSecret: string | undefined;
    let clientSecretHash: string | undefined;
    if (!isPublic) {
      clientSecret = generateClientSecret();
      clientSecretHash = hashSecret(clientSecret);
    }

    const [client] = await db.insert(oauthClientsTable).values({
      clientId,
      clientSecretHash: clientSecretHash ?? null,
      name,
      description,
      redirectUris,
      allowedScopes,
      grantTypes,
      ownerUserId: userId,
    }).returning();

    await writeAuditEvent("user", userId, "oauth.client.created", "oauth_client", client.id, {
      clientId,
      name,
      clientType: isPublic ? "public" : "confidential",
    });

    res.status(201).json({
      ...sanitizeClient(client),
      clientType: isPublic ? "public" : "confidential",
      ...(clientSecret ? {
        clientSecret,
        warning: "Store this client_secret securely — it will not be shown again.",
      } : {
        message: "Public client registered — no client secret required.",
      }),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const client = await db.query.oauthClientsTable.findFirst({
      where: and(
        eq(oauthClientsTable.clientId, req.params.id),
        eq(oauthClientsTable.ownerUserId, userId),
      ),
    });

    if (!client) throw new AppError(404, "NOT_FOUND", "Client not found");

    res.json(sanitizeClient(client));
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const parsed = updateClientSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid input", parsed.error.issues);
    }

    const userId = req.user!.id;
    const client = await db.query.oauthClientsTable.findFirst({
      where: and(
        eq(oauthClientsTable.clientId, req.params.id),
        eq(oauthClientsTable.ownerUserId, userId),
        isNull(oauthClientsTable.revokedAt),
      ),
    });

    if (!client) throw new AppError(404, "NOT_FOUND", "Client not found or revoked");

    const updates: Partial<typeof oauthClientsTable.$inferInsert> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.redirectUris !== undefined) updates.redirectUris = parsed.data.redirectUris;
    if (parsed.data.allowedScopes !== undefined) updates.allowedScopes = parsed.data.allowedScopes;

    const [updated] = await db.update(oauthClientsTable)
      .set(updates)
      .where(eq(oauthClientsTable.id, client.id))
      .returning();

    await writeAuditEvent("user", userId, "oauth.client.updated", "oauth_client", client.id, {
      clientId: client.clientId,
      changes: Object.keys(updates),
    });

    res.json(sanitizeClient(updated));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const client = await db.query.oauthClientsTable.findFirst({
      where: and(
        eq(oauthClientsTable.clientId, req.params.id),
        eq(oauthClientsTable.ownerUserId, userId),
        isNull(oauthClientsTable.revokedAt),
      ),
    });

    if (!client) throw new AppError(404, "NOT_FOUND", "Client not found or already revoked");

    await db.update(oauthClientsTable)
      .set({ revokedAt: new Date() })
      .where(eq(oauthClientsTable.id, client.id));

    await writeAuditEvent("user", userId, "oauth.client.revoked", "oauth_client", client.id, {
      clientId: client.clientId,
    });

    res.json({ success: true, clientId: client.clientId, revokedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/rotate-secret", async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const client = await db.query.oauthClientsTable.findFirst({
      where: and(
        eq(oauthClientsTable.clientId, req.params.id),
        eq(oauthClientsTable.ownerUserId, userId),
        isNull(oauthClientsTable.revokedAt),
      ),
    });

    if (!client) throw new AppError(404, "NOT_FOUND", "Client not found");

    const newSecret = generateClientSecret();
    await db.update(oauthClientsTable)
      .set({ clientSecretHash: hashSecret(newSecret) })
      .where(eq(oauthClientsTable.id, client.id));

    await writeAuditEvent("user", userId, "oauth.client.secret_rotated", "oauth_client", client.id, {
      clientId: client.clientId,
    });

    res.json({
      clientId: client.clientId,
      clientSecret: newSecret,
      warning: "Store this client_secret securely — it will not be shown again.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
