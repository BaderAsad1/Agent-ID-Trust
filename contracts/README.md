# AgentIDHandle Smart Contracts

ERC-721 NFT contract for Agent ID handles on Base.

## Setup

```bash
cd contracts
npm install
```

## Deploy to Base

```bash
npx hardhat run script/deploy.ts --network base
```

## Environment Variables

- `BASE_RPC_URL` — Base mainnet RPC URL
- `BASE_MINTER_PRIVATE_KEY` — Private key of the deployer/minter wallet
- `BASE_HANDLE_CONTRACT` — Deployed contract address (set after deploy)
- `BASE_PLATFORM_WALLET` — Platform custody wallet address (receives minted NFTs)

## Contract

`AgentIDHandle.sol` — ERC-721 with Enumerable + Ownable. Key functions:
- `mintHandle(address to, string handle)` — mints a handle NFT (minter only)
- `resolveHandle(string handle)` — returns the token ID for a handle
- `handleOf(uint256 tokenId)` — returns the handle string for a token ID
- `setMinter(address)` — updates the minter (owner only)
- `setBaseURI(string)` — updates the metadata base URI (owner only)
