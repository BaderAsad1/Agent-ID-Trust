import { createWalletClient, createPublicClient, http, parseAbi, type Address, type Hash } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { logger } from "../../middlewares/request-logger";

// ─── Legacy ERC-721 ABI (AgentIDHandle.sol) — kept for historical reference only ───
// NOT called from any live code path. Legacy contract was replaced by AgentIDRegistrar.
/** @deprecated Legacy ERC-721 path — do not call from live code */
const AGENT_ID_HANDLE_ABI = parseAbi([
  "function mintHandle(address to, string calldata handle) external returns (uint256 tokenId)",
  "function resolveHandle(string calldata handle) external view returns (uint256 tokenId)",
  "function handleOf(uint256 tokenId) external view returns (string memory handle)",
  "function isHandleMinted(string calldata handle) external view returns (bool)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function transferFrom(address from, address to, uint256 tokenId) external",
  "event HandleMinted(address indexed to, uint256 indexed tokenId, string handle)",
  "event HandleTransferred(address indexed from, address indexed to, uint256 indexed tokenId, string handle)",
]);

// ─── Canonical Registrar ABI (AgentIDRegistrar.sol v1.2.0) ───────────────────
// Matches deployed contract:
//   Mainnet: BASE_ERC8004_REGISTRY (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)
//   Testnet: 0x8004A818BFB912233c491871b3d84c89A494BD9e
// Tier codes: premium_3 → 1, premium_4 → 2, standard_5plus → 3
const REGISTRAR_ABI = parseAbi([
  "function registerHandle(string calldata handle, uint8 tier, uint256 expiresAt) external returns (uint256 agentId)",
  "function resolveHandle(string calldata handle) external view returns (uint256 agentId, address nftOwner, uint8 tier, bool active, bool expired)",
  "function transferToUser(string calldata handle, address userWallet) external",
  "function releaseHandle(string calldata handle) external",
  "function renewHandle(string calldata handle, uint256 newExpiry) external",
  "function handleRegistered(string calldata handle) external view returns (bool)",
]);

/**
 * Maps tier string to on-chain uint8 tier code.
 * premium_3 → 1, premium_4 → 2, standard_5plus → 3
 */
function tierToOnChainCode(tier: string): number {
  switch (tier) {
    case "premium_3": return 1;
    case "premium_4": return 2;
    case "standard_5plus": return 3;
    default: return 3;
  }
}

/** Maximum time in milliseconds to wait for an on-chain transaction receipt. */
const TX_RECEIPT_TIMEOUT_MS = 120_000;

export class BaseChainError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "BaseChainError";
  }
}

function isOnchainMintingEnabled(): boolean {
  const v = process.env.ONCHAIN_MINTING_ENABLED;
  return v === "true" || v === "1";
}

function getBaseConfig() {
  const rpcUrl = process.env.BASE_RPC_URL;
  const minterKey = process.env.BASE_MINTER_PRIVATE_KEY;
  // BASE_HANDLE_CONTRACT is deprecated from runtime use — kept for env reference only
  const contractAddress = process.env.BASE_HANDLE_CONTRACT as Address | undefined;
  const platformWallet = process.env.BASE_PLATFORM_WALLET as Address | undefined;
  // BASE_ERC8004_REGISTRY is the canonical registrar address env var
  const registrarAddress = (process.env.BASE_ERC8004_REGISTRY ?? process.env.BASE_AGENTID_REGISTRAR) as Address | undefined;

  return { rpcUrl, minterKey, contractAddress, platformWallet, registrarAddress };
}

function isChainEnabled(): boolean {
  const { rpcUrl, minterKey, registrarAddress, platformWallet } = getBaseConfig();
  return !!(rpcUrl && minterKey && registrarAddress && platformWallet);
}

export interface RegisterOnChainResult {
  agentId: string;
  txHash: Hash;
  chain: "base";
  contractAddress: Address;
}

