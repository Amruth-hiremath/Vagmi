from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.message import Message
from app.services.direct_message_service import get_user_conversations

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"]
)

def _normalize_datetime(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _room_unread_count(db: Session, room: Room, current_user_id: int) -> int:
    membership = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == current_user_id
        )
        .first()
    )

    if membership is None:
        return 0

    checkpoints = [
        membership.cleared_at,
        membership.last_read_at,
        membership.joined_at,
        room.created_at,
    ]
    last_seen_at = max(
        (_normalize_datetime(value) for value in checkpoints if value is not None),
        default=None
    )

    if last_seen_at is None:
        return 0

    return (
        db.query(Message)
        .filter(
            Message.room_id == room.id,
            Message.sender_id != current_user_id,
            Message.created_at > last_seen_at
        )
        .count()
    )

@router.get("/chat-unread")
def get_chat_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dm_conversations = get_user_conversations(
        db=db,
        user_id=current_user.id
    )
    dm_unread = sum(
        int(conversation.get("unread_count") or 0)
        for conversation in dm_conversations
    )

    room_ids = (
        db.query(RoomMember.room_id)
        .filter(
            RoomMember.user_id == current_user.id
        )
        .all()
    )
    room_ids = [room_id for (room_id,) in room_ids]

    room_unread = 0
    if room_ids:
        rooms = (
            db.query(Room)
            .filter(
                Room.id.in_(room_ids)
            )
            .all()
        )
        room_unread = sum(
            _room_unread_count(db, room, current_user.id)
            for room in rooms
        )

    return {
        "count": dm_unread + room_unread,
        "direct_messages": dm_unread,
        "rooms": room_unread
    }
