import { createWalletClient, createPublicClient, http, parseAbi, type Address, type Hash } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { logger } from "../../middlewares/request-logger";

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

const REGISTRAR_ABI = parseAbi([
  "function register(string calldata handle, string calldata tier, uint256 expiresAt) external returns (bytes32 agentId)",
  "function resolve(string calldata handle) external view returns (bytes32 agentId, address owner, uint256 expiresAt, bool active)",
  "function transfer(string calldata handle, address newOwner) external",
]);

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
  const contractAddress = process.env.BASE_HANDLE_CONTRACT as Address | undefined;
  const platformWallet = process.env.BASE_PLATFORM_WALLET as Address | undefined;
  const registrarAddress = process.env.BASE_AGENTID_REGISTRAR as Address | undefined;

  return { rpcUrl, minterKey, contractAddress, platformWallet, registrarAddress };
}

function isChainEnabled(): boolean {
  const { rpcUrl, minterKey, contractAddress, platformWallet } = getBaseConfig();
  return !!(rpcUrl && minterKey && contractAddress && platformWallet);
}

export interface MintResult {
  tokenId: bigint;
  txHash: Hash;
  contract: Address;
}

export interface RegisterOnChainResult {
  agentId: string;
  txHash: Hash;
  chain: "base";
  contractAddress: Address;
}

export interface ResolveOnChainResult {
  agentId: string;
  owner: Address;
  expiresAt: number;
  active: boolean;
}

function makeClients(rpcUrl: string, minterKey: string) {
  const account = privateKeyToAccount(minterKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
  return { account, publicClient, walletClient };
}

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

  const txHash = await walletClient.writeContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: "register",
    args: [handle, tier, expiresAtUnix],
  });

  logger.info({ handle, txHash }, "[base] register tx submitted, waiting for receipt");

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new BaseChainError("REGISTER_FAILED", `registerOnChain tx reverted: ${txHash}`);
  }

  const result = await publicClient.readContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: "resolve",
    args: [handle],
  });

  const agentId = (result as readonly [string, Address, bigint, boolean])[0];

  logger.info({ handle, agentId, txHash }, "[base] Handle registered on-chain");

  return {
    agentId,
    txHash,
    chain: "base",
    contractAddress: registrarAddress,
  };
}

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

  logger.info({ handle, userWallet, registrar: registrarAddress }, "[base] Transferring handle to user wallet via registrar");

  const { publicClient, walletClient } = makeClients(rpcUrl, minterKey);

  const txHash = await walletClient.writeContract({
    address: registrarAddress,
    abi: REGISTRAR_ABI,
    functionName: "transfer",
    args: [handle, userWallet as Address],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new BaseChainError("TRANSFER_FAILED", `transferToUser tx reverted: ${txHash}`);
  }

  logger.info({ handle, userWallet, txHash }, "[base] Handle transferred to user on-chain");

  return { txHash };
}

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
    functionName: "resolve",
    args: [handle],
  });

  const [agentId, owner, expiresAt, active] = result as readonly [string, Address, bigint, boolean];

  return {
    agentId,
    owner,
    expiresAt: Number(expiresAt),
    active,
  };
}

export async function mintHandleOnBase(handle: string): Promise<MintResult> {
  const { rpcUrl, minterKey, contractAddress, platformWallet } = getBaseConfig();

  if (!rpcUrl || !minterKey || !contractAddress || !platformWallet) {
    throw new BaseChainError(
      "CHAIN_NOT_CONFIGURED",
      "Base chain is not configured. Set BASE_RPC_URL, BASE_MINTER_PRIVATE_KEY, BASE_HANDLE_CONTRACT, BASE_PLATFORM_WALLET.",
    );
  }

  const { publicClient, walletClient } = makeClients(rpcUrl, minterKey);

  const alreadyMinted = await publicClient.readContract({
    address: contractAddress,
    abi: AGENT_ID_HANDLE_ABI,
    functionName: "isHandleMinted",
    args: [handle],
  });

  if (alreadyMinted) {
    const tokenId = await publicClient.readContract({
      address: contractAddress,
      abi: AGENT_ID_HANDLE_ABI,
      functionName: "resolveHandle",
      args: [handle],
    });
    throw new BaseChainError(
      "ALREADY_MINTED",
      `Handle "${handle}" is already minted with tokenId ${tokenId}`,
    );
  }

  logger.info({ handle, contract: contractAddress, to: platformWallet }, "[base] Minting handle NFT");

  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: AGENT_ID_HANDLE_ABI,
    functionName: "mintHandle",
    args: [platformWallet, handle],
  });

  logger.info({ handle, txHash }, "[base] Mint transaction submitted, waiting for receipt");

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new BaseChainError("MINT_FAILED", `Mint transaction reverted: ${txHash}`);
  }

  const tokenId = await publicClient.readContract({
    address: contractAddress,
    abi: AGENT_ID_HANDLE_ABI,
    functionName: "resolveHandle",
    args: [handle],
  });

  logger.info({ handle, tokenId: tokenId.toString(), txHash, contract: contractAddress }, "[base] Handle minted successfully");

  return {
    tokenId,
    txHash,
    contract: contractAddress,
  };
}

export async function transferHandleOnBase(
  handle: string,
  tokenId: bigint,
  destinationAddress: Address,
): Promise<{ txHash: Hash }> {
  const { rpcUrl, minterKey, contractAddress, platformWallet } = getBaseConfig();

  if (!rpcUrl || !minterKey || !contractAddress || !platformWallet) {
    throw new BaseChainError(
      "CHAIN_NOT_CONFIGURED",
      "Base chain is not configured.",
    );
  }

  const { publicClient, walletClient } = makeClients(rpcUrl, minterKey);

  const currentOwner = await publicClient.readContract({
    address: contractAddress,
    abi: AGENT_ID_HANDLE_ABI,
    functionName: "ownerOf",
    args: [tokenId],
  });

  if (currentOwner.toLowerCase() !== platformWallet.toLowerCase()) {
    throw new BaseChainError(
      "NOT_IN_CUSTODY",
      `Handle "${handle}" is not in platform custody. Current owner: ${currentOwner}`,
    );
  }

  logger.info({ handle, tokenId: tokenId.toString(), from: platformWallet, to: destinationAddress }, "[base] Transferring handle NFT");

  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: AGENT_ID_HANDLE_ABI,
    functionName: "transferFrom",
    args: [platformWallet, destinationAddress, tokenId],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new BaseChainError("TRANSFER_FAILED", `Transfer transaction reverted: ${txHash}`);
  }

  logger.info({ handle, txHash, to: destinationAddress }, "[base] Handle transferred successfully");

  return { txHash };
}

export interface HandleTransferEvent {
  tokenId: bigint;
  from: Address;
  to: Address;
  handle: string;
  blockNumber: bigint;
  txHash: Hash;
}

export async function getPlatformWallet(): Promise<Address | undefined> {
  return getBaseConfig().platformWallet;
}

export async function getContractAddress(): Promise<Address | undefined> {
  return getBaseConfig().contractAddress;
}

export { isOnchainMintingEnabled, isChainEnabled, AGENT_ID_HANDLE_ABI, getBaseConfig };
