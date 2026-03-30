# Agent ID Smart Contracts

Two contracts live here:
- **AgentIDRegistrar.sol** — Canonical UUPS-upgradeable registrar (current). Use this for all new handle registrations.
- **AgentIDHandle.sol** — Legacy ERC-721 contract (retired). Kept for historical reference only.

## AgentIDRegistrar (Canonical)

AgentIDRegistrar v1.2.0 — UUPS-upgradeable .agentid namespace registrar for ERC-8004 Identity Registries.
Built against IdentityRegistryUpgradeable v2.0.0 source code.

### ERC-8004 Identity Registry Addresses

The AgentIDRegistrar wraps the ERC-8004 IdentityRegistry. Pass these addresses to `initialize(_registry, ...)`.

| Network | Chain ID | ERC-8004 Registry Address |
|---|---|---|
| Base Mainnet | 8453 | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Base Sepolia Testnet | 84532 | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |

### AgentIDRegistrar Proxy Addresses

The AgentIDRegistrar proxy is deployed on top of the ERC-8004 registry.
Set `BASE_ERC8004_REGISTRY` to the proxy address for the target network.

| Network | Chain ID | Proxy Address |
|---|---|---|
| Base Mainnet | 8453 | `<fill-after-deploy>` |
| Base Sepolia Testnet | 84532 | `<fill-after-deploy>` |

> **Important**: Always use the proxy address (not the implementation directly).
> The implementation can be upgraded without changing the proxy address.
> Update `contracts/deployment.json` and `BASE_ERC8004_REGISTRY` after every deploy.

### Functions & ABI Selectors

ABI selectors are the first 4 bytes of `keccak256(functionSignature)`.

| Function | Signature | Description |
|---|---|---|
| `registerHandle` | `registerHandle(string,uint8,uint256)` | Register a handle after payment. Returns `agentId:uint256`. |
| `resolveHandle` | `resolveHandle(string)` | View. Returns `(agentId,nftOwner,tier,active,expired)`. |
| `transferToUser` | `transferToUser(string,address)` | Minter. Transfer custody from platform wallet to user wallet. |
| `releaseHandle` | `releaseHandle(string)` | Owner. Retire an expired handle (90-day grace period enforced on-chain). |
| `renewHandle` | `renewHandle(string,uint256)` | Minter. Extend handle expiry timestamp. |
| `getHandleByAgentId` | `getHandleByAgentId(uint256)` | View. Reverse lookup: ERC-8004 agentId → handle string. |
| `isHandleAvailable` | `isHandleAvailable(string)` | View. Returns `(available:bool, reason:string)`. |
| `handleToAgentId` | `handleToAgentId(string)` | View. Returns registered agentId for handle (0 if not registered). |

### Tier Codes

| Code | Name | Characters |
|---|---|---|
| `1` | `premium_3` | 3-char handles |
| `2` | `premium_4` | 4-char handles |
| `3` | `standard_5plus` | 5+ char handles |

Tier code mapping is defined in `artifacts/api-server/src/services/chains/base.ts`
(`tierToOnChainCode` / `onChainCodeToTier`).

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BASE_ERC8004_REGISTRY` | Yes (primary) | Deployed AgentIDRegistrar **proxy** address |
| `BASE_AGENTID_REGISTRAR` | Fallback | Alias for `BASE_ERC8004_REGISTRY` |
| `BASE_RPC_URL` | Yes | Base mainnet/testnet RPC endpoint |
| `BASE_MINTER_PRIVATE_KEY` | Yes | Platform minter wallet private key (hex, `0x`-prefixed) |
| `BASE_PLATFORM_WALLET` | Yes | Platform custody wallet address |
| `ONCHAIN_MINTING_ENABLED` | Optional | Set `true` or `1` to enable live on-chain calls |

### Claim Ticket Environment Variables

| Variable | Required | Description |
|---|---|---|
| `HANDLE_CLAIM_SIGNING_PRIVATE_KEY` | Yes | HMAC-SHA256 secret for claim ticket signing |
| `HANDLE_CLAIM_ISSUER` | Optional | JWT `iss` field (default: `agentid-api`) |
| `HANDLE_CLAIM_MAX_AGE_SECONDS` | Optional | Ticket TTL in seconds (default: `900` = 15 min) |

### Deploy to Base (Initial)

```bash
cd contracts
npm install
# Deploy UUPS proxy + implementation
# _registry = ERC-8004 IdentityRegistry address for the target network (see table above)
# _minter = BASE_MINTER_PRIVATE_KEY wallet address
# _platformWallet = BASE_PLATFORM_WALLET address
# _baseAgentCardURI = "https://api.getagent.id/v1/agent-card/"
npx hardhat run script/deploy.ts --network base
# After deploy, record the proxy address in contracts/deployment.json
# and set BASE_ERC8004_REGISTRY to that address.
```

### Upgrade (UUPS)

Only the contract owner can authorize upgrades:

```bash
export PROXY_ADDRESS=<AgentIDRegistrar proxy address>
npx hardhat run script/upgrade.ts --network base
# Update deployment.json with new implementation address
```

### Deployment Manifest

See `contracts/deployment.json` for the canonical record of deployed addresses.
Update this file after every deploy or upgrade.

## AgentIDHandle (Legacy — Retired)

`AgentIDHandle.sol` — ERC-721 NFT contract, used in an earlier version of Agent ID.

**Do not use for new registrations.** The `mintHandleOnBase()` and `transferHandleOnBase()`
backend functions throw immediately if called, preventing accidental use of the legacy path.

### Legacy Environment Variables (no longer needed)

- `BASE_HANDLE_CONTRACT` — Legacy ERC-721 contract address (unused in runtime)
