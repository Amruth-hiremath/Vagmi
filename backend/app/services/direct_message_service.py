from sqlalchemy import or_
from sqlalchemy.orm import Session
from datetime import datetime
from datetime import timezone
from app.models.user import User
from app.models.direct_conversation import DirectConversation
from app.models.direct_message import DirectMessage


def get_or_create_conversation(
    db: Session,
    current_user_id: int,
    other_user_id: int
):
    conversation = (
        db.query(DirectConversation)
        .filter(
            or_(
                (
                    (DirectConversation.user1_id == current_user_id)
                    & (DirectConversation.user2_id == other_user_id)
                ),
                (
                    (DirectConversation.user1_id == other_user_id)
                    & (DirectConversation.user2_id == current_user_id)
                )
            )
        )
        .first()
    )

    if conversation:
        return conversation

    conversation = DirectConversation(
        user1_id=current_user_id,
        user2_id=other_user_id
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return conversation


def verify_conversation_member(
    conversation: DirectConversation,
    user_id: int
):
    return (
        conversation.user1_id == user_id
        or conversation.user2_id == user_id
    )


def create_direct_message(
    db: Session,
    conversation_id: int,
    sender_id: int,
    message_text: str
):
    message = DirectMessage(
        conversation_id=conversation_id,
        sender_id=sender_id,
        message_text=message_text,
        message_type="TEXT",
        delivered_at=datetime.now(timezone.utc)
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return message

def get_user_conversations(
    db: Session,
    user_id: int
):
    conversations = (
        db.query(DirectConversation)
        .filter(
            or_(
                DirectConversation.user1_id == user_id,
                DirectConversation.user2_id == user_id
            )
        )
        .all()
    )

    result = []

    for conversation in conversations:

        other_user_id = (
            conversation.user2_id
            if conversation.user1_id == user_id
            else conversation.user1_id
        )

        other_user = (
            db.query(User)
            .filter(
                User.id == other_user_id
            )
            .first()
        )

        query = (
            db.query(DirectMessage)
            .filter(
                DirectMessage.conversation_id == conversation.id
            )
        )

        if user_id == conversation.user1_id:
            cleared_at = conversation.user1_cleared_at
        else:
            cleared_at = conversation.user2_cleared_at

        if cleared_at:
            query = query.filter(
                DirectMessage.created_at > cleared_at
            )

        last_message = (
            query
            .order_by(
                DirectMessage.created_at.desc()
            )
            .first()
        )
        unread_query = (
            db.query(DirectMessage)
            .filter(
                DirectMessage.conversation_id == conversation.id
            )
            .filter(
                DirectMessage.sender_id != user_id
            )
            .filter(
                DirectMessage.seen_at.is_(None)
            )
        )

        if cleared_at:
            unread_query = unread_query.filter(
                DirectMessage.created_at > cleared_at
            )

        unread_count = unread_query.count()

        result.append(
            {
                "conversation_id": conversation.id,
                "username": other_user.username if other_user else "Unknown",
                "last_message": (
                    "Image"
                    if last_message and last_message.message_type == "IMAGE"
                    else(
                        last_message.message_text
                        if last_message
                        else None
                    )
                ),
                "last_message_sender": (
                    db.query(User)
                    .filter(User.id == last_message.sender_id)
                    .first()
                    .username
                    if last_message and db.query(User).filter(User.id == last_message.sender_id).first()
                    else ("Unknown" if last_message else None)
                ),
                "last_message_time": (
                    last_message.created_at
                    if last_message
                    else None
                ),
                "unread_count": unread_count
            }
        )

    return result