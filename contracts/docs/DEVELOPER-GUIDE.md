# AgentIDRegistrar — Developer & Auditor Guide

## What This Contract Does (Plain English)

Agent ID (getagent.id) is a platform that gives AI agents human-readable names — like "openclaw.agentid". Think of it as a domain registrar (like GoDaddy) but for AI agent identities instead of websites.

There is an existing standard called ERC-8004 that defines how AI agents register on-chain identities. The ERC-8004 team has deployed their Identity Registry contract on 25+ blockchains. Anyone can call `register()` on that contract to mint an agent identity NFT.

**Our contract (AgentIDRegistrar) sits on top of the ERC-8004 registry.** It adds:
- A namespace system (`.agentid` handles)
- Handle validation rules (what characters are allowed, length limits)
- Tier-based pricing enforcement (3-char premium, 4-char standard, 5+ basic)
- Reserved word protection
- Expiry tracking
- Approved custody wallets (we hold the NFT until the user claims it, even across custody-wallet rotations)

The analogy: ERC-8004's registry is the DMV that issues license plates. Our registrar is the dealership that handles the paperwork and controls which plates are available under the `.agentid` namespace.

## Architecture

```
┌─────────────────────────────────────┐
│         Agent ID Backend            │
│     (Node.js on Replit)             │
│                                     │
│  Verifies payment (Stripe/crypto)   │
│  Then calls registerHandle()        │
│  via the MINTER wallet              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      AgentIDRegistrar (this)        │
│      (UUPS Upgradeable Proxy)       │
│                                     │
│  1. Validates handle                │
│  2. Calls ERC-8004 register()       │
│  3. Sets on-chain metadata          │
│  4. Transfers NFT to custody wallet │
│  5. Stores handle→agentId mapping   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   ERC-8004 IdentityRegistry         │
│   (deployed by ERC-8004 team)       │
│   (NOT our contract)                │
│                                     │
│   0x8004A169...432 (mainnet)        │
│   0x8004A818...9e  (testnet)        │
│                                     │
│   Standard ERC-721 + metadata       │
│   Anyone can call register()        │
│   We just wrap it with our rules    │
└─────────────────────────────────────┘
```

## Why Upgradeable?

The ERC-8004 registry itself is upgradeable (UUPS pattern). We use the same pattern so we can:
- Fix bugs after deployment without losing data
- Add new features (e.g., additional chain support, new metadata fields)
- Patch security issues
- The contract address never changes — all integrations keep working

UUPS means only the contract owner can authorize upgrades. The upgrade function requires a new implementation address, and the old state (all handle mappings, all settings) is preserved.

## Key Roles

| Role | Who | What they can do |
|------|-----|-----------------|
| **Owner** | Your admin wallet (Ledger/multisig) | Upgrade contract, change minter, change platform wallet, manage approved custody wallets, reserve handles, suspend handles, release expired handles |
| **Minter** | Backend hot wallet | Register handles, renew handles, transfer NFTs to users, update agent card URIs |
| **Platform Wallet** | Default custody wallet (Gnosis Safe) | Receives newly registered NFTs by default and is automatically marked as an approved custody wallet on-chain. |
| **Approved Custody Wallets** | Current and legacy custody wallets | Any approved custody wallet can hold unclaimed NFTs. Each one must separately call `registry.setApprovalForAll(registrar, true)` before the registrar can move NFTs out of it. |

## Function-by-Function Explanation

### `initialize(registry, minter, platformWallet, baseAgentCardURI)`
Called once after proxy deployment. Sets up the contract. Equivalent to a constructor but for upgradeable contracts.

### `registerHandle(handle, tier, expiresAt) → agentId`
**Who can call:** Only minter
**What it does:**
1. Validates the handle string (a-z, 0-9, hyphens, 3-32 chars, no start/end hyphen)
2. Checks handle isn't already registered (via `handleRegistered` mapping)
3. Checks handle isn't reserved
4. Validates tier matches handle length: 1 for 3-char, 2 for 4-char, 3 for 5+ chars
5. Builds the agent card URI: `baseAgentCardURI + handle`
6. Creates a MetadataEntry array with "agentid.handle" and "agentid.tier"
7. Calls `registry.register(agentCardURI, metadata)` — this mints an ERC-721 NFT to THIS CONTRACT
   - Inside the registry: `_safeMint(msg.sender, agentId)` where msg.sender is our contract
   - The registry automatically sets `agentWallet = address(this)`
   - The registry sets the tokenURI to our agentCardURI
   - The registry stores our metadata entries
   - `_safeMint` triggers our `onERC721Received` callback
8. Calls `registry.transferFrom(this, platformWallet, agentId)` — moves NFT to the current default custody wallet
   - The registry's `_update()` clears `agentWallet` to "" on transfer (by design)
9. Stores handle→agentId mapping, tier, expiry, active status in this contract's storage
10. Emits HandleRegistered event

### `renewHandle(handle, newExpiry)`
**Who can call:** Only minter
**What it does:** Updates the expiry timestamp for a handle after renewal payment is confirmed.
**Safety rules in `v1.2.0`:**
- the new expiry must be strictly greater than the current expiry
- the new expiry must still be in the future relative to `block.timestamp`
- the function is disabled while the contract is paused

### `transferToUser(handle, userWallet)`
**Who can call:** Only minter
**What it does:** Transfers the NFT from whichever approved custody wallet currently owns it to a user's personal wallet. This is the "claim NFT" flow. After this, the user owns the NFT and can trade it on OpenSea etc.
**Prerequisite:** Every custody wallet that may hold unclaimed NFTs must have called `registry.setApprovalForAll(registrar, true)` so our contract can move NFTs out of it.
**Safety check:** Once a user owns the NFT, `transferToUser()` stops working because user wallets are not on the approved custody-wallet allowlist.
**Side effect:** The ERC-8004 registry clears `agentWallet` on transfer. The new owner must call `registry.setAgentWallet()` with an EIP-712 signature to re-verify.
**Pause behavior:** Disabled while the contract is paused.

### `updateAgentCardURI(handle, newURI)`
**Who can call:** Only minter
**What it does:** Updates the on-chain tokenURI (the agent card URL) for a handle's ERC-8004 identity. Only works while the NFT is in platform custody (or if this contract is an approved operator).
**Pause behavior:** Disabled while the contract is paused.

### `resolveHandle(handle) → (agentId, nftOwner, tier, active, expired)`
**Who can call:** Anyone (view function, no gas)
**What it does:** Looks up a handle and returns its on-chain data.

### `isHandleAvailable(handle) → (available, reason)`
**Who can call:** Anyone (view function)
**What it does:** Checks if a handle can be registered. Returns a human-readable reason if not.

### `reserveHandles(handles[])`
**Who can call:** Only owner
**What it does:** Marks handles as reserved so they can't be registered. Used for brand protection, protocol terms, offensive words.

### `suspendHandle(handle)` / `reactivateHandle(handle)`
**Who can call:** Only owner
**What it does:** Marks a handle as inactive (suspended) or reactivates it. Suspended handles still exist but are flagged.

### `releaseHandle(handle)`
**Who can call:** Only owner
**What it does:** Permanently removes a handle from the namespace after it has expired + 90 day grace period. In `v1.2.0`, released handles are retired rather than made reusable. If the old ERC-8004 NFT is still in approved custody, the registrar also scrubs the old `agentid.handle` / `agentid.tier` metadata and updates the agent card URI before clearing the namespace mapping.

### `setMinter(address)` / `setPlatformWallet(address)` / `setCustodyWallet(address,bool)` / `setBaseAgentCardURI(string)` / `pause()` / `unpause()`
**Who can call:** Only owner
**What it does:** Updates admin settings.
**Ownership safety in `v1.2.0`:**
- the contract now uses `Ownable2StepUpgradeable`
- ownership transfers require `transferOwnership(newOwner)` and then `acceptOwnership()` by the recipient
- `pause()` freezes minting, renewals, claims, and agent-card URI updates during incidents

## Security Model

### What's at risk?
- **Handle namespace integrity:** If compromised, an attacker could register handles they shouldn't own
- **NFTs in custody wallets:** If an approved custody wallet is compromised, all unclaimed NFTs in that wallet are at risk
- **Minter key:** If stolen, attacker can register arbitrary handles and transfer NFTs

### What's NOT at risk?
- **User funds:** This contract never holds ETH, USDC, or any tokens
- **Private keys:** No private keys are stored in the contract
- **Existing claimed NFTs:** Once a user claims their NFT, the registrar can't touch it

