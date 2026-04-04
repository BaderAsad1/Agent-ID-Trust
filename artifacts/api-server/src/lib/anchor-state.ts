/**
 * Canonical on-chain anchor state derivation.
 *
 * Single source of truth for erc8004Status / onchainStatus / onchainAnchor
 * output fields. Must be used by all surfaces (bootstrap, resolver, public
 * profiles) so they agree on the same 3-state model:
 *
 *   "anchored"  – NFT minted and ownership settled (nftStatus active|minted)
 *   "pending"   – NFT in-flight (pending_anchor) OR claim in dispute window (pending_claim)
 *   "off-chain" – No on-chain registration exists
 */

export type AnchorStatus = "anchored" | "pending" | "off-chain";

export interface AnchorStateResult {
  erc8004Status: AnchorStatus;
  onchainStatus: AnchorStatus;
  onchainAnchor: Record<string, unknown> | null;
  anchoringMethod: "base-registrar" | "off-chain";
}

/**
 * Normalise chainRegistrations (object or array form) into a flat array.
 *
 * Object form: `{ base: { agentId, txHash, ... } }` — the object key IS
 * the chain label. The nested value may or may not include a redundant
 * `chain` field. We inject the key as `chain` when it's absent so that the
 * rest of the code can rely on `r.chain` unconditionally.
 *
 * Array form: `[{ chain: "base", agentId, txHash, ... }, ...]` — already
 * has `chain` embedded; returned as-is.
 */
function normaliseChainRegs(chainRegistrations: unknown): Array<Record<string, unknown>> {
  if (!chainRegistrations || typeof chainRegistrations !== "object") return [];
  if (Array.isArray(chainRegistrations)) {
    return (chainRegistrations as Array<unknown>).filter(
      (e): e is Record<string, unknown> => !!e && typeof e === "object",
    );
  }
  // Object form: keys are chain labels, values are registration metadata.
  return Object.entries(chainRegistrations as Record<string, unknown>)
    .filter(([, v]) => !!v && typeof v === "object")
    .map(([key, v]) => {
      const entry = v as Record<string, unknown>;
      // Inject the chain label from the object key if not already present in value.
      return entry.chain ? entry : { ...entry, chain: key };
    });
}

/**
 * Derive anchor state from the agent's chainRegistrations + nftStatus.
 *
 * @param chainRegistrations  Raw value from agentsTable.chainRegistrations
 * @param nftStatus           Raw value from agentsTable.nftStatus
 */
export function deriveAnchorState(
  chainRegistrations: unknown,
  nftStatus: string | null | undefined,
): AnchorStateResult {
  const regs = normaliseChainRegs(chainRegistrations);
  const baseAnchor = regs.find(
    (r) => r.chain === "base" || r.chain === "base-sepolia",
  ) ?? null;

  // nftStatus is the authoritative state machine for the lifecycle.
  // A chainRegistrations entry alone is not enough: pending_claim writes an
  // entry while the 30-day dispute window is open — that state is "pending",
  // not "anchored".
  const isConfirmed = !!baseAnchor && (nftStatus === "active" || nftStatus === "minted");
  const isPending = nftStatus === "pending_anchor" || nftStatus === "pending_claim";

  const status: AnchorStatus = isConfirmed ? "anchored" : isPending ? "pending" : "off-chain";

  return {
    erc8004Status: status,
    onchainStatus: status,
    onchainAnchor: isConfirmed ? baseAnchor : null,
    anchoringMethod: isConfirmed ? "base-registrar" : "off-chain",
  };
}
