import shutil
from pathlib import Path

from app.core.config import USERS_DIR

# this function creates the user workspace and then creates the respective sub directories for documents, attachments and artifacts
# created when a new user is registered
def create_user_workspace(user_id: int):
    user_root = USERS_DIR / f"user_{user_id}"

    directories = [
        user_root,
        user_root / "documents",
        user_root / "attachments",
        user_root / "artifacts",
        user_root / "profile",
    ]

    for directory in directories:
        directory.mkdir(
            parents=True,
            exist_ok=True
        )


def delete_user_workspace(user_id: int):
    user_root = USERS_DIR / f"user_{user_id}"
    shutil.rmtree(user_root, ignore_errors=True)
