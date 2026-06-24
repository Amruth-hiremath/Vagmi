from sqlalchemy import Column, Integer, String, DateTime,Boolean
from datetime import datetime

from app.core.database import Base

# this is the user model, this is the main schema input for the users table in the database.
# it includes fields for id, username, password hash, and created_at timestamp.
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    username = Column(String, unique=True, nullable=False)

    password_hash = Column(String, nullable=False)

    is_admin = Column(
    Boolean,
    default=False,
    nullable=False
    )
    must_change_password = Column(
        Boolean,
        default=False,
        nullable=False
    )
    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )