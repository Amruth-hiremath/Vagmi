from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException

from sqlalchemy.orm import Session

from app.core.database import get_db

from app.core.security import (
    get_current_admin,
    hash_password
)

from app.core.validators import (
    validate_username,
    validate_password
)

from app.models.user import User

from app.schemas.auth import UserRegister

from app.services.storage_service import (
    create_user_workspace
)


router = APIRouter(
    prefix="/admin",
    tags=["Admin"]
)


@router.post("/users")
def create_user(
    user_data: UserRegister,
    current_admin: User = Depends(
        get_current_admin
    ),
    db: Session = Depends(get_db)
):
    validate_username(
        user_data.username
    )

    validate_password(
        user_data.password
    )

    existing_user = (
        db.query(User)
        .filter(
            User.username ==
            user_data.username
        )
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    user = User(
        username=user_data.username,
        password_hash=hash_password(
            user_data.password
        ),
        is_admin=False,
        must_change_password=True
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    create_user_workspace(
        user.id
    )

    return {
        "message":
            "User created successfully"
    }