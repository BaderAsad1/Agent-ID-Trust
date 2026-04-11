#!/usr/bin/env node
/**
 * Agent ID cold-start bootstrap — pure Node.js stdlib, no dependencies.
 *
 * Works with any Node.js agent framework (LangChain.js, OpenAI SDK,
 * AutoGen.js, custom agents, etc.).
 *
 * Usage (add to your agent's startup):
 *   import { bootstrap, loadCredentials } from './agentid-bootstrap.mjs';
 *   const { systemContext } = await bootstrap();
 *   // → inject systemContext into your system prompt
 *
 * Or run standalone to refresh state files:
 *   node .agentid/agentid-bootstrap.mjs
 *
 * Credential discovery (in priority order):
 *   1. AGENTID_API_KEY + AGENTID_AGENT_ID env vars
 *   2. .agentid/state.json
 *   3. ~/.agentid/state.json
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AGENTID_DIR = resolve(__dirname);
const STATE_FILE = join(AGENTID_DIR, "state.json");
const API_BASE = "https://getagent.id/api/v1";
const USER_AGENT = "AgentID-Client/1.0 nodejs/agentid-bootstrap";
const TIMEOUT_MS = 10_000;

// ── Credential discovery ────────────────────────────────────────────────────

export function loadCredentials() {
  const envKey = (process.env.AGENTID_API_KEY || "").trim();
  const envAgentId = (process.env.AGENTID_AGENT_ID || "").trim();

  if (envKey && envAgentId) return { agentId: envAgentId, apiKey: envKey };

  const candidates = [STATE_FILE, join(homedir(), ".agentid", "state.json")];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const state = JSON.parse(readFileSync(candidate, "utf-8"));
      const agentId = state.agent_id || state.agentId || "";
      const apiKey = envKey || state.api_key || state.apiKey || "";
      if (agentId && apiKey) return { agentId, apiKey };
    } catch {
      // continue to next candidate
    }
  }

  throw new Error(
    "[agentid-bootstrap] FATAL: No agent_id/api_key found.\n" +
    "  Set AGENTID_API_KEY + AGENTID_AGENT_ID env vars,\n" +
    "  or ensure .agentid/state.json exists."
  );
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

async function apiRequest(method, path, apiKey, body = null) {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Agent-Key": apiKey,
        "User-Agent": USER_AGENT,
      },
      body: body !== null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Persistence ─────────────────────────────────────────────────────────────

function writeState(filename, data) {
  mkdirSync(AGENTID_DIR, { recursive: true });
  const path = join(AGENTID_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function readState(filename) {
  const path = join(AGENTID_DIR, filename);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

// ── Bootstrap sequence ──────────────────────────────────────────────────────

/**
 * Execute the full cold-start sequence.
 *
 * @returns {{
 *   agentId: string,
 *   systemContext: string,
 *   promptBlock: object|null,
 *   heartbeat: object|null,
 *   marketplace: object|null,
 *   bootstrap: object|null,
 *   stale: boolean,
 *   staleReasons: string[],
 * }}
 */
