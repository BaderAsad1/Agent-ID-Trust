import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db/schema";
import { logger } from "../../middlewares/request-logger";

export interface TronMintResult {
  tokenId: string;
  txHash: string;
  contract: string;
  minterAddress: string;
}

interface TronTransactionLog {
  topics?: string[];
  data?: string;
  address?: string;
}

interface TronTransactionInfo {
  id?: string;
  log?: TronTransactionLog[];
  receipt?: { result?: string };
}

interface TronContractMethod {
  mintHandle: (handle: string) => {
    send: (opts: { feeLimit: number; callValue: number }) => Promise<string>;
  };
}

interface TronWebClient {
  defaultAddress: { base58?: string; hex?: string };
  contract: () => { at: (address: string) => Promise<TronContractMethod> };
  trx: { getTransactionInfo: (txHash: string) => Promise<TronTransactionInfo> };
}

function getTronConfig(): { apiUrl: string; privateKey: string; contractAddress: string } {
  const apiUrl = process.env.TRON_API_URL;
  const privateKey = process.env.TRON_MINTER_PRIVATE_KEY;
  const contractAddress = process.env.TRON_CONTRACT_ADDRESS;
  if (!apiUrl || !privateKey || !contractAddress) {
    throw new Error(
      "TRON_NOT_CONFIGURED: TRON_API_URL, TRON_MINTER_PRIVATE_KEY, and TRON_CONTRACT_ADDRESS must all be set",
    );
  }
  return { apiUrl, privateKey, contractAddress };
}

async function createTronWeb(config: { apiUrl: string; privateKey: string }): Promise<TronWebClient> {
  const mod = await import("tronweb");
  const Ctor: new (opts: { fullHost: string; privateKey: string }) => TronWebClient =
    (mod as unknown as { default: typeof Ctor }).default ?? (mod as unknown as { TronWeb: typeof Ctor }).TronWeb ?? mod;
  return new Ctor({ fullHost: config.apiUrl, privateKey: config.privateKey });
}

function normalizeHex(s: string): string {
  return s.startsWith("0x") ? s.slice(2) : s;
}

/**
 * TRON_HANDLE_MINTED_TOPIC must be the keccak-256 hash of the HandleMinted event signature.
 * Minting fails if this is not set — intentional, to prevent accepting unrelated events.
 */
function getHandleMintedTopic(): string {
  const topic = process.env.TRON_HANDLE_MINTED_TOPIC;
  if (!topic) {
    throw new Error(
      "TRON_NOT_CONFIGURED: TRON_HANDLE_MINTED_TOPIC must be set to the keccak-256 hash of HandleMinted event signature",
    );
  }
  return topic;
}

function extractTokenIdFromReceipt(
  receipt: TronTransactionInfo,
  txHash: string,
  contractAddress: string,
): string {
  if (!receipt.log || receipt.log.length === 0) {
    throw new Error(`TRON_NO_LOGS: Transaction ${txHash} produced no logs; cannot confirm HandleMinted`);
  }

  const expectedTopic = normalizeHex(getHandleMintedTopic()).toLowerCase();

  for (const log of receipt.log) {
    if (!log.topics || log.topics.length === 0) continue;
    const firstTopic = log.topics[0];
    if (!firstTopic || normalizeHex(firstTopic).toLowerCase() !== expectedTopic) continue;
    if (log.address && log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;

    if (log.topics.length >= 2) {
      const hex = normalizeHex(log.topics[1] ?? "");
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        const tokenId = BigInt("0x" + hex).toString();
        if (tokenId !== "0") {
          logger.info({ txHash, tokenId }, "[tron] tokenId from HandleMinted topics[1]");
          return tokenId;
        }
      }
    }

    if (log.data && log.data.length >= 64) {
      const hex = normalizeHex(log.data).slice(0, 64);
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        const tokenId = BigInt("0x" + hex).toString();
        if (tokenId !== "0") {
          logger.info({ txHash, tokenId }, "[tron] tokenId from HandleMinted log data");
          return tokenId;
        }
      }
    }
  }

  throw new Error(
    `TRON_EVENT_NOT_FOUND: HandleMinted not found in tx ${txHash} logs ` +
    `(topic=${getHandleMintedTopic()}, contract=${contractAddress})`,
  );
}

async function waitForReceipt(
  tronWeb: TronWebClient,
  txHash: string,
  maxAttempts = 20,
): Promise<TronTransactionInfo> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((r) => setTimeout(r, 3000));
    try {
      const info = await tronWeb.trx.getTransactionInfo(txHash);
      if (info?.id) {
        if (info.receipt?.result && info.receipt.result !== "SUCCESS") {
          throw new Error(`TRON_TX_FAILED: tx ${txHash} failed: ${info.receipt.result}`);
        }
        return info;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("TRON_TX_FAILED")) throw err;
    }
  }
  throw new Error(`TRON_RECEIPT_TIMEOUT: tx ${txHash} not confirmed after ${maxAttempts * 3}s`);
}

export async function mintHandleOnTron(handle: string): Promise<TronMintResult> {
  const config = getTronConfig();
  const tronWeb = await createTronWeb(config);

  logger.info({ handle, contract: config.contractAddress }, "[tron] Minting handle on Tron");

  let txHash: string;
  try {
    const contract = await tronWeb.contract().at(config.contractAddress);
    txHash = await contract.mintHandle(handle).send({ feeLimit: 100_000_000, callValue: 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ handle, err: message }, "[tron] Mint submission failed");
    throw new Error(`TRON_MINT_SUBMIT_FAILED: ${message}`);
  }

  logger.info({ handle, txHash }, "[tron] Mint transaction submitted; awaiting receipt");

  const receipt = await waitForReceipt(tronWeb, txHash);
  const tokenId = extractTokenIdFromReceipt(receipt, txHash, config.contractAddress);
  const minterAddress = tronWeb.defaultAddress.base58 ?? tronWeb.defaultAddress.hex ?? "unknown";

  logger.info({ handle, txHash, tokenId, minterAddress }, "[tron] Handle minted on Tron");

  return { tokenId, txHash, contract: config.contractAddress, minterAddress };
}

export async function updateChainMintsTron(
  agentId: string,
  handle: string,
  mintResult: TronMintResult,
): Promise<void> {
  const agent = await db.query.agentsTable.findFirst({
    where: eq(agentsTable.id, agentId),
    columns: { chainMints: true },
  });

  const existing = (agent?.chainMints as Record<string, unknown>) ?? {};
  await db
    .update(agentsTable)
    .set({
      chainMints: {
        ...existing,
        tron: {
          tokenId: mintResult.tokenId,
          txHash: mintResult.txHash,
          mintedAt: new Date().toISOString(),
          custodian: "platform",
          owner: mintResult.minterAddress,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, agentId));

  logger.info({ agentId, handle, tokenId: mintResult.tokenId }, "[tron] chain_mints updated");
}
