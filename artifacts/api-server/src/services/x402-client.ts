import { getCdpClient, IS_TESTNET } from "../lib/cdp";
import { logger } from "../middlewares/request-logger";

export async function executeX402Payment(params: {
  agentId: string;
  agentAccountName: string;
  targetUrl: string;
  method?: string;
  body?: object;
  agentKey?: string;
}): Promise<{
  success: boolean;
  response?: unknown;
  txHash?: string;
  error?: string;
}> {
  const { agentId, agentAccountName, targetUrl, method = "POST", body, agentKey } = params;

  try {
    const cdp = getCdpClient();

    const account = await cdp.evm.getOrCreateAccount({ name: agentAccountName });

    const { createPublicClient, http } = await import("viem");
    const { baseSepolia, base } = await import("viem/chains");
    const chain = IS_TESTNET ? baseSepolia : base;

    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    const { toClientEvmSigner } = await import("@x402/evm");

    const signer = toClientEvmSigner(
      {
        address: account.address as `0x${string}`,
        signTypedData: async (message: {
          domain: Record<string, unknown>;
          types: Record<string, unknown>;
          primaryType: string;
          message: Record<string, unknown>;
        }) => {
          const result = await account.signTypedData({
            domain: message.domain as any,
            types: message.types as any,
            primaryType: message.primaryType as any,
            message: message.message as any,
          });
          return result as `0x${string}`;
        },
      },
      {
        readContract: publicClient.readContract.bind(publicClient) as any,
      },
    );

    const { x402Client } = await import("@x402/fetch");
    const { registerExactEvmScheme } = await import("@x402/evm/exact/client");

    const client = new x402Client();
    registerExactEvmScheme(client, { signer });

    const { wrapFetchWithPayment } = await import("@x402/fetch");
    const x402Fetch = wrapFetchWithPayment(fetch, client);

    logger.info(
      { agentId, targetUrl, method },
      "[x402-client] Executing server-side x402 payment",
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "AgentID-Client/1.0 x402-internal/1.0",
    };
    if (agentKey) {
      headers["X-Agent-Key"] = agentKey;
    }

    const response = await x402Fetch(targetUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      logger.warn(
        { agentId, status: response.status, errorBody },
        "[x402-client] Payment request failed",
      );
      return {
        success: false,
        error: `Request failed: ${response.status} — ${(errorBody as any).message || response.statusText}`,
      };
    }

    const responseData = await response.json();
    const txHash = response.headers.get("x-payment-response") || undefined;

    logger.info(
      { agentId, txHash },
      "[x402-client] Server-side x402 payment succeeded",
    );

    return {
      success: true,
      response: responseData,
      txHash,
    };
  } catch (err: any) {
    logger.error(
      { agentId, error: err.message },
      "[x402-client] Server-side x402 payment error",
    );
    return {
      success: false,
      error: err.message,
    };
  }
}
