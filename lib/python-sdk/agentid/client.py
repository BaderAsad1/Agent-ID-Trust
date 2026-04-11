"""Agent ID Python SDK client."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Union

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

from .types import (
    Agent,
    AgentRegistration,
    ResolvedAgent,
    Message,
    Task,
    TaskStatus,
    InboxMessage,
    HeartbeatResult,
    TrustData,
    TrustSignal,
)

DEFAULT_BASE_URL = "https://getagent.id/api/v1"


class AgentIDError(Exception):
    """Raised when the Agent ID API returns an error."""

    def __init__(self, status_code: int, error_code: str, message: str, details: Any = None):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details
        super().__init__(f"[{error_code}] {message} (HTTP {status_code})")


class AgentID:
    """
    Agent ID SDK client.

    Usage::

        from agentid import AgentID

        # Initialize with an API key (user-scoped)
        client = AgentID.init(api_key="aid_...")

        # Or initialize with an agent key
        client = AgentID.init(agent_key="agk_...")

        # Register an agent
        agent = client.register_agent(
            handle="my-agent",
            display_name="My Agent",
            capabilities=["chat", "code"],
        )

        # Resolve another agent
        target = client.resolve("some-handle")
    """

    _instance: Optional["AgentID"] = None

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        agent_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        sandbox: bool = False,
        timeout: float = 30.0,
    ):
        if not HAS_HTTPX:
            raise ImportError(
                "The 'httpx' package is required. Install it with: pip install agentid"
            )

        if not api_key and not agent_key:
            raise ValueError("Either api_key or agent_key must be provided.")

        self._api_key = api_key
        self._agent_key = agent_key
        self._base_url = base_url.rstrip("/")
        self._sandbox = sandbox
        self._timeout = timeout

        headers: Dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "agentid-python/0.1.0",
        }

        if agent_key:
            headers["X-Agent-Key"] = agent_key
        elif api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        if sandbox:
            headers["X-Sandbox"] = "true"

        self._client = httpx.Client(
            base_url=self._base_url,
            headers=headers,
            timeout=self._timeout,
        )

    @classmethod
    def init(
        cls,
        *,
        api_key: Optional[str] = None,
        agent_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        sandbox: bool = False,
        timeout: float = 30.0,
    ) -> "AgentID":
        """
        Initialize the global AgentID client.

        Args:
            api_key: A user-scoped API key (prefix: aid_).
            agent_key: An agent-scoped key (prefix: agk_ or agk_sandbox_).
            base_url: Override the default API base URL.
            sandbox: Enable sandbox mode. Requests will be isolated from production.
            timeout: HTTP request timeout in seconds.

        Returns:
            The initialized AgentID client.
        """
        instance = cls(
            api_key=api_key,
            agent_key=agent_key,
            base_url=base_url,
            sandbox=sandbox,
            timeout=timeout,
        )
        cls._instance = instance
        return instance

    @classmethod
    def from_env(
        cls,
        *,
        persist_dir: str = ".agentid",
        base_url: str = DEFAULT_BASE_URL,
    ) -> "AgentID":
        """
        Create an AgentID instance from environment variables and run cold-start.

        Reads ``AGENTID_API_KEY`` and ``AGENTID_AGENT_ID`` from the environment,
        runs the full cold-start sequence (heartbeat → prompt block → marketplace
        context if needed), and exposes the result via :attr:`system_context`.

        This is the **recommended one-call setup** for any Python agent:

        Example::

            from agentid import AgentID

            agent = AgentID.from_env()
            # inject agent.system_context into your system prompt — done.

        Args:
            persist_dir: Directory to write state files into (default: ``.agentid``).
            base_url:    Override the API base URL.

        Raises:
            RuntimeError: If ``AGENTID_API_KEY`` or ``AGENTID_AGENT_ID`` is not set.
        """
        import os as _os

        agent_key = _os.environ.get("AGENTID_API_KEY", "").strip()
        agent_id  = _os.environ.get("AGENTID_AGENT_ID", "").strip()

        if not agent_key:
            raise RuntimeError(
                "AGENTID_API_KEY environment variable is not set.\n"
                "Set it to your agent-scoped API key (prefix: agk_)."
            )
        if not agent_id:
            raise RuntimeError(
                "AGENTID_AGENT_ID environment variable is not set.\n"
                "Set it to your agent's UUID from getagent.id."
            )

        instance = cls(agent_key=agent_key, base_url=base_url)
        result = instance.cold_start(agent_id, persist_dir=persist_dir)
        instance._cold_start_result: Dict[str, Any] = result
        return instance

    @property
    def system_context(self) -> str:
        """
        The agent's identity block, ready to inject into a system prompt.

        Available after :meth:`from_env` or a manual :meth:`cold_start` call.
        Returns an empty string if cold-start has not been run.

        Example::

            agent = AgentID.from_env()
            response = anthropic_client.messages.create(
                model="claude-opus-4-6",
                system=agent.system_context,
                messages=[{"role": "user", "content": user_input}],
                max_tokens=1024,
            )
        """
        result = getattr(self, "_cold_start_result", None)
        if result:
            return result.get("system_context", "")
        return ""

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        response = self._client.request(
            method,
            path,
            json=body,
            params=params,
        )

        if not response.is_success:
            try:
                data = response.json()
                raise AgentIDError(
                    status_code=response.status_code,
                    error_code=data.get("code", "UNKNOWN"),
                    message=data.get("message", response.text),
                    details=data.get("details"),
                )
            except (ValueError, KeyError):
                raise AgentIDError(
                    status_code=response.status_code,
                    error_code="HTTP_ERROR",
                    message=response.text,
                )

        if response.status_code == 204 or not response.content:
            return {}

        return response.json()

    def register_agent(
        self,
        display_name: str,
        public_key: str,
        *,
        handle: Optional[str] = None,
        description: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        capabilities: Optional[List[str]] = None,
        key_type: str = "ed25519",
    ) -> "AgentRegistration":
        """
        Register a new agent using the secure two-phase bootstrap flow.

        Phase 1: POST /programmatic/agents/register — provisions the agent and
        returns a cryptographic challenge.
        Phase 2: POST /programmatic/agents/verify — must be called by the caller
        with a valid signature over the challenge to activate the agent.

        Args:
            display_name: Human-readable name for the agent.
            public_key: The agent's Ed25519 public key (base64 or hex encoded).
            handle: Optional unique handle (3–32 lowercase alphanumeric + hyphens).
            description: Optional description.
            endpoint_url: HTTPS endpoint to receive inbound calls.
            capabilities: List of capability strings.
            key_type: Key algorithm. Only "ed25519" is supported.

        Returns:
            AgentRegistration containing agent_id, kid, challenge, and
            expires_at. The caller MUST call verify_agent() to activate.

        Raises:
            AgentIDError: If the API returns an error response.
        """
        body: Dict[str, Any] = {
            "displayName": display_name,
            "publicKey": public_key,
            "keyType": key_type,
        }
        if handle is not None:
            body["handle"] = handle
        if description is not None:
            body["description"] = description
        if endpoint_url is not None:
            body["endpointUrl"] = endpoint_url
        if capabilities is not None:
            body["capabilities"] = capabilities

        data = self._request("POST", "/programmatic/agents/register", body=body)
        return AgentRegistration(
            agent_id=data["agentId"],
            kid=data["kid"],
            challenge=data["challenge"],
            expires_at=data.get("expiresAt"),
            handle=data.get("handle"),
            provisional_domain=data.get("provisionalDomain"),
        )

    def verify_agent(
        self,
        agent_id: str,
        challenge: str,
        signature: str,
        kid: str,
    ) -> Agent:
        """
        Complete the two-phase agent registration by verifying the challenge signature.

        Args:
            agent_id: UUID of the agent returned from register_agent().
            challenge: The challenge string returned from register_agent().
            signature: Ed25519 signature over the challenge bytes (base64url encoded).
            kid: The key ID returned from register_agent().

        Returns:
            The fully activated Agent object.

        Raises:
            AgentIDError: If the signature is invalid or the challenge has expired.
        """
        body: Dict[str, Any] = {
            "agentId": agent_id,
            "challenge": challenge,
            "signature": signature,
            "kid": kid,
        }
        data = self._request("POST", "/programmatic/agents/verify", body=body)
        agent_data = data.get("agent", data)
        return Agent(
            id=agent_data.get("id", agent_id),
            handle=agent_data.get("handle"),
            display_name=agent_data.get("displayName", ""),
            description=agent_data.get("description"),
            endpoint_url=agent_data.get("endpointUrl"),
            capabilities=agent_data.get("capabilities", []),
            protocols=agent_data.get("protocols", []),
            trust_score=agent_data.get("trustScore", 0),
            trust_tier=agent_data.get("trustTier", "unverified"),
            verification_status=agent_data.get("verificationStatus", "unverified"),
            is_public=agent_data.get("isPublic", False),
            status=agent_data.get("status", "active"),
            is_sandbox=agent_data.get("isSandbox", False),
        )

    def resolve(self, handle: str) -> ResolvedAgent:
        """
        Resolve an agent by handle.

        Args:
            handle: The agent's handle (e.g. "my-agent").

        Returns:
            ResolvedAgent with public profile data.
        """
        data = self._request("GET", f"/resolve/{handle}")
        agent_data = data.get("agent", data)
        return ResolvedAgent(
            id=agent_data.get("id", ""),
            handle=agent_data.get("handle", handle),
            display_name=agent_data.get("displayName", ""),
            description=agent_data.get("description"),
            endpoint_url=agent_data.get("endpointUrl"),
            capabilities=agent_data.get("capabilities", []),
            protocols=agent_data.get("protocols", []),
            trust_score=agent_data.get("trustScore", 0),
            trust_tier=agent_data.get("trustTier", "unverified"),
            verification_status=agent_data.get("verificationStatus", "unverified"),
            is_public=agent_data.get("isPublic", True),
            is_sandbox=agent_data.get("isSandbox", False),
        )

    def heartbeat(self, agent_id: str) -> HeartbeatResult:
        """
        Send a heartbeat for an agent to signal it is alive.

        Args:
            agent_id: The UUID of the agent.

        Returns:
            HeartbeatResult with updated status.
        """
        data = self._request("POST", f"/agents/{agent_id}/heartbeat", body={})
        return HeartbeatResult(
            agent_id=agent_id,
            status=data.get("status", "active"),
            last_heartbeat_at=data.get("lastHeartbeatAt"),
            trust_score=data.get("trustScore"),
        )

    def send_message(
        self,
        from_agent_id: str,
        to_agent_id: str,
        content: str,
        *,
        subject: Optional[str] = None,
        thread_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Message:
        """
        Send a message from one agent to another.

        Args:
            from_agent_id: UUID of the sending agent.
            to_agent_id: UUID of the recipient agent.
            content: Message body text.
            subject: Optional message subject.
            thread_id: Optional thread ID for conversations.
            metadata: Optional metadata.

        Returns:
            The sent Message object.
        """
        payload: Dict[str, Any] = {
            "direction": "outbound",
            "senderType": "agent",
            "senderAgentId": from_agent_id,
            "recipientAgentId": to_agent_id,
            "body": content,
            "bodyFormat": "text",
        }
        if subject is not None:
            payload["subject"] = subject
        if thread_id is not None:
            payload["threadId"] = thread_id
        if metadata is not None:
            payload["metadata"] = metadata

        data = self._request("POST", f"/mail/agents/{from_agent_id}/messages", body=payload)
        msg = data.get("message", data)
        return Message(
            id=msg.get("id", ""),
            from_agent_id=from_agent_id,
            to_agent_id=to_agent_id,
            content=content,
            content_type="text/plain",
            thread_id=msg.get("threadId") or thread_id,
            metadata=metadata,
            created_at=msg.get("createdAt"),
        )

    def check_inbox(
        self,
        agent_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        unread_only: bool = False,
    ) -> List[InboxMessage]:
        """
        Retrieve inbox messages for an agent.

        Args:
            agent_id: UUID of the agent.
            limit: Maximum number of messages to return (max 100).
            offset: Pagination offset.
            unread_only: If True, return only unread messages.

        Returns:
            List of InboxMessage objects.
        """
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if unread_only:
            params["unread"] = "true"

        data = self._request("GET", f"/mail/agents/{agent_id}/messages", params=params)
        messages = data.get("messages", data if isinstance(data, list) else [])
        return [
            InboxMessage(
                id=m.get("id", ""),
                from_agent_id=m.get("senderAgentId", ""),
                content=m.get("body", m.get("content", "")),
                content_type="text/plain",
                thread_id=m.get("threadId"),
                read=m.get("isRead", m.get("read", False)),
                created_at=m.get("createdAt"),
            )
            for m in messages
        ]

    def send_task(
        self,
        from_agent_id: str,
        to_agent_id: str,
        task_type: str,
        *,
        payload: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Task:
        """
        Delegate a task to another agent.

        Args:
            from_agent_id: UUID of the delegating (sender) agent.
            to_agent_id: UUID of the recipient agent.
            task_type: Short identifier for the task type (e.g. "summarize", "translate").
            payload: Arbitrary structured task payload.
            metadata: Optional metadata.

        Returns:
            The created Task object.
        """
        body: Dict[str, Any] = {
            "recipientAgentId": to_agent_id,
            "senderAgentId": from_agent_id,
            "taskType": task_type,
        }
        if payload is not None:
            body["payload"] = payload
        if metadata is not None:
            body["metadata"] = metadata

        data = self._request("POST", "/tasks", body=body)
        task_data = data.get("task", data)
        return Task(
            id=task_data.get("id", ""),
            from_agent_id=from_agent_id,
            to_agent_id=to_agent_id,
            title=task_type,
            description=None,
            status=task_data.get("status", "pending"),
            priority="normal",
            metadata=metadata,
            created_at=task_data.get("createdAt"),
        )

    def get_trust(self, agent_id: str) -> TrustData:
        """
        Get the trust score and signal breakdown for an agent.

        Equivalent to the TypeScript SDK's ``agent.trust.get()``.

        Args:
            agent_id: UUID of the agent to query.

        Returns:
            TrustData with score (0-100), tier, and per-provider signal list.

        Note:
            Trust tiers: unverified (0-19), basic (20-39), verified (40-64),
            trusted (65-84), elite (85-100).
        """
        data = self._request("GET", f"/agents/{agent_id}/runtime")
        trust = data.get("trust", {})
        return TrustData(
            score=trust.get("score", 0),
            tier=trust.get("tier", "unverified"),
            signals=[
                TrustSignal(
                    provider=s.get("provider", ""),
                    label=s.get("label", ""),
                    score=s.get("score", 0),
                    max_score=s.get("maxScore", s.get("max_score", 0)),
                )
                for s in trust.get("signals", [])
            ],
        )

    def whoami(self) -> Agent:
        """
        Return the profile of the currently authenticated agent.

        Returns:
            Agent object for the authenticated agent.
        """
        data = self._request("GET", "/agents/whoami")
        return Agent(
            id=data.get("id", ""),
            handle=data.get("handle", ""),
            display_name=data.get("displayName", ""),
            description=data.get("description"),
            endpoint_url=data.get("endpointUrl"),
            capabilities=data.get("capabilities", []),
            protocols=data.get("protocols", []),
            trust_score=data.get("trustScore", 0),
            trust_tier=data.get("trustTier", "unverified"),
            verification_status=data.get("verificationStatus", "unverified"),
            is_public=data.get("isPublic", False),
            status=data.get("status", "draft"),
            is_sandbox=data.get("isSandbox", False),
        )

    def get_identity_content(
        self,
        agent_id: Optional[str] = None,
        format: str = "generic",
    ) -> str:
        """
        Fetch the agent's identity file content for persistent injection into
        frameworks like OpenClaw, Claude Code, or any custom system prompt.

        Args:
            agent_id: UUID of the agent. Defaults to the authenticated agent
                (inferred via ``whoami()`` when not provided).
            format: One of ``"openclaw"``, ``"claude"``, ``"generic"``, or ``"json"``.

        Returns:
            The identity content as a string (markdown or JSON).

        Example::

            # With an agent key — agent_id is optional (auto-inferred)
            content = client.get_identity_content(format="openclaw")

            # Or pass agent_id explicitly
            content = client.get_identity_content(my_agent_id, format="openclaw")

            with open("/path/to/AGENTID.md", "w") as f:
                f.write(content)
        """
        valid_formats = {"openclaw", "claude", "generic", "json"}
        if format not in valid_formats:
            raise ValueError(f"format must be one of {valid_formats}")

        if agent_id is None:
            agent = self.whoami()
            agent_id = agent.id

        response = self._client.request(
            "GET",
            f"/agents/{agent_id}/identity-file",
            params={"format": format},
        )

        if not response.is_success:
            try:
                data = response.json()
                raise AgentIDError(
                    status_code=response.status_code,
                    error_code=data.get("code", "UNKNOWN"),
                    message=data.get("message", response.text),
                    details=data.get("details"),
                )
            except (ValueError, KeyError):
                raise AgentIDError(
                    status_code=response.status_code,
                    error_code="HTTP_ERROR",
                    message=response.text,
                )

        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            return json.dumps(response.json(), indent=2)
        return response.text

    def write_identity_file(
        self,
        path: str,
        agent_id: Optional[str] = None,
        format: str = "generic",
    ) -> None:
        """
        Fetch the agent's identity content and write it to a file.

        Args:
            path: Filesystem path where the identity file will be written
                (e.g. ``"AGENTID.md"`` or ``"~/.clawd/AGENTID.md"``).
            agent_id: UUID of the agent. Defaults to the authenticated agent.
            format: One of ``"openclaw"``, ``"claude"``, ``"generic"``, or ``"json"``.

        Example::

            # Write identity file for OpenClaw
            client.write_identity_file("AGENTID.md", format="openclaw")
        """
        import os
        content = self.get_identity_content(agent_id=agent_id, format=format)
        expanded = os.path.expanduser(path)
        os.makedirs(os.path.dirname(os.path.abspath(expanded)), exist_ok=True)
        with open(expanded, "w", encoding="utf-8") as f:
            f.write(content)

    def export_state(self, agent_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Export the agent's durable state as a dict.

        Permanent fields (agent_id, api_key, did, base_url) are safe to persist.
        Mutable fields (handle, bootstrap) should be refreshed on next startup
        via a fresh ``whoami()`` or ``get_bootstrap()`` call.

        Args:
            agent_id: UUID of the agent. Auto-inferred from API key if not provided.

        Returns:
            A dict with ``version``, ``base_url``, ``agent_id``, ``api_key``,
            ``did``, ``handle``, ``resolver_url``, ``profile_url``, and ``saved_at``.

        Example::

            state = client.export_state()
            import json
            with open('.agentid-state.json', 'w') as f:
                json.dump(state, f, indent=2)
        """
        import datetime
        if agent_id is None:
            agent = self.whoami()
            agent_id = agent.id
            handle = agent.handle
        else:
            agent = self.whoami()
            handle = agent.handle if agent.id == agent_id else None

        base_url = self._base_url
        return {
            "version": 1,
            "base_url": base_url,
            "agent_id": agent_id,
            "api_key": self._agent_key or self._api_key or "",
            "did": f"did:web:getagent.id:agents:{agent_id}",
            "handle": handle or None,
            "resolver_url": f"{base_url}/api/v1/resolve/{handle}" if handle else f"{base_url}/api/v1/resolve/id/{agent_id}",
            "profile_url": f"{base_url}/{handle}" if handle else f"{base_url}/id/{agent_id}",
            "saved_at": datetime.datetime.utcnow().isoformat() + "Z",
        }

    def write_state_file(self, path: str, agent_id: Optional[str] = None) -> None:
        """
        Export the agent's durable state and write it to a JSON file.

        Args:
            path: Filesystem path for the state file (e.g. ``".agentid-state.json"``).
            agent_id: UUID of the agent. Auto-inferred if not provided.

        Example::

            client.write_state_file('.agentid-state.json')
        """
        import os, json
        state = self.export_state(agent_id=agent_id)
        expanded = os.path.expanduser(path)
        os.makedirs(os.path.dirname(os.path.abspath(expanded)), exist_ok=True)
        with open(expanded, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)

    @classmethod
    def from_state(cls, state: Dict[str, Any]) -> "AgentID":
        """
        Restore an AgentID client from a previously exported state dict.

        Call this on startup to avoid re-registration. After restoring, call
        ``whoami()`` or fetch the bootstrap to refresh mutable fields.

        Args:
            state: A dict previously returned by ``export_state()``.

        Returns:
            A configured AgentID client for the restored agent.

        Example::

            import json
            with open('.agentid-state.json') as f:
                state = json.load(f)
            client = AgentID.from_state(state)
        """
        if state.get("version") != 1:
            raise ValueError(f"Unsupported state version: {state.get('version')}. Expected 1.")
        api_key = state.get("api_key", "")
        base_url = state.get("base_url", DEFAULT_BASE_URL)
        agent_key = None
        user_api_key = None
        if api_key.startswith("agk_"):
            agent_key = api_key
        else:
            user_api_key = api_key
        return cls(
            api_key=user_api_key,
            agent_key=agent_key,
            base_url=base_url,
        )

    @classmethod
    def read_state_file(cls, path: str) -> "AgentID":
        """
        Restore an AgentID client from a state JSON file on disk.

        Args:
            path: Path to the state file written by ``write_state_file()``.

        Returns:
            A configured AgentID client.

        Example::

            client = AgentID.read_state_file('.agentid-state.json')
        """
        import os, json
        expanded = os.path.expanduser(path)
        with open(expanded, "r", encoding="utf-8") as f:
            state = json.load(f)
        return cls.from_state(state)

    def acknowledge_task(self, task_id: str) -> Task:
        """
        Acknowledge receipt of a task.

        Args:
            task_id: UUID of the task.

        Returns:
            Updated Task object.
        """
        data = self._request("POST", f"/tasks/{task_id}/acknowledge", body={})
        task_data = data.get("task", data)
        return Task(
            id=task_data.get("id", task_id),
            to_agent_id=task_data.get("recipientAgentId", ""),
            from_agent_id=task_data.get("senderAgentId"),
            title=task_data.get("taskType", ""),
            status=task_data.get("businessStatus", "acknowledged"),
        )

    def complete_task(
        self, task_id: str, result: Optional[Dict[str, Any]] = None
    ) -> Task:
        """
        Mark a task as completed, optionally attaching a result payload.

        Args:
            task_id: UUID of the task.
            result: Optional result data to attach.

        Returns:
            Updated Task object.
        """
        body: Dict[str, Any] = {"status": "completed"}
        if result is not None:
            body["result"] = result
        data = self._request("PATCH", f"/tasks/{task_id}/business-status", body=body)
        task_data = data.get("task", data)
        return Task(
            id=task_data.get("id", task_id),
            to_agent_id=task_data.get("recipientAgentId", ""),
            from_agent_id=task_data.get("senderAgentId"),
            title=task_data.get("taskType", ""),
            status=task_data.get("businessStatus", "completed"),
        )

    def fail_task(
        self, task_id: str, result: Optional[Dict[str, Any]] = None
    ) -> Task:
        """
        Mark a task as failed.

        Args:
            task_id: UUID of the task.
            result: Optional error/reason data.

        Returns:
            Updated Task object.
        """
        body: Dict[str, Any] = {}
        if result is not None:
            body["result"] = result
        data = self._request("POST", f"/tasks/{task_id}/fail", body=body)
        task_data = data.get("task", data)
        return Task(
            id=task_data.get("id", task_id),
            to_agent_id=task_data.get("recipientAgentId", ""),
            from_agent_id=task_data.get("senderAgentId"),
            title=task_data.get("taskType", ""),
            status=task_data.get("businessStatus", "failed"),
        )

    def list_tasks(
        self,
        agent_id: str,
        *,
        business_status: Optional[str] = None,
        delivery_status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Task]:
        """
        List tasks for a given agent.

        Args:
            agent_id: UUID of the agent (recipient).
            business_status: Filter by business status (e.g. "pending", "completed").
            delivery_status: Filter by delivery status.
            limit: Max records to return.
            offset: Pagination offset.

        Returns:
            List of Task objects.
        """
        params: Dict[str, Any] = {
            "recipientAgentId": agent_id,
            "limit": limit,
            "offset": offset,
        }
        if business_status:
            params["businessStatus"] = business_status
        if delivery_status:
            params["deliveryStatus"] = delivery_status

        data = self._request("GET", "/tasks", params=params)
        tasks = data.get("tasks", [])
        return [
            Task(
                id=t.get("id", ""),
                to_agent_id=t.get("recipientAgentId", ""),
                from_agent_id=t.get("senderAgentId"),
                title=t.get("taskType", ""),
                status=t.get("businessStatus", "pending"),
            )
            for t in tasks
        ]

    def check_handle(self, handle: str) -> Dict[str, Any]:
        """
        Check if a handle is available and get pricing information.

        Args:
            handle: The handle to check (e.g. "my-agent").

        Returns:
            Dict with keys: handle, available, tier, isFree, priceDollars,
            priceYearly, reason (if unavailable), onChainMintPrice, etc.
        """
        params: Dict[str, Any] = {"handle": handle.lower().rstrip(".agentid")}
        return self._request("GET", "/handles/check", params=params)

    def list_handles(
        self, agent_id: str, *, limit: int = 20, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List handles owned by a specific agent.

        Args:
            agent_id: UUID of the agent.
            limit: Max records to return.
            offset: Pagination offset.

        Returns:
            List of handle dicts with keys: handle, agentId, status, nftStatus, paidThrough.
        """
        params: Dict[str, Any] = {
            "agentId": agent_id,
            "limit": limit,
            "offset": offset,
        }
        data = self._request("GET", "/handles", params=params)
        return data.get("handles", [])

    def get_wallet_balance(self, agent_id: str) -> Dict[str, Any]:
        """
        Get the wallet balance for an agent.

        Args:
            agent_id: UUID of the agent.

        Returns:
            Dict with keys: balanceCents, balanceFormatted, currency, lastUpdatedAt.
        """
        return self._request("GET", f"/agents/{agent_id}/wallet/balance")

    def get_wallet_transactions(
        self, agent_id: str, *, limit: int = 20, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get wallet transaction history for an agent.

        Args:
            agent_id: UUID of the agent.
            limit: Max records to return.
            offset: Pagination offset.

        Returns:
            List of transaction dicts.
        """
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        data = self._request(
            "GET", f"/agents/{agent_id}/wallet/transactions", params=params
        )
        return data.get("transactions", [])

    # ------------------------------------------------------------------
    # Billing
    # ------------------------------------------------------------------

    def get_plans(self) -> Dict[str, Any]:
        """Return available plans and handle pricing tiers (public)."""
        return self._request("GET", "/billing/plans")

    def get_subscription(self) -> Dict[str, Any]:
        """Return the authenticated user's current plan, limits, and subscription details."""
        return self._request("GET", "/billing/subscription")

    def create_checkout(
        self,
        *,
        plan: Optional[str] = None,
        price_id: Optional[str] = None,
        billing_interval: str = "monthly",
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a Stripe checkout session for a subscription plan. Returns {url}."""
        body: Dict[str, Any] = {"billingInterval": billing_interval}
        if plan:
            body["plan"] = plan
        if price_id:
            body["priceId"] = price_id
        if success_url:
            body["successUrl"] = success_url
        if cancel_url:
            body["cancelUrl"] = cancel_url
        return self._request("POST", "/billing/checkout", body=body)

    def create_handle_checkout(
        self,
        handle: str,
        *,
        success_url: str,
        cancel_url: str,
        agent_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a Stripe checkout session to claim a premium handle. Returns {url, handle, priceCents}."""
        body: Dict[str, Any] = {
            "handle": handle.lower(),
            "successUrl": success_url,
            "cancelUrl": cancel_url,
        }
        if agent_id:
            body["agentId"] = agent_id
        return self._request("POST", "/billing/handle-checkout", body=body)

    def get_portal_url(self) -> Dict[str, Any]:
        """Return the Stripe customer portal URL for the authenticated user. Returns {url}."""
        return self._request("POST", "/billing/portal", body={})

    def cancel_subscription(self) -> Dict[str, Any]:
        """Cancel the authenticated user's active subscription at period end."""
        return self._request("POST", "/billing/cancel", body={})

    def activate_agent(self, agent_id: str) -> Dict[str, Any]:
        """Activate an agent under the current subscription."""
        return self._request("POST", f"/billing/agents/{agent_id}/activate", body={})

    def deactivate_agent(self, agent_id: str) -> Dict[str, Any]:
        """Deactivate an agent (identity preserved, features suspended)."""
        return self._request("POST", f"/billing/agents/{agent_id}/deactivate", body={})

    def get_agent_billing_status(self, agent_id: str) -> Dict[str, Any]:
        """Return billing status for a specific agent."""
        return self._request("GET", f"/billing/agents/{agent_id}/status")

    # ------------------------------------------------------------------
    # API Keys
    # ------------------------------------------------------------------

    def create_api_key(
        self,
        name: str,
        *,
        scopes: Optional[List[str]] = None,
        sandbox: bool = False,
    ) -> Dict[str, Any]:
        """Create a new API key. Returns the key value once — store it securely."""
        body: Dict[str, Any] = {"name": name, "sandbox": sandbox}
        if scopes is not None:
            body["scopes"] = scopes
        return self._request("POST", "/api-keys", body=body)

    def list_api_keys(self) -> List[Dict[str, Any]]:
        """List all active API keys for the authenticated user."""
        data = self._request("GET", "/api-keys")
        return data.get("keys", [])

    def revoke_api_key(self, key_id: str) -> Dict[str, Any]:
        """Revoke an API key by its UUID."""
        return self._request("DELETE", f"/api-keys/{key_id}")

    # ------------------------------------------------------------------
    # OAuth Clients (Sign in with Agent ID)
    # ------------------------------------------------------------------

    def list_oauth_clients(self) -> List[Dict[str, Any]]:
        """List OAuth/OIDC clients registered by the authenticated user."""
        data = self._request("GET", "/clients")
        return data.get("clients", [])

    def register_oauth_client(
        self,
        name: str,
        *,
        description: Optional[str] = None,
        redirect_uris: Optional[List[str]] = None,
        allowed_scopes: Optional[List[str]] = None,
        grant_types: Optional[List[str]] = None,
        client_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Register a new OAuth client for 'Sign in with Agent ID'. Returns clientId and clientSecret."""
        body: Dict[str, Any] = {"name": name}
        if description is not None:
            body["description"] = description
        if redirect_uris is not None:
            body["redirectUris"] = redirect_uris
        if allowed_scopes is not None:
            body["allowedScopes"] = allowed_scopes
        if grant_types is not None:
            body["grantTypes"] = grant_types
        if client_type is not None:
            body["clientType"] = client_type
        return self._request("POST", "/clients", body=body)

    def get_oauth_client(self, client_id: str) -> Dict[str, Any]:
        """Get a specific OAuth client by its clientId string."""
        return self._request("GET", f"/clients/{client_id}")

    def update_oauth_client(self, client_id: str, **kwargs: Any) -> Dict[str, Any]:
        """Update an OAuth client. Accepts name, description, redirectUris, allowedScopes."""
        camel = {
            "name": kwargs.get("name"),
            "description": kwargs.get("description"),
            "redirectUris": kwargs.get("redirect_uris"),
            "allowedScopes": kwargs.get("allowed_scopes"),
        }
        body = {k: v for k, v in camel.items() if v is not None}
        return self._request("PATCH", f"/clients/{client_id}", body=body)

    def revoke_oauth_client(self, client_id: str) -> Dict[str, Any]:
        """Revoke an OAuth client."""
        return self._request("DELETE", f"/clients/{client_id}")

    def rotate_oauth_client_secret(self, client_id: str) -> Dict[str, Any]:
        """Rotate the client secret for a confidential OAuth client."""
        return self._request("POST", f"/clients/{client_id}/rotate-secret", body={})

    # ------------------------------------------------------------------
    # Organizations
    # ------------------------------------------------------------------

    def create_org(
        self,
        slug: str,
        display_name: str,
        *,
        description: Optional[str] = None,
        avatar_url: Optional[str] = None,
        website_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new organization with a namespace slug (e.g. 'acme' → acme.agentid)."""
        body: Dict[str, Any] = {"slug": slug.lower(), "displayName": display_name}
        if description is not None:
            body["description"] = description
        if avatar_url is not None:
            body["avatarUrl"] = avatar_url
        if website_url is not None:
            body["websiteUrl"] = website_url
        return self._request("POST", "/orgs", body=body)

    def get_org(self, slug: str) -> Dict[str, Any]:
        """Get an organization and its member agents by slug."""
        return self._request("GET", f"/orgs/{slug.lower()}")

    def add_agent_to_org(self, org_slug: str, agent_id: str) -> Dict[str, Any]:
        """Add an agent you own to an organization."""
        return self._request("POST", f"/orgs/{org_slug.lower()}/agents", body={"agentId": agent_id})

    def remove_agent_from_org(self, org_slug: str, agent_id: str) -> Dict[str, Any]:
        """Remove an agent from an organization."""
        return self._request("DELETE", f"/orgs/{org_slug.lower()}/agents/{agent_id}")

    def list_org_members(self, org_slug: str) -> List[Dict[str, Any]]:
        """List members of an organization (requires membership)."""
        data = self._request("GET", f"/orgs/{org_slug.lower()}/members")
        return data.get("members", [])

    # ------------------------------------------------------------------
    # Fleet (sub-handle delegation — Pro+ plan)
    # ------------------------------------------------------------------

    def list_fleets(self) -> List[Dict[str, Any]]:
        """List all root handles and their sub-handle agents (requires Pro plan)."""
        data = self._request("GET", "/fleet")
        return data.get("fleets", [])

    def create_sub_handle(
        self,
        root_handle: str,
        sub_name: str,
        display_name: str,
        *,
        description: Optional[str] = None,
        capabilities: Optional[List[str]] = None,
        endpoint_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a sub-handle agent under a root handle (e.g. sub.root.agentid)."""
        body: Dict[str, Any] = {
            "rootHandle": root_handle.lower(),
            "subName": sub_name.lower(),
            "displayName": display_name,
        }
        if description is not None:
            body["description"] = description
        if capabilities is not None:
            body["capabilities"] = capabilities
        if endpoint_url is not None:
            body["endpointUrl"] = endpoint_url
        return self._request("POST", "/fleet/sub-handles", body=body)

    def delete_sub_handle(self, agent_id: str) -> Dict[str, Any]:
        """Delete a sub-handle agent by its UUID."""
        return self._request("DELETE", f"/fleet/sub-handles/{agent_id}")

    # ------------------------------------------------------------------
    # Jobs & Proposals (marketplace jobs board)
    # ------------------------------------------------------------------

    def list_jobs(
        self,
        *,
        category: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        budget_min: Optional[float] = None,
        budget_max: Optional[float] = None,
        capability: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List open jobs from the marketplace jobs board."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if category:
            params["category"] = category
        if status:
            params["status"] = status
        if search:
            params["search"] = search
        if budget_min is not None:
            params["budgetMin"] = budget_min
        if budget_max is not None:
            params["budgetMax"] = budget_max
        if capability:
            params["capability"] = capability
        if sort_by:
            params["sortBy"] = sort_by
        if sort_order:
            params["sortOrder"] = sort_order
        return self._request("GET", "/jobs", params=params)

    def get_job(self, job_id: str) -> Dict[str, Any]:
        """Get a specific job by UUID."""
        return self._request("GET", f"/jobs/{job_id}")

    def my_jobs(self) -> List[Dict[str, Any]]:
        """List jobs posted by the authenticated user."""
        data = self._request("GET", "/jobs/mine")
        return data.get("jobs", [])

    def create_job(
        self,
        title: str,
        *,
        description: Optional[str] = None,
        category: Optional[str] = None,
        budget_min: Optional[str] = None,
        budget_max: Optional[str] = None,
        budget_fixed: Optional[str] = None,
        deadline_hours: Optional[int] = None,
        required_capabilities: Optional[List[str]] = None,
        min_trust_score: Optional[int] = None,
        verified_only: bool = False,
    ) -> Dict[str, Any]:
        """Post a new job to the marketplace jobs board."""
        body: Dict[str, Any] = {"title": title}
        if description is not None:
            body["description"] = description
        if category is not None:
            body["category"] = category
        if budget_min is not None:
            body["budgetMin"] = budget_min
        if budget_max is not None:
            body["budgetMax"] = budget_max
        if budget_fixed is not None:
            body["budgetFixed"] = budget_fixed
        if deadline_hours is not None:
            body["deadlineHours"] = deadline_hours
        if required_capabilities is not None:
            body["requiredCapabilities"] = required_capabilities
        if min_trust_score is not None:
            body["minTrustScore"] = min_trust_score
        body["verifiedOnly"] = verified_only
        return self._request("POST", "/jobs", body=body)

    def update_job(self, job_id: str, **kwargs: Any) -> Dict[str, Any]:
        """Update an existing job. Accepts title, description, category, budgetMin/Max/Fixed, etc."""
        camel = {
            "title": kwargs.get("title"),
            "description": kwargs.get("description"),
            "category": kwargs.get("category"),
            "budgetMin": kwargs.get("budget_min"),
            "budgetMax": kwargs.get("budget_max"),
            "budgetFixed": kwargs.get("budget_fixed"),
            "deadlineHours": kwargs.get("deadline_hours"),
            "requiredCapabilities": kwargs.get("required_capabilities"),
            "minTrustScore": kwargs.get("min_trust_score"),
            "verifiedOnly": kwargs.get("verified_only"),
        }
        body = {k: v for k, v in camel.items() if v is not None}
        return self._request("PATCH", f"/jobs/{job_id}", body=body)

    def close_job(self, job_id: str, status: str = "closed") -> Dict[str, Any]:
        """Update job status to 'filled', 'closed', or 'expired'."""
        return self._request("PATCH", f"/jobs/{job_id}/status", body={"status": status})

    def list_job_proposals(
        self, job_id: str, *, limit: int = 20, offset: int = 0
    ) -> Dict[str, Any]:
        """List proposals for a job you posted."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        return self._request("GET", f"/jobs/{job_id}/proposals", params=params)

    def my_proposals(self, *, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
        """List proposals submitted by agents you own."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        return self._request("GET", "/jobs/proposals/mine", params=params)

    def submit_proposal(
        self,
        job_id: str,
        agent_id: str,
        *,
        approach: Optional[str] = None,
        price_amount: Optional[str] = None,
        delivery_hours: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Submit a proposal on a job using one of your agents."""
        body: Dict[str, Any] = {"agentId": agent_id}
        if approach is not None:
            body["approach"] = approach
        if price_amount is not None:
            body["priceAmount"] = price_amount
        if delivery_hours is not None:
            body["deliveryHours"] = delivery_hours
        return self._request("POST", f"/jobs/{job_id}/proposals", body=body)

    def update_proposal_status(
        self, job_id: str, proposal_id: str, status: str
    ) -> Dict[str, Any]:
        """Accept or reject a proposal on your job. status: 'accepted' | 'rejected'."""
        return self._request("PATCH", f"/jobs/{job_id}/proposals/{proposal_id}", body={"status": status})

    def withdraw_proposal(self, job_id: str, proposal_id: str) -> Dict[str, Any]:
        """Withdraw a proposal you submitted."""
        return self._request("POST", f"/jobs/{job_id}/proposals/{proposal_id}/withdraw", body={})

    # ------------------------------------------------------------------
    # Custom Domains
    # ------------------------------------------------------------------

    def get_domain(self, agent_id: str) -> Dict[str, Any]:
        """Get the custom domain configured for an agent."""
        return self._request("GET", f"/agents/{agent_id}/domain")

    def get_domain_status(self, agent_id: str) -> Dict[str, Any]:
        """Get DNS/SSL verification status for an agent's custom domain."""
        return self._request("GET", f"/agents/{agent_id}/domain/status")

    def provision_domain(self, agent_id: str) -> Dict[str, Any]:
        """Provision a custom domain for an agent."""
        return self._request("POST", f"/agents/{agent_id}/domain/provision", body={})

    def reprovision_domain(self, agent_id: str) -> Dict[str, Any]:
        """Re-provision (reset) the custom domain for an agent."""
        return self._request("POST", f"/agents/{agent_id}/domain/reprovision", body={})

    # ------------------------------------------------------------------
    # Agent Verification (key-challenge)
    # ------------------------------------------------------------------

    def initiate_verification(
        self, agent_id: str, method: str = "key_challenge"
    ) -> Dict[str, Any]:
        """
        Initiate agent verification by requesting a signing challenge.

        Returns:
            Dict with keys: agentId, challenge, method, expiresAt.
        """
        return self._request(
            "POST", f"/agents/{agent_id}/verify/initiate", body={"method": method}
        )

    def complete_verification(
        self, agent_id: str, challenge: str, signature: str, kid: str
    ) -> Dict[str, Any]:
        """
        Complete agent verification by submitting the signed challenge.

        Args:
            agent_id: UUID of the agent to verify.
            challenge: Challenge string returned by initiate_verification.
            signature: Base64-encoded signature over the challenge using the agent's private key.
            kid: Key ID of the signing key.

        Returns:
            Dict with keys: verified, agentId, handle, trustScore, trustTier, bootstrapIssuedAt.
        """
        return self._request(
            "POST",
            f"/agents/{agent_id}/verify/complete",
            body={"challenge": challenge, "signature": signature, "kid": kid},
        )

    # ── Startup / cold-start helpers ──────────────────────────────────────────

    def get_prompt_block(self, agent_id: str, *, format: str = "structured") -> Dict[str, Any]:
        """
        Fetch the agent's latest prompt block — its identity and policy context.

        This MUST be injected into the **system prompt** layer before the first
        user turn, not passed as a user message.

        Args:
            agent_id: UUID of the agent.
            format:   "structured" (default) returns a JSON object with
                      ``promptText``, ``version``, and ``checksum``.
                      "text" returns the plain prompt string.

        Returns:
            Dict with at minimum::

                {
                    "promptText": "...",   # inject this into system context
                    "version":    "...",
                    "checksum":   "...",
                }

        Example::

            block = client.get_prompt_block(agent_id)
            system_context = block["promptText"]  # → system prompt
        """
        return self._request(
            "GET",
            f"/agents/{agent_id}/prompt-block",
            params={"format": format},
        )

    def get_bootstrap_bundle(self, agent_id: str) -> Dict[str, Any]:
        """
        Fetch the full bootstrap bundle for an agent.

        Contains identity, capabilities, trust, wallet, and next-steps.
        Cache this locally — re-fetch when heartbeat signals changes.

        Args:
            agent_id: UUID of the agent.

        Returns:
            Full bootstrap dict as returned by the bootstrap endpoint.
        """
        return self._request("GET", f"/agents/{agent_id}/bootstrap")

    def get_marketplace_context(self, agent_id: str) -> Dict[str, Any]:
        """
        Fetch the agent's full marketplace operational context.

        Only call this when ``heartbeat().marketplace_alerts.any_action_required``
        is ``True`` — it is more expensive than heartbeat.

        Args:
            agent_id: UUID of the agent.

        Returns:
            Dict with ``as_seller``, ``as_buyer``, and ``action_summary`` keys.
        """
        return self._request("GET", f"/agents/{agent_id}/marketplace/context")

    def cold_start(
        self,
        agent_id: str,
        *,
        persist_dir: Optional[str] = None,
        force_bootstrap_refresh: bool = False,
    ) -> Dict[str, Any]:
        """
        Execute the full Agent ID cold-start sequence.

        Call this **once per process startup**, before the first user turn.
        Returns a single result object containing everything the runtime needs
        to hydrate the agent's system context.

        Steps executed:
        1. Send heartbeat (marks agent online, gets state deltas)
        2. Fetch latest prompt block
        3. If marketplace action required → fetch marketplace context
        4. If bootstrap refresh needed → fetch bootstrap bundle
        5. Persist updated state to ``persist_dir`` if provided

        Args:
            agent_id:               UUID of the agent.
            persist_dir:            Directory to write state files into.
                                    If ``None``, files are not written.
            force_bootstrap_refresh: Re-fetch bootstrap even if heartbeat
                                    does not signal a change.

        Returns:
            Dict with keys::

                {
                    "agent_id":         str,
                    "system_context":   str,   # → inject into system prompt
                    "prompt_block":     dict,
                    "heartbeat":        dict,
                    "marketplace":      dict | None,
                    "bootstrap":        dict | None,
                    "stale":            bool,  # True if any live fetch failed
                    "stale_reasons":    list[str],
                    "persisted_at":     str | None,
                }

        Example::

            result = client.cold_start(agent_id, persist_dir="~/.agentid")
            system_prompt = result["system_context"]  # inject this
        """
        import datetime

        result: Dict[str, Any] = {
            "agent_id":       agent_id,
            "system_context": "",
            "prompt_block":   None,
            "heartbeat":      None,
            "marketplace":    None,
            "bootstrap":      None,
            "stale":          False,
            "stale_reasons":  [],
            "persisted_at":   None,
        }

        # 1. Heartbeat
        try:
            hb_raw = self._request("POST", f"/agents/{agent_id}/heartbeat", body={})
            result["heartbeat"] = hb_raw
        except Exception as exc:
            result["stale"] = True
            result["stale_reasons"].append(f"heartbeat failed: {exc}")
            hb_raw = {}

        # 2. Prompt block
        try:
            pb = self._request("GET", f"/agents/{agent_id}/prompt-block", params={"format": "structured"})
            result["prompt_block"]   = pb
            result["system_context"] = pb.get("promptText") or pb.get("text") or ""
        except Exception as exc:
            result["stale"] = True
            result["stale_reasons"].append(f"prompt-block fetch failed: {exc}")

        # 3. Marketplace context (only when action required)
        alerts = hb_raw.get("stateDelta", {}).get("marketplace_alerts", {})
        if alerts.get("any_action_required") or alerts.get("orders_requiring_acceptance", 0) > 0:
            try:
                result["marketplace"] = self._request(
                    "GET", f"/agents/{agent_id}/marketplace/context"
                )
            except Exception as exc:
                result["stale_reasons"].append(f"marketplace/context fetch failed: {exc}")

        # 4. Bootstrap refresh (when signalled or forced)
        needs_bootstrap = (
            force_bootstrap_refresh
            or hb_raw.get("stateDelta", {}).get("action_required", False)
        )
        if needs_bootstrap:
            try:
                result["bootstrap"] = self._request("GET", f"/agents/{agent_id}/bootstrap")
            except Exception as exc:
                result["stale_reasons"].append(f"bootstrap fetch failed: {exc}")

        # 5. Persist
        if persist_dir:
            try:
                self._persist_cold_start(agent_id, result, persist_dir)
                result["persisted_at"] = datetime.datetime.utcnow().isoformat() + "Z"
            except Exception as exc:
                result["stale_reasons"].append(f"persist failed: {exc}")

        return result

    def _persist_cold_start(
        self,
        agent_id: str,
        cold_start_result: Dict[str, Any],
        persist_dir: str,
    ) -> None:
        """Write cold-start artifacts to disk."""
        import os, json, datetime

        base = os.path.expanduser(persist_dir)
        os.makedirs(base, exist_ok=True)

        ts = datetime.datetime.utcnow().isoformat() + "Z"

        def write(filename: str, data: Any) -> None:
            path = os.path.join(base, filename)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)

        if cold_start_result.get("heartbeat"):
            write("heartbeat.json", {**cold_start_result["heartbeat"], "_refreshed_at": ts})

        if cold_start_result.get("prompt_block"):
            write("prompt-block.json", {**cold_start_result["prompt_block"], "_refreshed_at": ts})

        if cold_start_result.get("bootstrap"):
            write("bootstrap.json", {**cold_start_result["bootstrap"], "_refreshed_at": ts})

        if cold_start_result.get("marketplace"):
            write("marketplace-context.json", {**cold_start_result["marketplace"], "_refreshed_at": ts})

        # Always update state.json with refresh timestamp
        state_path = os.path.join(base, "state.json")
        if os.path.exists(state_path):
            with open(state_path, "r", encoding="utf-8") as f:
                state = json.load(f)
        else:
            state = {"version": 1, "agent_id": agent_id}

        hb = cold_start_result.get("heartbeat") or {}
        pb = cold_start_result.get("prompt_block") or {}
        state.update({
            "agent_id":              agent_id,
            "last_cold_start":       ts,
            "last_heartbeat_at":     hb.get("lastHeartbeatAt", ts),
            "prompt_block_checksum": pb.get("checksum"),
            "prompt_block_version":  pb.get("version"),
            "stale":                 cold_start_result.get("stale", False),
            "stale_reasons":         cold_start_result.get("stale_reasons", []),
        })
        write("state.json", state)

    def get_next_marketplace_actions(
        self, agent_id: str, marketplace_context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Return a prioritised list of marketplace actions the agent must take.

        Fetches marketplace context if not provided, then normalises into
        an ordered action list so the runtime can act without parsing raw context.

        Priority order (highest first):
          1. accept_or_decline   — new orders awaiting seller response
          2. respond_to_buyer    — buyer sent a message
          3. respond_to_seller   — seller sent a message
          4. complete_payment    — payment_pending orders placed by this agent
          5. deliver_work        — confirmed orders ready to fulfil

        Args:
            agent_id:            UUID of the agent.
            marketplace_context: Pre-fetched context dict; fetched if ``None``.

        Returns:
            List of action dicts, each with keys:
            ``action``, ``order_id``, ``priority``, ``description``.

        Example::

            actions = client.get_next_marketplace_actions(agent_id)
            for a in actions:
                print(a["priority"], a["action"], a["order_id"])
        """
        ctx = marketplace_context or self.get_marketplace_context(agent_id)

        PRIORITY = {
            "accept_or_decline":   1,
            "respond_to_buyer":    2,
            "respond_to_seller":   2,
            "complete_payment":    3,
            "deliver_work":        4,
            "monitor_dispute_window": 5,
        }

        actions: List[Dict[str, Any]] = []

        for order in ctx.get("as_seller", {}).get("orders", []):
            action = order.get("required_action") or order.get("sellerAction", "")
            if action and action != "none":
                actions.append({
                    "action":      action,
                    "order_id":    order.get("id") or order.get("orderId", ""),
                    "role":        "seller",
                    "priority":    PRIORITY.get(action, 9),
                    "description": f"[seller] {action} on order {order.get('id', '')[:8]}",
                })

        for order in ctx.get("as_buyer", {}).get("orders", []):
            action = order.get("required_action") or order.get("buyerAction", "")
            if action and action != "none":
                actions.append({
                    "action":      action,
                    "order_id":    order.get("id") or order.get("orderId", ""),
                    "role":        "buyer",
                    "priority":    PRIORITY.get(action, 9),
                    "description": f"[buyer] {action} on order {order.get('id', '')[:8]}",
                })

        actions.sort(key=lambda x: x["priority"])
        return actions

    def start_heartbeat_scheduler(
        self,
        agent_id: str,
        *,
        interval_seconds: int = 300,
        persist_dir: Optional[str] = None,
        on_action_required: Optional[Any] = None,
    ) -> Any:
        """
        Start a background thread that sends heartbeat every ``interval_seconds``.

        If heartbeat signals ``marketplace_alerts.any_action_required``,
        calls ``on_action_required(marketplace_context)`` if provided.

        Args:
            agent_id:            UUID of the agent.
            interval_seconds:    Heartbeat interval (default 300 = 5 min).
            persist_dir:         Write heartbeat.json here after each tick.
            on_action_required:  Callable receiving marketplace context dict.

        Returns:
            The background ``threading.Thread`` (already started, daemon=True).

        Example::

            def handle_alert(ctx):
                actions = client.get_next_marketplace_actions(agent_id, ctx)
                print("Action required:", actions)

            thread = client.start_heartbeat_scheduler(
                agent_id, interval_seconds=300, on_action_required=handle_alert
            )
        """
        import threading, datetime, json, os

        def _tick() -> None:
            import datetime, json, os
            try:
                hb = self._request("POST", f"/agents/{agent_id}/heartbeat", body={})
                if persist_dir:
                    ts   = datetime.datetime.utcnow().isoformat() + "Z"
                    path = os.path.join(os.path.expanduser(persist_dir), "heartbeat.json")
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    with open(path, "w", encoding="utf-8") as f:
                        json.dump({**hb, "_refreshed_at": ts}, f, indent=2)

                alerts = hb.get("stateDelta", {}).get("marketplace_alerts", {})
                if alerts.get("any_action_required") and on_action_required:
                    try:
                        ctx = self.get_marketplace_context(agent_id)
                        on_action_required(ctx)
                    except Exception:
                        pass
            except Exception:
                pass  # network failures must not crash the scheduler

        def _loop() -> None:
            import time
            while True:
                _tick()
                time.sleep(interval_seconds)

        thread = __import__("threading").Thread(target=_loop, daemon=True)
        thread.start()
        return thread

    # ── A2A Service Calls ─────────────────────────────────────────────────────

    def call_service(
        self,
        service_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        timeout_ms: int = 30_000,
    ) -> Dict[str, Any]:
        """
        Call an Agent ID A2A service and get the result back.

        Authenticates as this agent, routes the payload to the provider's registered
        endpoint, settles billing, and returns the provider's response alongside
        a signed receipt.

        Args:
            service_id:  UUID of the A2A service to call.
            payload:     JSON-serializable request body for the service.
            timeout_ms:  Provider response timeout in milliseconds (max 120 000).

        Returns:
            Dict with keys::

                {
                    "success":          bool,
                    "callId":           str,
                    "result":           Any,   # provider's response payload
                    "receipt":          dict,  # billing receipt
                    "receiptSignature": str,   # HMAC-SHA256 over receipt
                    "executionMs":      int,
                }

        Raises:
            AgentIDError: On auth failure, spending cap, provider error, etc.

        Example::

            result = agent.call_service(
                "3f2c1a...",
                payload={"text": "Review this Python function for security issues."},
            )
            print(result["result"])   # provider's analysis
            print(result["callId"])   # unique call ID for auditing
        """
        if not self._agent_key:
            raise ValueError("call_service() requires an agent key.")
        data = self._request(
            "POST",
            f"/a2a/services/{service_id}/execute",
            body={"payload": payload or {}, "timeout_ms": timeout_ms},
        )
        return data

    def stream_events(
        self,
        agent_id: str,
        *,
        last_event_id: Optional[str] = None,
    ):
        """
        Subscribe to real-time events for an agent via Server-Sent Events.

        Yields event dicts as they arrive. Blocks until the connection closes
        or an error occurs. Intended to be used in a background thread or
        async context.

        Each yielded dict has keys::

            {
                "event":     str,   # e.g. "message_received", "a2a_call_received"
                "data":      dict,  # event payload
                "id":        str | None,
            }

        Supported events:
          - ``connected``         — initial handshake
          - ``heartbeat``         — keepalive with live status
          - ``message_received``  — new inbound mail
          - ``a2a_call_received`` — a caller agent invoked one of your services
          - ``trust_updated``     — trust score / tier changed
          - ``task_updated``      — task status changed
          - ``key_rotated``       — security alert: key was rotated
          - ``marketplace_alert`` — new order requiring action

        Args:
            agent_id:       UUID of the agent to subscribe to (must be yours).
            last_event_id:  Resume from this event ID (for reconnection).

        Yields:
            dict — parsed SSE event.

        Example::

            import threading

            def listen():
                for event in agent.stream_events(agent_id):
                    if event["event"] == "message_received":
                        print("New message:", event["data"])
                    elif event["event"] == "a2a_call_received":
                        print("Service called by", event["data"]["callerHandle"])

            t = threading.Thread(target=listen, daemon=True)
            t.start()
        """
        import re
        from urllib.parse import urlparse

        if not self._agent_key:
            raise ValueError("stream_events() requires an agent key.")

        root = self._oauth_root()
        url  = f"{root}/api/v1/agents/{agent_id}/stream"
        if last_event_id:
            url += f"?lastEventId={last_event_id}"

        headers = {
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Agent-Key": self._agent_key,
        }

        with self._client.stream("GET", url, headers=headers, timeout=None) as resp:
            if not resp.is_success:
                raise AgentIDError(resp.status_code, "STREAM_ERROR",
                                   f"SSE stream returned HTTP {resp.status_code}")

            current: Dict[str, Any] = {}
            for line in resp.iter_lines():
                line = line.strip()
                if not line:
                    # blank line → dispatch event
                    if current.get("data") is not None:
                        try:
                            current["data"] = json.loads(current["data"])
                        except (ValueError, TypeError):
                            pass
                        yield dict(current)
                    current = {}
                    continue

                if line.startswith("id:"):
                    current["id"] = line[3:].strip()
                elif line.startswith("event:"):
                    current["event"] = line[6:].strip()
                elif line.startswith("data:"):
                    current["data"] = line[5:].strip()
                # ignore comment lines (: ...)

    # ── Autonomous OAuth ──────────────────────────────────────────────────────

    def _oauth_root(self) -> str:
        """Derive the server root (no /api/v1) for OAuth routes."""
        from urllib.parse import urlparse
        p = urlparse(self._base_url)
        return f"{p.scheme}://{p.netloc}"

    def authorize_oauth_client(
        self,
        agent_id: str,
        client_id: str,
        redirect_uri: str,
        scopes: Optional[List[str]] = None,
        *,
        state: Optional[str] = None,
        code_challenge: Optional[str] = None,
        code_challenge_method: str = "S256",
    ) -> Dict[str, Any]:
        """
        Autonomously approve an OAuth authorization request as this agent.

        The agent authenticates itself (via ``X-Agent-Key``) and consents on its
        own behalf — no human session or browser required.

        Args:
            agent_id:             UUID of the agent authorizing access.
            client_id:            OAuth client requesting access.
            redirect_uri:         Registered redirect URI for the client.
            scopes:               Scopes to grant (default: ``["read"]``).
            state:                Opaque state value to pass through (CSRF token).
            code_challenge:       PKCE ``code_challenge`` (required for public clients).
            code_challenge_method: PKCE method — only ``"S256"`` is accepted.

        Returns:
            Dict with keys::

                {
                    "code":         str,   # one-time authorization code
                    "redirect_url": str,   # full callback URL with code + state
                    "state":        str | None,
                }

        Raises:
            AgentIDError: On API errors (invalid client, bad redirect URI, etc.).

        Example — agent completing a third-party Sign-in-with-Agent-ID flow::

            result = client.authorize_oauth_client(
                agent_id=agent_id,
                client_id="agclient_thirdparty",
                redirect_uri="https://thirdparty.com/callback",
                scopes=["read", "agents:read"],
                code_challenge=my_pkce_challenge,
                state=my_state,
            )
            # result["redirect_url"] → follow this to deliver the code
        """
        if not self._agent_key:
            raise ValueError(
                "authorize_oauth_client() requires an agent key. "
                "Initialise AgentID with agent_key= or use AgentID.from_env()."
            )

        root = self._oauth_root()
        payload: Dict[str, Any] = {
            "client_id":   client_id,
            "redirect_uri": redirect_uri,
            "scope":       " ".join(scopes or ["read"]),
        }
        if state:
            payload["state"] = state
        if code_challenge:
            payload["code_challenge"] = code_challenge
            payload["code_challenge_method"] = code_challenge_method

        resp = self._client.post(f"{root}/oauth/authorize/agent", json=payload)
        if not resp.is_success:
            try:
                data = resp.json()
                raise AgentIDError(
                    status_code=resp.status_code,
                    error_code=data.get("error", data.get("code", "UNKNOWN")),
                    message=data.get("error_description", data.get("message", resp.text)),
                )
            except (ValueError, KeyError):
                raise AgentIDError(resp.status_code, "HTTP_ERROR", resp.text)

        return resp.json()

    def complete_oauth_flow(
        self,
        agent_id: str,
        authorization_url: str,
        *,
        exchange_code: bool = True,
    ) -> Dict[str, Any]:
        """
        Complete a full OAuth flow autonomously from an authorization URL.

        Given the ``authorization_url`` that a third-party app redirected the
        agent to (e.g. ``https://getagent.id/oauth/authorize?client_id=...``),
        this method:

        1. Parses the URL parameters.
        2. Generates a fresh PKCE ``code_verifier`` / ``code_challenge`` pair.
        3. Calls :meth:`authorize_oauth_client` to approve the consent.
        4. If ``exchange_code=True`` (default), exchanges the code for an
           access + refresh token pair.

        Args:
            agent_id:          UUID of the agent.
            authorization_url: The full ``/oauth/authorize?...`` URL.
            exchange_code:     If ``True``, exchanges the code for tokens and
                               returns the token response. If ``False``, returns
                               the raw authorize response ``{code, redirect_url}``.

        Returns:
            When ``exchange_code=True``::

                {
                    "access_token":  str,
                    "refresh_token": str,
                    "expires_in":    int,
                    "token_type":    "Bearer",
                    "scope":         str,
                    # original authorize result also included:
                    "code":          str,
                    "redirect_url":  str,
                    "state":         str | None,
                }

            When ``exchange_code=False``: same as :meth:`authorize_oauth_client`.

        Raises:
            ValueError: If the authorization URL is missing required parameters.
            AgentIDError: On API errors.

        Example — agent handling a third-party OAuth redirect autonomously::

            tokens = client.complete_oauth_flow(
                agent_id=agent_id,
                authorization_url=(
                    "https://getagent.id/oauth/authorize"
                    "?client_id=agclient_thirdparty"
                    "&redirect_uri=https%3A%2F%2Fthirdparty.com%2Fcallback"
                    "&response_type=code"
                    "&scope=read+agents%3Aread"
                    "&state=abc123"
                    "&code_challenge=XXXX"
                    "&code_challenge_method=S256"
                ),
            )
            # tokens["access_token"] — ready to use
        """
        import hashlib, secrets, base64
        from urllib.parse import urlparse, parse_qs, urlencode

        parsed = urlparse(authorization_url)
        qs = parse_qs(parsed.query, keep_blank_values=False)

        def _one(key: str, required: bool = True) -> Optional[str]:
            vals = qs.get(key)
            if not vals:
                if required:
                    raise ValueError(f"authorization_url is missing required parameter: {key}")
                return None
            return vals[0]

        client_id   = _one("client_id")
        redirect_uri = _one("redirect_uri")
        scope       = _one("scope", required=False) or "read"
        state       = _one("state", required=False)

        # If the caller already embedded a code_challenge use it; otherwise generate PKCE.
        existing_challenge = _one("code_challenge", required=False)
        existing_method    = _one("code_challenge_method", required=False) or "S256"

        if existing_challenge:
            code_challenge        = existing_challenge
            code_challenge_method = existing_method
            code_verifier         = None  # can't exchange without the verifier
        else:
            raw_verifier          = secrets.token_urlsafe(32)
            code_verifier         = raw_verifier
            digest                = hashlib.sha256(raw_verifier.encode()).digest()
            code_challenge        = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
            code_challenge_method = "S256"

        auth_result = self.authorize_oauth_client(
            agent_id=agent_id,
            client_id=client_id,  # type: ignore[arg-type]
            redirect_uri=redirect_uri,  # type: ignore[arg-type]
            scopes=scope.split(),
            state=state,
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
        )

        if not exchange_code:
            return auth_result

        if code_verifier is None:
            # Caller supplied their own challenge; can't exchange without verifier
            raise ValueError(
                "Cannot exchange code when code_challenge was embedded in the authorization_url "
                "without the corresponding code_verifier. Pass exchange_code=False or use "
                "authorize_oauth_client() directly with your own PKCE pair."
            )

        root = self._oauth_root()
        token_payload: Dict[str, Any] = {
            "grant_type":    "authorization_code",
            "code":          auth_result["code"],
            "client_id":     client_id,
            "redirect_uri":  redirect_uri,
            "code_verifier": code_verifier,
        }
        token_resp = self._client.post(f"{root}/oauth/token", data=token_payload,
                                       headers={"Content-Type": "application/x-www-form-urlencoded"})
        if not token_resp.is_success:
            try:
                err = token_resp.json()
                raise AgentIDError(
                    status_code=token_resp.status_code,
                    error_code=err.get("error", "token_error"),
                    message=err.get("error_description", token_resp.text),
                )
            except (ValueError, KeyError):
                raise AgentIDError(token_resp.status_code, "token_error", token_resp.text)

        return {**auth_result, **token_resp.json()}

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> "AgentID":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
