from datetime import datetime

from pydantic import BaseModel


class MessageCreate(BaseModel):
    message_text: str


class MessageResponse(BaseModel):
    id: int
    room_id: int
    sender_id: int
    message_type: str
    message_text: str
    created_at: datetime

    class Config:
        from_attributes = True