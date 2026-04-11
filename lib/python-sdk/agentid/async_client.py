"""Agent ID Python SDK — async client."""

from __future__ import annotations

import json
import os
import datetime
from typing import Any, Dict, List, Optional

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
    InboxMessage,
    HeartbeatResult,
    TrustData,
    TrustSignal,
)
from .client import AgentIDError, DEFAULT_BASE_URL


class AsyncAgentID:
    """
    Async Agent ID SDK client backed by ``httpx.AsyncClient``.

    Usage::

        import asyncio
        from agentid import AsyncAgentID

        async def main():
            # Use as an async context manager (recommended)
            async with AsyncAgentID.init(api_key="aid_...") as client:
                agent = await client.whoami()

            # Or manage lifecycle manually
            client = AsyncAgentID.init(api_key="aid_...")
            try:
                agent = await client.whoami()
            finally:
                await client.aclose()

        asyncio.run(main())
    """

    _instance: Optional["AsyncAgentID"] = None

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

        self._client = httpx.AsyncClient(
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
    ) -> "AsyncAgentID":
        """
        Create (and store as global singleton) an async AgentID client.

        Returns:
            The initialized AsyncAgentID client. Call ``await client.aclose()``
            when done, or use ``async with AsyncAgentID.init(...) as client:``.
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

    # ------------------------------------------------------------------
    # Context-manager support
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "AsyncAgentID":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close the underlying HTTP client and release connections."""
        await self._client.aclose()

    # ------------------------------------------------------------------
    # Internal request helper
    # ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        response = await self._client.request(
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

    # ------------------------------------------------------------------
    # Public API — mirrors AgentID (sync) method-for-method
    # ------------------------------------------------------------------

    async def register_agent(
        self,
        display_name: str,
        public_key: str,
        *,
        handle: Optional[str] = None,
        description: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        capabilities: Optional[List[str]] = None,
        key_type: str = "ed25519",
    ) -> AgentRegistration:
        """
        Register a new agent (phase 1 of the two-phase bootstrap).

        Returns an ``AgentRegistration`` containing the challenge. Call
        ``await verify_agent(...)`` to complete activation.
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

        data = await self._request("POST", "/programmatic/agents/register", body=body)
        return AgentRegistration(
            agent_id=data["agentId"],
            kid=data["kid"],
            challenge=data["challenge"],
            expires_at=data.get("expiresAt"),
            handle=data.get("handle"),
            provisional_domain=data.get("provisionalDomain"),
        )

    async def verify_agent(
        self,
        agent_id: str,
        challenge: str,
        signature: str,
        kid: str,
    ) -> Agent:
        """
        Complete two-phase registration by verifying the challenge signature.

        Args:
            agent_id: UUID returned from ``register_agent()``.
            challenge: Challenge string returned from ``register_agent()``.
            signature: Ed25519 signature over the challenge bytes (base64url).
            kid: Key ID returned from ``register_agent()``.

        Returns:
            The fully activated Agent object.
        """
        body: Dict[str, Any] = {
            "agentId": agent_id,
            "challenge": challenge,
            "signature": signature,
            "kid": kid,
        }
        data = await self._request("POST", "/programmatic/agents/verify", body=body)
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

    async def whoami(self) -> Agent:
        """Return the profile of the currently authenticated agent."""
        data = await self._request("GET", "/agents/whoami")
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

    async def resolve(self, handle: str) -> ResolvedAgent:
        """
        Resolve an agent by handle.

        Returns:
            ResolvedAgent with public profile data.
        """
        data = await self._request("GET", f"/resolve/{handle}")
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

    async def heartbeat(self, agent_id: str) -> HeartbeatResult:
        """
        Send a heartbeat for an agent to signal it is alive.

        Returns:
            HeartbeatResult with updated status.
        """
        data = await self._request("POST", f"/agents/{agent_id}/heartbeat", body={})
        return HeartbeatResult(
            agent_id=agent_id,
            status=data.get("status", "active"),
            last_heartbeat_at=data.get("lastHeartbeatAt"),
            trust_score=data.get("trustScore"),
        )

    async def get_trust(self, agent_id: str) -> TrustData:
        """
        Get the trust score and signal breakdown for an agent.

        Returns:
            TrustData with score (0-100), tier, and per-provider signal list.
        """
        data = await self._request("GET", f"/agents/{agent_id}/runtime")
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

    async def send_message(
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

        data = await self._request("POST", f"/mail/agents/{from_agent_id}/messages", body=payload)
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

    async def check_inbox(
        self,
        agent_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        unread_only: bool = False,
    ) -> List[InboxMessage]:
        """
        Retrieve inbox messages for an agent.

        Returns:
            List of InboxMessage objects.
        """
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if unread_only:
            params["unread"] = "true"

        data = await self._request("GET", f"/mail/agents/{agent_id}/messages", params=params)
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

    async def send_task(
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

        data = await self._request("POST", "/tasks", body=body)
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

    async def get_identity_content(
        self,
        agent_id: Optional[str] = None,
        format: str = "generic",
    ) -> str:
        """
        Fetch the agent's identity file content.

        Args:
            agent_id: UUID of the agent. Defaults to the authenticated agent.
            format: One of ``"openclaw"``, ``"claude"``, ``"generic"``, or ``"json"``.

        Returns:
            The identity content as a string (markdown or JSON).
        """
        valid_formats = {"openclaw", "claude", "generic", "json"}
        if format not in valid_formats:
            raise ValueError(f"format must be one of {valid_formats}")

        if agent_id is None:
            agent = await self.whoami()
            agent_id = agent.id

        response = await self._client.request(
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

    async def write_identity_file(
        self,
        path: str,
        agent_id: Optional[str] = None,
        format: str = "generic",
    ) -> None:
        """
        Fetch the agent's identity content and write it to a file.

        Args:
            path: Filesystem path (e.g. ``"AGENTID.md"``).
            agent_id: UUID of the agent. Defaults to the authenticated agent.
            format: One of ``"openclaw"``, ``"claude"``, ``"generic"``, or ``"json"``.
        """
        content = await self.get_identity_content(agent_id=agent_id, format=format)
        expanded = os.path.expanduser(path)
        os.makedirs(os.path.dirname(os.path.abspath(expanded)), exist_ok=True)
        with open(expanded, "w", encoding="utf-8") as f:
            f.write(content)

    async def export_state(self, agent_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Export the agent's durable state as a dict.

        Returns:
            A dict with ``version``, ``base_url``, ``agent_id``, ``api_key``,
            ``did``, ``handle``, ``resolver_url``, ``profile_url``, and ``saved_at``.
        """
        if agent_id is None:
            agent = await self.whoami()
            agent_id = agent.id
            handle = agent.handle
        else:
            agent = await self.whoami()
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

    async def write_state_file(self, path: str, agent_id: Optional[str] = None) -> None:
        """
        Export the agent's durable state and write it to a JSON file.

        Args:
            path: Filesystem path (e.g. ``".agentid-state.json"``).
            agent_id: UUID of the agent. Auto-inferred if not provided.
        """
        state = await self.export_state(agent_id=agent_id)
        expanded = os.path.expanduser(path)
        os.makedirs(os.path.dirname(os.path.abspath(expanded)), exist_ok=True)
        with open(expanded, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)

    @classmethod
    def from_state(cls, state: Dict[str, Any]) -> "AsyncAgentID":
        """
        Restore an AsyncAgentID client from a previously exported state dict.

        Args:
            state: A dict previously returned by ``export_state()``.

        Returns:
            A configured AsyncAgentID client. Use as an async context manager
            or call ``await client.aclose()`` when done.

        Example::

            import json, asyncio
            from agentid import AsyncAgentID

            async def main():
                with open('.agentid-state.json') as f:
                    state = json.load(f)
                async with AsyncAgentID.from_state(state) as client:
                    agent = await client.whoami()

            asyncio.run(main())
        """
        if state.get("version") != 1:
            raise ValueError(f"Unsupported state version: {state.get('version')}. Expected 1.")
        api_key = state.get("api_key", "")
        return cls(
            agent_key=api_key if api_key.startswith("agk_") else None,
            api_key=api_key if not api_key.startswith("agk_") else None,
            base_url=state.get("base_url", DEFAULT_BASE_URL),
        )
