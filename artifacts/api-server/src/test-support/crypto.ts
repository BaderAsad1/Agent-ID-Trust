/**
 * Ed25519 crypto helpers for tests.
 *
 * All crypto in tests uses the real Node.js crypto module — no mocks.
 */
import {
  generateKeyPairSync,
  sign as cryptoSign,
  createPublicKey,
  createPrivateKey,
} from "crypto";

export interface Ed25519KeyPair {
  publicKeyB64: string;
  privateKeyB64: string;
  publicKeyDer: Buffer;
  privateKeyDer: Buffer;
}

/** Generate a real Ed25519 key pair and return base64-encoded SPKI public key and PKCS8 private key. */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  const publicKeyDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const privateKeyDer = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

  return {
    publicKeyB64: publicKeyDer.toString("base64"),
    privateKeyB64: privateKeyDer.toString("base64"),
    publicKeyDer,
    privateKeyDer,
  };
}

/**
 * Sign a challenge string with an Ed25519 private key (base64 PKCS8 DER format).
 * Returns the signature as a base64 string.
 */
export function signChallenge(challenge: string, privateKeyB64: string): string {
  const privateKeyDer = Buffer.from(privateKeyB64, "base64");
  const privKey = createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
  const sig = cryptoSign(null, Buffer.from(challenge), privKey);
  return sig.toString("base64");
}

/**
 * Sign a challenge with the raw private key object.
 */
export function signChallengeWithKey(challenge: string, privateKeyDer: Buffer): string {
  const privKey = createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
  const sig = cryptoSign(null, Buffer.from(challenge), privKey);
  return sig.toString("base64");
}

/**
 * Generate an RSA-2048 key pair and return SPKI-DER base64 public key.
 * Used for label-mismatch attack tests.
 */
export function generateRsaPublicKeyB64(): string {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return der.toString("base64");
}

/**
 * Build a PoP JWT header+payload and return the signed token string.
 * Used for pop-jwt strategy tests.
 */
export function buildPopJwt({
  agentId,
  kid,
  nonce,
  privateKeyDer,
  aud = "agentid",
  expOffsetSeconds = 300,
}: {
  agentId: string;
  kid: string;
  nonce: string;
  privateKeyDer: Buffer;
  aud?: string;
  expOffsetSeconds?: number;
}): string {
  const header = {
    alg: "EdDSA",
    kid,
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    agent_id: agentId,
    jti: nonce,
    aud,
    iat: now,
    exp: now + expOffsetSeconds,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const message = `${encodedHeader}.${encodedPayload}`;

  const privKey = createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
  const sig = cryptoSign(null, Buffer.from(message), privKey);
  const encodedSig = sig.toString("base64url");

  return `${message}.${encodedSig}`;
}
