# Security Incidents

This file records security incidents and the remediation taken. Append new
entries at the bottom; never delete or rewrite history.

---

## Incident 0001 — R2 credentials committed to `.replit`

- **Discovered:** 2026-05-02 (end-to-end audit, finding C-NEW-1)
- **Repo cleanup:** 2026-05-02 (this commit — plaintext values purged from
  `.replit` and from the audit doc)
- **Cloudflare rotation:** ⚠️ PENDING OPERATOR ACTION (see checklist below).
  Until the operator completes the Cloudflare-side steps, the leaked
  credentials remain valid at Cloudflare and the bucket should be assumed
  compromised.
- **Severity:** Critical
- **Scope:** `agentid-attachments` Cloudflare R2 bucket (inbound mail attachments
  + OAuth client icons).

### What happened

The production R2 access key, secret, and account ID were committed to
`.replit` under `[userenv.shared]` in plaintext. `userenv` values are
version-controlled, so anyone with read access to the repository (including any
historical clone) had full read/write/delete on the bucket.

Leaked access key ID SHA-256 (first 16 hex chars):

```
4dc0e4202c817c20
```

Full SHA-256 of the leaked access key ID:
`4dc0e4202c817c207c6ea270352197df624e786c41cca7e808f7c6fe2fe7f44c`

The leaked secret access key and account ID are intentionally not hashed here;
treat the entire credential triple as fully compromised in any commit prior to
this incident's remediation.

### Remediation

1. The three R2 variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`) were removed from `.replit` `[userenv.shared]`.
   `R2_BUCKET_NAME` and `R2_PUBLIC_URL` remain — they are not secret.
2. The new credentials live as Replit Secrets (global, not version-controlled)
   and the running deployment reads them from `process.env` exactly as before.
3. The leaked credential values in
   `audits/00-end-to-end-principal-engineer-audit.md` were redacted and now
   point here.

### Required manual follow-ups (Cloudflare side)

These steps must be performed in the Cloudflare dashboard by an operator and
cannot be automated from the repo. As each step is completed, edit this file
to check it off and append the operator + UTC timestamp.

- [ ] Issue a new R2 API token scoped to **read/write/delete on
      `agentid-attachments` only**. _Operator: ___ — Completed: ___ UTC._
- [ ] Overwrite the three production Replit Secrets (`R2_ACCOUNT_ID`,
      `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) with the new values and
      redeploy. _Operator: ___ — Completed: ___ UTC._
- [ ] Verify production end-to-end: upload an attachment via the dashboard,
      fetch its presigned URL, and confirm both succeed against the new key.
      _Operator: ___ — Completed: ___ UTC._
- [ ] Revoke the old R2 token (access key ID hash `4dc0e4202c817c20…`) in
      Cloudflare. _Operator: ___ — Completed: ___ UTC._
- [ ] Spot-check the bucket for unexpected objects created between the
      original commit date and the rotation timestamp. _Operator: ___ —
      Completed: ___ UTC._

When every box above is checked, change the **Cloudflare rotation** line at
the top of this incident from `⚠️ PENDING OPERATOR ACTION` to the date the
old key was revoked.

### Acceptance-criterion clarification

Task #282's literal acceptance check —
`git grep -E 'R2_(SECRET|ACCESS|ACCOUNT)_'` returns zero hits — was too broad
in practice: the variable *names* legitimately appear in source code
(`artifacts/api-server/src/lib/attachment-storage.ts`,
`artifacts/api-server/src/routes/v1/oauth-clients.ts`,
`artifacts/api-server/src/lib/env.ts`,
`artifacts/api-server/.env.example`, `DNS_SETUP.md`) and in this incident
report. The intent of the check is "no plaintext **values** of the leaked
credential triple in tracked files," which is verified by:

```
rg 'bf60d895670c848c|a20a2b2ed88dd42a|b39d91a7613af2dc'
```

That command returns zero hits as of this commit.
