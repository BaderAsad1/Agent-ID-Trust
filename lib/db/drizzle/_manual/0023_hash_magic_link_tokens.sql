-- C1: Hash magic-link tokens at rest
-- Rename the plaintext `token` column to `hashed_token` so only a SHA-256
-- digest is persisted. The raw token is sent only in the email link and never
-- stored in the database.
ALTER TABLE magic_link_tokens
  RENAME COLUMN token TO hashed_token;
