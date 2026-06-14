from fastapi import FastAPI

from app.core.database import Base
from app.core.database import engine
from contextlib import asynccontextmanager
from app.models import User
from app.models import Document

from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.models import Room
from app.models import RoomMember
from app.models import Attachment
from app.models import Message
from app.models import Artifact
from app.api.rooms import router as rooms_router
from app.api.messages import router as messages_router
from app.api.attachments import router as attachments_router
from app.api.system import router as system_router
from app.core.logging_config import logger

# lifespan function to create db tables
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info("Vagmi backend started")
    yield
    logger.info("Vagmi backend shutting down")

# initialize the app
app = FastAPI(
    title="Vāgmi"
)

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(rooms_router)
app.include_router(messages_router)
app.include_router(attachments_router)
app.include_router(system_router)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {
        "project": "Vagmi",
        "status": "running",
        "version": "0.2"
    }

@app.get("/health")
def health():
    return {
        "status": "healthy"
    }

# uvicorn app.main:app --reload  