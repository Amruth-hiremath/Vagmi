from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from app.core.database import Base


class AiSession(Base):
    __tablename__ = "ai_sessions"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    routing_mode = Column(String, nullable=False, default="manual")
    selected_agent = Column(String, nullable=False, default="master")
    status = Column(String, nullable=False, default="idle")
    last_prompt = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    last_used_at = Column(DateTime, nullable=True)

    # Backward-compatible aliases for older code paths and cached UI payloads.
    @property
    def name(self):
        return self.title

    @name.setter
    def name(self, value):
        self.title = value

    @property
    def mode(self):
        return self.routing_mode

    @mode.setter
    def mode(self, value):
        self.routing_mode = value

    @property
    def agent(self):
        return self.selected_agent

    @agent.setter
    def agent(self, value):
        self.selected_agent = value

    @property
    def last_run_at(self):
        return self.last_used_at

    @last_run_at.setter
    def last_run_at(self, value):
        self.last_used_at = value
