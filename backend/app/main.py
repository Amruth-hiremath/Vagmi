from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.core.database import Base
from app.core.database import engine
from app.models import User
from app.models import Document
from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.models import Room
from app.models import RoomMember
from app.models import Attachment
from app.models import Message
from app.api.rooms import router as rooms_router
from app.api.messages import router as messages_router
from app.api.attachments import router as attachments_router

# lifespan function to create db tables
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

# initialize the app
app = FastAPI(
    title="Vāgmi",
    lifespan=lifespan
)

# include routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(rooms_router)
app.include_router(messages_router)
app.include_router(attachments_router)

# define root and health endpoints
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