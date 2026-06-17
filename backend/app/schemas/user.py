from pydantic import BaseModel


class UserSearchResponse(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True