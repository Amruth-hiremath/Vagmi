from datetime import datetime

from pydantic import BaseModel


class MessageCreate(BaseModel):
    message_text: str


class MessageResponse(BaseModel):
    id: int
    room_id: int
    sender_id: int
    sender_username: str
    message_text: str
    message_type: str
    attachment_id: int | None = None
    attachment_path: str | None = None
    original_filename: str | None = None
    created_at: datetime
    class Config:
        from_attributes = True