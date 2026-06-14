from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import UserRegister
from app.schemas.auth import UserLogin
from app.schemas.auth import TokenResponse
from app.schemas.auth import UserResponse
from app.core.security import get_current_user
from app.core.security import hash_password
from app.core.security import verify_password
from app.core.security import create_access_token
from app.services.storage_service import create_user_workspace
from app.core.validators import (validate_username, validate_password)
from app.core.logging_config import logger

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

@router.post("/register")
def register(
    user_data: UserRegister,
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
            User.username == user_data.username
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
        )
    )

    db.add(user)

    db.commit()

    db.refresh(user)

    logger.info(f"User registered: {user.username}")

    create_user_workspace(
        user.id
    )

    return {
        "message": "User registered successfully"
    }
    

@router.post(
    "/login",
    response_model=TokenResponse
)
def login(
    user_data: UserLogin,
    db: Session = Depends(get_db)
):
    user = (
        db.query(User)
        .filter(
            User.username == user_data.username
        )
        .first()
    )

    if not user:
        logger.warning(
            f"Failed login attempt for username: "
            f"{user_data.username}"
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    if not verify_password(
        user_data.password,
        user.password_hash
    ):
        logger.warning(
            f"Failed login attempt for username: "
            f"{user_data.username}"
        )
        
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    token = create_access_token(
        {
            "sub": str(user.id)
        }
    )

    logger.info(
        f"User logged in: {user.username}"
    )

    return {
        "access_token": token,
        "token_type": "bearer"
    }

@router.get(
    "/me",
    response_model=UserResponse
)
def get_me(
    current_user: User = Depends(get_current_user)
):
    return current_user