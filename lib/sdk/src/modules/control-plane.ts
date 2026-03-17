export interface ControlPlaneInstruction {
  type: string;
  agentId: string;
  payload: Record<string, unknown>;
}

export interface SignedControlPlaneInstruction {
  token: string;
  expiresAt: string;
}

export interface VerifyControlPlaneOptions {
  jwksUri?: string;
}

const DEFAULT_JWKS_URI = "https://getagent.id/api/.well-known/jwks.json";
const EXPECTED_TYP = "agentid-control-plane+jwt";

export async function verifyControlPlaneInstruction(
  jwt: string,
  options?: VerifyControlPlaneOptions,
): Promise<ControlPlaneInstruction> {
  const jose = await import("jose");

  const jwksUri = options?.jwksUri || DEFAULT_JWKS_URI;
  const JWKS = jose.createRemoteJWKSet(new URL(jwksUri));

  const { payload, protectedHeader } = await jose.jwtVerify(jwt, JWKS, {
    issuer: "did:web:getagent.id",
    algorithms: ["EdDSA"],
  });

  if (protectedHeader.typ !== EXPECTED_TYP) {
    throw new Error(`Unexpected token type: ${protectedHeader.typ}`);
  }

  const instruction = (payload as Record<string, unknown>).instruction as
    | ControlPlaneInstruction
    | undefined;

  if (!instruction || !instruction.type || !instruction.agentId) {
    throw new Error("Missing or malformed instruction in token payload");
  }

  if (payload.sub !== instruction.agentId) {
    throw new Error("Token subject does not match instruction agentId");
  }

  return instruction;
}
