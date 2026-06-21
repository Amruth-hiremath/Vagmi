from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi import Depends

from sqlalchemy.orm import Session

from datetime import datetime
from datetime import timezone

from pathlib import Path

from app.core.database import get_db
from app.core.security import get_current_user

from app.models.user import User
from app.models.message import Message

from app.schemas.message import (
    MessageCreate,
    MessageResponse
)
from app.core.validators import (
    validate_message
)
from app.services.message_service import create_message

from app.services.room_service import (
    verify_room_membership
)
from app.services.image_service import save_image
from app.services.voice_service import save_voice

from app.core.logging_config import logger
from app.models.room_member import RoomMember

router = APIRouter(
    prefix="/rooms",
    tags=["Messages"]
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
        "created_at": message.created_at
    }


@router.post(
    "/room/{room_id}/image",
    response_model=MessageResponse
)
def send_image_message(
    room_id: int,
    file: UploadFile = File(...),
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
        original_filename=original_name
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return {
        "id": message.id,
        "room_id": room_id,
        "sender_id": current_user.id,
        "sender_username": current_user.username,
        "message_text": "",
        "message_type": "IMAGE",
        "attachment_path": image_path,
        "original_filename": original_name,
        "created_at": message.created_at
    }

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

    return {
        "id": message.id,
        "room_id": message.room_id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "message_text": "",
        "message_type": "VOICE",
        "attachment_path": voice_path,
        "original_filename": original_name,
        "created_at": message.created_at
    }


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

    messages = (
        db.query(Message)
        .filter(
            Message.room_id == room_id
        )
        .order_by(
            Message.created_at.asc()
        )
        .all()
    )

    result = []

    for message in messages:

        sender = (
            db.query(User)
            .filter(
                User.id == message.sender_id
            )
            .first()
        )

        result.append(
            {
                "id": message.id,
                "room_id": message.room_id,
                "sender_id": message.sender_id,
                "sender_username": sender.username,
                "message_text": message.message_text,
                "message_type": message.message_type,
                "attachment_path": message.attachment_path,
                "original_filename": message.original_filename,
                "created_at": message.created_at
            }
        )

    return result

@router.delete(
    "/message/{message_id}"
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

    if message.attachment_path:
        file_path = Path(
            message.attachment_path
        )

        if file_path.exists():
            file_path.unlink()

    db.delete(message)
    db.commit()

    return {
        "status": "deleted"
    }