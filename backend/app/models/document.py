from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey

from datetime import datetime

from app.core.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)

    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    filename = Column(String, nullable=False)

    file_path = Column(String, nullable=False)

    status = Column(
        String,
        default="uploaded"
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )