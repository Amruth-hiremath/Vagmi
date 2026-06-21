from datetime import datetime

from pydantic import BaseModel


class StartConversationRequest(BaseModel):
    username: str


class ConversationResponse(BaseModel):
    id: int

    class Config:
        from_attributes = True


class DirectMessageCreate(BaseModel):
    message_text: str


class DirectMessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    sender_username: str

    message_text: str
    message_type: str

    attachment_path: str | None = None
    original_filename: str | None = None

    created_at: datetime

    delivered_at: datetime | None = None
    seen_at: datetime | None = None

    class Config:
        from_attributes = True