export interface ResolveOnChainResult {
  agentId: string;
  nftOwner: Address;
  tier: number;
  active: boolean;
  expired: boolean;
}

function makeClients(rpcUrl: string, minterKey: string) {
  const account = privateKeyToAccount(minterKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
  return { account, publicClient, walletClient };
}

/**
 * Register a handle on-chain via AgentIDRegistrar.registerHandle(string, uint8, uint256).
 * Returns the agentId (ERC-8004 tokenId as string), txHash, chain, and contractAddress.
 * Returns null if ONCHAIN_MINTING_ENABLED=false or registrar is not configured.
 */
export async function registerOnChain(
  handle: string,
  tier: string,
  expiresAt: Date,
): Promise<RegisterOnChainResult | null> {
  if (!isOnchainMintingEnabled()) {
    logger.debug({ handle }, "[base] ONCHAIN_MINTING_ENABLED=false — skipping registerOnChain");
    return null;
  }

  const { rpcUrl, minterKey, registrarAddress, platformWallet } = getBaseConfig();

  if (!rpcUrl || !minterKey || !registrarAddress || !platformWallet) {
    logger.warn({ handle }, "[base] registerOnChain: registrar not configured — skipping");
    return null;
  }

  logger.info({ handle, tier, expiresAt, registrar: registrarAddress }, "[base] Registering handle on-chain via AgentIDRegistrar");

  const { publicClient, walletClient } = makeClients(rpcUrl, minterKey);

  const expiresAtUnix = BigInt(Math.floor(expiresAt.getTime() / 1000));
  const tierCode = tierToOnChainCode(tier);

  const txHash = await walletClient.writeContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: "registerHandle",
    args: [handle, tierCode, expiresAtUnix],
  });

  logger.info({ handle, txHash }, "[base] registerHandle tx submitted, waiting for receipt");

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: TX_RECEIPT_TIMEOUT_MS });

  if (receipt.status !== "success") {
    throw new BaseChainError("REGISTER_FAILED", `registerHandle tx reverted: ${txHash}`);
  }

  const result = await publicClient.readContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: "resolveHandle",
    args: [handle],
  });

  const agentId = (result as readonly [bigint, Address, number, boolean, boolean])[0].toString();

  logger.info({ handle, agentId, txHash }, "[base] Handle registered on-chain");

  return {
    agentId,
    txHash,
    chain: "base",
    contractAddress: registrarAddress,
  };
}

/**
 * Transfer a handle from platform custody to a user's wallet via
 * AgentIDRegistrar.transferToUser(string, address).
 */
export async function transferToUser(
  handle: string,
  userWallet: string,
): Promise<{ txHash: Hash } | null> {
  if (!isOnchainMintingEnabled()) {
    logger.debug({ handle }, "[base] ONCHAIN_MINTING_ENABLED=false — skipping transferToUser");
    return null;
  }

  const { rpcUrl, minterKey, registrarAddress } = getBaseConfig();

  if (!rpcUrl || !minterKey || !registrarAddress) {
    logger.warn({ handle }, "[base] transferToUser: registrar not configured — skipping");
    return null;
  }

  logger.info({ handle, userWallet, registrar: registrarAddress }, "[base] Transferring handle to user wallet via AgentIDRegistrar.transferToUser");

  const { publicClient, walletClient } = makeClients(rpcUrl, minterKey);

  const txHash = await walletClient.writeContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: "transferToUser",
    args: [handle, userWallet as Address],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: TX_RECEIPT_TIMEOUT_MS });

  if (receipt.status !== "success") {
    throw new BaseChainError("TRANSFER_FAILED", `transferToUser tx reverted: ${txHash}`);
  }

  logger.info({ handle, userWallet, txHash }, "[base] Handle transferred to user on-chain");

  return { txHash };
}

/**
 * Resolve a handle on-chain via AgentIDRegistrar.resolveHandle(string).
 * Returns null if ONCHAIN_MINTING_ENABLED=false or registrar is not configured.
 */
