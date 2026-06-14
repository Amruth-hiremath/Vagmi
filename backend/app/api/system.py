from pathlib import Path

from fastapi import APIRouter

from app.core.config import USERS_DIR
from app.core.database import engine


router = APIRouter(
    prefix="/system",
    tags=["System"]
)


@router.get("/health")
def health_check():
    database_status = False

    try:
        connection = engine.connect()
        connection.close()

        database_status = True

    except Exception:
        database_status = False

    storage_status = Path(
        USERS_DIR
    ).exists()

    return {
        "status": "healthy",
        "database": (
            "connected"
            if database_status
            else "disconnected"
        ),
        "storage": (
            "available"
            if storage_status
            else "missing"
        ),
        "version": "0.2"
    }