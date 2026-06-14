from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user

from app.models.user import User
from app.models.room import Room
from app.models.room_member import RoomMember

from app.schemas.room import (
    RoomCreate,
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

from app.services.room_service import create_room


router = APIRouter(
    prefix="/rooms",
    tags=["Rooms"]
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
    room = create_room(
        db=db,
        name=room_data.name,
        creator_id=current_user.id
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

    if room.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only room creator can add members"
        )

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

    if room.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only room creator can remove members"
        )

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

    if room.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only room creator can delete room"
        )

    messages = (
        db.query(Message)
        .filter(
            Message.room_id == room_id
        )
        .all()
    )

    for message in messages:
        attachments = (
            db.query(Attachment)
            .filter(
                Attachment.message_id == message.id
            )
            .all()
        )

        for attachment in attachments:
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

    return {
        "message": "Room deleted successfully"
    }