#!/usr/bin/env python3
"""
Agent ID cold-start bootstrap script.

Designed to be called:
  - automatically via a Claude Code SessionStart hook before the first turn
  - manually when you want to refresh state

Outputs the prompt block text to stdout so CLAUDE.md can instruct Claude to
read it, and writes all state artifacts to disk so they survive restarts.

Usage:
    python3 .agentid/agentid-bootstrap.py

Exit codes:
    0  - success (online or offline-fallback)
    1  - no identity found (no state.json, no env var)
"""

from __future__ import annotations

import json
import os
import sys
import hashlib
import datetime
import urllib.request
import urllib.error

# ── Config ────────────────────────────────────────────────────────────────────

AGENTID_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)))
STATE_FILE   = os.path.join(AGENTID_DIR, "state.json")
API_BASE     = "https://getagent.id/api/v1"
USER_AGENT   = "AgentID-Client/1.0 claude-code/1.0"
TIMEOUT_SECS = 10

# ── Credential discovery ──────────────────────────────────────────────────────

def load_credentials() -> tuple[str, str]:
    """
    Returns (agent_id, api_key).

    Precedence:
      1. AGENTID_API_KEY env var  +  AGENTID_AGENT_ID env var
      2. ~/.agentid/state.json
      3. <workspace>/.agentid/state.json

    Raises SystemExit(1) if neither found.
    """
    env_key      = os.environ.get("AGENTID_API_KEY", "").strip()
    env_agent_id = os.environ.get("AGENTID_AGENT_ID", "").strip()

    # Try env first (best for CI / hosted agents)
    if env_key and env_agent_id:
        return env_agent_id, env_key

    # Try workspace state file
    for candidate in [STATE_FILE, os.path.expanduser("~/.agentid/state.json")]:
        if os.path.exists(candidate):
            try:
                with open(candidate, encoding="utf-8") as f:
                    state = json.load(f)
                agent_id = state.get("agent_id") or state.get("agentId", "")
                api_key  = (
                    env_key                       # honour env key if only agent_id is in state
                    or state.get("api_key", "")
                    or state.get("apiKey", "")
                )
                if agent_id and api_key:
                    return agent_id, api_key
            except Exception as exc:
                _warn(f"Could not read state file {candidate}: {exc}")

    print("[agentid-bootstrap] FATAL: No agent_id/api_key found.", file=sys.stderr)
    print(
        "  Set AGENTID_API_KEY + AGENTID_AGENT_ID env vars, "
        "or ensure .agentid/state.json exists.",
        file=sys.stderr,
    )
    sys.exit(1)


# ── HTTP helper ───────────────────────────────────────────────────────────────

def _api(method: str, path: str, api_key: str, body: dict | None = None) -> dict:
    """Make an authenticated request to the Agent ID API."""
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req  = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Accept":       "application/json",
            "X-Agent-Key":  api_key,
            "User-Agent":   USER_AGENT,
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
        return json.loads(resp.read().decode())


def _warn(msg: str) -> None:
    print(f"[agentid-bootstrap] WARN  {msg}", file=sys.stderr)


def _info(msg: str) -> None:
    print(f"[agentid-bootstrap] INFO  {msg}", file=sys.stderr)


# ── Persistence ───────────────────────────────────────────────────────────────

