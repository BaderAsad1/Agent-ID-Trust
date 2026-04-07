# Secret Rotation Audit — 2026-04-07

## Rotated Secrets

All six symmetric secrets were replaced with freshly generated 32-byte hex values
using `crypto.randomBytes(32).toString('hex')`. The Ed25519 keypair was regenerated
using `crypto.generateKeyPairSync('ed25519')` and exported in JWK format.

| Secret | Type | Storage |
|---|---|---|
| ACTIVITY_HMAC_SECRET | 32-byte hex | Replit Secrets Store |
| WEBHOOK_SECRET_KEY | 32-byte hex | Replit Secrets Store |
| CREDENTIAL_SIGNING_SECRET | 32-byte hex | Replit Secrets Store |
| CLAIM_TOKEN_SECRET | 32-byte hex | Replit Secrets Store |
| JWT_SECRET | 32-byte hex | Replit Secrets Store |
| ADMIN_SECRET_KEY | 32-byte hex | Replit Secrets Store |
| VC_SIGNING_KEY | Ed25519 private key (JWK) | Replit Secrets Store |
| VC_PUBLIC_KEY | Ed25519 public key (JWK) | Replit Secrets Store |

## Storage Change

Previously these values existed as plaintext in `[userenv.shared]` in `.replit`.
They have been removed from there and stored exclusively in the Replit Secrets Store,
which does not appear in version control.

## Startup Verification

API server restarted cleanly after rotation. Startup log excerpt:

```
{"subsystems":{"redis":true,"stripe":true,"resend":true,"cloudflare":true,"hmac":true,"webhookKey":true,"credSign":true},"msg":"[startup] Subsystem status"}
{"port":8080,"msg":"Server listening on port 8080"}
```

No errors related to missing or invalid secrets. All subsystems healthy.

## Expected Consequences

- All existing JWT sessions are invalidated (JWT_SECRET rotated).
- All existing admin tokens are invalidated (ADMIN_SECRET_KEY rotated).
- Stripe and third-party API keys were NOT rotated (out of scope).