export async function bootstrap() {
  const ts = new Date().toISOString();
  const staleReasons = [];

  const { agentId, apiKey } = loadCredentials();
  console.error(`[agentid-bootstrap] INFO  Agent: ${agentId}`);

  const result = {
    agentId,
    systemContext: "",
    promptBlock: null,
    heartbeat: null,
    marketplace: null,
    bootstrap: null,
    stale: false,
    staleReasons: [],
    refreshedAt: ts,
  };

  // 1. Heartbeat ─────────────────────────────────────────────────────────────
  let hb = {};
  try {
    hb = await apiRequest("POST", `/agents/${agentId}/heartbeat`, apiKey, {});
    result.heartbeat = hb;
    writeState("heartbeat.json", { ...hb, _refreshed_at: ts });
    console.error("[agentid-bootstrap] INFO  Heartbeat OK");
  } catch (err) {
    staleReasons.push(`heartbeat: ${err.message}`);
    console.error(`[agentid-bootstrap] WARN  Heartbeat failed — using cache. (${err.message})`);
    hb = readState("heartbeat.json") || {};
  }

  // 2. Prompt block ──────────────────────────────────────────────────────────
  let pb = {};
  try {
    pb = await apiRequest("GET", `/agents/${agentId}/prompt-block?format=structured`, apiKey);
    result.promptBlock = pb;
    result.systemContext = pb.promptText || pb.text || "";
    writeState("prompt-block.json", { ...pb, _refreshed_at: ts });
    console.error(`[agentid-bootstrap] INFO  Prompt block fetched (checksum=${pb.checksum || "n/a"})`);
  } catch (err) {
    staleReasons.push(`prompt-block: ${err.message}`);
    console.error(`[agentid-bootstrap] WARN  Prompt block fetch failed — falling back to cache. (${err.message})`);
    pb = readState("prompt-block.json") || {};
    result.promptBlock = pb;
    result.systemContext = pb.promptText || pb.text || "";
  }

  // 3. Marketplace context (only when action required) ───────────────────────
  const alerts = hb?.stateDelta?.marketplace_alerts || {};
  if (alerts.any_action_required || (alerts.orders_requiring_acceptance || 0) > 0) {
    try {
      const mkt = await apiRequest("GET", `/agents/${agentId}/marketplace/context`, apiKey);
      result.marketplace = mkt;
      writeState("marketplace-context.json", { ...mkt, _refreshed_at: ts });
      console.error("[agentid-bootstrap] INFO  Marketplace context fetched (action required)");
    } catch (err) {
      staleReasons.push(`marketplace/context: ${err.message}`);
      console.error(`[agentid-bootstrap] WARN  Marketplace context fetch failed. (${err.message})`);
    }
  }

  // 4. Bootstrap bundle (when signalled or missing) ──────────────────────────
  const needsBootstrap = hb?.stateDelta?.action_required || !readState("bootstrap.json");
  if (needsBootstrap) {
    try {
      const bs = await apiRequest("GET", `/agents/${agentId}/bootstrap`, apiKey);
      result.bootstrap = bs;
      writeState("bootstrap.json", { ...bs, _refreshed_at: ts });
      console.error("[agentid-bootstrap] INFO  Bootstrap bundle refreshed");
    } catch (err) {
      staleReasons.push(`bootstrap: ${err.message}`);
      console.error(`[agentid-bootstrap] WARN  Bootstrap refresh failed. (${err.message})`);
      result.bootstrap = readState("bootstrap.json");
    }
  } else {
    result.bootstrap = readState("bootstrap.json");
  }

  // 5. Persist state.json ────────────────────────────────────────────────────
  const state = readState("state.json") || { version: 1 };
  Object.assign(state, {
    agent_id: agentId,
    did: `did:web:getagent.id:agents:${agentId}`,
    inbox: `${agentId}@getagent.id`,
    last_cold_start: ts,
    last_heartbeat_at: hb.lastHeartbeatAt || ts,
    prompt_block_checksum: pb.checksum || null,
    prompt_block_version: pb.version || null,
    stale: staleReasons.length > 0,
    stale_reasons: staleReasons,
  });
  writeState("state.json", state);

  result.stale = staleReasons.length > 0;
  result.staleReasons = staleReasons;
  return result;
}

// ── Standalone entry point ──────────────────────────────────────────────────

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = await bootstrap();

  if (result.stale) {
    console.error(`[agentid-bootstrap] Running on stale/cached state: ${result.staleReasons}`);
  }

  console.error(
    `[agentid-bootstrap] Identity loaded — ` +
    `agent_id=${result.agentId} stale=${result.stale}`
  );

  // Print prompt block to stdout (captured by process supervisors / hooks)
  if (result.systemContext) {
    process.stdout.write(result.systemContext + "\n");
  } else {
    process.stdout.write(
      `[Agent ID identity — loaded from cache]\n` +
      `agentId: ${result.agentId}\n` +
      `did: did:web:getagent.id:agents:${result.agentId}\n` +
      `inbox: ${result.agentId}@getagent.id\n` +
      `Note: Prompt block could not be fetched from network. Using last known state.\n`
    );
  }
}
