import { describe, it, expect } from "vitest";
import { parseInboundEmail, type ResendInboundPayload } from "../services/mail-inbound";

function payloadWith(overrides: Partial<ResendInboundPayload["data"]>): ResendInboundPayload {
  return {
    type: "email.received",
    created_at: new Date().toISOString(),
    data: {
      from: "alice@external.example",
      to: "bob@getagent.id",
      subject: "Hello",
      text: "Hi there",
      ...overrides,
    },
  };
}

describe("parseInboundEmail — attachments", () => {
  it("returns an empty attachments array when none are present", () => {
    const parsed = parseInboundEmail(payloadWith({}));
    expect(parsed.attachments).toEqual([]);
  });

  it("captures inline base64 attachment metadata", () => {
    const content = Buffer.from("hello world").toString("base64");
    const parsed = parseInboundEmail(
      payloadWith({
        attachments: [
          {
            filename: "greeting.txt",
            content_type: "text/plain",
            size: 11,
            content,
          },
        ],
      }),
    );
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({
      filename: "greeting.txt",
      contentType: "text/plain",
      size: 11,
      content,
    });
    expect(parsed.attachments[0].contentUrl).toBeUndefined();
  });

  it("captures content_url attachments", () => {
    const parsed = parseInboundEmail(
      payloadWith({
        attachments: [
          {
            filename: "report.pdf",
            content_type: "application/pdf",
            size: 1234,
            content_url: "https://files.example.com/abc.pdf",
          },
        ],
      }),
    );
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]).toMatchObject({
      filename: "report.pdf",
      contentType: "application/pdf",
      size: 1234,
      contentUrl: "https://files.example.com/abc.pdf",
    });
  });

  it("filters attachments without a filename", () => {
    const parsed = parseInboundEmail(
      payloadWith({
        attachments: [
          { filename: "", content_type: "text/plain", size: 0 },
          { filename: "ok.txt", content_type: "text/plain", size: 2, content: "aGk=" },
        ],
      }),
    );
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe("ok.txt");
  });

  it("defaults missing content_type to application/octet-stream", () => {
    const parsed = parseInboundEmail(
      payloadWith({
        attachments: [
          // @ts-expect-error - intentional missing content_type
          { filename: "blob.bin", size: 4, content: "AAAA" },
        ],
      }),
    );
    expect(parsed.attachments[0].contentType).toBe("application/octet-stream");
  });

  it("identifies AgentID-domain senders", () => {
    const parsed = parseInboundEmail(payloadWith({ from: "alice@getagent.id" }));
    expect(parsed.isAgentIdSender).toBe(true);
  });

  it("treats external senders as not AgentID", () => {
    const parsed = parseInboundEmail(payloadWith({ from: "alice@external.example" }));
    expect(parsed.isAgentIdSender).toBe(false);
  });

  it("normalizes recipient list when string vs array is provided", () => {
    const single = parseInboundEmail(payloadWith({ to: "one@getagent.id" }));
    expect(single.to).toEqual(["one@getagent.id"]);

    const multi = parseInboundEmail(
      payloadWith({ to: ["one@getagent.id", "Two <two@getagent.id>"] }),
    );
    expect(multi.to).toEqual(["one@getagent.id", "two@getagent.id"]);
  });
});
