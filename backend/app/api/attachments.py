from pathlib import Path
import shutil
import uuid

from fastapi import APIRouter
from fastapi import Depends
from fastapi import File
from fastapi import UploadFile
from fastapi import HTTPException

from fastapi.responses import FileResponse

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user

from app.core.config import USERS_DIR

from app.models.user import User
from app.models.attachment import Attachment
from app.models.message import Message

from app.core.constants import (
    ALLOWED_ATTACHMENT_EXTENSIONS
)

from app.schemas.attachment import (
    AttachmentResponse
)

from app.services.room_service import (
    verify_room_membership
)

from app.services.message_service import (
    create_message
)

from app.services.attachment_service import (
    create_attachment
)

from app.core.logging_config import logger


router = APIRouter(
    tags=["Attachments"]
)


ATTACHMENT_SIZE_LIMIT = 50 * 1024 * 1024


@router.post(
    "/rooms/{room_id}/attachments",
    response_model=AttachmentResponse
)
def upload_attachment(
    room_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_room_membership(
        room_id,
        current_user.id,
        db
    )

    user_attachment_dir = (
        USERS_DIR /
        f"user_{current_user.id}" /
        "attachments"
    )

    user_attachment_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    extension = Path(
        file.filename
    ).suffix.lower()

    if extension not in ALLOWED_ATTACHMENT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported attachment type"
        )

    unique_name = (
        f"{uuid.uuid4()}{extension}"
    )

    file_path = (
        user_attachment_dir /
        unique_name
    )

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(
            file.file,
            buffer
        )

    if file_path.stat().st_size > ATTACHMENT_SIZE_LIMIT:
        file_path.unlink()

        raise HTTPException(
            status_code=400,
            detail="File too large"
        )

    message = create_message(
        db=db,
        room_id=room_id,
        sender_id=current_user.id,
        message_text=f"Uploaded file: {file.filename}",
        message_type="FILE"
    )

    attachment = create_attachment(
        db=db,
        message_id=message.id,
        owner_id=current_user.id,
        original_filename=file.filename,
        file_path=str(file_path)
    )

    logger.info(
        f"Attachment uploaded: "
        f"{file.filename}"
    )

    return attachment


@router.get("/attachments/{attachment_id}")
def download_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    attachment = (
        db.query(Attachment)
        .filter(
            Attachment.id == attachment_id
        )
        .first()
    )

    if attachment is None:
        raise HTTPException(
            status_code=404,
            detail="Attachment not found"
        )

    message = (
        db.query(Message)
        .filter(
            Message.id == attachment.message_id
        )
        .first()
    )

    if message is None:
        raise HTTPException(
            status_code=404,
            detail="Message not found"
        )

    verify_room_membership(
        message.room_id,
        current_user.id,
        db
    )

    if not Path(attachment.file_path).exists():
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    logger.info(
        f"Attachment downloaded: "
        f"{attachment.original_filename}"
    )

    return FileResponse(
        path=attachment.file_path,
        filename=attachment.original_filename
    )