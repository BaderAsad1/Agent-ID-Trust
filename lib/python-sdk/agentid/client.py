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
        handle: str,
        display_name: str,
        *,
        description: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        capabilities: Optional[List[str]] = None,
        scopes: Optional[List[str]] = None,
        protocols: Optional[List[str]] = None,
        auth_methods: Optional[List[str]] = None,
        payment_methods: Optional[List[str]] = None,
        is_public: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Agent:
        """
        Register a new agent with the given handle.

        Args:
            handle: Unique agent handle (3–100 lowercase alphanumeric + hyphens).
            display_name: Human-readable name for the agent.
            description: Optional description.
            endpoint_url: HTTPS endpoint to receive inbound calls.
            capabilities: List of capability strings.
            scopes: Permission scopes.
            protocols: Supported protocols.
            auth_methods: Accepted authentication methods.
            payment_methods: Accepted payment methods.
            is_public: Whether to list on the public marketplace.
            metadata: Arbitrary key-value metadata.

        Returns:
            The created Agent object.
        """
        body: Dict[str, Any] = {
            "handle": handle,
            "displayName": display_name,
        }
        if description is not None:
            body["description"] = description
        if endpoint_url is not None:
            body["endpointUrl"] = endpoint_url
        if capabilities is not None:
            body["capabilities"] = capabilities
        if scopes is not None:
            body["scopes"] = scopes
        if protocols is not None:
            body["protocols"] = protocols
        if auth_methods is not None:
            body["authMethods"] = auth_methods
        if payment_methods is not None:
            body["paymentMethods"] = payment_methods
        if is_public:
            body["isPublic"] = is_public
        if metadata is not None:
            body["metadata"] = metadata

        data = self._request("POST", "/agents", body=body)
        return Agent(
            id=data["id"],
            handle=data["handle"],
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

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> "AgentID":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
