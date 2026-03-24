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

function getBaseConfig() {
  const rpcUrl = process.env.BASE_RPC_URL;
  const minterKey = process.env.BASE_MINTER_PRIVATE_KEY;
  const contractAddress = process.env.BASE_HANDLE_CONTRACT as Address | undefined;
  const platformWallet = process.env.BASE_PLATFORM_WALLET as Address | undefined;

  return { rpcUrl, minterKey, contractAddress, platformWallet };
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

export async function mintHandleOnBase(handle: string): Promise<MintResult> {
  const { rpcUrl, minterKey, contractAddress, platformWallet } = getBaseConfig();

  if (!rpcUrl || !minterKey || !contractAddress || !platformWallet) {
    throw new BaseChainError(
      "CHAIN_NOT_CONFIGURED",
      "Base chain is not configured. Set BASE_RPC_URL, BASE_MINTER_PRIVATE_KEY, BASE_HANDLE_CONTRACT, BASE_PLATFORM_WALLET.",
    );
  }

  const account = privateKeyToAccount(minterKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });

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

  const account = privateKeyToAccount(minterKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });

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

export { isChainEnabled, AGENT_ID_HANDLE_ABI, getBaseConfig };
