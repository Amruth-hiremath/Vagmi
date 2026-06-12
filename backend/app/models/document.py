from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import DateTime
from sqlalchemy import ForeignKey

from datetime import datetime, timezone

from app.core.database import Base

# this is the document model, this is the main schema input for the documents table in the database.
# it includes fields for id, owner_id, filename, file_path, status, and created_at timestamp.
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
        default=lambda: datetime.now(timezone.utc)
    )