from datetime import datetime

from pydantic import BaseModel


class AdminUserResponse(BaseModel):

    id: int
    username: str
    is_admin: bool
    is_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True