from fastapi import APIRouter
from fastapi import Depends

from sqlalchemy.orm import Session

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

from app.core.logging_config import logger

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

    return message


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

    return messages