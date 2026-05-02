/**
 * Inbound attachment malware scanner.
 *
 * Talks to a ClamAV daemon over TCP using the INSTREAM command. The daemon
 * itself is expected to be reachable over the network (e.g. a sidecar
 * container or managed clamd service). Configuration:
 *
 *   CLAMAV_HOST          — daemon hostname (enables scanning when set)
 *   CLAMAV_PORT          — daemon TCP port (default 3310)
 *   CLAMAV_TIMEOUT_MS    — total scan timeout in milliseconds (default 30000)
 *
 * If CLAMAV_HOST is not set we treat scanning as disabled and return
 * "unscanned" so inbound mail keeps flowing — callers should still log a
 * warning so the operator notices a degraded state.
 *
 * The protocol is documented at:
 *   https://docs.clamav.net/manual/Usage/Scanning.html#clamd
 */

import { Socket } from "net";
import { logger } from "../middlewares/request-logger";

export type ScanStatus = "clean" | "infected" | "unscanned";

export interface ScanResult {
  status: ScanStatus;
  /** Free-form scanner message (e.g. signature name, error string). */
  detail?: string;
  /** Time the scan completed (or was attempted). */
  scannedAt: Date;
}

const DEFAULT_PORT = 3310;
const DEFAULT_TIMEOUT_MS = 30_000;
const INSTREAM_CHUNK_BYTES = 64 * 1024;
// clamd refuses streams larger than its StreamMaxLength setting (default 25 MB).
// Using a conservative 25 MB cap keeps us aligned with stock clamd configs;
// anything larger is reported as "unscanned" so it falls back to allow-with-warning.
const MAX_STREAM_BYTES = 25 * 1024 * 1024;

export function isScannerConfigured(): boolean {
  return !!process.env.CLAMAV_HOST;
}

/**
 * Scan a buffer with the configured malware scanner.
 *
 * - Returns `clean` when the scanner reports OK.
 * - Returns `infected` (with `detail` containing the signature) when a
 *   threat is found.
 * - Returns `unscanned` (with `detail` describing why) when the scanner is
 *   not configured, the buffer is too large, or the scanner errored. Callers
 *   should treat `unscanned` as "still downloadable" and emit a warning log
 *   so the degraded state is visible.
 */
export async function scanBuffer(buffer: Buffer): Promise<ScanResult> {
  // An empty payload has no executable content and is treated as clean even
  // when the scanner is offline — saves a round-trip and keeps callers simple.
  if (buffer.length === 0) {
    return { status: "clean", detail: "empty", scannedAt: new Date() };
  }

  const host = process.env.CLAMAV_HOST;
  if (!host) {
    return { status: "unscanned", detail: "scanner_not_configured", scannedAt: new Date() };
  }

  if (buffer.length > MAX_STREAM_BYTES) {
    return {
      status: "unscanned",
      detail: `payload_too_large:${buffer.length}`,
      scannedAt: new Date(),
    };
  }

  const port = Number(process.env.CLAMAV_PORT) || DEFAULT_PORT;
  const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  try {
    const reply = await instreamScan(host, port, buffer, timeoutMs);
    return interpretClamdReply(reply);
  } catch (err) {
    return {
      status: "unscanned",
      detail: `scanner_error:${err instanceof Error ? err.message : String(err)}`,
      scannedAt: new Date(),
    };
  }
}

function instreamScan(host: string, port: number, buffer: Buffer, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (err: Error | null, value?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(value ?? "");
    };

    const timer = setTimeout(() => finish(new Error(`timeout_after_${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();

    socket.setNoDelay(true);
    socket.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      finish(err);
    });
    socket.on("end", () => {
      clearTimeout(timer);
      const reply = Buffer.concat(chunks).toString("utf8").replace(/\0+$/, "").trim();
      finish(null, reply);
    });

    socket.connect(port, host, () => {
      // zINSTREAM uses NUL-terminated commands and replies, which is friendlier
      // than nINSTREAM for response framing.
      socket.write("zINSTREAM\0");

      let offset = 0;
      while (offset < buffer.length) {
        const end = Math.min(offset + INSTREAM_CHUNK_BYTES, buffer.length);
        const slice = buffer.subarray(offset, end);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(slice.length, 0);
        socket.write(header);
        socket.write(slice);
        offset = end;
      }
      // Zero-length chunk signals end of stream.
      const terminator = Buffer.alloc(4);
      terminator.writeUInt32BE(0, 0);
      socket.write(terminator);
    });
  });
}

export function interpretClamdReply(reply: string): ScanResult {
  const scannedAt = new Date();
  const trimmed = reply.trim();

  if (!trimmed) {
    return { status: "unscanned", detail: "empty_reply", scannedAt };
  }

  // Typical clamd replies:
  //   "stream: OK"
  //   "stream: Eicar-Test-Signature FOUND"
  //   "INSTREAM size limit exceeded. ERROR"
  if (/\bOK\b\s*$/.test(trimmed)) {
    return { status: "clean", detail: trimmed, scannedAt };
  }

  if (/\bFOUND\b/.test(trimmed)) {
    const match = trimmed.match(/stream:\s*(.+?)\s+FOUND/i);
    const signature = match?.[1] || "unknown_signature";
    return { status: "infected", detail: signature, scannedAt };
  }

  // Anything else (ERROR, unrecognized) → fall back to unscanned so mail keeps
  // flowing. Caller logs a warning.
  return { status: "unscanned", detail: trimmed, scannedAt };
}

/** Wrapper that always logs scanner failures so degraded states are visible. */
export async function scanAttachment(
  buffer: Buffer,
  context: { agentId: string; messageId: string; filename: string },
): Promise<ScanResult> {
  const result = await scanBuffer(buffer);

  if (result.status === "infected") {
    logger.warn(
      { ...context, signature: result.detail, size: buffer.length },
      "[attachment-scanner] Malware detected in inbound attachment",
    );
  } else if (result.status === "unscanned") {
    // Only emit a warning when the scanner *should* have run — not when it is
    // simply unconfigured (that's a deployment choice, not a runtime problem).
    if (isScannerConfigured() && result.detail !== "empty") {
      logger.warn(
        { ...context, reason: result.detail, size: buffer.length },
        "[attachment-scanner] Scan failed — attachment kept as unscanned",
      );
    }
  }

  return result;
}
