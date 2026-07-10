from pydantic import BaseModel


class UserSearchResponse(BaseModel):
    id: int
    username: str
    profile_image_path: str | None = None

    class Config:
        from_attributes = True
