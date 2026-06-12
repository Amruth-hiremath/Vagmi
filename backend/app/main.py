from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.core.database import Base
from app.core.database import engine

from app.models import User
from app.models import Document

from app.api.auth import router as auth_router
from app.api.documents import router as documents_router

# 1. Define the lifespan function first
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

# 2. Initialize the app ONCE with all required configurations
app = FastAPI(
    title="Vāgmi",
    lifespan=lifespan
)

# 3. Include your routers
app.include_router(auth_router)
app.include_router(documents_router)

# 4. Define your root and health endpoints
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
