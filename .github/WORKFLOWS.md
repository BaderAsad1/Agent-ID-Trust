# CI Workflows

## `nightly-coherence.yml` — Nightly base-sepolia credential coherence

Runs `artifacts/api-server/src/__tests__/cross-system-coherence.integration.test.ts`
nightly with `RUN_ONCHAIN_COHERENCE_TEST=true` so the live
`ownerOf(tokenId)` assertion against the base-sepolia registrar
`0x8004A818BFB912233c491871b3d84c89A494BD9e` (chainId `84532`) actually
executes. Per-PR CI keeps that flag off so it doesn't pay the gas /
RPC-flake cost on every push.

### One-time setup: seed a real testnet handle

The test is only meaningful if the seeded `chainRegistrations[base]` row
matches a handle that has actually been minted on base-sepolia. Do this
once and store the result as repo secrets.

1. Mint (or pick) a handle owned by a wallet you control under the
   registrar above on base-sepolia.
2. Note the `tokenId` (uint256) and the `controller` address that
   `ownerOf(tokenId)` returns.
3. In the GitHub repo settings, set:
   - `COHERENCE_TEST_BASE_TOKEN_ID` — the tokenId from step 2.
   - `COHERENCE_TEST_BASE_CONTROLLER` — the owning address from step 2
     (checksummed or lowercase, the test compares case-insensitively).
   - `BASE_RPC_URL` — a private base-sepolia RPC URL (Alchemy / QuickNode /
     Infura). The public `https://sepolia.base.org` works as a fallback
     but is rate-limited.
   - `CREDENTIAL_SIGNING_SECRET` — same value the api-server uses, so the
     HMAC coherence invariants in the test resolve.
   - `SLACK_WEBHOOK_URL` (optional) — incoming webhook for the failure
     alert. Without it, the workflow still opens / updates a tracking
     issue labeled `nightly-coherence`.

If the controller for the seeded handle ever changes on-chain (transfer,
re-mint), update `COHERENCE_TEST_BASE_CONTROLLER` to match before the
next nightly run.

### Failure alerting

On failure the workflow:
- posts a message to `SLACK_WEBHOOK_URL` if it's set, and
- opens (or comments on the existing) GitHub issue labeled
  `nightly-coherence` so the failure surfaces even without Slack.

### Manual reruns

Use the **Run workflow** button on the Actions tab. The dispatch form
accepts optional `token_id` / `controller` overrides if you want to
verify a different seed without changing repo secrets.
