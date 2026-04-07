-- Add storage_key and storage_backend columns to message_attachments
-- storage_key: R2 object key (empty for inline/base64 attachments)
-- storage_backend: "r2" or "inline"
ALTER TABLE "message_attachments"
  ADD COLUMN IF NOT EXISTS "storage_key" varchar(1024),
  ADD COLUMN IF NOT EXISTS "storage_backend" varchar(16) DEFAULT 'inline';
