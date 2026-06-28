from fastapi import HTTPException

from sqlalchemy.orm import Session

from app.models.room import Room
from app.models.room_member import RoomMember


def create_room(
    db: Session,
    name: str,
    creator_id: int
):
    room = Room(
        name=name,
        created_by=creator_id
    )

    db.add(room)

    db.commit()

    db.refresh(room)

    membership = RoomMember(
        room_id=room.id,
        user_id=creator_id,
        last_read_at=room.created_at
    )

    db.add(membership)

    db.commit()

    return room


def verify_room_membership(
    room_id: int,
    user_id: int,
    db: Session
):
    membership = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == user_id
        )
        .first()
    )

    if membership is None:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    return membership