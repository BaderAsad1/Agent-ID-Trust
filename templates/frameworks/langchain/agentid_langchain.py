"""
Agent ID × LangChain integration.

Drop this file into any LangChain agent project to wire Agent ID identity
into the system prompt automatically at startup.

Supports:
  - LangChain LCEL chains (SystemMessage injection)
  - LangChain AgentExecutor
  - LangGraph agents

Requirements:
  pip install agentid langchain-core

Environment variables:
  AGENTID_API_KEY   — your Agent ID API key
  AGENTID_AGENT_ID  — your agent's UUID
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from agentid import AgentID


# ── Bootstrap ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _client() -> AgentID:
    return AgentID(
        agent_key=os.environ["AGENTID_API_KEY"],
        base_url=os.environ.get("AGENTID_BASE_URL", "https://getagent.id"),
    )


def cold_start(persist_dir: str = ".agentid") -> dict[str, Any]:
    """
    Run the Agent ID cold-start sequence and return the result.

    Call this ONCE at agent startup before any LangChain chain is invoked.
    """
    agent_id = os.environ["AGENTID_AGENT_ID"]
    return _client().cold_start(agent_id, persist_dir=persist_dir)


# ── LangChain helpers ─────────────────────────────────────────────────────────

def get_system_message() -> "SystemMessage":  # type: ignore[name-defined]
    """
    Return a LangChain SystemMessage containing the Agent ID identity block.

    Usage:
        from langchain_core.messages import HumanMessage
        from agentid_langchain import get_system_message

        result = cold_start()
        messages = [get_system_message(), HumanMessage(content=user_input)]
        response = chat_model.invoke(messages)
    """
    from langchain_core.messages import SystemMessage

    result = cold_start()
    return SystemMessage(content=result["system_context"])


def build_system_prompt() -> str:
    """
    Return the plain-text system prompt string for use with prompt templates.

    Usage:
        from langchain_core.prompts import ChatPromptTemplate
        from agentid_langchain import build_system_prompt

        prompt = ChatPromptTemplate.from_messages([
            ("system", build_system_prompt()),
            ("human", "{input}"),
        ])
    """
    result = cold_start()
    return result["system_context"]


def with_agent_id_system(
    chat_prompt_template: Any,
    *,
    prepend: bool = True,
) -> Any:
    """
    Inject Agent ID system context into an existing ChatPromptTemplate.

    Args:
        chat_prompt_template: A LangChain ChatPromptTemplate instance.
        prepend: If True (default), insert Agent ID context BEFORE existing
                 system messages. If False, append after.

    Usage:
        from langchain_core.prompts import ChatPromptTemplate
        from agentid_langchain import with_agent_id_system

        base_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful coding assistant."),
            ("human", "{input}"),
        ])
        prompt = with_agent_id_system(base_prompt)
    """
    from langchain_core.messages import SystemMessage
    from langchain_core.prompts import ChatPromptTemplate

    identity_msg = get_system_message()
    existing = list(chat_prompt_template.messages)

    if prepend:
        new_messages = [identity_msg] + existing
    else:
        new_messages = existing + [identity_msg]

    return ChatPromptTemplate.from_messages(new_messages)


# ── LangGraph helpers ─────────────────────────────────────────────────────────

def inject_identity_into_state(state: dict[str, Any]) -> dict[str, Any]:
    """
    LangGraph node: inject Agent ID identity into graph state messages.

    Add this as the FIRST node in any LangGraph graph:

        from langgraph.graph import StateGraph, MessagesState
        from agentid_langchain import inject_identity_into_state

        graph = StateGraph(MessagesState)
        graph.add_node("identity", inject_identity_into_state)
        graph.set_entry_point("identity")
        graph.add_edge("identity", "agent")
        ...
    """
    from langchain_core.messages import SystemMessage

    result = cold_start()
    identity_msg = SystemMessage(content=result["system_context"])
    existing_messages = state.get("messages", [])

    # Don't inject twice
    for msg in existing_messages:
        if isinstance(msg, SystemMessage) and "AgentID" in (msg.content or ""):
            return state

    return {**state, "messages": [identity_msg] + existing_messages}


# ── Marketplace callback ──────────────────────────────────────────────────────

def marketplace_action_tool():
    """
    Return a LangChain tool that reads pending marketplace actions.

    The agent can invoke this tool to understand what orders/tasks it needs
    to handle in the Agent ID marketplace.

    Usage:
        from langchain.agents import AgentExecutor, create_tool_calling_agent
        from agentid_langchain import marketplace_action_tool

        tools = [marketplace_action_tool(), ...]
        agent = create_tool_calling_agent(llm, tools, prompt)
        executor = AgentExecutor(agent=agent, tools=tools)
    """
    from langchain_core.tools import tool

    @tool
    def get_marketplace_actions() -> str:
        """
        Get pending Agent ID marketplace actions that need to be handled.
        Returns a formatted list of orders, messages, and payments requiring action.
        """
        import json
        agent_id = os.environ["AGENTID_AGENT_ID"]
        ctx = _client().get_marketplace_context(agent_id)
        actions = _client().get_next_marketplace_actions(agent_id, ctx)
        if not actions:
            return "No pending marketplace actions."
        lines = ["Pending marketplace actions (in priority order):"]
        for i, action in enumerate(actions, 1):
            lines.append(f"{i}. [{action['action']}] {action['description']} (priority={action['priority']})")
        return "\n".join(lines)

    return get_marketplace_actions


# ── Example usage ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = cold_start()
    print(f"Identity loaded — agent_id={os.environ.get('AGENTID_AGENT_ID')} stale={result['stale']}")
    print("\nSystem context preview (first 500 chars):")
    print(result["system_context"][:500])
