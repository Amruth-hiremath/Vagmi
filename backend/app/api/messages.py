from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi import Depends
from fastapi.responses import FileResponse
import mimetypes

from sqlalchemy.orm import Session

from datetime import datetime
from datetime import timezone

from pathlib import Path

from app.core.database import get_db
from app.core.security import get_current_user

from app.models.user import User
from app.models.message import Message
from app.models.attachment import Attachment
from app.models.deleted_room_message import DeletedRoomMessage
from app.models.room_member import RoomMember

from app.schemas.message import (
    MessageCreate,
    MessageResponse
)
from app.core.validators import (
    validate_message
)
from app.services.message_service import create_message
from app.services.attachment_service import create_attachment

from app.services.room_service import (
    verify_room_membership
)
from app.services.image_service import save_image
from app.services.voice_service import save_voice

from app.core.logging_config import logger
from app.models.room_member import RoomMember

router = APIRouter(
    prefix="/rooms",
    tags=["Chat"]
)


@router.post(
    "/{room_id}/messages",
    response_model=MessageResponse
)
def send_message(
    room_id: int,
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_room_membership(
        room_id,
        current_user.id,
        db
    )
    validate_message(
        message_data.message_text
    )

    message = create_message(
        db=db,
        room_id=room_id,
        sender_id=current_user.id,
        message_text=message_data.message_text
    )
    logger.info(
        f"Message sent in room "
        f"{room_id} by user "
        f"{current_user.username}"
    )

    return {
        "id": message.id,
        "room_id": message.room_id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "message_text": message.message_text,
        "message_type": message.message_type,
        "attachment_path": message.attachment_path,
        "original_filename": message.original_filename,
        "caption": message.caption,
        "created_at": message.created_at
    }


@router.post(
    "/{room_id}/image",
    response_model=MessageResponse
)
@router.post(
    "/room/{room_id}/image",
    response_model=MessageResponse
)
def send_image_message(
    room_id: int,
    file: UploadFile = File(...),
    caption: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    room_member = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == current_user.id
        )
        .first()
    )

    if not room_member:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    image_path, original_name = save_image(
        file=file,
        user_id=current_user.id
    )

    message = Message(
        room_id=room_id,
        sender_id=current_user.id,
        message_text="",
        message_type="IMAGE",
        attachment_path=image_path,
        original_filename=original_name,
        caption=caption
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    image_file_size = Path(image_path).stat().st_size if Path(image_path).exists() else None
    attachment = create_attachment(
        db=db,
        message_id=message.id,
        owner_id=current_user.id,
        original_filename=original_name,
        file_path=str(image_path),
        file_size=image_file_size,
    )

    return {
        "id": message.id,
        "room_id": room_id,
        "sender_id": current_user.id,
        "sender_username": current_user.username,
        "message_text": "",
        "message_type": "IMAGE",
        "attachment_path": image_path,
        "original_filename": original_name,
        "file_size": image_file_size,
        "caption": message.caption,
        "created_at": message.created_at
    }

@router.post(
    "/{room_id}/voice",
    response_model=MessageResponse
)
@router.post(
    "/room/{room_id}/voice",
    response_model=MessageResponse
)
def send_voice_message(
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

    voice_path, original_name = save_voice(
        file=file,
        user_id=current_user.id
    )

    message = Message(
        room_id=room_id,
        sender_id=current_user.id,
        message_text="",
        message_type="VOICE",
        attachment_path=voice_path,
        original_filename=original_name
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    voice_file_size = Path(voice_path).stat().st_size if Path(voice_path).exists() else None
    attachment = create_attachment(
        db=db,
        message_id=message.id,
        owner_id=current_user.id,
        original_filename=original_name,
        file_path=str(voice_path),
        file_size=voice_file_size,
    )

    return {
        "id": message.id,
        "room_id": message.room_id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "message_text": "",
        "message_type": "VOICE",
        "attachment_path": voice_path,
        "original_filename": original_name,
        "file_size": voice_file_size,
        "created_at": message.created_at
    }

@router.get(
    "/voice/{message_id}"
)
def get_room_voice_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = (
        db.query(Message)
        .filter(
            Message.id == message_id
        )
        .first()
    )

    if not message:
        raise HTTPException(
            status_code=404,
            detail="Message not found"
        )

    if message.message_type != "VOICE":
        raise HTTPException(
            status_code=400,
            detail="Not a voice message"
        )

    verify_room_membership(
        message.room_id,
        current_user.id,
        db
    )

    file_path = Path(message.attachment_path)

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Voice file not found"
        )

    media_type, _ = mimetypes.guess_type(
        str(file_path)
    )

    return FileResponse(
        path=str(file_path),
        filename=message.original_filename or file_path.name,
        media_type=media_type or "application/octet-stream"
    )


@router.get(
    "/{room_id}/messages",
    response_model=list[MessageResponse]
)
def get_messages(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_room_membership(
        room_id,
        current_user.id,
        db
    )

    hidden_message_ids = [
        row.message_id
        for row in db.query(
            DeletedRoomMessage.message_id
        )
        .filter(
            DeletedRoomMessage.user_id == current_user.id
        )
        .all()
    ]

    room_member = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == current_user.id
        )
        .first()
    )

    cleared_at = room_member.cleared_at if room_member else None

    messages = (
        db.query(Message)
        .filter(
            Message.room_id == room_id
        )
    )

    if hidden_message_ids:
        messages = messages.filter(
            ~Message.id.in_(hidden_message_ids)
        )

    if cleared_at:
        messages = messages.filter(
            Message.created_at > cleared_at
        )

    messages = messages.order_by(
        Message.created_at.asc()
    ).all()

    result = []

    for message in messages:
        sender = (
            db.query(User)
            .filter(User.id == message.sender_id)
            .first()
        )

        attachment = (
            db.query(Attachment)
            .filter(
                Attachment.message_id == message.id
            )
            .first()
        )

        attachment_path = message.attachment_path or (attachment.file_path if attachment else None)
        original_filename = message.original_filename or (attachment.original_filename if attachment else None)
        file_size = attachment.file_size if attachment else None

        result.append(
            {
                "id": message.id,
                "room_id": message.room_id,
                "sender_id": message.sender_id,
                "sender_username": sender.username if sender else "Unknown",
                "message_text": message.message_text,
                "message_type": message.message_type,
                "attachment_id": attachment.id if attachment else None,
                "attachment_path": attachment_path,
                "original_filename": original_filename,
                "file_size": file_size,
                "caption": message.caption,
                "created_at": message.created_at
            }
        )

    return result

@router.get(
    "/{room_id}/messages/{message_id}/attachment"
)
@router.get(
    "/room/{room_id}/message/{message_id}/attachment"
)
def download_room_message_attachment(
    room_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_room_membership(
        room_id,
        current_user.id,
        db
    )

    message = (
        db.query(Message)
        .filter(
            Message.id == message_id,
            Message.room_id == room_id
        )
        .first()
    )

    attachment = (
        db.query(Attachment)
        .filter(Attachment.message_id == message_id)
        .first()
    )

    file_path_value = message.attachment_path if message and message.attachment_path else None
    filename_value = message.original_filename if message and message.original_filename else None

    if attachment:
        file_path_value = file_path_value or attachment.file_path
        filename_value = filename_value or attachment.original_filename

    if not file_path_value:
        raise HTTPException(
            status_code=404,
            detail="Attachment not found"
        )

    file_path = Path(file_path_value)

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    media_type, _ = mimetypes.guess_type(str(file_path))

    return FileResponse(
        path=str(file_path),
        filename=filename_value or file_path.name,
        media_type=media_type or "application/octet-stream"
    )


@router.delete(
    "/message/{message_id}"
)
@router.delete(
    "/messages/{message_id}"
)
def delete_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = (
        db.query(Message)
        .filter(
            Message.id == message_id
        )
        .first()
    )

    if not message:
        raise HTTPException(
            status_code=404,
            detail="Message not found"
        )

    if message.sender_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only delete your own messages"
        )

    attachments = (
        db.query(Attachment)
        .filter(
            Attachment.message_id == message.id
        )
        .all()
    )

    for attachment in attachments:
        try:
            Path(attachment.file_path).unlink(missing_ok=True)
        except Exception:
            pass
        db.delete(attachment)

    if message.attachment_path:
        file_path = Path(message.attachment_path)
        if file_path.exists():
            file_path.unlink()

    db.delete(message)
    db.commit()

    return {
        "status": "deleted"
    }
@router.delete(
    "/messages/{message_id}/me"
)
def delete_message_for_me(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = (
        db.query(Message)
        .filter(
            Message.id == message_id
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

    existing = (
        db.query(DeletedRoomMessage)
        .filter(
            DeletedRoomMessage.user_id == current_user.id,
            DeletedRoomMessage.message_id == message.id
        )
        .first()
    )

    if existing:
        return {
            "status": "already deleted"
        }

    db.add(
        DeletedRoomMessage(
            user_id=current_user.id,
            message_id=message.id
        )
    )

    db.commit()

    return {
        "status": "deleted"
    }

@router.post(
    "/{room_id}/clear"
)
def clear_room_conversation(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_room_membership(
        room_id,
        current_user.id,
        db
    )

    room_member = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == current_user.id
        )
        .first()
    )

    if not room_member:
        raise HTTPException(
            status_code=404,
            detail="Room member not found"
        )

    now = datetime.now(timezone.utc)
    room_member.cleared_at = now
    db.commit()
    db.refresh(room_member)

    return {
        "message": "Conversation cleared successfully."
    }