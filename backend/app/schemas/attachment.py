from datetime import datetime

from pydantic import BaseModel


class AttachmentResponse(BaseModel):
    id: int
    message_id: int
    owner_id: int
    original_filename: str
    file_size: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True