import { createWalletClient, createPublicClient, http, parseAbi, type Address, type Hash } from "viem";
import { base, baseSepolia } from "viem/chains";
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
// Proxy address (all write calls): BASE_AGENTID_REGISTRAR
//   Testnet proxy:  0x1D592A07dF4aFd897D25d348e90389C494034110
//   Mainnet proxy:  (set BASE_AGENTID_REGISTRAR)
// Registry address (separate named value): BASE_ERC8004_REGISTRY
//   Testnet registry: 0x8004A818BFB912233c491871b3d84c89A494BD9e
//   Mainnet registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
// Tier codes: premium_3 → 1, premium_4 → 2, standard_5plus → 3
const REGISTRAR_ABI = parseAbi([
  "function registerHandle(string calldata handle, uint8 tier, uint256 expiresAt) external returns (uint256 agentId)",
  "function resolveHandle(string calldata handle) external view returns (uint256 agentId, address nftOwner, uint8 tier, bool active, bool expired)",
  "function transferToUser(string calldata handle, address userWallet) external",
  "function releaseHandle(string calldata handle) external",
  "function renewHandle(string calldata handle, uint256 newExpiry) external",
  "function handleRegistered(string calldata handle) external view returns (bool)",
  "function reserveHandles(string[] calldata handles) external",
  "function unreserveHandle(string calldata handle) external",
  "function isHandleAvailable(string calldata handle) external view returns (bool)",
  "function handleActive(string calldata handle) external view returns (bool)",
  "function handleTier(string calldata handle) external view returns (uint8)",
  "function handleExpiry(string calldata handle) external view returns (uint256)",
  "function handleToAgentId(string calldata handle) external view returns (uint256)",
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

/**
 * Resolve the active viem chain for Base.
 * Precedence (most-specific wins):
 *   1. BASE_CHAIN_ID=84532  → baseSepolia (explicit chain ID wins)
 *   2. IS_TESTNET=true       → baseSepolia (shorthand flag, used when chain ID omitted)
 *   3. (default)             → base mainnet (chain ID 8453)
 */
function getViemChain() {
  const chainId = process.env.BASE_CHAIN_ID;
  if (chainId === "84532") return baseSepolia;
  if (process.env.IS_TESTNET === "true") return baseSepolia;
  return base;
}

/** Returns a human-readable network label for telemetry / logs / DB records. */
function getNetworkLabel(): "base-sepolia" | "base" {
  return getViemChain().id === baseSepolia.id ? "base-sepolia" : "base";
}

function getBaseConfig() {
  const rpcUrl = process.env.BASE_RPC_URL;
  const minterKey = process.env.BASE_MINTER_PRIVATE_KEY;
  // BASE_HANDLE_CONTRACT is deprecated from runtime use — kept for env reference only
  const contractAddress = process.env.BASE_HANDLE_CONTRACT as Address | undefined;
  const platformWallet = process.env.BASE_PLATFORM_WALLET as Address | undefined;
  // BASE_AGENTID_REGISTRAR is the callable proxy — ONLY address used for write calls.
  // No fallback to BASE_ERC8004_REGISTRY: the proxy and registry are separate contracts.
  // Write calls (registerHandle, reserveHandles, transferToUser, etc.) MUST go through the proxy.
  const registrarAddress = process.env.BASE_AGENTID_REGISTRAR as Address | undefined;
  // BASE_ERC8004_REGISTRY is the ERC-8004 registry — kept for reference/read operations only.
  const registryAddress = process.env.BASE_ERC8004_REGISTRY as Address | undefined;

  return { rpcUrl, minterKey, contractAddress, platformWallet, registrarAddress, registryAddress };
}

function isChainEnabled(): boolean {
  const { rpcUrl, minterKey, registrarAddress, platformWallet } = getBaseConfig();
  return !!(rpcUrl && minterKey && registrarAddress && platformWallet);
}

export interface RegisterOnChainResult {
  agentId: string;
  txHash: Hash;
  chain: "base" | "base-sepolia";
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
  const chain = getViemChain();
  const account = privateKeyToAccount(minterKey as `0x${string}`);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
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
    chain: getNetworkLabel(),
    contractAddress: registrarAddress,
  };
}

/**
 * Reserve handles on-chain via AgentIDRegistrar.reserveHandles(string[]).
 * Soft-fail: returns false if registrar is not configured or tx fails — never throws to caller.
 * Called in the Stripe checkout path immediately after session creation to lock the handle
 * in the registrar before payment completes.
 */
export async function reserveHandlesOnChain(handles: string[]): Promise<boolean> {
  if (!isOnchainMintingEnabled()) {
    logger.debug({ handles }, "[base] ONCHAIN_MINTING_ENABLED=false — skipping reserveHandlesOnChain");
    return false;
  }

  const { rpcUrl, minterKey, registrarAddress } = getBaseConfig();

  if (!rpcUrl || !minterKey || !registrarAddress) {
    logger.debug({ handles }, "[base] reserveHandlesOnChain: registrar not configured — skipping");
    return false;
  }

  try {
    const { publicClient, walletClient } = makeClients(rpcUrl, minterKey);

    const txHash = await walletClient.writeContract({
      address: registrarAddress,
      abi: REGISTRAR_ABI,
      functionName: "reserveHandles",
      args: [handles],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: TX_RECEIPT_TIMEOUT_MS });

    if (receipt.status !== "success") {
      logger.warn({ handles, txHash }, "[base] reserveHandles tx reverted — soft-fail");
      return false;
    }

    logger.info({ handles, txHash }, "[base] Handles reserved on-chain via AgentIDRegistrar.reserveHandles");
    return true;
  } catch (err) {
    logger.warn({ handles, err: err instanceof Error ? err.message : String(err) }, "[base] reserveHandlesOnChain failed — soft-fail");
    return false;
  }
}

/**
 * Unreserve a handle on-chain via AgentIDRegistrar.unreserveHandle(string).
 * Soft-fail: returns false if registrar is not configured or tx fails — never throws to caller.
 */
export async function unreserveHandleOnChain(handle: string): Promise<boolean> {
  if (!isOnchainMintingEnabled()) {
    logger.debug({ handle }, "[base] ONCHAIN_MINTING_ENABLED=false — skipping unreserveHandleOnChain");
    return false;
  }

  const { rpcUrl, minterKey, registrarAddress } = getBaseConfig();

  if (!rpcUrl || !minterKey || !registrarAddress) {
    logger.debug({ handle }, "[base] unreserveHandleOnChain: registrar not configured — skipping");
    return false;
  }

  try {
    const { publicClient, walletClient } = makeClients(rpcUrl, minterKey);

    const txHash = await walletClient.writeContract({
      address: registrarAddress,
      abi: REGISTRAR_ABI,
      functionName: "unreserveHandle",
      args: [handle],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: TX_RECEIPT_TIMEOUT_MS });

    if (receipt.status !== "success") {
      logger.warn({ handle, txHash }, "[base] unreserveHandle tx reverted — soft-fail");
      return false;
    }

    logger.info({ handle, txHash }, "[base] Handle unreserved on-chain");
    return true;
  } catch (err) {
    logger.warn({ handle, err: err instanceof Error ? err.message : String(err) }, "[base] unreserveHandleOnChain failed — soft-fail");
    return false;
  }
}

/**
 * Check handle availability on-chain via AgentIDRegistrar.isHandleAvailable(string).
 * Returns null if registrar is not configured or read fails.
 */
export async function isHandleAvailableOnChain(handle: string): Promise<boolean | null> {
  const { rpcUrl, registrarAddress } = getBaseConfig();

  if (!rpcUrl || !registrarAddress) {
    return null;
  }

  try {
    const chain = getViemChain();
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

    const available = await publicClient.readContract({
      address: registrarAddress,
      abi: REGISTRAR_ABI,
      functionName: "isHandleAvailable",
      args: [handle],
    });

    return available as boolean;
  } catch (err) {
    logger.warn({ handle, err: err instanceof Error ? err.message : String(err) }, "[base] isHandleAvailableOnChain failed");
    return null;
  }
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

  const chain = getViemChain();
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

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

// ─── View helpers for new ABI functions ─────────────────────────────────────

/**
 * Read whether a handle is active on-chain via AgentIDRegistrar.handleActive(string).
 * Returns null if registrar is not configured or read fails.
 */
export async function getHandleActiveOnChain(handle: string): Promise<boolean | null> {
  const { rpcUrl, registrarAddress } = getBaseConfig();
  if (!rpcUrl || !registrarAddress) return null;
  try {
    const chain = getViemChain();
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const active = await publicClient.readContract({
      address: registrarAddress,
      abi: REGISTRAR_ABI,
      functionName: "handleActive",
      args: [handle],
    });
    return active as boolean;
  } catch (err) {
    logger.warn({ handle, err: err instanceof Error ? err.message : String(err) }, "[base] getHandleActiveOnChain failed");
    return null;
  }
}

/**
 * Read the tier code for a handle on-chain via AgentIDRegistrar.handleTier(string).
 * Returns null if registrar is not configured or read fails.
 * Tier codes: 1=premium_3, 2=premium_4, 3=standard_5plus
 */
export async function getHandleTierOnChain(handle: string): Promise<number | null> {
  const { rpcUrl, registrarAddress } = getBaseConfig();
  if (!rpcUrl || !registrarAddress) return null;
  try {
    const chain = getViemChain();
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const tier = await publicClient.readContract({
      address: registrarAddress,
      abi: REGISTRAR_ABI,
      functionName: "handleTier",
      args: [handle],
    });
    return Number(tier);
  } catch (err) {
    logger.warn({ handle, err: err instanceof Error ? err.message : String(err) }, "[base] getHandleTierOnChain failed");
    return null;
  }
}

/**
 * Read the expiry timestamp for a handle on-chain via AgentIDRegistrar.handleExpiry(string).
 * Returns expiry as a Date, or null if registrar is not configured or read fails.
 */
export async function getHandleExpiryOnChain(handle: string): Promise<Date | null> {
  const { rpcUrl, registrarAddress } = getBaseConfig();
  if (!rpcUrl || !registrarAddress) return null;
  try {
    const chain = getViemChain();
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const expiry = await publicClient.readContract({
      address: registrarAddress,
      abi: REGISTRAR_ABI,
      functionName: "handleExpiry",
      args: [handle],
    });
    const expiryUnix = Number(expiry as bigint);
    return expiryUnix > 0 ? new Date(expiryUnix * 1000) : null;
  } catch (err) {
    logger.warn({ handle, err: err instanceof Error ? err.message : String(err) }, "[base] getHandleExpiryOnChain failed");
    return null;
  }
}

/**
 * Read the ERC-8004 agentId for a handle on-chain via AgentIDRegistrar.handleToAgentId(string).
 * Returns agentId as string, or null if registrar is not configured or read fails.
 */
export async function getHandleToAgentIdOnChain(handle: string): Promise<string | null> {
  const { rpcUrl, registrarAddress } = getBaseConfig();
  if (!rpcUrl || !registrarAddress) return null;
  try {
    const chain = getViemChain();
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const agentId = await publicClient.readContract({
      address: registrarAddress,
      abi: REGISTRAR_ABI,
      functionName: "handleToAgentId",
      args: [handle],
    });
    return (agentId as bigint).toString();
  } catch (err) {
    logger.warn({ handle, err: err instanceof Error ? err.message : String(err) }, "[base] getHandleToAgentIdOnChain failed");
    return null;
  }
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
 * Returns the canonical AgentIDRegistrar proxy address (BASE_AGENTID_REGISTRAR).
 * This is the contract that /claim-nft and the idempotency path reference for metadata.
 */
export async function getContractAddress(): Promise<Address | undefined> {
  return getBaseConfig().registrarAddress;
}

export { isOnchainMintingEnabled, isChainEnabled, AGENT_ID_HANDLE_ABI, getBaseConfig, REGISTRAR_ABI, tierToOnChainCode };
