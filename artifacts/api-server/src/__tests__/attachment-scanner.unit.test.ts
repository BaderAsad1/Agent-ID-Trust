import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type Socket as NetSocket } from "net";
import { scanBuffer, interpretClamdReply, isScannerConfigured } from "../lib/attachment-scanner";

describe("attachment-scanner — interpretClamdReply", () => {
  it("treats `stream: OK` as clean", () => {
    const r = interpretClamdReply("stream: OK");
    expect(r.status).toBe("clean");
  });

  it("treats `stream: <sig> FOUND` as infected and extracts the signature", () => {
    const r = interpretClamdReply("stream: Eicar-Test-Signature FOUND");
    expect(r.status).toBe("infected");
    expect(r.detail).toBe("Eicar-Test-Signature");
  });

  it("falls back to unscanned for unrecognized clamd replies", () => {
    const r = interpretClamdReply("INSTREAM size limit exceeded. ERROR");
    expect(r.status).toBe("unscanned");
    expect(r.detail).toContain("ERROR");
  });

  it("falls back to unscanned for empty replies", () => {
    const r = interpretClamdReply("");
    expect(r.status).toBe("unscanned");
    expect(r.detail).toBe("empty_reply");
  });
});

describe("attachment-scanner — scanBuffer", () => {
  const ORIGINAL_HOST = process.env.CLAMAV_HOST;
  const ORIGINAL_PORT = process.env.CLAMAV_PORT;
  const ORIGINAL_TIMEOUT = process.env.CLAMAV_TIMEOUT_MS;

  beforeEach(() => {
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
    delete process.env.CLAMAV_TIMEOUT_MS;
  });

  afterEach(() => {
    if (ORIGINAL_HOST !== undefined) process.env.CLAMAV_HOST = ORIGINAL_HOST;
    else delete process.env.CLAMAV_HOST;
    if (ORIGINAL_PORT !== undefined) process.env.CLAMAV_PORT = ORIGINAL_PORT;
    else delete process.env.CLAMAV_PORT;
    if (ORIGINAL_TIMEOUT !== undefined) process.env.CLAMAV_TIMEOUT_MS = ORIGINAL_TIMEOUT;
    else delete process.env.CLAMAV_TIMEOUT_MS;
  });

  it("returns unscanned when scanner is not configured", async () => {
    expect(isScannerConfigured()).toBe(false);
    const r = await scanBuffer(Buffer.from("hello"));
    expect(r.status).toBe("unscanned");
    expect(r.detail).toBe("scanner_not_configured");
  });

  it("returns clean for an empty buffer without contacting the scanner", async () => {
    const r = await scanBuffer(Buffer.alloc(0));
    expect(r.status).toBe("clean");
    expect(r.detail).toBe("empty");
  });

  it("returns unscanned with scanner_error when the daemon is unreachable", async () => {
    // Port 1 is reserved and refuses connections — we use it to exercise the
    // socket-error fallback path without spinning up a real listener.
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = "1";
    process.env.CLAMAV_TIMEOUT_MS = "500";
    const r = await scanBuffer(Buffer.from("hello"));
    expect(r.status).toBe("unscanned");
    expect(r.detail?.startsWith("scanner_error")).toBe(true);
  });

  it("speaks zINSTREAM and reports clean on `stream: OK`", async () => {
    const reply = await withFakeClamd((_payload, socket) => {
      socket.write("stream: OK\0");
      socket.end();
    }, async (port) => {
      process.env.CLAMAV_HOST = "127.0.0.1";
      process.env.CLAMAV_PORT = String(port);
      return scanBuffer(Buffer.from("safe contents"));
    });
    expect(reply.status).toBe("clean");
  });

  it("reports infected with the signature on `stream: <sig> FOUND`", async () => {
    const reply = await withFakeClamd((_payload, socket) => {
      socket.write("stream: Eicar-Test-Signature FOUND\0");
      socket.end();
    }, async (port) => {
      process.env.CLAMAV_HOST = "127.0.0.1";
      process.env.CLAMAV_PORT = String(port);
      return scanBuffer(Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR"));
    });
    expect(reply.status).toBe("infected");
    expect(reply.detail).toBe("Eicar-Test-Signature");
  });

  it("frames the buffer correctly: terminator chunk size is zero", async () => {
    let receivedPayload = Buffer.alloc(0);
    const reply = await withFakeClamd((payload, socket) => {
      receivedPayload = payload;
      socket.write("stream: OK\0");
      socket.end();
    }, async (port) => {
      process.env.CLAMAV_HOST = "127.0.0.1";
      process.env.CLAMAV_PORT = String(port);
      return scanBuffer(Buffer.from("abcd"));
    });

    expect(reply.status).toBe("clean");
    // Expected wire format: "zINSTREAM\0" + <4B size=4> + "abcd" + <4B size=0>
    const expected = Buffer.concat([
      Buffer.from("zINSTREAM\0"),
      sizePrefix(4),
      Buffer.from("abcd"),
      sizePrefix(0),
    ]);
    expect(receivedPayload.equals(expected)).toBe(true);
  });
});

function sizePrefix(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

async function withFakeClamd<T>(
  handler: (payload: Buffer, socket: NetSocket) => void,
  body: (port: number) => Promise<T>,
): Promise<T> {
  const server = await startFakeClamd(handler);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no_port");
    return await body(address.port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function startFakeClamd(
  handler: (payload: Buffer, socket: NetSocket) => void,
): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      // Real clamd does not require the client to half-close — it watches for
      // the zero-length INSTREAM terminator and replies as soon as it sees it.
      // Mirror that behaviour so the scanner code path under test (which never
      // calls socket.end) reaches the on("end") branch via our reply + FIN.
      const chunks: Buffer[] = [];
      let responded = false;
      socket.on("error", () => { /* test scaffolding — ignore EPIPE noise */ });
      socket.on("data", (chunk) => {
        chunks.push(chunk);
        if (responded) return;
        const buf = Buffer.concat(chunks);
        // Look for the 4-byte zero terminator after the "zINSTREAM\0" header.
        const headerEnd = buf.indexOf(0); // end of zINSTREAM\0
        if (headerEnd < 0) return;
        let cursor = headerEnd + 1;
        while (cursor + 4 <= buf.length) {
          const size = buf.readUInt32BE(cursor);
          cursor += 4;
          if (size === 0) {
            responded = true;
            handler(buf, socket);
            return;
          }
          if (cursor + size > buf.length) return; // wait for more data
          cursor += size;
        }
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
