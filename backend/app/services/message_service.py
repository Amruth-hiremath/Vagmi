from sqlalchemy.orm import Session

from app.models.message import Message


def create_message(
    db: Session,
    room_id: int,
    sender_id: int,
    message_text: str,
    message_type: str = "TEXT"
):
    message = Message(
        room_id=room_id,
        sender_id=sender_id,
        message_text=message_text,
        message_type=message_type
    )

    db.add(message)

    db.commit()

    db.refresh(message)

    return message