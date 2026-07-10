from pydantic import BaseModel, Field


class RetrievalRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)


class RetrievalResult(BaseModel):
    document_id: int
    chunk_text: str
    score: float


class RetrievalResponse(BaseModel):
    results: list[RetrievalResult]