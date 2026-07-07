from pathlib import Path
import mimetypes

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import USERS_DIR
from app.models.user import User
from app.models.attachment import Attachment
from app.models.message import Message
from app.schemas.attachment import AttachmentResponse
from app.services.room_service import verify_room_membership
from app.services.message_service import create_message
from app.services.attachment_service import create_attachment, save_upload_file
from app.core.logging_config import logger

router = APIRouter(tags=["Chat"])
ATTACHMENT_SIZE_LIMIT = 50 * 1024 * 1024


@router.post("/rooms/{room_id}/attachments", response_model=AttachmentResponse)
def upload_attachment(
    room_id: int,
    file: UploadFile = File(...),
    caption: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_room_membership(room_id, current_user.id, db)

    room_attachment_dir = (
        USERS_DIR / f"user_{current_user.id}" / "room_attachments" / f"room_{room_id}"
    )
    file_path, original_name, file_size = save_upload_file(
        file=file,
        destination_dir=room_attachment_dir,
        max_size=ATTACHMENT_SIZE_LIMIT,
    )

    message = create_message(
        db=db,
        room_id=room_id,
        sender_id=current_user.id,
        message_text=original_name,
        message_type="FILE",
        caption=caption,
    )

    attachment = create_attachment(
        db=db,
        message_id=message.id,
        owner_id=current_user.id,
        original_filename=original_name,
        file_path=str(file_path),
        file_size=file_size,
    )

    # Keep the message row and attachment row in sync so both the
    # message download endpoint and the attachment endpoint remain usable.
    message.attachment_path = str(file_path)
    message.original_filename = original_name
    db.commit()
    db.refresh(message)

    logger.info("Attachment uploaded: %s", original_name)
    return attachment


@router.get("/attachments/{attachment_id}")
def download_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    message = db.query(Message).filter(Message.id == attachment.message_id).first()
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")

    verify_room_membership(message.room_id, current_user.id, db)

    file_path = Path(attachment.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    logger.info("Attachment downloaded: %s", attachment.original_filename)
    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(
        path=str(file_path),
        filename=attachment.original_filename or file_path.name,
        media_type=media_type or "application/octet-stream",
    )
