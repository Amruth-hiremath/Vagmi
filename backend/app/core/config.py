from pathlib import Path
from dotenv import load_dotenv
import os

#load environment variables from .env file
load_dotenv()

# this file defines the configuration variables for the application, including paths for data and storage, database URL, and security settings like secret key and token expiration time.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

DATA_DIR = BASE_DIR / "data"
STORAGE_DIR = BASE_DIR / "storage"
USERS_DIR = STORAGE_DIR / "users"

DATABASE_PATH = DATA_DIR / "vagmi.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-offline-key-change-in-production")
ACCESS_TOKEN_EXPIRE_HOURS = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24")
)