### Protections
1. **onlyMinter:** State-changing functions restricted to one address
2. **onlyOwner:** Admin functions restricted to owner
3. **ReentrancyGuard:** On registerHandle and transferToUser (both make external calls)
4. **UUPS upgrade auth:** Only owner can upgrade, and ownership itself now uses a two-step handoff
5. **Handle validation:** On-chain character-by-character validation
6. **Tier enforcement:** 3-char handles require tier 1, 4-char handles require tier 2, 5+ char handles require tier 3
7. **Custody allowlist:** transferToUser only works while the NFT is held by an approved custody wallet
8. **No payable functions:** Contract cannot receive ETH accidentally
9. **No delegatecall:** No arbitrary code execution
10. **No selfdestruct:** Contract cannot be destroyed

## Known Issues & Design Decisions

### 1. agentId 0 sentinel
ERC-8004 starts agentId at 0. We use a separate `handleRegistered` boolean mapping instead of checking `handleToAgentId != 0` to handle this edge case correctly.

### 2. Centralization
The minter and owner are single addresses. This is by design — the backend needs to call registerHandle programmatically. For production, use a multisig (Gnosis Safe) for the owner and consider a multisig or MPC wallet for the minter.

### 3. agentWallet cleared on transfer
When we transfer the NFT from our contract to a custody wallet, and again from a custody wallet to a user, the ERC-8004 registry clears the `agentWallet` metadata each time. This is ERC-8004 behavior, not ours. The final owner must call `setAgentWallet()` with a signature to re-verify.

### 4. Handle expiry is advisory
The contract stores expiry timestamps but does NOT prevent resolution of expired handles. Expiry enforcement happens in the backend. On-chain, expired handles remain registered until explicitly released via `releaseHandle()`. In `v1.2.0`, an anchored handle stays unavailable after release unless a future contract version adds explicit supersession/versioning.

### 5. No on-chain payment
Payments are verified off-chain (Stripe or crypto). The contract trusts the minter to only call registerHandle after payment is confirmed. This keeps the contract simple and avoids DeFi-style attack surfaces.

## Audit Checklist for Your Developer

Your developer should verify:

- [ ] `register()` on ERC-8004 mints to `msg.sender` (this contract) — confirmed in source
- [ ] `_safeMint` triggers `onERC721Received` — our contract implements it
- [ ] MetadataEntry struct matches the ERC-8004 contract's struct exactly
- [ ] "agentWallet" is reserved in ERC-8004 and CANNOT be passed in metadata[] — we don't pass it
- [ ] `transferFrom` works because we own the NFT after mint — confirmed
- [ ] Tier/length enforcement is on-chain: 3-char → tier 1, 4-char → tier 2, 5+ char → tier 3
- [ ] `transferToUser` only succeeds while `ownerOf(agentId)` is an approved custody wallet
- [ ] `setAgentURI` in updateAgentCardURI works because we're owner/operator — confirmed
- [ ] `handleRegistered` mapping correctly handles agentId 0 edge case
- [ ] `_validateHandle` rejects all invalid characters, enforces 3-32 length
- [ ] ReentrancyGuard is on all functions that make external calls
- [ ] UUPS `_authorizeUpgrade` is restricted to onlyOwner
- [ ] `Initializable` prevents re-initialization
- [ ] No integer overflow risks (Solidity 0.8.20 built-in checks)
- [ ] `unchecked` blocks are safe (only on totalHandles increment/decrement)
- [ ] All events emitted correctly for indexing
- [ ] No way for minter to bypass owner-only functions
- [ ] No way for external caller to bypass onlyMinter

## Testing Checklist

- [ ] Deploy to local hardhat network
- [ ] Register a handle → verify NFT minted to registrar → transferred to the default custody wallet
- [ ] Resolve the handle → verify correct data
- [ ] Try to register same handle again → should revert
- [ ] Try to register reserved handle → should revert
- [ ] Try invalid tier/length combinations → should revert
- [ ] Try to register with invalid characters → should revert
- [ ] Try to register from non-minter address → should revert
- [ ] Renew a handle → verify new expiry
- [ ] Transfer to user → verify NFT moves
- [ ] Rotate the platform wallet → verify old custody wallet can still release already-held NFTs
- [ ] Suspend and reactivate a handle
- [ ] Release an expired handle after grace period
- [ ] Upgrade the contract → verify state preserved
- [ ] Call isHandleAvailable for various handles
- [ ] Register handle with agentId 0 (first mint on fresh registry) → verify it works
