from datetime import datetime
from datetime import timezone

from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey

from app.core.database import Base


class RoomMember(Base):
    __tablename__ = "room_members"

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

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    joined_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    last_read_at = Column(
        DateTime,
        nullable=True
    )

    cleared_at = Column(
        DateTime,
        nullable=True
    )