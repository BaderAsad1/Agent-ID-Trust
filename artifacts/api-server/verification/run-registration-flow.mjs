import crypto from 'crypto';

const BASE = process.env.API_BASE || 'http://localhost:8080';
const DATABASE_URL = process.env.DATABASE_URL;
const results = [];
let stepNum = 0;

function logStep(name, status, details) {
  stepNum++;
  results.push({ step: stepNum, name, status, ...details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${icon} Step ${stepNum}: ${name} — ${status}`);
  for (const [k, v] of Object.entries(details)) {
    if (v === undefined) continue;
    console.log(`   ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
}

async function req(method, path, body, headers = {}) {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'AgentID-Verifier/1.0 (bot)',
      ...headers,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, headers: res.headers, body: json, raw: text };
}

async function dbQuery(sql, params = []) {
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set');
  let pgMod;
  try {
    pgMod = await import('pg');
  } catch {
    const wsRoot = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
    pgMod = await import(`${wsRoot}/lib/db/node_modules/pg/lib/index.js`);
  }
  const Client = pgMod.default?.Client || pgMod.Client;
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

function createUserApiKey() {
  const rawKey = crypto.randomBytes(32).toString('base64url');
  const prefix = `aid_${rawKey.slice(0, 8)}`;
  const fullKey = `${prefix}${rawKey.slice(8)}`;
  const hashedKey = crypto.createHash('sha256').update(fullKey).digest('hex');
  return { raw: fullKey, prefix, hashed: hashedKey };
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  AGENT REGISTRATION FLOW — COMPLETE E2E VERIFICATION       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`API Base: ${BASE}\n`);

  // ── Step 1: Health Check ─────────────────────────────────────────────────
  const h = await req('GET', '/api/healthz');
  const dbOk = h.status === 200 && h.body?.services?.database?.status === 'ok';
  logStep('Health Check & DB Connection', dbOk ? 'PASS' : 'FAIL', {
    httpStatus: h.status,
    responseBody: h.body,
  });
  if (!dbOk) {
    console.log('\n⛔ BLOCKING — DB not connected.');
    return;
  }

  // ── Step 2: Key Generation ───────────────────────────────────────────────
  const { publicKey: pubDer, privateKey: privDer } = crypto.generateKeyPairSync(
    'ed25519',
    {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    },
  );
  const pubB64 = pubDer.toString('base64');
  logStep('Generate Ed25519 Key Pair', 'PASS', {
    publicKeyB64: pubB64,
    keyLengthBytes: pubDer.length,
  });

  // ── Step 3: Handle Availability ──────────────────────────────────────────
  let handle = 'replit-test-agent';
  let handleRes;
  for (let i = 0; i < 50; i++) {
    const c = i === 0 ? handle : `${handle}-${i}`;
    const r = await req('GET', `/api/v1/handles/check?handle=${c}`);
    if (r.status === 200 && r.body?.available) {
      handle = c;
      handleRes = r;
      break;
    }
  }
  logStep('Handle Availability Check', handleRes ? 'PASS' : 'FAIL', {
    handle,
    httpStatus: handleRes?.status,
    responseBody: handleRes?.body,
  });
  if (!handleRes) return;

  // ── Step 4: Programmatic Registration ────────────────────────────────────
  const regR = await req('POST', '/api/v1/programmatic/agents/register', {
    handle,
    displayName: 'Replit Test Agent',
    publicKey: pubB64,
    keyType: 'ed25519',
    description: 'E2E verification test',
    capabilities: ['test', 'verification'],
  });
  const regOk = regR.status === 201 && !!regR.body?.agentId;
  logStep('Programmatic Registration', regOk ? 'PASS' : 'FAIL', {
    httpStatus: regR.status,
    responseBody: regR.body,
  });
  if (!regOk) return;
  const { agentId, challenge, kid, provisionalDomain } = regR.body;

  // ── Step 5: Challenge Sign & Verification ────────────────────────────────
  const privKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
  const sig = crypto.sign(null, Buffer.from(challenge), privKey).toString('base64');
  const vR = await req('POST', '/api/v1/programmatic/agents/verify', {
    agentId, challenge, signature: sig, kid,
  });
  const vOk = vR.status === 200 && vR.body?.verified === true;
  const apiKey = vR.body?.apiKey;
  const planStatus = vR.body?.planStatus;
  const uuidResolutionUrl = planStatus?.uuidResolutionUrl;
  const vBody = { ...vR.body };
  if (vBody.apiKey) vBody.apiKey = vBody.apiKey.slice(0, 12) + '…[redacted]';
  if (vBody.bootstrap) vBody.bootstrapKeys = Object.keys(vBody.bootstrap);
  delete vBody.bootstrap;
  logStep('Challenge Sign & Verification', vOk ? 'PASS' : 'FAIL', {
    httpStatus: vR.status,
    responseBody: vBody,
  });

  const agentAuth = apiKey ? { 'X-Agent-Key': apiKey } : {};

  // ── Step 6: Bootstrap Bundle (must contain inboxUnavailable, not inbox) ──
  const bR = await req('GET', `/api/v1/agents/${agentId}/bootstrap`, null, agentAuth);
  const bKeys = bR.body ? Object.keys(bR.body) : [];
  const hasInboxUnavailable = bKeys.includes('inboxUnavailable');
  const hasNoActiveInbox = !bR.body?.inbox || bR.body?.inbox === null;
  const bOk = bR.status === 200 && !!bR.body?.prompt_block && hasInboxUnavailable && hasNoActiveInbox;
  logStep('Bootstrap Bundle (inboxUnavailable, no active inbox)', bOk ? 'PASS' : 'FAIL', {
    httpStatus: bR.status,
    responseBodyKeys: bKeys,
    hasPromptBlock: !!bR.body?.prompt_block,
    hasInboxUnavailable,
    inboxValue: bR.body?.inbox,
    promptBlockPreview: typeof bR.body?.prompt_block === 'string'
      ? bR.body.prompt_block.slice(0, 200) + '…'
      : undefined,
    responseBody: bR.status !== 200 ? bR.body : '(large object, keys shown above)',
  });

  // ── Step 7: Free Agent — Inbox Gated Behind Paid Plan (expect 402) ───────
  const iR = await req('GET', `/api/v1/mail/agents/${agentId}/inbox`, null, agentAuth);
  const inboxGatedOk = iR.status === 402 && iR.body?.error === 'PLAN_REQUIRED';
  logStep('Free Agent: Inbox Gated (expect 402 PLAN_REQUIRED)', inboxGatedOk ? 'PASS' : 'FAIL', {
    httpStatus: iR.status,
    expectedStatus: 402,
    expectedError: 'PLAN_REQUIRED',
    responseBody: iR.body,
    note: 'Free plan does not include inbox. This 402 is correct behavior.',
  });

  // ── Step 8: UUID Resolution — resolvable regardless of isPublic ──────────
  const uuidPath = `/api/v1/resolve/id/${agentId}`;
  const uuidR = await req('GET', uuidPath);
  const uuidOk = uuidR.status === 200 && (uuidR.body?.handle === handle || uuidR.body?.agent?.handle === handle);
  logStep('UUID Resolution (GET /resolve/id/:agentId)', uuidOk ? 'PASS' : 'FAIL', {
    httpStatus: uuidR.status,
    expectedStatus: 200,
    path: uuidPath,
    responseBody: uuidR.body,
    note: 'UUID-based resolution works for any verified agent regardless of isPublic.',
  });

  // ── Step 9: Handle Resolution — 403 because agent is not public ──────────
  const jR = await req('GET', `/api/v1/resolve/${handle}`);
  const handleResolveForbiddenOk =
    jR.status === 403 &&
    (jR.body?.error === 'AGENT_NOT_PUBLIC' || jR.body?.message?.toLowerCase().includes('not publicly'));
  logStep('Handle Resolution: Not Public (expect 403 AGENT_NOT_PUBLIC)', handleResolveForbiddenOk ? 'PASS' : 'FAIL', {
    httpStatus: jR.status,
    expectedStatus: 403,
    uuidResolutionUrl: jR.body?.uuidResolutionUrl || uuidResolutionUrl,
    responseBody: jR.body,
    note: 'Free agents default isPublic=false. UUID resolution is the alternative.',
  });

  // ── Step 10: Markdown Resolution — same 403 expected ────────────────────
  const mR = await req('GET', `/api/v1/resolve/${handle}`, null, { Accept: 'text/markdown' });
  const mdResolveForbiddenOk =
    mR.status === 403 &&
    (mR.body?.error === 'AGENT_NOT_PUBLIC' || (mR.body?.message || mR.raw || '').toLowerCase().includes('not publicly'));
  logStep('Markdown Resolution: Not Public (expect 403 AGENT_NOT_PUBLIC)', mdResolveForbiddenOk ? 'PASS' : 'FAIL', {
    httpStatus: mR.status,
    expectedStatus: 403,
    responseBody: mR.body || mR.raw?.slice(0, 500),
    note: 'Same as JSON resolution — free agent is not publicly listed.',
  });

  // ── Step 11: Send Message — 402 because no inbox on free plan ────────────
  const sR = await req(
    'POST',
    `/api/v1/mail/agents/${agentId}/messages`,
    {
      direction: 'inbound',
      senderType: 'agent',
      senderAgentId: agentId,
      recipientAddress: `${handle}@getagent.id`,
      subject: 'Verification Test',
      body: 'This is an automated verification test message.',
      bodyFormat: 'text',
    },
    agentAuth,
  );
  const sendGatedOk = sR.status === 402 && sR.body?.error === 'PLAN_REQUIRED';
  logStep('Free Agent: Send Message Gated (expect 402 PLAN_REQUIRED)', sendGatedOk ? 'PASS' : 'FAIL', {
    httpStatus: sR.status,
    expectedStatus: 402,
    expectedError: 'PLAN_REQUIRED',
    responseBody: sR.body,
    note: 'Free plan does not include messaging.',
  });

  // ── Step 12: Read Messages — 200 with empty list ─────────────────────────
  const rR = await req('GET', `/api/v1/mail/agents/${agentId}/messages`, null, agentAuth);
  logStep('Read Messages (expect 200)', rR.status === 200 ? 'PASS' : 'FAIL', {
    httpStatus: rR.status,
    responseBody: rR.body,
  });

  // ── Step 13: Heartbeat ───────────────────────────────────────────────────
  const hbR = await req(
    'POST',
    `/api/v1/agents/${agentId}/heartbeat`,
    { status: 'online', endpointUrl: 'https://test.example.com/agent' },
    agentAuth,
  );
  logStep('Heartbeat', hbR.status === 200 ? 'PASS' : 'FAIL', {
    httpStatus: hbR.status,
    responseBody: hbR.body,
  });

  // ── Step 14: Discovery Listing ───────────────────────────────────────────
  const dR = await req('GET', '/api/v1/resolve/');
  const agents = dR.body?.agents || dR.body;
  logStep('Discovery Listing', dR.status === 200 ? 'PASS' : 'FAIL', {
    httpStatus: dR.status,
    totalAgents: Array.isArray(agents) ? agents.length : 'n/a',
    testAgentFound: Array.isArray(agents) ? agents.some((a) => a.handle === handle) : false,
    responseBody: dR.body,
  });

  // ── Step 15: Response Headers ─────────────────────────────────────────────
  const hdR = await fetch(`${BASE}/api/healthz`, { method: 'HEAD' });
  const expected = ['X-AgentID-Platform', 'X-AgentID-Registration', 'X-AgentID-Namespace', 'X-AgentID-Version'];
  const hdrMap = {};
  for (const k of expected)
    hdrMap[k] = hdR.headers.get(k) ? `PRESENT: ${hdR.headers.get(k)}` : 'MISSING';
  const allPresent = expected.every((k) => hdR.headers.get(k));
  logStep('Response Headers', allPresent ? 'PASS' : 'FAIL', {
    httpStatus: hdR.status,
    headers: hdrMap,
  });

  // ── Step 16: Cleanup — Delete Test Agent ──────────────────────────────────
  let cleanupSuccess = false;
  try {
    const rows = await dbQuery('SELECT user_id FROM agents WHERE id = $1', [agentId]);
    const userId = rows[0]?.user_id;

    if (!userId) {
      logStep('Cleanup — Delete Test Agent', 'FAIL', {
        error: 'Could not find user_id for agent in database',
        agentId,
      });
    } else {
      const tempKey = createUserApiKey();
      await dbQuery(
        `INSERT INTO api_keys (owner_type, owner_id, name, key_prefix, hashed_key, scopes)
         VALUES ('user', $1, 'verification-cleanup-temp', $2, $3, '{}')`,
        [userId, tempKey.prefix, tempKey.hashed],
      );

      const delR = await req('DELETE', `/api/v1/agents/${agentId}`, null, {
        Authorization: `Bearer ${tempKey.raw}`,
      });

      await dbQuery(`DELETE FROM api_keys WHERE hashed_key = $1`, [tempKey.hashed]);

      if (delR.status === 200 || delR.status === 204) {
        cleanupSuccess = true;
        logStep('Cleanup — Delete Test Agent', 'PASS', {
          httpStatus: delR.status,
          responseBody: delR.body,
          method: 'DB user_id lookup + temp user API key + DELETE endpoint',
          userId,
        });
      } else {
        logStep('Cleanup — Delete Test Agent', 'FAIL', {
          httpStatus: delR.status,
          responseBody: delR.body,
          userId,
        });
      }

      await dbQuery(
        `DELETE FROM users WHERE id = $1 AND replit_user_id LIKE 'auto_%'`,
        [userId],
      );
    }
  } catch (e) {
    logStep('Cleanup — Delete Test Agent', 'FAIL', {
      error: e.message,
      note: 'DB access required for cleanup of autonomous agents',
    });
  }

  // ── Step 17: Post-Cleanup Handle Freed ───────────────────────────────────
  const verifyClean = await req('GET', `/api/v1/handles/check?handle=${handle}`);
  const handleFreed = verifyClean.body?.available === true;
  logStep('Post-Cleanup Verification', cleanupSuccess && handleFreed ? 'PASS' : 'FAIL', {
    httpStatus: verifyClean.status,
    responseBody: verifyClean.body,
    handleFreed,
    cleanupSuccess,
  });

  // ── Step 18: Auth Metadata 404 After Cleanup ─────────────────────────────
  const amR = await req('GET', `/api/v1/programmatic/agents/${agentId}/auth-metadata`);
  const metaExpected = cleanupSuccess ? 404 : 200;
  logStep('Auth Metadata Endpoint', amR.status === metaExpected ? 'PASS' : 'FAIL', {
    httpStatus: amR.status,
    expectedStatus: metaExpected,
    responseBody: amR.body,
  });

  // ── Final Report ─────────────────────────────────────────────────────────
  console.log('\n\n' + '═'.repeat(65));
  console.log('                       FINAL REPORT');
  console.log('═'.repeat(65));

  const passed = results.filter((r) => r.status === 'PASS');
  const failed = results.filter((r) => r.status === 'FAIL');

  console.log(`\nOverall Result: ${passed.length}/${results.length} PASS, ${failed.length}/${results.length} FAIL`);
  console.log(`Verdict: ${failed.length === 0 ? '✅ ALL STEPS PASSED' : '⚠️  ISSUES FOUND'}\n`);

  console.log('┌─────┬──────────────────────────────────────────┬────────┐');
  console.log('│  #  │ Step                                     │ Result │');
  console.log('├─────┼──────────────────────────────────────────┼────────┤');
  for (const r of results) {
    console.log(`│ ${String(r.step).padStart(3)} │ ${r.name.padEnd(40)} │ ${r.status.padEnd(6)} │`);
  }
  console.log('└─────┴──────────────────────────────────────────┴────────┘');

  console.log('\n── Service Status ──');
  console.log(`  Database:  ${h.body.services.database.status} (${h.body.services.database.latencyMs}ms)`);
  console.log(`  Redis:     ${h.body.services.redis?.status}`);

  console.log('\n── Agent Details ──');
  console.log(`  Agent ID:       ${agentId}`);
  console.log(`  Handle:         ${handle}`);
  console.log(`  Domain:         ${vR.body?.domain || provisionalDomain}`);
  console.log(`  Trust Score:    ${vR.body?.trustScore}`);
  console.log(`  Trust Tier:     ${vR.body?.trustTier}`);
  console.log(`  API Key Prefix: ${apiKey?.slice(0, 8)}…`);
  console.log(`  UUID Resolve:   ${uuidResolutionUrl || 'n/a'}`);
  console.log(`  Cleaned Up:     ${cleanupSuccess}`);

  if (failed.length > 0) {
    console.log('\n── Issues ──');
    failed.forEach((f, i) => {
      const err =
        f.error?.message || f.error?.error ||
        f.responseBody?.message || f.responseBody?.error ||
        'See step details above';
      console.log(`  #${i + 1}. [Step ${f.step}] ${f.name}: ${typeof err === 'string' ? err : JSON.stringify(err)}`);
    });
  }

  console.log('\n' + '═'.repeat(65));
  return { passed: passed.length, failed: failed.length, total: results.length };
}

run().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
