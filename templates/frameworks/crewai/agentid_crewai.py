"""
Agent ID × CrewAI integration.

Injects Agent ID identity into CrewAI Agent backstory/goal at startup,
and wires marketplace context into a CrewAI Task for autonomous order handling.

Requirements:
  pip install agentid crewai

Environment variables:
  AGENTID_API_KEY   — your Agent ID API key
  AGENTID_AGENT_ID  — your agent's UUID
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from agentid import AgentID


@lru_cache(maxsize=1)
def _client() -> AgentID:
    return AgentID(
        agent_key=os.environ["AGENTID_API_KEY"],
        base_url=os.environ.get("AGENTID_BASE_URL", "https://getagent.id"),
    )


def _cold_start(persist_dir: str = ".agentid") -> dict[str, Any]:
    agent_id = os.environ["AGENTID_AGENT_ID"]
    return _client().cold_start(agent_id, persist_dir=persist_dir)


# ── CrewAI helpers ────────────────────────────────────────────────────────────

def build_agent_backstory(base_backstory: str = "") -> str:
    """
    Return an Agent ID–enriched backstory string for a CrewAI Agent.

    Usage:
        from crewai import Agent
        from agentid_crewai import build_agent_backstory

        agent = Agent(
            role="Software Reviewer",
            goal="Review pull requests and give actionable feedback.",
            backstory=build_agent_backstory("You have 10 years of Python experience."),
            llm=your_llm,
        )
    """
    result = _cold_start()
    identity_block = result["system_context"]
    if base_backstory:
        return f"{identity_block}\n\n{base_backstory}"
    return identity_block


def create_identified_agent(
    role: str,
    goal: str,
    *,
    base_backstory: str = "",
    llm: Any = None,
    tools: list[Any] | None = None,
    verbose: bool = False,
    **kwargs: Any,
) -> Any:
    """
    Create a CrewAI Agent with Agent ID identity baked in.

    Usage:
        from crewai import Crew, Task
        from agentid_crewai import create_identified_agent

        agent = create_identified_agent(
            role="Code Reviewer",
            goal="Review the provided pull request and identify bugs.",
            base_backstory="Expert in Python, security, and clean code.",
            llm=your_llm,
            verbose=True,
        )
        task = Task(description="Review this PR: ...", agent=agent, expected_output="...")
        crew = Crew(agents=[agent], tasks=[task])
        crew.kickoff()
    """
    from crewai import Agent

    backstory = build_agent_backstory(base_backstory)
    return Agent(
        role=role,
        goal=goal,
        backstory=backstory,
        llm=llm,
        tools=tools or [],
        verbose=verbose,
        **kwargs,
    )


def create_marketplace_task(agent: Any) -> Any:
    """
    Create a CrewAI Task that instructs the agent to handle pending marketplace actions.

    Usage:
        from crewai import Crew
        from agentid_crewai import create_identified_agent, create_marketplace_task

        agent = create_identified_agent(role="Market Agent", goal="Handle orders", llm=llm)
        task  = create_marketplace_task(agent)
        crew  = Crew(agents=[agent], tasks=[task])
        crew.kickoff()
    """
    from crewai import Task

    agent_id = os.environ["AGENTID_AGENT_ID"]
    ctx = _client().get_marketplace_context(agent_id)
    actions = _client().get_next_marketplace_actions(agent_id, ctx)

    if not actions:
        description = (
            "Check the Agent ID marketplace for pending actions.\n"
            "Currently there are no pending actions. Confirm this to the crew."
        )
    else:
        action_lines = "\n".join(
            f"  {i}. [{a['action']}] {a['description']}"
            for i, a in enumerate(actions, 1)
        )
        description = (
            f"Handle the following pending Agent ID marketplace actions:\n"
            f"{action_lines}\n\n"
            f"For each action, take the appropriate response based on your capabilities and policies."
        )

    return Task(
        description=description,
        agent=agent,
        expected_output="A summary of actions taken or deferred, with reasons.",
    )


# ── Multi-agent crew factory ──────────────────────────────────────────────────

def create_identified_crew(
    agents_config: list[dict[str, Any]],
    tasks: list[Any],
    *,
    process: str = "sequential",
    verbose: bool = False,
) -> Any:
    """
    Create a full Crew where every agent carries their Agent ID identity.

    Each entry in agents_config should be a dict with keys:
      role, goal, base_backstory (optional), llm (optional), tools (optional)

    Usage:
        from agentid_crewai import create_identified_crew

        crew = create_identified_crew(
            agents_config=[
                {"role": "Researcher", "goal": "Find best solution", "llm": llm},
                {"role": "Writer",     "goal": "Write report",       "llm": llm},
            ],
            tasks=[research_task, write_task],
        )
        result = crew.kickoff()
    """
    from crewai import Crew, Process

    agents = [
        create_identified_agent(
            role=cfg["role"],
            goal=cfg["goal"],
            base_backstory=cfg.get("base_backstory", ""),
            llm=cfg.get("llm"),
            tools=cfg.get("tools"),
            verbose=verbose,
        )
        for cfg in agents_config
    ]

    process_type = Process.sequential if process == "sequential" else Process.hierarchical

    return Crew(
        agents=agents,
        tasks=tasks,
        process=process_type,
        verbose=verbose,
    )


# ── Example ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = _cold_start()
    print(f"Identity loaded: agent_id={os.environ.get('AGENTID_AGENT_ID')} stale={result['stale']}")
    print("\nBackstory preview (first 300 chars):")
    print(build_agent_backstory()[:300])
