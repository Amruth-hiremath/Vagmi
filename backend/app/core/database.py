from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import DATABASE_URL

# setup database engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# session management using SQLAlchemy's sessionmaker
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# base class for all database models, using SQLAlchemy's declarative system
Base = declarative_base()

# dependency function to get a database session for each request, ensuring proper cleanup after the request is done.
def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()