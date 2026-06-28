from datetime import datetime

from pydantic import BaseModel


class ConversationListResponse(BaseModel):
    conversation_id: int
    username: str
    user_id: int | None = None
    last_message: str | None = None
    last_message_sender: str | None = None
    last_message_time: datetime | None = None
    unread_count: int = 0