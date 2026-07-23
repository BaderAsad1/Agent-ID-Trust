import { afterEach, describe, expect, it, vi } from "vitest";
import AgentResolver, { AgentResolverError, type ResolveResponse } from "./index";

const resolved = {
  resolved: true,
  agent: { handle: "research-agent" },
} as unknown as ResolveResponse;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgentResolver", () => {
  it("normalizes protocol addresses and caches successful resolutions", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify(resolved), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const resolver = new AgentResolver({ baseUrl: "https://example.test/api/v1/resolve/", retries: 0 });

    await expect(resolver.resolve("Research-Agent.agentid")).resolves.toEqual(resolved);
    await expect(resolver.resolve("research-agent")).resolves.toEqual(resolved);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/v1/resolve/research-agent");

    resolver.invalidate("research-agent.agentid");
    await resolver.resolve("research-agent");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the canonical reverse-resolution contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(resolved), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const resolver = new AgentResolver({ baseUrl: "https://example.test/api/v1/resolve", retries: 0 });

    await resolver.reverse("https://agent.example/tasks");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/v1/resolve/reverse",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ endpointUrl: "https://agent.example/tasks" }),
      }),
    );
  });

  it("maps the API error field to a typed resolver error code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "AGENT_NOT_FOUND", message: "Agent not found" }), { status: 404 }),
    ));
    const resolver = new AgentResolver({ retries: 0 });

    const error = await resolver.resolve("missing").catch((reason) => reason);
    expect(error).toBeInstanceOf(AgentResolverError);
    expect(error).toMatchObject({ code: "AGENT_NOT_FOUND", message: "Agent not found", status: 404 });
  });

  it("formats and validates .agentid protocol addresses", () => {
    expect(AgentResolver.parseProtocolAddress("Research_Agent.agentid")).toEqual({
      handle: "research_agent",
      namespace: "agentid",
    });
    expect(AgentResolver.parseProtocolAddress("research-agent.example")).toBeNull();
    expect(AgentResolver.isAgentIdAddress("research-agent.agentid")).toBe(true);
    expect(AgentResolver.toProtocolAddress("research-agent.agent")).toBe("research-agent.agentid");
    expect(AgentResolver.toDomain("Research-Agent.agentid")).toBe("research-agent.getagent.id");
  });
});
