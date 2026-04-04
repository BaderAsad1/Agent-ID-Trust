/**
 * Unit tests for the shared anchor-state derivation helper (Task #181).
 *
 * Verifies that erc8004Status / onchainStatus / onchainAnchor agree across
 * the 3-state model (anchored | pending | off-chain) for all realistic
 * chainRegistrations + nftStatus combinations.
 */

import { describe, it, expect } from "vitest";
import { deriveAnchorState } from "../lib/anchor-state";

const BASE_ENTRY = { chain: "base", agentId: "42", txHash: "0xabc" };
const SEPOLIA_ENTRY = { chain: "base-sepolia", agentId: "7", txHash: "0xdef" };

describe("deriveAnchorState — 3-state anchor model (Task #181)", () => {
  // ── off-chain cases ────────────────────────────────────────────────────

  it("off-chain: no chainRegistrations, no nftStatus", () => {
    const r = deriveAnchorState(null, null);
    expect(r.erc8004Status).toBe("off-chain");
    expect(r.onchainStatus).toBe("off-chain");
    expect(r.onchainAnchor).toBeNull();
    expect(r.anchoringMethod).toBe("off-chain");
  });

  it("off-chain: empty array chainRegistrations", () => {
    const r = deriveAnchorState([], null);
    expect(r.erc8004Status).toBe("off-chain");
    expect(r.onchainAnchor).toBeNull();
  });

  it("off-chain: empty object chainRegistrations", () => {
    const r = deriveAnchorState({}, null);
    expect(r.erc8004Status).toBe("off-chain");
    expect(r.onchainAnchor).toBeNull();
  });

  it("off-chain: entry present but nftStatus is null (unexpected data; defaults to off-chain)", () => {
    const r = deriveAnchorState([BASE_ENTRY], null);
    expect(r.erc8004Status).toBe("off-chain");
    expect(r.onchainAnchor).toBeNull();
  });

  it("off-chain: entry present but nftStatus is unrecognised string", () => {
    const r = deriveAnchorState([BASE_ENTRY], "released");
    expect(r.erc8004Status).toBe("off-chain");
  });

  // ── pending cases ──────────────────────────────────────────────────────

  it("pending: nftStatus=pending_anchor, no chainRegistrations entry", () => {
    const r = deriveAnchorState([], "pending_anchor");
    // erc8004Status is "off-chain": NFT not yet minted, no ERC-8004 record exists.
    // onchainStatus is "pending": the workflow is in-flight.
    expect(r.erc8004Status).toBe("off-chain");
    expect(r.onchainStatus).toBe("pending");
    expect(r.onchainAnchor).toBeNull();
    expect(r.anchoringMethod).toBe("off-chain");
  });

  it("pending: nftStatus=pending_claim, entry exists (dispute window)", () => {
    const entry = { ...BASE_ENTRY, pendingClaimSince: "2025-01-01T00:00:00.000Z" };
    const r = deriveAnchorState([entry], "pending_claim");
    expect(r.erc8004Status).toBe("pending");
    expect(r.onchainStatus).toBe("pending");
    expect(r.onchainAnchor).toBeNull();
  });

  it("pending: nftStatus=pending_anchor, entry present (queued for anchor)", () => {
    const r = deriveAnchorState([BASE_ENTRY], "pending_anchor");
    // Even with a chainRegistrations entry, pending_anchor means the NFT is not
    // yet confirmed — no ERC-8004 record is resolvable; erc8004Status is "off-chain".
    expect(r.erc8004Status).toBe("off-chain");
    expect(r.onchainStatus).toBe("pending");
    expect(r.onchainAnchor).toBeNull();
  });

  // ── anchored cases ─────────────────────────────────────────────────────

  it("anchored: array form, nftStatus=active", () => {
    const r = deriveAnchorState([BASE_ENTRY], "active");
    expect(r.erc8004Status).toBe("anchored");
    expect(r.onchainStatus).toBe("anchored");
    expect(r.onchainAnchor).toEqual(BASE_ENTRY);
    expect(r.anchoringMethod).toBe("base-registrar");
  });

  it("anchored: array form, nftStatus=minted", () => {
    const r = deriveAnchorState([BASE_ENTRY], "minted");
    expect(r.erc8004Status).toBe("anchored");
    expect(r.onchainAnchor).toEqual(BASE_ENTRY);
  });

  it("anchored: object form {base: {...}} with chain field, nftStatus=active", () => {
    const r = deriveAnchorState({ base: BASE_ENTRY }, "active");
    expect(r.erc8004Status).toBe("anchored");
    expect(r.onchainAnchor).toEqual(BASE_ENTRY);
  });

  it("anchored: object form {base: {...}} WITHOUT chain field (key-only), nftStatus=active", () => {
    // Real DB rows stored before the chain field was added may lack it in the value.
    const entryWithoutChain = { agentId: "42", txHash: "0xabc" };
    const r = deriveAnchorState({ base: entryWithoutChain }, "active");
    expect(r.erc8004Status).toBe("anchored");
    // onchainAnchor must have chain injected from the object key
    expect(r.onchainAnchor).toMatchObject({ agentId: "42", chain: "base" });
  });

  it("pending: object form {base: {...}} without chain field, nftStatus=pending_claim", () => {
    const entryWithoutChain = { agentId: "42", txHash: "0xabc" };
    const r = deriveAnchorState({ base: entryWithoutChain }, "pending_claim");
    expect(r.erc8004Status).toBe("pending");
    expect(r.onchainAnchor).toBeNull();
  });

  it("anchored: base-sepolia chain label, nftStatus=active", () => {
    const r = deriveAnchorState([SEPOLIA_ENTRY], "active");
    expect(r.erc8004Status).toBe("anchored");
    expect(r.onchainAnchor).toEqual(SEPOLIA_ENTRY);
  });

  it("anchored: multiple chains in array; selects first base entry", () => {
    const tron = { chain: "tron", agentId: "99" };
    const r = deriveAnchorState([tron, BASE_ENTRY], "active");
    expect(r.erc8004Status).toBe("anchored");
    expect(r.onchainAnchor).toEqual(BASE_ENTRY);
  });

  // ── coherence: erc8004Status vs onchainStatus semantics ───────────────
  // erc8004Status = "is there an ERC-8004 record resolvable on-chain?"
  // onchainStatus = "what is the lifecycle workflow state?"
  // They agree for most states, but pending_anchor is the exception:
  // the workflow is in-flight (onchainStatus=pending) but no ERC-8004
  // record exists yet (erc8004Status=off-chain).

  it("coherence: erc8004Status and onchainStatus agree for off-chain and anchored", () => {
    const fixtures: [unknown, string | null | undefined][] = [
      [null, null],
      [[BASE_ENTRY], "active"],
      [{ base: BASE_ENTRY }, "minted"],
    ];
    for (const [regs, status] of fixtures) {
      const r = deriveAnchorState(regs, status);
      expect(r.erc8004Status).toBe(r.onchainStatus);
    }
  });

  it("coherence: pending_claim agrees (both pending)", () => {
    const r = deriveAnchorState([BASE_ENTRY], "pending_claim");
    expect(r.erc8004Status).toBe(r.onchainStatus);
    expect(r.erc8004Status).toBe("pending");
  });

  it("coherence: pending_anchor diverges — onchainStatus=pending, erc8004Status=off-chain", () => {
    const r = deriveAnchorState([], "pending_anchor");
    expect(r.onchainStatus).toBe("pending");
    expect(r.erc8004Status).toBe("off-chain");
  });

  // ── bootstrap/resolver parity surface check ────────────────────────────

  it("parity: same inputs produce identical output regardless of call site", () => {
    const regs = [BASE_ENTRY];
    const nftStatus = "active";
    const r1 = deriveAnchorState(regs, nftStatus);
    const r2 = deriveAnchorState(regs, nftStatus);
    expect(r1).toEqual(r2);
  });
});
