"""
Agent ID universal bootstrap — works with ANY Python agent framework.

Use this when you don't use LangChain, CrewAI, or AutoGen, or when you
want the lowest-level integration.

Requirements:
  pip install agentid

Environment variables:
  AGENTID_API_KEY   — your Agent ID API key (agent-scoped key, prefix: agk_)
  AGENTID_AGENT_ID  — your agent's UUID
"""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from typing import Any, Tuple

from agentid import AgentID


@lru_cache(maxsize=1)
def _agent() -> AgentID:
    """Singleton AgentID instance, initialized from env vars via from_env()."""
    return AgentID.from_env()


# ── The one function you need ─────────────────────────────────────────────────

def load_identity() -> AgentID:
    """
    Cold-start the agent and return an initialized AgentID instance.

    Call this ONCE at process startup, before the first user turn.
    Uses AGENTID_API_KEY and AGENTID_AGENT_ID environment variables.

    Access the system context via .system_context on the returned instance:

        agent = load_identity()
        system_prompt = agent.system_context  # inject this
    """
    return _agent()


# ── Convenience wrappers ──────────────────────────────────────────────────────

def get_system_prompt(base_prompt: str = "") -> str:
    """
    Return the full system prompt with Agent ID identity prepended.

    Usage:
        system_prompt = get_system_prompt("You are a helpful coding assistant.")
        # → pass to your model's system parameter
    """
    identity = _agent().system_context
    if base_prompt:
        return f"{identity}\n\n{base_prompt}"
    return identity


def get_marketplace_actions() -> list[dict[str, Any]]:
    """
    Return a prioritised list of pending marketplace actions.

    Returns empty list if no actions are pending.
    Each entry: { action, order_id, role, priority, description }
    """
    agent_id = os.environ["AGENTID_AGENT_ID"]
    a = _agent()
    ctx = a.get_marketplace_context(agent_id)
    return a.get_next_marketplace_actions(agent_id, ctx)


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
    _agent().start_heartbeat_scheduler(
        agent_id,
        interval_seconds=interval_seconds,
        persist_dir=".agentid",
        on_action_required=on_action_required,
    )


# ── Quick integration patterns ────────────────────────────────────────────────

# Pattern 1: Anthropic SDK
def anthropic_params(user_message: str, base_system: str = "") -> Tuple[str, list[dict]]:
    """
    Return (system, messages) for anthropic.Anthropic().messages.create().

    Usage:
        system, messages = anthropic_params("What can you do?")
        client.messages.create(model="claude-opus-4-6", system=system, messages=messages, max_tokens=1024)
    """
    system = get_system_prompt(base_system)
    messages = [{"role": "user", "content": user_message}]
    return system, messages


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
    agent = _agent()
    os.environ["AGENTID_SYSTEM_CONTEXT"] = agent.system_context
    cold = getattr(agent, "_cold_start_result", {})
    os.environ["AGENTID_STALE"] = "1" if cold.get("stale") else "0"


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    try:
        agent = load_identity()
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    cold = getattr(agent, "_cold_start_result", {})
    print(f"Identity loaded: agent_id={os.environ.get('AGENTID_AGENT_ID')} stale={cold.get('stale', False)}")

    if cold.get("stale"):
        print(f"  Stale reasons: {cold.get('stale_reasons', [])}", file=sys.stderr)

    actions = get_marketplace_actions()
    if actions:
        print(f"\nPending marketplace actions: {len(actions)}")
        for action in actions:
            print(f"  [{action['action']}] {action['description']}")
    else:
        print("\nNo pending marketplace actions.")

    print("\nSystem prompt preview:")
    print(agent.system_context[:500])
