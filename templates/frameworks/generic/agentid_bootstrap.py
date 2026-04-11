"""
Agent ID universal bootstrap — works with ANY Python agent framework.

Use this when you don't use LangChain, CrewAI, or AutoGen, or when you
want the lowest-level integration.

Requirements:
  pip install agentid

Environment variables:
  AGENTID_API_KEY   — your Agent ID API key
  AGENTID_AGENT_ID  — your agent's UUID
"""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from typing import Any

from agentid import AgentIDClient


@lru_cache(maxsize=1)
def client() -> AgentIDClient:
    return AgentIDClient(
        api_key=os.environ["AGENTID_API_KEY"],
        base_url=os.environ.get("AGENTID_BASE_URL", "https://getagent.id"),
    )


# ── The one function you need ─────────────────────────────────────────────────

def load_identity(persist_dir: str = ".agentid") -> dict[str, Any]:
    """
    Cold-start the agent and return its identity context.

    Call this ONCE at process startup, before the first user turn.
    Injects `systemContext` into whatever passes for your system prompt.

    Returns a dict with:
        systemContext  — the text to inject into your system prompt
        promptBlock    — structured prompt block from Agent ID
        heartbeat      — latest heartbeat response (or None on failure)
        marketplace    — marketplace context if action required (or None)
        bootstrap      — full bootstrap bundle (or None)
        stale          — True if any network call failed (using cache)
        staleReasons   — list of failure descriptions
    """
    agent_id = os.environ.get("AGENTID_AGENT_ID", "")
    if not agent_id:
        raise RuntimeError(
            "AGENTID_AGENT_ID environment variable is not set. "
            "Set it to your agent's UUID."
        )
    return client().cold_start(agent_id, persist_dir=persist_dir)


# ── Convenience wrappers ──────────────────────────────────────────────────────

def get_system_prompt(base_prompt: str = "") -> str:
    """
    Return the full system prompt with Agent ID identity prepended.

    Usage:
        system_prompt = get_system_prompt("You are a helpful coding assistant.")
        # → pass to your model's system parameter
    """
    identity = load_identity()["systemContext"]
    if base_prompt:
        return f"{identity}\n\n{base_prompt}"
    return identity


def get_marketplace_actions() -> list[dict[str, Any]]:
    """
    Return a prioritised list of pending marketplace actions.

    Returns empty list if no actions are pending.
    Each entry: { type, description, priority, data }
    """
    agent_id = os.environ["AGENTID_AGENT_ID"]
    ctx = client().get_marketplace_context(agent_id)
    return client().get_next_marketplace_actions(agent_id, ctx)


def start_background_heartbeat(
    interval_seconds: int = 300,
    on_action_required: Any = None,
) -> None:
    """
    Start a background daemon thread that sends heartbeat every N seconds.

    Args:
        interval_seconds:    How often to heartbeat (default: 5 minutes).
        on_action_required:  Optional callback(marketplace_context) called
                             when marketplace alerts require attention.

    Usage:
        def handle_marketplace(ctx):
            actions = get_marketplace_actions()
            print(f"Marketplace alert: {len(actions)} actions pending")

        start_background_heartbeat(on_action_required=handle_marketplace)
        # → runs in background, your main thread continues
    """
    agent_id = os.environ["AGENTID_AGENT_ID"]
    client().start_heartbeat_scheduler(
        agent_id,
        interval_seconds=interval_seconds,
        persist_dir=".agentid",
        on_action_required=on_action_required,
    )


# ── Quick integration patterns ────────────────────────────────────────────────

# Pattern 1: Anthropic SDK
def anthropic_messages(user_message: str, base_system: str = "") -> list[dict]:
    """Build message list for anthropic.Anthropic().messages.create()."""
    system = get_system_prompt(base_system)
    return [{"role": "user", "content": user_message}], system


# Pattern 2: Any model with messages list
def build_messages(user_message: str, base_system: str = "") -> list[dict]:
    """Build OpenAI-compatible messages list with identity as system message."""
    return [
        {"role": "system", "content": get_system_prompt(base_system)},
        {"role": "user",   "content": user_message},
    ]


# Pattern 3: Environment variable export (for shell-spawned agents)
def export_to_env() -> None:
    """
    Export the identity context to AGENTID_SYSTEM_CONTEXT env var.

    Useful when spawning child processes that need the identity context
    without running their own cold start.
    """
    result = load_identity()
    os.environ["AGENTID_SYSTEM_CONTEXT"] = result["systemContext"]
    os.environ["AGENTID_STALE"] = "1" if result["stale"] else "0"


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    try:
        result = load_identity()
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Identity loaded: agent_id={os.environ.get('AGENTID_AGENT_ID')} stale={result['stale']}")

    if result["stale"]:
        print(f"  Stale reasons: {result['staleReasons']}", file=sys.stderr)

    actions = get_marketplace_actions()
    if actions:
        print(f"\nPending marketplace actions: {len(actions)}")
        for action in actions:
            print(f"  [{action['type']}] {action['description']}")
    else:
        print("\nNo pending marketplace actions.")

    print("\nSystem prompt preview:")
    print(result["systemContext"][:500])
