from datetime import datetime

from pydantic import BaseModel


class RoomCreate(BaseModel):
    name: str


class RoomUpdate(BaseModel):
    name: str | None = None


class AddMemberRequest(BaseModel):
    user_id: int | None = None
    username: str | None = None


class RoomResponse(BaseModel):
    id: int
    name: str
    created_by: int
    created_at: datetime
    unread_count: int = 0

    class Config:
        from_attributes = True


class MemberResponse(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True
