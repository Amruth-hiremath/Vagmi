from datetime import datetime, timezone

from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey

from app.core.database import Base


class DirectConversation(Base):
    __tablename__ = "direct_conversations"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    user1_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    user2_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    user1_cleared_at = Column(
        DateTime,
        nullable=True
    )

    user2_cleared_at = Column(
        DateTime,
        nullable=True
    )


    