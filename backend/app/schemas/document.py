from pydantic import BaseModel
from datetime import datetime

# this is the main schema for the document response, it includes the id, filename, status, and created_at timestamp
class DocumentResponse(BaseModel):
    id: int
    filename: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True