import { afterEach, describe, expect, it, vi } from "vitest";
import { createRelyingPartyClient } from "./modules/auth.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRelyingPartyClient", () => {
  it("maps the OAuth token endpoint's RFC 6749 response fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 900,
      token_type: "Bearer",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createRelyingPartyClient({
      clientId: "agclient_test",
      clientSecret: "secret",
      redirectUri: "https://example.com/callback",
    });

    await expect(client.exchangeCode("authorization-code")).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
      tokenType: "Bearer",
    });
  });

  it("supports public PKCE clients without sending a client secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 900,
      token_type: "Bearer",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createRelyingPartyClient({
      clientId: "agclient_public",
      redirectUri: "https://example.com/callback",
    });
    await client.exchangeCode("authorization-code", "pkce-verifier");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      grant_type: "authorization_code",
      client_id: "agclient_public",
      redirect_uri: "https://example.com/callback",
      code: "authorization-code",
      code_verifier: "pkce-verifier",
    });
  });
});
