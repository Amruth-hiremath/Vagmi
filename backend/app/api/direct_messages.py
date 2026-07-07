from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi import File
from fastapi import Form
from fastapi.responses import FileResponse
from pathlib import Path
from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user

from app.models.user import User
from app.models.direct_conversation import DirectConversation
from app.models.direct_message import DirectMessage
from app.models.deleted_direct_message import DeletedDirectMessage

from app.schemas.direct_message import (
    StartConversationRequest,
    ConversationResponse,
    DirectMessageCreate,
    DirectMessageResponse
)
from app.schemas.conversation import ConversationListResponse

from app.services.attachment_service import create_attachment
from app.models.attachment import Attachment
from app.services.direct_message_service import (
    get_or_create_conversation,
    verify_conversation_member,
    create_direct_message,
    get_user_conversations
)
from app.services.image_service import save_image
from app.services.voice_service import save_voice
from app.services.attachment_service import save_upload_file
from app.core.config import USERS_DIR
router = APIRouter(
    prefix="/dm",
    tags=["Chat"]
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

    if not other_user.is_approved:
        raise HTTPException(
            status_code=403,
            detail="User is awaiting administrator approval."
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
    current_user.last_seen = datetime.now(timezone.utc)

    db.commit()

    db.refresh(current_user)
    
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
    caption: str = Form(None),
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
        caption=caption,
        delivered_at=datetime.now(timezone.utc)
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    image_file_size = Path(image_path).stat().st_size if Path(image_path).exists() else None
    attachment = create_attachment(
        db=db,
        message_id=message.id,
        owner_id=current_user.id,
        original_filename=original_name,
        file_path=str(image_path),
        file_size=image_file_size,
    )

    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "message_text": "",
        "message_type": "IMAGE",
        "attachment_path": image_path,
        "original_filename": original_name,
        "file_size": image_file_size,
        "caption": message.caption,
        "created_at": message.created_at,
        "delivered_at": message.delivered_at,
        "seen_at": message.seen_at,
    }

@router.post(
    "/{conversation_id}/attachment",
    response_model=DirectMessageResponse
)
@router.post(
    "/{conversation_id}/attachments",
    response_model=DirectMessageResponse
)
def send_attachment_dm(
    conversation_id: int,
    file: UploadFile = File(...),
    caption: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conversation = (
        db.query(DirectConversation)
        .filter(DirectConversation.id == conversation_id)
        .first()
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if not verify_conversation_member(conversation, current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    attachment_dir = (
        USERS_DIR /
        f"user_{current_user.id}" /
        "dm_attachments" /
        f"conversation_{conversation_id}"
    )

    file_path, original_name, file_size = save_upload_file(
        file=file,
        destination_dir=attachment_dir,
    )

    message = DirectMessage(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        message_text=original_name,
        message_type="FILE",
        attachment_path=file_path,
        original_filename=original_name,
        caption=caption,
        delivered_at=datetime.now(timezone.utc)
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    attachment = create_attachment(
        db=db,
        message_id=message.id,
        owner_id=current_user.id,
        original_filename=original_name,
        file_path=str(file_path),
        file_size=file_size,
    )

    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "message_text": original_name,
        "message_type": "FILE",
        "attachment_path": file_path,
        "original_filename": original_name,
        "file_size": file_size,
        "caption": message.caption,
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

    voice_file_size = Path(voice_path).stat().st_size if Path(voice_path).exists() else None
    attachment = create_attachment(
        db=db,
        message_id=message.id,
        owner_id=current_user.id,
        original_filename=original_name,
        file_path=str(voice_path),
        file_size=voice_file_size,
    )

    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "message_text": "",
        "message_type": "VOICE",
        "attachment_path": voice_path,
        "original_filename": original_name,
        "file_size": voice_file_size,
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

    query = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.conversation_id == conversation_id
        )
    )

    hidden_ids = [
        row.message_id
        for row in db.query(
            DeletedDirectMessage.message_id
        )
        .filter(
            DeletedDirectMessage.user_id == current_user.id
        )
        .all()
    ]

    if hidden_ids:
        query = query.filter(
            ~DirectMessage.id.in_(hidden_ids)
        )

    if current_user.id == conversation.user1_id:
        cleared_at = conversation.user1_cleared_at
    else:
        cleared_at = conversation.user2_cleared_at

    if cleared_at:
        query = query.filter(
            DirectMessage.created_at > cleared_at
        )

    messages = (
        query
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

        attachment = (
            db.query(Attachment)
            .filter(
                Attachment.message_id == message.id
            )
            .first()
        )

        attachment_path = message.attachment_path or (attachment.file_path if attachment else None)
        original_filename = message.original_filename or (attachment.original_filename if attachment else None)
        file_size = attachment.file_size if attachment else None

        result.append(
            {
                "id": message.id,
                "conversation_id": message.conversation_id,
                "sender_id": message.sender_id,
                "sender_username": sender.username if sender else "Unknown",
                "message_text": message.message_text,
                "message_type": message.message_type,
                "attachment_path": attachment_path,
                "original_filename": original_filename,
                "file_size": file_size,
                "caption": message.caption,
                "created_at": message.created_at,
                "delivered_at": message.delivered_at,
                "seen_at": message.seen_at,
            }
        )

    return result


@router.get(
    "/{conversation_id}/messages/{message_id}/attachment"
)
def download_message_attachment(
    conversation_id: int,
    message_id: int,
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

    message = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.id == message_id
        )
        .filter(
            DirectMessage.conversation_id == conversation_id
        )
        .first()
    )

    if not message:
        raise HTTPException(
            status_code=404,
            detail="Message not found"
        )

    if not message.attachment_path:
        raise HTTPException(
            status_code=404,
            detail="Attachment not found"
        )

    file_path = Path(message.attachment_path)

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="File not found"
        )

    media_type, _ = __import__("mimetypes").guess_type(str(file_path))

    return FileResponse(
        path=str(file_path),
        filename=message.original_filename or file_path.name,
        media_type=media_type or "application/octet-stream"
    )

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

    file_path = Path(message.attachment_path)
    media_type, _ = __import__("mimetypes").guess_type(str(file_path))

    return FileResponse(
        path=str(file_path),
        filename=message.original_filename or file_path.name,
        media_type=media_type or "application/octet-stream"
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

@router.delete(
    "/message/{message_id}/me"
)
def delete_direct_message_for_me(
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

    if message is None:
        raise HTTPException(
            status_code=404,
            detail="Message not found"
        )

    conversation = (
        db.query(DirectConversation)
        .filter(
            DirectConversation.id == message.conversation_id
        )
        .first()
    )

    if (
        conversation.user1_id != current_user.id
        and
        conversation.user2_id != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    existing = (
        db.query(DeletedDirectMessage)
        .filter(
            DeletedDirectMessage.user_id == current_user.id,
            DeletedDirectMessage.message_id == message.id
        )
        .first()
    )

    if existing:
        return {
            "status": "already deleted"
        }

    db.add(
        DeletedDirectMessage(
            user_id=current_user.id,
            message_id=message.id
        )
    )

    db.commit()

    return {
        "status": "deleted"
    }

@router.post(
    "/{conversation_id}/clear"
)
def clear_conversation(
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

    now = datetime.now(timezone.utc)

    if current_user.id == conversation.user1_id:
        conversation.user1_cleared_at = now
    else:
        conversation.user2_cleared_at = now

    db.commit()
    db.refresh(conversation)

    return {
        "message": "Conversation cleared successfully."
    }