def _write(filename: str, data: dict) -> None:
    os.makedirs(AGENTID_DIR, exist_ok=True)
    path = os.path.join(AGENTID_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _read(filename: str) -> dict | None:
    path = os.path.join(AGENTID_DIR, filename)
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


# ── Bootstrap sequence ────────────────────────────────────────────────────────

def bootstrap() -> dict:
    """
    Full cold-start sequence. Returns a result dict.

    On any individual step failure the script continues with local cache
    so the agent still boots with the last known-good identity.
    """
    ts       = datetime.datetime.utcnow().isoformat() + "Z"
    stale    = False
    reasons: list[str] = []

    agent_id, api_key = load_credentials()
    _info(f"Agent: {agent_id}")

    result: dict = {
        "agent_id":       agent_id,
        "system_context": "",
        "prompt_block":   None,
        "heartbeat":      None,
        "marketplace":    None,
        "bootstrap":      None,
        "stale":          False,
        "stale_reasons":  [],
        "refreshed_at":   ts,
    }

    # 1. Heartbeat ─────────────────────────────────────────────────────────────
    hb: dict = {}
    try:
        hb = _api("POST", f"/agents/{agent_id}/heartbeat", api_key, {})
        result["heartbeat"] = hb
        _write("heartbeat.json", {**hb, "_refreshed_at": ts})
        _info("Heartbeat OK")
    except Exception as exc:
        stale = True
        reasons.append(f"heartbeat: {exc}")
        _warn(f"Heartbeat failed — using cached state. ({exc})")
        hb = _read("heartbeat.json") or {}

    # 2. Prompt block ──────────────────────────────────────────────────────────
    pb: dict = {}
    try:
        pb = _api("GET", f"/agents/{agent_id}/prompt-block?format=structured", api_key)
        result["prompt_block"]   = pb
        result["system_context"] = pb.get("promptText") or pb.get("text") or ""
        _write("prompt-block.json", {**pb, "_refreshed_at": ts})
        _info(f"Prompt block fetched (checksum={pb.get('checksum', 'n/a')})")
    except Exception as exc:
        stale = True
        reasons.append(f"prompt-block: {exc}")
        _warn(f"Prompt block fetch failed — falling back to cache. ({exc})")
        pb = _read("prompt-block.json") or {}
        result["prompt_block"]   = pb
        result["system_context"] = pb.get("promptText") or pb.get("text") or ""

    # 3. Marketplace context ───────────────────────────────────────────────────
    alerts = hb.get("stateDelta", {}).get("marketplace_alerts", {})
    if alerts.get("any_action_required") or alerts.get("orders_requiring_acceptance", 0) > 0:
        try:
            mkt = _api("GET", f"/agents/{agent_id}/marketplace/context", api_key)
            result["marketplace"] = mkt
            _write("marketplace-context.json", {**mkt, "_refreshed_at": ts})
            _info("Marketplace context fetched (action required)")
        except Exception as exc:
            reasons.append(f"marketplace/context: {exc}")
            _warn(f"Marketplace context fetch failed. ({exc})")

    # 4. Bootstrap refresh (when signalled) ────────────────────────────────────
    if hb.get("stateDelta", {}).get("action_required") or not _read("bootstrap.json"):
        try:
            bs = _api("GET", f"/agents/{agent_id}/bootstrap", api_key)
            result["bootstrap"] = bs
            _write("bootstrap.json", {**bs, "_refreshed_at": ts})
            _info("Bootstrap bundle refreshed")
        except Exception as exc:
            reasons.append(f"bootstrap: {exc}")
            _warn(f"Bootstrap refresh failed. ({exc})")
            result["bootstrap"] = _read("bootstrap.json")

    # 5. Persist updated state.json ────────────────────────────────────────────
    state = _read("state.json") or {"version": 1}
    state.update({
        "agent_id":              agent_id,
        "did":                   f"did:web:getagent.id:agents:{agent_id}",
        "inbox":                 f"{agent_id}@getagent.id",
        "last_cold_start":       ts,
        "last_heartbeat_at":     hb.get("lastHeartbeatAt", ts),
        "prompt_block_checksum": pb.get("checksum"),
        "prompt_block_version":  pb.get("version"),
        "stale":                 stale,
        "stale_reasons":         reasons,
    })
    _write("state.json", state)

    result["stale"]        = stale
    result["stale_reasons"] = reasons
    return result


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    result = bootstrap()

    system_context = result.get("system_context", "")
    agent_id       = result.get("agent_id", "")

    if result["stale"]:
        print(
            f"[agentid-bootstrap] Running on stale/cached state: {result['stale_reasons']}",
            file=sys.stderr,
        )

    # Emit a brief identity summary to stderr (shows in Claude Code SessionStart output)
    print(
        f"[agentid-bootstrap] Identity loaded — "
        f"agent_id={agent_id} "
        f"stale={result['stale']}",
        file=sys.stderr,
    )

    # Print the prompt block text to stdout — Claude Code session hook sees this
    if system_context:
        print(system_context)
    else:
        print(
            f"[Agent ID identity — loaded from cache]\n"
            f"agentId: {agent_id}\n"
            f"did: did:web:getagent.id:agents:{agent_id}\n"
            f"inbox: {agent_id}@getagent.id\n"
            f"Note: Prompt block could not be fetched from network. Using last known state."
        )


if __name__ == "__main__":
    main()
