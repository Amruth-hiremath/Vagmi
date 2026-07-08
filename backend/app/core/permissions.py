from fastapi import HTTPException
from app.models.user import User

OWNER = "owner"
ADMIN = "admin"
USER = "user"


def require_owner(current_user: User):
    if current_user.role != OWNER:
        raise HTTPException(
            status_code=403,
            detail="Owner access required."
        )


def require_admin(current_user: User):
    if current_user.role not in (OWNER, ADMIN):
        raise HTTPException(
            status_code=403,
            detail="Admin access required."
        )


def is_owner(current_user: User):
    return current_user.role == OWNER


def is_admin(current_user: User):
    return current_user.role in (OWNER, ADMIN)
