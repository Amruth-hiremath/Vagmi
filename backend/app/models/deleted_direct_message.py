from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import ForeignKey
from sqlalchemy import UniqueConstraint

from app.core.database import Base


class DeletedDirectMessage(Base):
    __tablename__ = "deleted_direct_messages"

    id = Column(Integer, primary_key=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    message_id = Column(
        Integer,
        ForeignKey("direct_messages.id"),
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "message_id"
        ),
    )