from datetime import datetime, timezone

from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey

from app.core.database import Base


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    conversation_id = Column(
        Integer,
        ForeignKey("direct_conversations.id"),
        nullable=False
    )

    sender_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    message_text = Column(
        String,
        nullable=False
    )

    message_type = Column(
        String,
        nullable=False,
        default="TEXT"
    )

    attachment_path = Column(
        String,
        nullable=True
    )

    original_filename = Column(
        String,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc)
    )
    delivered_at = Column(
        DateTime,
        nullable=True
    )

    seen_at = Column(
        DateTime,
        nullable=True
    )