/**
 * Validation script: Verify that a reconciled handle returns valid responses
 * from all public metadata routes.
 *
 * Usage:
 *   npx tsx artifacts/api-server/scripts/validate-reconciled-handle.ts <handle> [base-url]
 *
 * Examples:
 *   # Against local dev server:
 *   npx tsx artifacts/api-server/scripts/validate-reconciled-handle.ts launchsmoke20260403 http://localhost:3000
 *
 *   # Against production:
 *   npx tsx artifacts/api-server/scripts/validate-reconciled-handle.ts launchsmoke20260403 https://getagent.id
 *
 * The script checks:
 *   1. GET /api/v1/p/<handle>/erc8004           — full ERC-8004 metadata JSON
 *   2. GET /api/v1/handles/<handle>/image.svg   — deterministic SVG card
 *   3. GET /api/v1/p/<handle>                   — public profile/resolver
 */

const handle = process.argv[2];
const baseUrl = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");

if (!handle) {
  console.error("Usage: npx tsx validate-reconciled-handle.ts <handle> [base-url]");
  process.exit(1);
}

interface CheckResult {
  route: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  error?: string;
}

async function checkRoute(label: string, url: string, expectedContentType: string): Promise<CheckResult> {
  try {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type");
    const ok = res.status === 200 && (contentType?.includes(expectedContentType) ?? false);

    return {
      route: label,
      status: res.status,
      ok,
      contentType,
      error: ok ? undefined : `Expected 200 ${expectedContentType}, got ${res.status} ${contentType}`,
    };
  } catch (err) {
    return {
      route: label,
      status: 0,
      ok: false,
      contentType: null,
      error: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function main() {
  console.log(`Validating reconciled handle: "${handle}" against ${baseUrl}\n`);

  const results = await Promise.all([
    checkRoute(
      "ERC-8004 metadata",
      `${baseUrl}/api/v1/p/${handle}/erc8004`,
      "application/json",
    ),
    checkRoute(
      "SVG image card",
      `${baseUrl}/api/v1/handles/${handle}/image.svg`,
      "image/svg+xml",
    ),
    checkRoute(
      "Public profile",
      `${baseUrl}/api/v1/p/${handle}`,
      "application/json",
    ),
  ]);

  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    console.log(`${icon} ${r.route}: HTTP ${r.status} — ${r.contentType ?? "no content-type"}`);
    if (!r.ok) {
      console.log(`  Error: ${r.error}`);
      allOk = false;
    }
  }

  if (allOk) {
    console.log(`\nAll routes OK for handle "${handle}".`);
  } else {
    console.log(`\nOne or more routes failed for handle "${handle}". Ensure reconciliation ran successfully.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
