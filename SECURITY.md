# Security Policy

The Agent ID team takes the security of our software, our users, and our researchers seriously. This document explains how to report a vulnerability, what to expect from us, and the rules we ask researchers to follow so that everyone stays safe.

## Reporting a Vulnerability

**Please email [security@getagent.id](mailto:security@getagent.id).**

Where possible, include:

- A clear description of the issue and its impact.
- Step-by-step instructions, proof-of-concept code, or a short screen recording that lets us reproduce the bug.
- The affected URL, endpoint, commit hash, or component.
- Your name or handle, if you would like to be credited.

If the report is sensitive, you may PGP-encrypt it. Request our current public key in your first email and we will reply with the fingerprint out of band.

**Please do not** open a public GitHub issue, pull request, discussion, or social-media post for a suspected vulnerability before it has been resolved and we have agreed on a disclosure date.

## Our Commitments

When you report in good faith, we commit to the following:

| Stage | Target |
| --- | --- |
| Acknowledge receipt of your report | Within **2 business days** |
| Initial triage and severity decision | Within **7 business days** |
| Status update cadence while we work on a fix | At least every **14 days** |
| Coordinated disclosure window after a fix is available | Up to **90 days** from initial report, by default |

If we cannot meet one of these targets, we will tell you why and agree on a new date with you.

## Scope

The following are **in scope** for vulnerability reports:

- The Agent ID web application and marketing site (`getagent.id` and its subdomains).
- The public Agent ID HTTP API and OAuth / PKCE endpoints.
- The Agent ID mail subsystem (inbound webhook handler, outbound senders, signing/verification).
- The on-chain anchoring contracts published under the Agent ID organization.
- The Agent ID marketplace (listings, payments, dispute resolution, payouts).
- Official Agent ID SDKs published from this repository (Python, JavaScript/TypeScript).

The following are **out of scope**, and reports limited to these areas will generally be closed without a fix:

- Third-party integrations and the underlying providers (Stripe, Clerk, Replit, Anthropic, OpenAI, Google, AWS, Azure, etc.). Please report those directly to the upstream vendor.
- The Replit deployment platform itself, container escape, or shared-infrastructure issues — report these to Replit.
- Volumetric denial-of-service, brute-force, or load-testing attacks.
- Vulnerabilities that require a rooted/jailbroken device, a malicious browser extension, or a compromised user account that the attacker already controls.
- Reports based solely on automated scanner output without a demonstrated impact.
- Missing security headers, missing SPF/DKIM/DMARC records, TLS configuration nits, or version-disclosure findings without a concrete exploit path.
- Social engineering of Agent ID staff, users, or vendors, and any physical attacks.
- Self-XSS, clickjacking on pages without sensitive actions, and CSRF on unauthenticated endpoints with no state change.

If you are unsure whether something is in scope, email us and ask before testing.

## Severity and Recognition

We use a rough internal severity scale to prioritize fixes. Examples (non-exhaustive):

- **Critical** — Remote code execution on our servers; full bypass of authentication; theft of funds from the marketplace or on-chain contracts; mass exfiltration of user data or private keys.
- **High** — Account takeover of an arbitrary user; privilege escalation between tenants; forging signed Agent ID identities or mail; significant payment manipulation.
- **Medium** — Stored XSS in an authenticated context; IDOR exposing limited non-sensitive data; bypass of a single security control without direct user impact.
- **Low** — Reflected XSS requiring unusual user interaction; information leaks of non-sensitive metadata; rate-limit weaknesses without a concrete abuse path.

**Agent ID does not currently run a paid bug bounty.** We offer:

- Public credit in our security acknowledgements page (with your permission).
- A written thank-you and, for impactful reports, Agent ID swag.

We may, at our sole discretion, offer a discretionary monetary thank-you for exceptional Critical-severity reports, but this is not a contractual bounty and should not be relied upon.

## Safe Harbour

We will not pursue or support legal action against researchers who, in good faith:

1. Follow this policy and the scope rules above.
2. Make a good-faith effort to avoid privacy violations, data destruction, service degradation, and disruption to other users.
3. Use only their own accounts, or accounts they have explicit written permission to test.
4. Stop testing and notify us immediately upon discovering sensitive data (personal data, credentials, private keys, payment data) and do not retain, copy, transfer, or further access it.
5. Give us a reasonable time to remediate before any public disclosure, as described above.

Activity conducted in line with this policy is considered authorized under the Computer Fraud and Abuse Act (and analogous laws in other jurisdictions). We will make this clear to law enforcement if needed. If a third party brings legal action against you for activity that complied with this policy, we will make it known that your actions were authorized.

If at any point you are unsure whether your planned testing is consistent with this policy, contact us first at [security@getagent.id](mailto:security@getagent.id).

## Supported Versions

Agent ID is offered as a hosted service, so security fixes are applied to the live deployment as soon as they are ready; there is no separate "patch" release for end users to install.

For our published SDKs, we support the **latest minor release** of each major version with security fixes. Older majors are supported for **90 days** after a new major is released, after which users are expected to upgrade.

## Inbox Ownership (Internal)

The `security@getagent.id` inbox is owned and monitored by the Agent ID
security on-call rotation, with the Head of Engineering as the named
accountable owner. At least one human reviews the inbox every business
day, and pages are sent to the on-call engineer for any message tagged
`[security]` or matching the new-report template. Backup coverage is
provided by the Platform team lead.

If you are an Agent ID maintainer and the inbox stops being monitored,
revert this file (or replace the contact) **before** the gap becomes
public — a `SECURITY.md` pointing at a dead inbox is worse than none at
all.

## Changes to This Policy

We may update this policy from time to time. Material changes will be noted in the commit history of this file. The version in the `main` branch is always the authoritative one.

Thank you for helping keep Agent ID and its users safe.
