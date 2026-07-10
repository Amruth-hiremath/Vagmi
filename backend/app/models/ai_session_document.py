from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, Integer, DateTime, ForeignKey
from app.core.database import Base


class AiSessionDocument(Base):
    __tablename__ = "ai_session_documents"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("ai_sessions.id"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
