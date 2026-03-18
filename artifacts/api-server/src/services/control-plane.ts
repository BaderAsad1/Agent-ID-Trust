import { env } from "../lib/env";

let joseModule: typeof import("jose") | null = null;

async function getJose() {
  if (!joseModule) {
    joseModule = await import("jose");
  }
  return joseModule;
}

export interface ControlPlaneInstruction {
  type: string;
  agentId: string;
  payload: Record<string, unknown>;
}

export interface SignedControlPlaneResult {
  token: string;
  expiresAt: string;
}

export interface VerifyControlPlaneResult {
  valid: boolean;
  instruction?: ControlPlaneInstruction;
  reason?: string;
}

const DEFAULT_TTL_SECONDS = 5 * 60;
const EXPECTED_TYP = "agentid-control-plane+jwt";

export async function signControlPlaneInstruction(
  agentId: string,
  instruction: ControlPlaneInstruction,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<SignedControlPlaneResult> {
  const jose = await getJose();
  const { getVcSigner } = await import("./vc-signer");
  const signer = await getVcSigner();

  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;

  const token = await signer.sign(
    new jose.SignJWT({
      instruction,
    } as unknown as Record<string, unknown>)
      .setProtectedHeader({
        alg: "EdDSA",
        kid: signer.kid,
        typ: EXPECTED_TYP,
      })
      .setIssuer("did:web:getagent.id")
      .setSubject(agentId)
      .setIssuedAt(now)
      .setExpirationTime(exp),
  );

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function verifyControlPlaneInstruction(
  token: string,
): Promise<VerifyControlPlaneResult> {
  try {
    const jose = await getJose();
    const { getSigningKeyPair } = await import("./verifiable-credential");
    const { publicKey } = await getSigningKeyPair();

    const { payload, protectedHeader } = await jose.jwtVerify(token, publicKey, {
      issuer: "did:web:getagent.id",
      algorithms: ["EdDSA"],
    });

    if (protectedHeader.typ !== EXPECTED_TYP) {
      return { valid: false, reason: `Unexpected token type: ${protectedHeader.typ}` };
    }

    const instruction = (payload as Record<string, unknown>).instruction as
      | ControlPlaneInstruction
      | undefined;

    if (!instruction || !instruction.type || !instruction.agentId) {
      return { valid: false, reason: "Missing or malformed instruction in token payload" };
    }

    if (payload.sub !== instruction.agentId) {
      return { valid: false, reason: "Token subject does not match instruction agentId" };
    }

    return { valid: true, instruction };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return { valid: false, reason: message };
  }
}
