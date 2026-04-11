"""
Agent ID × AutoGen (Microsoft) integration.

Works with both:
  - AutoGen 0.2.x  (pyautogen)
  - AutoGen 0.4.x  (autogen-agentchat, autogen-core)

Injects Agent ID identity into the system_message of ConversableAgent /
AssistantAgent so every session starts with persistent, verified identity.

Requirements:
  pip install agentid pyautogen   # or: pip install agentid autogen-agentchat

Environment variables:
  AGENTID_API_KEY   — your Agent ID API key
  AGENTID_AGENT_ID  — your agent's UUID
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from agentid import AgentIDClient


@lru_cache(maxsize=1)
def _client() -> AgentIDClient:
    return AgentIDClient(
        api_key=os.environ["AGENTID_API_KEY"],
        base_url=os.environ.get("AGENTID_BASE_URL", "https://getagent.id"),
    )


def _cold_start(persist_dir: str = ".agentid") -> dict[str, Any]:
    agent_id = os.environ["AGENTID_AGENT_ID"]
    return _client().cold_start(agent_id, persist_dir=persist_dir)


# ── AutoGen 0.2.x ─────────────────────────────────────────────────────────────

def build_system_message(base_message: str = "") -> str:
    """
    Build a system message with Agent ID identity prepended.

    Usage (AutoGen 0.2.x):
        from autogen import AssistantAgent
        from agentid_autogen import build_system_message

        assistant = AssistantAgent(
            name="MyAgent",
            system_message=build_system_message("You help with Python code."),
            llm_config={"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]},
        )
    """
    result = _cold_start()
    identity = result["system_context"]
    if base_message:
        return f"{identity}\n\n{base_message}"
    return identity


def create_assistant_agent(
    name: str,
    llm_config: dict[str, Any],
    *,
    base_system_message: str = "",
    **kwargs: Any,
) -> Any:
    """
    Create an AutoGen AssistantAgent with Agent ID identity in its system message.

    Usage:
        from agentid_autogen import create_assistant_agent

        agent = create_assistant_agent(
            name="ReviewAgent",
            llm_config={"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]},
            base_system_message="You review Python code for security issues.",
        )
    """
    try:
        from autogen import AssistantAgent
    except ImportError:
        from autogen_agentchat.agents import AssistantAgent  # 0.4.x

    return AssistantAgent(
        name=name,
        system_message=build_system_message(base_system_message),
        llm_config=llm_config,
        **kwargs,
    )


def create_conversable_agent(
    name: str,
    llm_config: dict[str, Any],
    *,
    base_system_message: str = "",
    human_input_mode: str = "NEVER",
    **kwargs: Any,
) -> Any:
    """
    Create an AutoGen ConversableAgent with Agent ID identity.

    Usage:
        from agentid_autogen import create_conversable_agent

        agent = create_conversable_agent(
            name="DataAgent",
            llm_config={"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]},
            base_system_message="You analyze datasets and produce reports.",
        )
    """
    try:
        from autogen import ConversableAgent
    except ImportError:
        from autogen_agentchat.agents import ConversableAgent

    return ConversableAgent(
        name=name,
        system_message=build_system_message(base_system_message),
        llm_config=llm_config,
        human_input_mode=human_input_mode,
        **kwargs,
    )


# ── AutoGen 0.4.x (autogen-core) ──────────────────────────────────────────────

def patch_system_prompt_into_model_context(
    model_context: Any,
    base_message: str = "",
) -> None:
    """
    AutoGen 0.4.x: add Agent ID identity SystemMessage into a model context.

    Usage:
        from autogen_core.model_context import UnboundedChatCompletionContext
        from agentid_autogen import patch_system_prompt_into_model_context

        context = UnboundedChatCompletionContext()
        await patch_system_prompt_into_model_context(context)
    """
    from autogen_core.models import SystemMessage

    result = _cold_start()
    identity = result["system_context"]
    if base_message:
        identity = f"{identity}\n\n{base_message}"

    # 0.4.x uses async add_message
    import asyncio

    async def _add():
        await model_context.add_message(SystemMessage(content=identity))

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_add())
    except RuntimeError:
        asyncio.run(_add())


# ── Multi-agent group chat factory ────────────────────────────────────────────

def create_group_chat_with_identity(
    agents_config: list[dict[str, Any]],
    *,
    max_round: int = 10,
    speaker_selection_method: str = "auto",
) -> tuple[Any, Any]:
    """
    Create an AutoGen GroupChat + GroupChatManager where every agent has identity.

    Each entry in agents_config:
      name, llm_config, base_system_message (optional)

    Returns:
      (groupchat, manager) — call manager.initiate_chat(...) to start.

    Usage:
        from agentid_autogen import create_group_chat_with_identity

        chat, manager = create_group_chat_with_identity([
            {"name": "Coder",    "llm_config": cfg, "base_system_message": "Write code."},
            {"name": "Reviewer", "llm_config": cfg, "base_system_message": "Review code."},
        ])
        user_proxy.initiate_chat(manager, message="Build a REST API.")
    """
    try:
        from autogen import GroupChat, GroupChatManager
    except ImportError:
        raise ImportError("AutoGen 0.2.x required for GroupChat. Use autogen 0.4.x alternatives.")

    agents = [
        create_assistant_agent(
            name=cfg["name"],
            llm_config=cfg["llm_config"],
            base_system_message=cfg.get("base_system_message", ""),
        )
        for cfg in agents_config
    ]

    groupchat = GroupChat(
        agents=agents,
        messages=[],
        max_round=max_round,
        speaker_selection_method=speaker_selection_method,
    )
    manager = GroupChatManager(
        groupchat=groupchat,
        llm_config=agents_config[0]["llm_config"],
    )
    return groupchat, manager


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = _cold_start()
    print(f"Identity loaded: agent_id={os.environ.get('AGENTID_AGENT_ID')} stale={result['stale']}")
    print("\nSystem message preview (first 300 chars):")
    print(build_system_message()[:300])
