"""
Agent ID × OpenAI integration.

Covers both:
  - OpenAI Chat Completions API  (system role message)
  - OpenAI Assistants API v2     (instructions field)

Requirements:
  pip install agentid openai

Environment variables:
  OPENAI_API_KEY    — your OpenAI API key
  AGENTID_API_KEY   — your Agent ID API key
  AGENTID_AGENT_ID  — your agent's UUID
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from agentid import AgentID


@lru_cache(maxsize=1)
def _agentid_client() -> AgentID:
    return AgentID(
        agent_key=os.environ["AGENTID_API_KEY"],
        base_url=os.environ.get("AGENTID_BASE_URL", "https://getagent.id"),
    )


def _run_cold_start(persist_dir: str = ".agentid") -> dict[str, Any]:
    agent_id = os.environ["AGENTID_AGENT_ID"]
    return _agentid_client().cold_start(agent_id, persist_dir=persist_dir)


# ── Chat Completions API ──────────────────────────────────────────────────────

def chat_with_identity(
    user_message: str,
    *,
    model: str = "gpt-4o",
    extra_system: str = "",
    **openai_kwargs: Any,
) -> str:
    """
    Call OpenAI Chat Completions with Agent ID identity injected as the system message.

    Usage:
        from agentid_openai import chat_with_identity

        reply = chat_with_identity(
            "What can you do?",
            model="gpt-4o",
            extra_system="You specialize in Python code review.",
        )
        print(reply)
    """
    from openai import OpenAI

    result = _run_cold_start()
    system_content = result["system_context"]
    if extra_system:
        system_content = f"{system_content}\n\n{extra_system}"

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user",   "content": user_message},
        ],
        **openai_kwargs,
    )
    return response.choices[0].message.content or ""


def build_messages_with_identity(
    conversation: list[dict[str, str]],
    *,
    extra_system: str = "",
) -> list[dict[str, str]]:
    """
    Prepend Agent ID system message to an existing conversation message list.

    Usage:
        from agentid_openai import build_messages_with_identity

        messages = build_messages_with_identity([
            {"role": "user", "content": "Hello!"},
        ])
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
        )
    """
    result = _run_cold_start()
    system_content = result["system_context"]
    if extra_system:
        system_content = f"{system_content}\n\n{extra_system}"

    # Don't prepend twice if caller already has a system message
    if conversation and conversation[0]["role"] == "system":
        return [
            {"role": "system", "content": f"{system_content}\n\n{conversation[0]['content']}"},
            *conversation[1:],
        ]

    return [{"role": "system", "content": system_content}, *conversation]


# ── Assistants API v2 ─────────────────────────────────────────────────────────

def create_assistant_with_identity(
    name: str,
    *,
    model: str = "gpt-4o",
    base_instructions: str = "",
    tools: list[dict] | None = None,
    **kwargs: Any,
) -> Any:
    """
    Create an OpenAI Assistant with Agent ID identity baked into its instructions.

    Usage:
        from agentid_openai import create_assistant_with_identity

        assistant = create_assistant_with_identity(
            name="My Code Agent",
            base_instructions="You specialize in reviewing Python pull requests.",
            tools=[{"type": "code_interpreter"}],
        )
        print(assistant.id)
    """
    from openai import OpenAI

    result = _run_cold_start()
    system_context = result["system_context"]
    instructions = system_context
    if base_instructions:
        instructions = f"{system_context}\n\n{base_instructions}"

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return client.beta.assistants.create(
        name=name,
        model=model,
        instructions=instructions,
        tools=tools or [],
        **kwargs,
    )


def update_assistant_identity(assistant_id: str) -> None:
    """
    Refresh an existing Assistant's instructions with the latest Agent ID identity.

    Call this on startup when you have a pre-created Assistant but want to
    keep its identity context current (e.g., after trust score changes).

    Usage:
        update_assistant_identity("asst_abc123")
    """
    from openai import OpenAI

    result = _run_cold_start()
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    assistant = client.beta.assistants.retrieve(assistant_id)
    existing = assistant.instructions or ""

    # Strip old AgentID block if present, prepend fresh one
    agentid_marker = "## AgentID"
    if agentid_marker in existing:
        existing = existing[existing.find("\n\n", existing.find(agentid_marker)):].lstrip()

    new_instructions = (
        f"{result['system_context']}\n\n{existing}".strip()
    )
    client.beta.assistants.update(assistant_id, instructions=new_instructions)


# ── Streaming helper ──────────────────────────────────────────────────────────

def stream_with_identity(
    user_message: str,
    *,
    model: str = "gpt-4o",
    extra_system: str = "",
) -> None:
    """
    Stream a response with Agent ID identity injected. Prints chunks to stdout.

    Usage:
        from agentid_openai import stream_with_identity
        stream_with_identity("Summarize your capabilities.")
    """
    from openai import OpenAI

    result = _run_cold_start()
    system_content = result["system_context"]
    if extra_system:
        system_content = f"{system_content}\n\n{extra_system}"

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    with client.chat.completions.stream(
        model=model,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user",   "content": user_message},
        ],
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
    print()


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = _run_cold_start()
    print(f"Identity loaded: agent_id={os.environ.get('AGENTID_AGENT_ID')} stale={result['stale']}")
    reply = chat_with_identity("Introduce yourself briefly.")
    print(f"\nAgent response:\n{reply}")
