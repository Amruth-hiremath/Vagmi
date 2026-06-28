from __future__ import annotations

import mimetypes
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import USERS_DIR
from app.core.constants import ALLOWED_IMAGE_EXTENSIONS, MAX_IMAGE_SIZE
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.user import UserSearchResponse
from app.services.storage_service import create_user_workspace


router = APIRouter(
    prefix="/users",
    tags=["Users"]
)


def _user_profile_dir(user_id: int) -> Path:
    return USERS_DIR / f"user_{user_id}" / "profile"


def _profile_image_path(user_id: int) -> Path | None:
    user_dir = _user_profile_dir(user_id)
    if not user_dir.exists():
        return None
    for candidate in sorted(user_dir.iterdir()):
        if candidate.is_file():
            return candidate
    return None


def _save_profile_image(file: UploadFile, user_id: int) -> tuple[str, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Invalid image file")

    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image format")

    profile_dir = _user_profile_dir(user_id)
    profile_dir.mkdir(parents=True, exist_ok=True)

    # Remove previous profile images so the folder stays clean.
    for old_file in profile_dir.glob("*"):
        try:
            old_file.unlink(missing_ok=True)
        except Exception:
            pass

    unique_name = f"profile-{uuid.uuid4()}{extension}"
    file_path = profile_dir / unique_name

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if file_path.stat().st_size > MAX_IMAGE_SIZE:
        try:
            file_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Image too large")

    return str(file_path), file.filename


@router.get(
    "/search",
    response_model=list[UserSearchResponse]
)
def search_users(
    query: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    users_query = (
        db.query(User)
        .filter(
            User.id != current_user.id,
            User.is_approved.is_(True)
        )
    )

    if query and query.strip():
        users_query = users_query.filter(
            User.username.ilike(
                f"%{query.strip()}%"
            )
        )

    users = (
        users_query
        .order_by(User.username)
        .limit(50)
        .all()
    )

    return users


@router.get(
    "/me/profile-image"
)
def get_my_profile_image(
    current_user: User = Depends(get_current_user)
):
    image_path = _profile_image_path(current_user.id)
    if image_path is None or not image_path.exists():
        raise HTTPException(status_code=404, detail="Profile image not found")

    media_type, _ = mimetypes.guess_type(str(image_path))
    return FileResponse(
        path=str(image_path),
        filename=image_path.name,
        media_type=media_type or "application/octet-stream",
    )


@router.post(
    "/me/profile-image",
    response_model=UserSearchResponse
)
def upload_my_profile_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    create_user_workspace(current_user.id)
    file_path, _ = _save_profile_image(file, current_user.id)
    current_user.profile_image_path = file_path
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get(
    "/{user_id}/profile-image"
)
def get_profile_image(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Keep this authenticated so avatars only load inside the workspace.
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not target.is_approved:
        raise HTTPException(status_code=403, detail="Access denied")

    image_path = _profile_image_path(user_id)
    if image_path is None or not image_path.exists():
        raise HTTPException(status_code=404, detail="Profile image not found")

    media_type, _ = mimetypes.guess_type(str(image_path))
    return FileResponse(
        path=str(image_path),
        filename=image_path.name,
        media_type=media_type or "application/octet-stream",
    )
