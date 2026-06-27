from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from pathlib import Path
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

@router.get(
    "",
    response_model=list[RoomResponse]
)
def list_rooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
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

    return rooms

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

    user = (
        db.query(User)
        .filter(
            User.username == request.username
        )
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )
    
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
        user_id=user.id
    )

    db.add(membership)

    db.commit()

    logger.info(
        f"User {request.username} "
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
    "/{room_id}/members/{username}"
)
def remove_member(
    room_id: int,
    username: str,
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

    user = (
        db.query(User)
        .filter(
            User.username == username
        )
        .first()
    )

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
        f"User {username} "
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