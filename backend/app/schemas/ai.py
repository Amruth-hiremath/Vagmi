from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AiSessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    name: str | None = Field(default=None, max_length=120)
    routing_mode: str | None = None
    mode: str | None = None
    selected_agent: str | None = None
    agent: str | None = None


class AiSessionUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=120)
    name: Optional[str] = Field(default=None, max_length=120)
    routing_mode: Optional[str] = None
    mode: Optional[str] = None
    selected_agent: Optional[str] = None
    agent: Optional[str] = None
    status: Optional[str] = None


class AiSessionDocumentsUpdate(BaseModel):
    document_ids: list[int] = Field(default_factory=list)


class AiChatRequest(BaseModel):
    session_id: int
    prompt: str = Field(min_length=1)
    routing_mode: Optional[str] = None
    selected_agent: Optional[str] = None


class AiSessionMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    agent_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AiSessionDocumentResponse(BaseModel):
    id: int
    filename: str
    status: str
    created_at: datetime
    selected: bool = False

    class Config:
        from_attributes = True


class AiSessionResponse(BaseModel):
    id: int
    title: str
    routing_mode: str
    selected_agent: str
    status: str
    last_prompt: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_used_at: Optional[datetime] = None
    selected_document_count: int = 0
    message_count: int = 0
    artifact_count: int = 0
    selected_documents: list[AiSessionDocumentResponse] = Field(default_factory=list)
    messages: list[AiSessionMessageResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class AiChatResponse(BaseModel):
    session: AiSessionResponse
    routed_agent: str
    routing_mode: str
    confidence: float
    needs_clarification: bool = False
    reply: str
    sources: list[str] = Field(default_factory=list)
    artifact_type: Optional[str] = None
    artifact_title: Optional[str] = None


class AiSessionArtifactResponse(BaseModel):
    id: int
    title: str
    artifact_type: str
    content: Optional[str] = None
    file_path: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AiSessionContextResponse(BaseModel):
    session_id: int
    title: str
    routing_mode: str
    selected_agent: str
    status: str
    last_prompt: Optional[str] = None
    prompt: Optional[str] = None
    document_count: int = 0
    message_count: int = 0
    documents: list[AiSessionDocumentResponse] = Field(default_factory=list)
    selected_documents: list[AiSessionDocumentResponse] = Field(default_factory=list)
    recent_messages: list[AiSessionMessageResponse] = Field(default_factory=list)


class AiStatusResponse(BaseModel):
    enabled: bool
    offline_only: bool
    model_policy: str
    ready: bool
    session_count: int
    local_model_available: bool = False
    model_path: Optional[str] = None
