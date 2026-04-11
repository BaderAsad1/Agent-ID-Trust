#!/bin/sh
# Agent ID universal container entrypoint.
#
# Runs the Agent ID cold-start bootstrap before launching your agent process.
# Works with any containerised agent regardless of framework.
#
# Required environment variables (pass via docker run -e or docker-compose env):
#   AGENTID_API_KEY   — your Agent ID API key
#   AGENTID_AGENT_ID  — your agent's UUID
#
# Optional:
#   AGENTID_PERSIST_DIR  — where to write .agentid/ state files (default: /var/lib/agentid)
#   AGENTID_SKIP_BOOTSTRAP — set to "1" to skip bootstrap (e.g. in CI)
#
# Usage in your Dockerfile:
#   COPY .agentid/agentid-bootstrap.py /usr/local/lib/agentid/agentid-bootstrap.py
#   COPY templates/docker/entrypoint.sh /entrypoint.sh
#   RUN chmod +x /entrypoint.sh
#   ENTRYPOINT ["/entrypoint.sh"]
#   CMD ["python", "your_agent.py"]
#
# Or with Node.js agents:
#   COPY templates/nodejs/agentid-bootstrap.mjs /usr/local/lib/agentid/agentid-bootstrap.mjs
#   ENTRYPOINT ["/entrypoint.sh"]
#   CMD ["node", "your_agent.js"]

set -e

PERSIST_DIR="${AGENTID_PERSIST_DIR:-/var/lib/agentid}"
BOOTSTRAP_PY="/usr/local/lib/agentid/agentid-bootstrap.py"
BOOTSTRAP_MJS="/usr/local/lib/agentid/agentid-bootstrap.mjs"

# ── Pre-flight checks ──────────────────────────────────────────────────────

if [ "${AGENTID_SKIP_BOOTSTRAP:-0}" = "1" ]; then
  echo "[agentid-entrypoint] Bootstrap skipped (AGENTID_SKIP_BOOTSTRAP=1)" >&2
  exec "$@"
fi

if [ -z "${AGENTID_API_KEY:-}" ]; then
  echo "[agentid-entrypoint] ERROR: AGENTID_API_KEY is not set." >&2
  echo "  Pass it via: docker run -e AGENTID_API_KEY=agk_..." >&2
  exit 1
fi

if [ -z "${AGENTID_AGENT_ID:-}" ]; then
  echo "[agentid-entrypoint] ERROR: AGENTID_AGENT_ID is not set." >&2
  exit 1
fi

# Ensure persist dir exists and bootstrap script knows where to write
mkdir -p "${PERSIST_DIR}/.agentid"
export AGENTID_PERSIST_DIR="${PERSIST_DIR}"

# ── Run bootstrap ──────────────────────────────────────────────────────────

echo "[agentid-entrypoint] Starting Agent ID cold-start..." >&2

if [ -f "${BOOTSTRAP_PY}" ] && command -v python3 >/dev/null 2>&1; then
  # Python bootstrap
  PROMPT_BLOCK="$(AGENTID_PERSIST_DIR="${PERSIST_DIR}/.agentid" python3 "${BOOTSTRAP_PY}" 2>&1 1>/tmp/agentid_prompt.txt; cat /tmp/agentid_prompt.txt)"
  BOOTSTRAP_EXIT=$?
elif [ -f "${BOOTSTRAP_MJS}" ] && command -v node >/dev/null 2>&1; then
  # Node.js bootstrap
  PROMPT_BLOCK="$(AGENTID_PERSIST_DIR="${PERSIST_DIR}/.agentid" node "${BOOTSTRAP_MJS}" 2>&1 1>/tmp/agentid_prompt.txt; cat /tmp/agentid_prompt.txt)"
  BOOTSTRAP_EXIT=$?
else
  echo "[agentid-entrypoint] WARN: No bootstrap script found at ${BOOTSTRAP_PY} or ${BOOTSTRAP_MJS}" >&2
  echo "[agentid-entrypoint] WARN: Agent will start WITHOUT identity context." >&2
  BOOTSTRAP_EXIT=0
fi

if [ "${BOOTSTRAP_EXIT:-0}" != "0" ]; then
  echo "[agentid-entrypoint] WARN: Bootstrap exited with code ${BOOTSTRAP_EXIT} — continuing anyway." >&2
fi

# Export the system context for the child process to consume
if [ -n "${PROMPT_BLOCK:-}" ]; then
  export AGENTID_SYSTEM_CONTEXT="${PROMPT_BLOCK}"
  echo "[agentid-entrypoint] Identity loaded — AGENTID_SYSTEM_CONTEXT exported." >&2
fi

# Export state file location for child process
export AGENTID_STATE_FILE="${PERSIST_DIR}/.agentid/state.json"

echo "[agentid-entrypoint] Launching: $*" >&2

# ── Hand off to the agent process ─────────────────────────────────────────
exec "$@"
