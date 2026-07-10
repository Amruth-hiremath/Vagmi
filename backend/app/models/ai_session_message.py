from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from app.core.database import Base


class AiSessionMessage(Base):
    __tablename__ = "ai_session_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("ai_sessions.id"), nullable=False, index=True)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    agent_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Compatibility aliases.
    @property
    def sender_role(self):
        return self.role

    @sender_role.setter
    def sender_role(self, value):
        self.role = value

    @property
    def message_text(self):
        return self.content

    @message_text.setter
    def message_text(self, value):
        self.content = value

    @property
    def agent(self):
        return self.agent_name

    @agent.setter
    def agent(self, value):
        self.agent_name = value
