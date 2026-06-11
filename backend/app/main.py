from fastapi import FastAPI

from app.core.database import Base
from app.core.database import engine

from app.models import User
from app.models import Document

from app.api.auth import router as auth_router
from app.api.documents import router as documents_router

app = FastAPI(
    title="Vāgmi"
)

app.include_router(auth_router)
app.include_router(documents_router)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {
        "message": "Vāgmi Backend Running"
    }

@app.get("/health")
def health():
    return {
        "status": "healthy"
    }