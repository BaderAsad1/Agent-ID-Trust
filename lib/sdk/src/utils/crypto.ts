import type { KeyPair, RegisterOptions, RegisterResult, AgentIDCredential, BootstrapBundle } from "../types.js";
import { HttpClient } from "./http.js";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function generateKid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    false,
    ["sign", "verify"],
  );

  const publicKeyBuffer = await crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey,
  );

  const publicKey = arrayBufferToBase64(publicKeyBuffer);
  const kid = generateKid();

  return {
    publicKey,
    privateKey: keyPair.privateKey,
    kid,
  };
}

export async function signChallenge(
  challenge: string,
  privateKey: CryptoKey,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(challenge);

  const signature = await crypto.subtle.sign("Ed25519", privateKey, data);

  return arrayBufferToBase64(signature);
}

export async function registerAgent(
  options: RegisterOptions,
  baseUrl = "https://getagent.id",
): Promise<RegisterResult> {
  const http = new HttpClient({ baseUrl });
  const keyPair = await generateKeyPair();

  const registerResponse = await http.post<{
    agentId: string;
    handle: string;
    kid: string;
    challenge: string;
    expiresAt: string;
  }>("/api/v1/programmatic/agents/register", {
    handle: options.handle,
    displayName: options.displayName,
    publicKey: keyPair.publicKey,
    keyType: "ed25519",
    description: options.description,
    capabilities: options.capabilities,
    endpointUrl: options.endpointUrl,
  });

  const signature = await signChallenge(
    registerResponse.challenge,
    keyPair.privateKey,
  );

  const verifyResponse = await http.post<{
    verified: boolean;
    agentId: string;
    handle: string;
    apiKey: string;
    bootstrap?: BootstrapBundle;
    trustScore: number;
    trustTier: string;
    planStatus: string;
  }>("/api/v1/programmatic/agents/verify", {
    agentId: registerResponse.agentId,
    challenge: registerResponse.challenge,
    signature,
    kid: registerResponse.kid,
  });

  let credential: AgentIDCredential | null = null;
  try {
    const publicHttp = new HttpClient({ baseUrl });
    credential = await publicHttp.get<AgentIDCredential>(
      `/api/v1/p/${encodeURIComponent(verifyResponse.handle)}/credential`,
    );
  } catch {
    // credential may not be available immediately after registration
  }

  return {
    agentId: verifyResponse.agentId,
    handle: verifyResponse.handle,
    apiKey: verifyResponse.apiKey,
    credential,
    privateKey: keyPair.privateKey,
    trustScore: verifyResponse.trustScore,
    trustTier: verifyResponse.trustTier,
    planStatus: verifyResponse.planStatus,
  };
}

export { arrayBufferToBase64 };
