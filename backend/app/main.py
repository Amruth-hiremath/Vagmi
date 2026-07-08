import os
from sqlalchemy import inspect, text
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.middleware.cors import CORSMiddleware
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
from app.models import Artifact
from app.models import DeletedRoomMessage
from app.models import DeletedDirectMessage
from app.api.rooms import router as rooms_router
from app.api.messages import router as messages_router
from app.api.attachments import router as attachments_router
from app.api.system import router as system_router
from app.core.logging_config import logger
from app.api.retrieval import router as retrieval_router
from app.api.users import router as users_router
from app.api.direct_messages import router as dm_router
from app.api.admin import router as admin_router


def _ensure_user_profile_image_column() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("users"):
            return
        columns = {column["name"] for column in inspector.get_columns("users")}
        if "profile_image_path" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN profile_image_path VARCHAR"))


def _ensure_room_member_last_read_at_column() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("room_members"):
            return
        columns = {column["name"] for column in inspector.get_columns("room_members")}
        if "last_read_at" not in columns:
            connection.execute(text("ALTER TABLE room_members ADD COLUMN last_read_at DATETIME"))

# lifespan function to create db tables
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_user_profile_image_column()
    _ensure_room_member_last_read_at_column()
    logger.info("Vagmi backend started")
    yield
    logger.info("Vagmi backend shutting down")

# initialize the app, disabling default online docs
app = FastAPI(
    title="Vāgmi",
    lifespan=lifespan,
    docs_url=None,   # <--- Disables default online swagger
    redoc_url=None   # <--- Disables default online redoc
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)
# mount the local static folder so FastAPI can serve the JS/CSS files
current_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(current_dir, "static")

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# explicitly override the /docs endpoint to point to local assets
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=app.title + " - Swagger UI (Offline)",
        swagger_js_url="/static/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui.css",
        swagger_favicon_url="/static/favicon.png"
    )

# include routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(rooms_router)
app.include_router(messages_router)
app.include_router(attachments_router)
app.include_router(system_router)
app.include_router(retrieval_router)
app.include_router(users_router)
app.include_router(dm_router)
app.include_router(admin_router)
# define root and health endpoints
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