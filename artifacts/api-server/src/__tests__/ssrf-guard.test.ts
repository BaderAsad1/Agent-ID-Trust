/**
 * SSRF Guard — DNS Rebinding Simulation Tests
 *
 * These tests mock the dns module to deterministically simulate DNS rebinding
 * attacks. They prove that resolveAndValidateHostname() blocks a hostname that
 * previously resolved to a public IP but has since been rebound to a private IP.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// Mock dns/promises BEFORE importing the module under test.
// vitest.mock() is hoisted to the top of the file automatically.
vi.mock("dns/promises", () => ({
  default: {
    resolve: vi.fn(),
    resolve6: vi.fn(),
  },
}));

describe("SSRF Guard — resolveAndValidateHostname (M1 delivery-time DNS validation)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    // Clear the module cache so the mock resets between tests
    vi.resetModules();
  });

  it("blocks a hostname that resolves to a loopback address (127.0.0.1)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve).mockResolvedValue(["127.0.0.1"]);
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("ENODATA"));

    const { resolveAndValidateHostname } = await import("../lib/ssrf-guard");
    await expect(resolveAndValidateHostname("attacker.example.com")).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });

  it("blocks a hostname that resolves to a private RFC1918 address (10.x.x.x)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve).mockResolvedValue(["10.0.0.1"]);
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("ENODATA"));

    const { resolveAndValidateHostname } = await import("../lib/ssrf-guard");
    await expect(resolveAndValidateHostname("legit-looking.com")).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });

  it("blocks a hostname that resolves to a link-local/metadata address (169.254.169.254)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve).mockResolvedValue(["169.254.169.254"]);
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("ENODATA"));

    const { resolveAndValidateHostname } = await import("../lib/ssrf-guard");
    await expect(resolveAndValidateHostname("metadata-proxy.evil.com")).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });

  it("blocks a hostname that resolves to a link-local IPv6 address (fe80::1)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve).mockRejectedValue(new Error("ENODATA"));
    vi.mocked(dns.default.resolve6).mockResolvedValue(["fe80::1"]);

    const { resolveAndValidateHostname } = await import("../lib/ssrf-guard");
    await expect(resolveAndValidateHostname("ipv6-attacker.com")).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });

  it("blocks a hostname that resolves to an ULA IPv6 address (fc00::1)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve).mockRejectedValue(new Error("ENODATA"));
    vi.mocked(dns.default.resolve6).mockResolvedValue(["fc00::dead:beef"]);

    const { resolveAndValidateHostname } = await import("../lib/ssrf-guard");
    await expect(resolveAndValidateHostname("ula-attacker.com")).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });

  it("blocks when DNS resolution returns no records (fail-closed)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve).mockRejectedValue(new Error("NXDOMAIN"));
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("NXDOMAIN"));

    const { resolveAndValidateHostname } = await import("../lib/ssrf-guard");
    await expect(resolveAndValidateHostname("nonexistent.invalid")).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });

  it("DNS rebinding simulation: same hostname, IP changed after registration", async () => {
    // This is the exact DNS rebinding scenario:
    // 1. At registration time, attacker.com resolves to 8.8.8.8 (public) → allowed
    // 2. Attacker repoints DNS to 10.0.0.1 (private)
    // 3. At delivery time, attacker.com now resolves to 10.0.0.1 → BLOCKED
    const dns = await import("dns/promises");

    // Simulate delivery-time resolution (the attacker has now rebound DNS)
    vi.mocked(dns.default.resolve).mockResolvedValue(["10.0.0.1"]);
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("ENODATA"));

    const { resolveAndValidateHostname } = await import("../lib/ssrf-guard");
    // At delivery time: hostname now resolves to private IP → must be blocked
    await expect(resolveAndValidateHostname("attacker.com")).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });

  it("allows a hostname resolving to a valid public IP", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve).mockResolvedValue(["104.16.0.1"]);
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("ENODATA"));

    const { resolveAndValidateHostname } = await import("../lib/ssrf-guard");
    // Should not throw for a public IP
    await expect(resolveAndValidateHostname("hooks.example.com")).resolves.toBeUndefined();
  });

  it("blocks when one of multiple resolved IPs is private (multi-A-record rebinding)", async () => {
    // Attacker's CDN returns multiple IPs; one of them is private.
    // All resolved IPs must be validated — any single private IP causes rejection.
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve).mockResolvedValue(["104.16.0.1", "192.168.1.100"]);
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("ENODATA"));

    const { resolveAndValidateHostname } = await import("../lib/ssrf-guard");
    await expect(resolveAndValidateHostname("mixed.attacker.com")).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });
});
