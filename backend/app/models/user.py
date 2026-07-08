from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime, timezone

from app.core.database import Base

# this is the user model, this is the main schema input for the users table in the database.
# it includes fields for id, username, password hash, and created_at timestamp.

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    username = Column(String, unique=True, nullable=False)

    password_hash = Column(String, nullable=False)

    role = Column(String, default="user", nullable=False)

    # Temporary until full migration away from is_admin
    is_admin = Column(Boolean, default=False, nullable=False)

    is_approved = Column(Boolean, default=False, nullable=False)

    profile_image_path = Column(String, nullable=True)

    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    last_seen = Column(
        DateTime,
        nullable=True,
        default=datetime.utcnow
    )
