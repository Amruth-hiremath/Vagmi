from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User

from app.schemas.auth import (
    UserRegister,
    UserLogin,
    TokenResponse,
    UserResponse,
    ChangePasswordRequest,
    MessageResponse
)
from app.core.security import (
    get_current_user,
    hash_password,
    verify_password,
    create_access_token
)

from app.services.storage_service import create_user_workspace

from app.core.validators import (
    validate_username,
    validate_password
)

from app.core.logging_config import logger

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

# ------------------------------------------------------------------
# Register
# ------------------------------------------------------------------
@router.post("/register")
def register(
    user_data: UserRegister,
    db: Session = Depends(get_db)
):
    validate_username(user_data.username)
    validate_password(user_data.password)

    existing_user = (
        db.query(User)
        .filter(User.username == user_data.username)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    # First registered user becomes Owner
    user_count = db.query(User).count()
    is_first_user = user_count == 0

    user = User(
        username=user_data.username,
        password_hash=hash_password(user_data.password),

        role="owner" if is_first_user else "user",

        # Temporary backward compatibility
        is_admin=is_first_user,

        # Owner is auto approved
        is_approved=is_first_user
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # Create workspace immediately for Owner
    if user.role == "owner":
        create_user_workspace(user.id)

        logger.info(
            f"Owner account created: {user.username}"
        )

        return {
            "message": "Owner account created successfully."
        }

    logger.info(
        f"User registered: {user.username}"
    )

    return {
        "message": (
            "Registration submitted. "
            "Await administrator approval."
        )
    }
# ------------------------------------------------------------------
# Login
# ------------------------------------------------------------------
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

    if not user.is_approved:
        logger.warning(
            f"Login attempt by unapproved user: "
            f"{user.username}"
        )

        raise HTTPException(
            status_code=403,
            detail="Your account is awaiting administrator approval."
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

# ------------------------------------------------------------------
# Change Password
# ------------------------------------------------------------------
@router.post(
    "/change-password",
    response_model=MessageResponse
)
def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(
        password_data.current_password,
        current_user.password_hash
    ):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect"
        )

    validate_password(
        password_data.new_password
    )

    current_user.password_hash = hash_password(
        password_data.new_password
    )

    db.commit()

    logger.info(
        f"Password changed for user: "
        f"{current_user.username}"
    )

    return {
        "message": "Password changed successfully"
    }
# ------------------------------------------------------------------
# Current User
# ------------------------------------------------------------------
@router.get(
    "/me",
    response_model=UserResponse
)
def get_me(
    current_user: User = Depends(get_current_user)
):
    return current_user