export async function resolveOnChain(
  handle: string,
): Promise<ResolveOnChainResult | null> {
  if (!isOnchainMintingEnabled()) {
    return null;
  }

  const { rpcUrl, registrarAddress } = getBaseConfig();

  if (!rpcUrl || !registrarAddress) {
    return null;
  }

  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });

  const result = await publicClient.readContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: "resolveHandle",
    args: [handle],
  });

  const [agentId, nftOwner, tier, active, expired] = result as readonly [bigint, Address, number, boolean, boolean];

  return {
    agentId: agentId.toString(),
    nftOwner,
    tier,
    active,
    expired,
  };
}

/**
 * Release an expired+anchored handle on-chain via AgentIDRegistrar.releaseHandle(string).
 * This is the registrar path for retiring anchored handles; it marks the handle as
 * retired on-chain so it cannot be re-registered.
 * Returns null if ONCHAIN_MINTING_ENABLED=false or registrar is not configured.
 * NOTE: releaseHandle is owner-only on the contract (not minter), so in practice
 * this logs the intent and can be gated if the signing key is not an owner.
 */
export async function releaseHandleOnChain(
  handle: string,
): Promise<{ txHash: Hash } | null> {
  if (!isOnchainMintingEnabled()) {
    logger.debug({ handle }, "[base] ONCHAIN_MINTING_ENABLED=false — skipping releaseHandleOnChain");
    return null;
  }

  const { rpcUrl, minterKey, registrarAddress } = getBaseConfig();

  if (!rpcUrl || !minterKey || !registrarAddress) {
    logger.warn({ handle }, "[base] releaseHandleOnChain: registrar not configured — skipping");
    return null;
  }

  logger.info({ handle, registrar: registrarAddress }, "[base] Releasing expired anchored handle on-chain via AgentIDRegistrar.releaseHandle");

  const { publicClient, walletClient } = makeClients(rpcUrl, minterKey);

  const txHash = await walletClient.writeContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: "releaseHandle",
    args: [handle],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: TX_RECEIPT_TIMEOUT_MS });

  if (receipt.status !== "success") {
    throw new BaseChainError("RELEASE_FAILED", `releaseHandle tx reverted: ${txHash}`);
  }

  logger.info({ handle, txHash }, "[base] Handle released on-chain");

  return { txHash };
}

// ─── Legacy functions — NOT reachable from live code paths ──────────────────

/** @deprecated Legacy ERC-721 path. Not called from any live code path. */
export async function mintHandleOnBase(handle: string): Promise<never> {
  throw new BaseChainError(
    "LEGACY_PATH_DISABLED",
    `mintHandleOnBase is a legacy ERC-721 path and is no longer called. Handle "${handle}" must be registered via registerOnChain() using AgentIDRegistrar.`,
  );
}

/** @deprecated Legacy ERC-721 path. Not called from any live code path. */
export async function transferHandleOnBase(
  _handle: string,
  _tokenId: bigint,
  _destinationAddress: Address,
): Promise<never> {
  throw new BaseChainError(
    "LEGACY_PATH_DISABLED",
    "transferHandleOnBase is a legacy ERC-721 path. Use transferToUser() via AgentIDRegistrar instead.",
  );
}

export async function getPlatformWallet(): Promise<Address | undefined> {
  return getBaseConfig().platformWallet;
}

/**
 * Returns the canonical AgentIDRegistrar proxy address (BASE_ERC8004_REGISTRY or BASE_AGENTID_REGISTRAR).
 * This is the contract that /claim-nft and the idempotency path reference for metadata.
 */
export async function getContractAddress(): Promise<Address | undefined> {
  return getBaseConfig().registrarAddress;
}

export { isOnchainMintingEnabled, isChainEnabled, AGENT_ID_HANDLE_ABI, getBaseConfig, REGISTRAR_ABI, tierToOnChainCode };
