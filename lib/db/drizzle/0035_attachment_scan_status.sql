-- Track malware-scan results for inbound message attachments.
--   scan_status: "unscanned" (default — scanner unconfigured or scan failed),
--                "pending"   (queued for async scan, reserved),
--                "clean"     (scanner returned no threats; scanned_at is set),
--                "blocked"   (scanner flagged the file; storage object deleted)
--   scan_result: free-form scanner response (e.g. signature name) for forensics
--   scanned_at:  timestamp of the scan attempt that produced the current status
ALTER TABLE "message_attachments"
  ADD COLUMN IF NOT EXISTS "scan_status" varchar(20) NOT NULL DEFAULT 'unscanned',
  ADD COLUMN IF NOT EXISTS "scan_result" text,
  ADD COLUMN IF NOT EXISTS "scanned_at" timestamptz;

CREATE INDEX IF NOT EXISTS "message_attachments_scan_status_idx"
  ON "message_attachments" ("scan_status");
