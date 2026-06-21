from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi import File
from fastapi.responses import FileResponse

from datetime import datetime
from datetime import timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from pathlib import Path

from app.core.database import get_db
from app.core.security import get_current_user

from app.models.user import User
from app.models.direct_conversation import DirectConversation
from app.models.direct_message import DirectMessage

from app.schemas.direct_message import (
    StartConversationRequest,
    ConversationResponse,
    DirectMessageCreate,
    DirectMessageResponse
)
from app.schemas.conversation import ConversationListResponse

from app.services.direct_message_service import (
    get_or_create_conversation,
    verify_conversation_member,
    create_direct_message,
    get_user_conversations
)
from app.services.image_service import save_image
from app.services.voice_service import save_voice
router = APIRouter(
    prefix="/dm",
    tags=["Direct Messages"]
)


@router.post(
    "/start",
    response_model=ConversationResponse
)
def start_conversation(
    request: StartConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    other_user = (
        db.query(User)
        .filter(
            User.username == request.username
        )
        .first()
    )

    if not other_user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if other_user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot chat with yourself"
        )

    conversation = get_or_create_conversation(
        db,
        current_user.id,
        other_user.id
    )

    return conversation


@router.get(
    "",
    response_model=list[ConversationListResponse]
)
def get_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_user_conversations(
        db=db,
        user_id=current_user.id
    )


@router.post(
    "/{conversation_id}",
    response_model=DirectMessageResponse
)
def send_message(
    conversation_id: int,
    message_data: DirectMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conversation = (
        db.query(DirectConversation)
        .filter(
            DirectConversation.id == conversation_id
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found"
        )

    if not verify_conversation_member(
        conversation,
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    message = create_direct_message(
        db=db,
        conversation_id=conversation_id,
        sender_id=current_user.id,
        message_text=message_data.message_text
    )

    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "message_text": message.message_text,
        "message_type": message.message_type,
        "attachment_path": message.attachment_path,
        "original_filename": message.original_filename,
        "created_at": message.created_at,
        "delivered_at": message.delivered_at,
        "seen_at": message.seen_at,
    }

@router.post(
    "/{conversation_id}/image",
    response_model=DirectMessageResponse
)
def send_image_dm(
    conversation_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conversation = (
        db.query(DirectConversation)
        .filter(
            DirectConversation.id == conversation_id
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found"
        )

    if not verify_conversation_member(
        conversation,
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    image_path, original_name = save_image(
        file=file,
        user_id=current_user.id
    )

    message = DirectMessage(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        message_text="",
        message_type="IMAGE",
        attachment_path=image_path,
        original_filename=original_name,
        delivered_at=datetime.now(timezone.utc)
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "message_text": "",
        "message_type": "IMAGE",
        "attachment_path": image_path,
        "original_filename": original_name,
        "created_at": message.created_at,
        "delivered_at": message.delivered_at,
        "seen_at": message.seen_at,
    }

@router.post(
    "/{conversation_id}/voice",
    response_model=DirectMessageResponse
)
def send_voice_dm(
    conversation_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conversation = (
        db.query(DirectConversation)
        .filter(
            DirectConversation.id == conversation_id
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found"
        )

    if not verify_conversation_member(
        conversation,
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    voice_path, original_name = save_voice(
        file=file,
        user_id=current_user.id
    )

    message = DirectMessage(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        message_text="",
        message_type="VOICE",
        attachment_path=voice_path,
        original_filename=original_name,
        delivered_at=datetime.now(timezone.utc)
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "message_text": "",
        "message_type": "VOICE",
        "attachment_path": voice_path,
        "original_filename": original_name,
        "created_at": message.created_at,
        "delivered_at": message.delivered_at,
        "seen_at": message.seen_at
    }

@router.get(
    "/{conversation_id}",
    response_model=list[DirectMessageResponse]
)
def get_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conversation = (
        db.query(DirectConversation)
        .filter(
            DirectConversation.id == conversation_id
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found"
        )

    if not verify_conversation_member(
        conversation,
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    messages = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.conversation_id == conversation_id
        )
        .order_by(
            DirectMessage.created_at
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
                "conversation_id": message.conversation_id,
                "sender_id": message.sender_id,
                "sender_username": sender.username,
                "message_text": message.message_text,
                "message_type": message.message_type,
                "attachment_path": message.attachment_path,
                "original_filename": message.original_filename,
                "created_at": message.created_at,   
                "delivered_at": message.delivered_at,
                "seen_at": message.seen_at,
            }
        )

    return result

@router.get(
    "/voice/{message_id}"
)
def get_voice_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.id == message_id
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

    conversation = (
        db.query(DirectConversation)
        .filter(
            DirectConversation.id == message.conversation_id
        )
        .first()
    )

    if not verify_conversation_member(
        conversation,
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    return FileResponse(
        path=message.attachment_path,
        filename=message.original_filename
    )

@router.post(
    "/{conversation_id}/mark-read"
)
def mark_conversation_read(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conversation = (
        db.query(DirectConversation)
        .filter(
            DirectConversation.id == conversation_id
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found"
        )

    if not verify_conversation_member(
        conversation,
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    unread_messages = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.conversation_id == conversation_id
        )
        .filter(
            DirectMessage.sender_id != current_user.id
        )
        .filter(
            DirectMessage.seen_at.is_(None)
        )
        .all()
    )

    now = datetime.now(timezone.utc)

    for message in unread_messages:
        message.seen_at = now

    db.commit()

    return {
        "updated": len(unread_messages)
    }
    
@router.delete(
    "/message/{message_id}"
)
def delete_direct_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.id == message_id
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