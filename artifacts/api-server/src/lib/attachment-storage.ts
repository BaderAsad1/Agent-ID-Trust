/**
 * Attachment storage abstraction.
 *
 * Primary backend: Cloudflare R2 (S3-compatible).
 * Fallback: inline base64 stored in the DB storageUrl field (≤ 500 KB only).
 *
 * Required env vars for R2:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_URL (optional — if set, files are public)
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "crypto";

const MAX_INLINE_BYTES = 500 * 1024; // 500 KB — max size stored in DB
const PRESIGN_TTL_SECONDS = 60 * 60; // 1 hour

export type UploadResult = {
  storageUrl: string;   // presigned or data: URL
  storageKey: string;   // R2 object key (empty for inline)
  checksum: string;
  backend: "r2" | "inline";
};

function getR2Client(): S3Client | null {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
  } = process.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;

  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

/**
 * Upload a file buffer to storage.
 * Returns storageUrl (presigned for R2, data: URL for inline),
 * storageKey (R2 object key), checksum, and backend used.
 */
export async function uploadAttachment(opts: {
  agentId: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<UploadResult> {
  const { agentId, messageId, fileName, mimeType, buffer } = opts;
  const checksum = createHash("sha256").update(buffer).digest("hex");

  if (isR2Configured()) {
    const client = getR2Client()!;
    const bucket = process.env.R2_BUCKET_NAME!;
    // Deterministic key: agentId/messageId/checksum/filename
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `attachments/${agentId}/${messageId}/${checksum.slice(0, 8)}/${safeFileName}`;

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
      ContentLength: buffer.length,
      Metadata: {
        "agent-id": agentId,
        "message-id": messageId,
        "original-name": fileName,
      },
    }));

    // If a public R2 custom domain is configured, use that; otherwise presign
    const publicUrl = process.env.R2_PUBLIC_URL;
    const storageUrl = publicUrl
      ? `${publicUrl.replace(/\/$/, "")}/${storageKey}`
      : await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
          { expiresIn: PRESIGN_TTL_SECONDS },
        );

    return { storageUrl, storageKey, checksum, backend: "r2" };
  }

  // Fallback: inline base64 (only for small files)
  if (buffer.length > MAX_INLINE_BYTES) {
    throw new Error(
      `File too large for inline storage (${(buffer.length / 1024).toFixed(0)} KB). ` +
      `Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME to enable uploads up to 100 MB.`,
    );
  }

  const b64 = buffer.toString("base64");
  const storageUrl = `data:${mimeType};base64,${b64}`;
  return { storageUrl, storageKey: "", checksum, backend: "inline" };
}

export function getStableAttachmentUrl(
  storageKey: string | null | undefined,
  storageUrl: string | null | undefined,
): string | null {
  if (!storageUrl) return null;
  if (storageUrl.startsWith("data:")) return storageUrl;

  const publicUrl = process.env.R2_PUBLIC_URL;
  if (storageKey && publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${storageKey}`;
  }

  return null;
}

/**
 * Generate a fresh presigned URL for an existing R2 object.
 * For inline (data:) attachments, returns the URL as-is.
 */
export async function presignAttachmentUrl(storageKey: string, storageUrl: string): Promise<string> {
  // Public R2 URL or inline — already accessible
  if (!storageKey || !isR2Configured() || storageUrl.startsWith("data:")) {
    return storageUrl;
  }

  const publicUrl = process.env.R2_PUBLIC_URL;
  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${storageKey}`;
  }

  const client = getR2Client()!;
  const bucket = process.env.R2_BUCKET_NAME!;
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );
}

/**
 * Delete an attachment from R2. No-op for inline attachments.
 */
export async function deleteAttachment(storageKey: string): Promise<void> {
  if (!storageKey || !isR2Configured()) return;
  const client = getR2Client()!;
  const bucket = process.env.R2_BUCKET_NAME!;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}

export const ATTACHMENT_LIMITS = {
  maxFileSizeBytes: isR2Configured() ? 100 * 1024 * 1024 : MAX_INLINE_BYTES, // 100 MB R2, 500 KB inline
  maxFilesPerMessage: 10,
  allowedMimeTypes: new Set([
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "application/xml",
    "text/xml",
    // Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    // Archives
    "application/zip",
    "application/gzip",
    // Audio/Video (small)
    "audio/mpeg",
    "audio/wav",
    "video/mp4",
    "video/webm",
  ]),
};
