from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from pathlib import Path
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func


from app.core.database import get_db
from app.core.security import get_current_user

from app.models.user import User
from app.models.room import Room
from app.models.room_member import RoomMember

from app.schemas.room import (
    RoomCreate,
    RoomUpdate,
    RoomResponse,
    AddMemberRequest,
    MemberResponse
)

from app.services.room_service import (
    create_room,
    verify_room_membership
)

from app.models.message import Message
from app.models.attachment import Attachment
from app.core.validators import (
    validate_room_name
)
from app.core.logging_config import logger

router = APIRouter(
    prefix="/rooms",
    tags=["Chat"]
)


def _require_room_admin(room: Room, current_user: User):
    if room.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only room admin can perform this action"
        )


def _resolve_room_member(db: Session, request: AddMemberRequest) -> User:
    user = None
    if request.user_id is not None:
        user = db.query(User).filter(User.id == request.user_id).first()
    elif request.username and request.username.strip():
        user = db.query(User).filter(User.username == request.username.strip()).first()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post(
    "",
    response_model=RoomResponse
)
def create_room_endpoint(
    room_data: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    validate_room_name(
        room_data.name
    )

    existing_room = (
        db.query(Room)
        .filter(
            Room.created_by == current_user.id,
            func.lower(Room.name) == room_data.name.strip().lower()
        )
        .first()
    )

    if existing_room:
        raise HTTPException(
            status_code=400,
            detail="You already have a room with this name"
        )

    room = create_room(
        db=db,
        name=room_data.name.strip(),
        creator_id=current_user.id
    )
    logger.info(
        f"Room created: {room.name} "
        f"by user {current_user.username}"
    )

    return room

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

    last_seen_at = membership.last_read_at or membership.joined_at or room.created_at
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


@router.get(
    "",
    response_model=list[RoomResponse]
)
def list_rooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.last_seen = datetime.now(timezone.utc)

    db.commit()

    db.refresh(current_user)

    room_ids = (
        db.query(RoomMember.room_id)
        .filter(
            RoomMember.user_id == current_user.id
        )
        .all()
    )

    room_ids = [room_id[0] for room_id in room_ids]

    rooms = (
        db.query(Room)
        .filter(
            Room.id.in_(room_ids)
        )
        .all()
    )

    result = []
    for room in rooms:
        result.append({
            "id": room.id,
            "name": room.name,
            "created_by": room.created_by,
            "created_at": room.created_at,
            "unread_count": _room_unread_count(db, room, current_user.id),
        })

    return result

@router.post(
    "/{room_id}/read"
)
def mark_room_read(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == current_user.id
        )
        .first()
    )

    if membership is None:
        raise HTTPException(status_code=403, detail="Access denied")

    membership.last_read_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Room marked as read"}


@router.patch(
    "/{room_id}",
    response_model=RoomResponse
)
def update_room(
    room_id: int,
    room_data: RoomUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    room = (
        db.query(Room)
        .filter(Room.id == room_id)
        .first()
    )

    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")

    _require_room_admin(room, current_user)

    if room_data.name is not None:
        validate_room_name(room_data.name)
        candidate = room_data.name.strip()
        duplicate = (
            db.query(Room)
            .filter(
                Room.created_by == current_user.id,
                func.lower(Room.name) == candidate.lower(),
                Room.id != room_id,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(
                status_code=400,
                detail="You already have a room with this name"
            )
        room.name = candidate

    db.commit()
    db.refresh(room)
    return room

@router.post(
    "/{room_id}/members"
)
def add_member(
    room_id: int,
    request: AddMemberRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    room = (
        db.query(Room)
        .filter(
            Room.id == room_id
        )
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    _require_room_admin(room, current_user)

    user = _resolve_room_member(db, request)

    if not user.is_approved:
        raise HTTPException(
            status_code=403,
            detail="User is awaiting administrator approval."
        )

    if user.id == room.created_by:
        raise HTTPException(
            status_code=400,
            detail="Creator is already a room member"
        )

    existing = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == user.id
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="User already in room"
        )

    membership = RoomMember(
        room_id=room_id,
        user_id=user.id,
        last_read_at=datetime.now(timezone.utc)
    )

    db.add(membership)

    db.commit()

    logger.info(
        f"User {user.username} "
        f"added to room {room_id}"
    )

    return {
        "message": "Member added successfully"
    }

@router.get(
    "/{room_id}/members",
    response_model=list[MemberResponse]
)
def list_members(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == current_user.id
        )
        .first()
    )

    if membership is None:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    members = (
        db.query(User)
        .join(
            RoomMember,
            User.id == RoomMember.user_id
        )
        .filter(
            RoomMember.room_id == room_id
        )
        .all()
    )

    return members

@router.delete(
    "/{room_id}/members/{member_identifier}"
)
def remove_member(
    room_id: int,
    member_identifier: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    room = (
        db.query(Room)
        .filter(
            Room.id == room_id
        )
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    _require_room_admin(room, current_user)

    if member_identifier.isdigit():
        user = db.query(User).filter(User.id == int(member_identifier)).first()
    else:
        user = db.query(User).filter(User.username == member_identifier).first()

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if user.id == room.created_by:
        raise HTTPException(
            status_code=400,
            detail="Creator cannot be removed"
        )

    membership = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == user.id
        )
        .first()
    )

    if membership is None:
        raise HTTPException(
            status_code=404,
            detail="User is not a member of this room"
        )

    db.delete(membership)

    db.commit()

    logger.info(
        f"User {user.username} "
        f"removed from room {room_id}"
    )

    return {
        "message": "Member removed successfully"
    }


@router.get(
    "/{room_id}",
    response_model=RoomResponse
)
def get_room(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    verify_room_membership(
        room_id,
        current_user.id,
        db
    )

    room = (
        db.query(Room)
        .filter(
            Room.id == room_id
        )
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    return room

@router.delete(
    "/{room_id}"
)
def delete_room(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    room = (
        db.query(Room)
        .filter(
            Room.id == room_id
        )
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    _require_room_admin(room, current_user)

    messages = (
        db.query(Message)
        .filter(
            Message.room_id == room_id
        )
        .all()
    )

    for message in messages:
        if message.attachment_path:
            try:
                Path(message.attachment_path).unlink(missing_ok=True)
            except Exception:
                pass

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

        db.delete(message)

    memberships = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id
        )
        .all()
    )

    for membership in memberships:
        db.delete(membership)

    db.delete(room)

    db.commit()

    logger.info(
        f"Room deleted: {room_id}"
    )

    return {
        "message": "Room deleted successfully"
    }
