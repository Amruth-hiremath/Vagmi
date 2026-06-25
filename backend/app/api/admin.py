from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.security import get_current_admin

from app.core.validators import (
    validate_username,
    validate_password
)

from app.models.user import User

from app.schemas.auth import UserRegister

from app.services.storage_service import (
    create_user_workspace,
    delete_user_workspace
)


router = APIRouter(
    prefix="/admin",
    tags=["Admin"]
)

def verify_admin(
    current_user: User
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Administrator access required."
        )

@router.get(
    "/pending-users"
)
def get_pending_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_admin(current_user)

    users = (
        db.query(User)
        .filter(User.is_approved.is_(False))
        .order_by(User.created_at.asc())
        .all()
    )

    return [
        {
            "id": user.id,
            "username": user.username
        }
        for user in users
    ]
@router.post(
    "/users/{user_id}/approve"
)
def approve_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_admin(current_user)

    user = (
        db.query(User)
        .filter(
            User.id == user_id
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if user.is_admin:
        raise HTTPException(
            status_code=400,
            detail="Administrator account cannot be approved."
        )

    if user.is_approved:
        raise HTTPException(
            status_code=400,
            detail="User is already approved."
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot approve your own account."
        )

    user.is_approved = True

    db.commit()
    create_user_workspace(user.id)

    return {
        "message": f"{user.username} approved successfully."
    }
@router.delete(
    "/users/{user_id}"
)
def reject_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_admin(current_user)

    user = (
        db.query(User)
        .filter(
            User.id == user_id
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if user.is_admin:
        raise HTTPException(
            status_code=400,
            detail="Administrator account cannot be deleted."
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own account."
        )

    delete_user_workspace(user.id)

    db.delete(user)
    db.commit()

    return {
        "message":
            f"{user.username} rejected successfully."
    }
@router.get(
    "/users"
)
def get_all_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_admin(current_user)

    users = (
        db.query(User)
        .order_by(User.username)
        .all()
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
            "is_approved": user.is_approved,
            "created_at": user.created_at
        }
        for user in users
    ]