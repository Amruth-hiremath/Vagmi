from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user

from app.core.permissions import (
    require_admin,
    require_owner,
    OWNER,
    ADMIN,
)

from app.models.user import User

from app.services.storage_service import (
    create_user_workspace,
    delete_user_workspace,
)


router = APIRouter(
    prefix="/admin",
    tags=["Admin"]
)

@router.get("/pending-users")
def get_pending_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_admin(current_user)

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
@router.post("/users/{user_id}/approve")
def approve_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_admin(current_user)

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if user.role in (OWNER, ADMIN):
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
@router.delete("/users/{user_id}")
def reject_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_admin(current_user)

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Owner can never be deleted
    if user.role == OWNER:
        raise HTTPException(
            status_code=403,
            detail="Owner account cannot be deleted."
        )

    # Only Owner can delete an Admin
    if user.role == ADMIN:
        require_owner(current_user)

    # Nobody can delete themselves
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own account."
        )

    delete_user_workspace(user.id)

    db.delete(user)
    db.commit()

    return {
        "message": f"{user.username} rejected successfully."
    }
@router.get("/users")
def get_all_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_admin(current_user)

    users = (
        db.query(User)
        .order_by(User.username)
        .all()
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "is_approved": user.is_approved,
            "created_at": user.created_at,
        }
        for user in users
    ]

@router.post("/users/{user_id}/make-admin")
def make_admin(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only the Owner can promote users
    require_owner(current_user)

    # Find the target user
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    # User must be approved
    if not user.is_approved:
        raise HTTPException(
            status_code=400,
            detail="User must be approved before becoming an admin."
        )

    # Owner cannot be promoted
    if user.role == OWNER:
        raise HTTPException(
            status_code=400,
            detail="Owner already has the highest privileges."
        )

    # Already an admin
    if user.role == ADMIN:
        raise HTTPException(
            status_code=400,
            detail="User is already an admin."
        )

    # Count current admins (excluding the Owner)
    admin_count = (
        db.query(User)
        .filter(User.role == ADMIN)
        .count()
    )

    if admin_count >= 5:
        raise HTTPException(
            status_code=400,
            detail="Maximum of 5 admins allowed."
        )

    # Promote the user
    user.role = ADMIN

    # Temporary backward compatibility
    user.is_admin = True

    db.commit()
    db.refresh(user)

    return {
        "message": f"{user.username} has been promoted to Admin.",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role
        }
    }

@router.post("/users/{user_id}/remove-admin")
def remove_admin(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only Owner can remove admins
    require_owner(current_user)

    # Find the target user
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    # Owner cannot be demoted
    if user.role == OWNER:
        raise HTTPException(
            status_code=400,
            detail="Owner cannot be demoted."
        )

    # User must currently be an admin
    if user.role != ADMIN:
        raise HTTPException(
            status_code=400,
            detail="User is not an admin."
        )

    # Demote
    user.role = "user"

    # Temporary backward compatibility
    user.is_admin = False

    db.commit()
    db.refresh(user)

    return {
        "message": f"{user.username} has been removed as Admin.",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role
        }
    }

@router.post("/users/{user_id}/transfer-ownership")
def transfer_ownership(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only the current Owner can transfer ownership
    require_owner(current_user)

    # Find the target user
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    # Cannot transfer ownership to yourself
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You are already the Owner."
        )

    # New owner must be an Admin
    if user.role != ADMIN:
        raise HTTPException(
            status_code=400,
            detail="Only an Admin can become the Owner."
        )

    # Demote current Owner to Admin
    current_user.role = ADMIN
    current_user.is_admin = True

    # Promote selected Admin to Owner
    user.role = OWNER
    user.is_admin = True

    db.commit()

    return {
        "message": f"{user.username} is now the Owner.",
        "current_user": {
            "id": current_user.id,
            "username": current_user.username,
            "role": current_user.role,
            "is_admin": current_user.is_admin,
            "is_approved": current_user.is_approved,
    }
}