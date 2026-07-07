from datetime import datetime
from datetime import timezone

from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import Text
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey
from sqlalchemy import String

from app.core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    room_id = Column(
        Integer,
        ForeignKey("rooms.id"),
        nullable=False
    )

    sender_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    message_type = Column(
        String,
        nullable=False,
        default="TEXT"
    )

    message_text = Column(
        Text,
        nullable=False
    )
    
    attachment_path = Column(
        String,
        nullable=True
    )

    original_filename = Column(
        String,
        nullable=True
    )

    caption = Column(
        Text,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc)
    )