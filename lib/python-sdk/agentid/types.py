"""Pydantic models for the Agent ID SDK."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, HttpUrl


class Agent(BaseModel):
    id: str
    handle: str
    display_name: str
    description: Optional[str] = None
    endpoint_url: Optional[str] = None
    capabilities: List[str] = []
    protocols: List[str] = []
    auth_methods: List[str] = []
    trust_score: int = 0
    trust_tier: str = "unverified"
    verification_status: str = "unverified"
    is_public: bool = False
    status: str = "draft"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None
    is_sandbox: bool = False


class AgentRegistration(BaseModel):
    handle: str
    display_name: str
    description: Optional[str] = None
    endpoint_url: Optional[str] = None
    capabilities: List[str] = []
    scopes: List[str] = []
    protocols: List[str] = []
    auth_methods: List[str] = []
    payment_methods: List[str] = []
    is_public: bool = False
    metadata: Optional[Dict[str, Any]] = None


class ResolvedAgent(BaseModel):
    id: str
    handle: str
    display_name: str
    description: Optional[str] = None
    endpoint_url: Optional[str] = None
    capabilities: List[str] = []
    protocols: List[str] = []
    trust_score: int = 0
    trust_tier: str = "unverified"
    verification_status: str = "unverified"
    is_public: bool = True
    is_sandbox: bool = False


class Message(BaseModel):
    id: str
    from_agent_id: str
    to_agent_id: str
    content: str
    content_type: str = "text/plain"
    thread_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None


class InboxMessage(BaseModel):
    id: str
    from_agent_id: str
    content: str
    content_type: str = "text/plain"
    thread_id: Optional[str] = None
    read: bool = False
    created_at: Optional[datetime] = None


class Task(BaseModel):
    id: str
    from_agent_id: Optional[str] = None
    to_agent_id: str
    title: str
    description: Optional[str] = None
    status: str = "pending"
    priority: str = "normal"
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TaskStatus(BaseModel):
    task_id: str
    status: str
    updated_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None


class HeartbeatResult(BaseModel):
    agent_id: str
    status: str
    last_heartbeat_at: Optional[datetime] = None
    trust_score: Optional[int] = None


class TrustSignal(BaseModel):
    provider: str
    label: str
    score: int
    max_score: int


class TrustData(BaseModel):
    score: int
    tier: str
    signals: List[TrustSignal] = []


class ApiKeyInfo(BaseModel):
    id: str
    name: str
    key_prefix: str
    scopes: List[str] = []
    created_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
