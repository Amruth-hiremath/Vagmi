from pathlib import Path
from dotenv import load_dotenv
import os

# load environment variables from .env file
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

DATA_DIR = BASE_DIR / "data"
STORAGE_DIR = BASE_DIR / "storage"
USERS_DIR = STORAGE_DIR / "users"
LOCAL_MODELS_DIR = BASE_DIR / "local_models"
OFFLINE_MODELS_DIR = BASE_DIR / "offline_models"

DATABASE_PATH = DATA_DIR / "vagmi.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-offline-key-change-in-production")
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))

EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
EMBEDDING_MODEL_PATH = os.getenv("EMBEDDING_MODEL_PATH", "").strip() or None

EMBEDDING_MODEL_CANDIDATES = [
    EMBEDDING_MODEL_PATH,
    str(LOCAL_MODELS_DIR / EMBEDDING_MODEL_NAME),
    str(OFFLINE_MODELS_DIR / EMBEDDING_MODEL_NAME),
    str(DATA_DIR / "models" / EMBEDDING_MODEL_NAME),
    str(DATA_DIR / EMBEDDING_MODEL_NAME),
]
