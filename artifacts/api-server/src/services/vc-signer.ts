/**
 * vc-signer.ts — KMS-ready VC Signing Abstraction
 *
 * Provides a signing interface for Verifiable Credential JWTs that is designed
 * to support KMS migration without changing call sites.
 *
 * SECURITY CONTRACT:
 *   - In production: private key imported transiently per signing call; never stored in module memory.
 *   - In development: ephemeral Ed25519 key pair generated once per process startup.
 *   - To migrate to KMS: replace `getEnvKeyedSigner()` body with a call to AWS KMS, GCP Cloud HSM,
 *     or Hashicorp Vault that accepts the JWT payload and returns the signature bytes without
 *     exporting the private key.
 *
 * KMS MIGRATION PATH:
 *   1. Provision an Ed25519 or P-256 signing key in your KMS of choice.
 *   2. Implement the `VcSigner` interface using the KMS SDK:
 *        const sig = await kmsClient.sign({ KeyId: KMS_KEY_ARN, Message: payload }).promise();
 *        return sig.Signature as Uint8Array;
 *   3. Replace `getVcSigner()` to return the KMS-backed implementation.
 *   4. Remove VC_SIGNING_KEY / VC_PUBLIC_KEY env vars from production secrets.
 *   5. Serve the public key from getPublicKeyJwk() via KMS GetPublicKey.
 */

import type { SignJWT } from "jose";
import { env } from "../lib/env";
import { logger } from "../middlewares/request-logger";

// ─────────────────────────────────────────────────────────────────────────────
// Public interface — implement this when migrating to KMS
// ─────────────────────────────────────────────────────────────────────────────

export interface VcSigner {
  /** Key ID for JWT `kid` header — must match the JWKS endpoint */
  kid: string;
  /** Sign a jose SignJWT instance and return the compact JWT string */
  sign(builder: SignJWT): Promise<string>;
  /** Return the public key JWK for the JWKS endpoint */
  getPublicKeyJwk(): Promise<Record<string, unknown>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only: ephemeral key pair (process-lifetime; NOT for production)
// ─────────────────────────────────────────────────────────────────────────────

let _devSigner: VcSigner | null = null;

async function getDevEphemeralSigner(): Promise<VcSigner> {
  if (_devSigner) return _devSigner;

  const { generateKeyPair, exportJWK } = await import("jose");
  logger.warn("[vc-signer] Generating ephemeral Ed25519 signing key (dev only — NOT for production)");

  const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const publicJwk = await exportJWK(publicKey);
  const kid = env().VC_KEY_ID;

  const newSigner: VcSigner = {
    kid,
    sign: async (builder: SignJWT): Promise<string> => builder.sign(privateKey),
    getPublicKeyJwk: async () => publicJwk as Record<string, unknown>,
  };
  _devSigner = newSigner;

  return newSigner;
}

// ─────────────────────────────────────────────────────────────────────────────
// Production: env-var keyed signer (private key imported per-call)
// Replace this function body to migrate to KMS.
// ─────────────────────────────────────────────────────────────────────────────

async function getEnvKeyedSigner(): Promise<VcSigner> {
  const { importJWK, exportJWK } = await import("jose");

  // C1: Read config fresh from env() — not captured in closure — so env() re-invocations
  // can reflect secret rotation in the future. The public key JWK is derived once per
  // signer instance (returned by getVcSigner()), while the PRIVATE key is always read
  // transiently inside sign() to minimize key residency time.
  const config = env();
  let publicKeyJwk: Record<string, unknown>;

  try {
    const publicKey = await importJWK(JSON.parse(config.VC_PUBLIC_KEY!), "EdDSA");
    const jwk = await exportJWK(publicKey);
    publicKeyJwk = jwk as unknown as Record<string, unknown>;
  } catch (err) {
    logger.error({ err }, "[vc-signer] Failed to import public key from VC_PUBLIC_KEY");
    throw new Error("[vc-signer] Invalid VC_PUBLIC_KEY format");
  }

  const kid = config.VC_KEY_ID;

  return {
    kid,
    sign: async (builder: SignJWT): Promise<string> => {
      // C1: Private key JSON is read fresh from env() on every signing call.
      // The raw key string and CryptoKey object are local to this call's stack frame
      // and are eligible for GC immediately after use — no closure captures them.
      // KMS MIGRATION: replace this block with a call to your KMS sign API.
      const signingKeyJson = env().VC_SIGNING_KEY;
      if (!signingKeyJson) {
        throw new Error("[vc-signer] VC_SIGNING_KEY not available — cannot sign");
      }
      let privateKey: CryptoKey;
      try {
        privateKey = (await importJWK(JSON.parse(signingKeyJson), "EdDSA")) as CryptoKey;
      } catch (err) {
        logger.error({ err }, "[vc-signer] Failed to import private key for signing");
        throw new Error("[vc-signer] VC signing key import failed");
      }
      return builder.sign(privateKey);
      // Note: JavaScript does not expose memory-level key zeroization. The privateKey CryptoKey
      // is stack-local and eligible for GC after this function returns. For cryptographic
      // erasure guarantees, migrate to KMS/HSM remote signing (see KMS MIGRATION PATH above).
    },
    getPublicKeyJwk: async () => publicKeyJwk!,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — returns the appropriate signer for the current environment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the VC signer for the current environment.
 *
 * Returns a VcSigner whose `sign()` method creates a signed JWT without
 * persisting the private key in module memory (production) or uses a
 * process-lifetime ephemeral key (development).
 */
export async function getVcSigner(): Promise<VcSigner> {
  const config = env();

  if (config.VC_SIGNING_KEY && config.VC_PUBLIC_KEY) {
    return getEnvKeyedSigner();
  }

  if (config.NODE_ENV === "production") {
    // validateEnv() in env.ts calls process.exit(1) at startup if VC_SIGNING_KEY absent.
    // This guard is belt-and-suspenders in case validateEnv() was not called.
    throw new Error("[vc-signer] VC_SIGNING_KEY required in production — startup should have failed. Check env.ts validateEnv().");
  }

  return getDevEphemeralSigner();
}
