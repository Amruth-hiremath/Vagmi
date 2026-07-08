from pathlib import Path
import shutil
import uuid

from fastapi import UploadFile
from fastapi import HTTPException

from app.core.config import USERS_DIR


ALLOWED_VOICE_EXTENSIONS = {
    ".wav",
    ".mp3",
    ".ogg",
    ".webm",
    ".m4a"
}

VOICE_SIZE_LIMIT = 20 * 1024 * 1024


def save_voice(
    file: UploadFile,
    user_id: int
):
    extension = (
        Path(file.filename)
        .suffix
        .lower()
    )

    if extension not in ALLOWED_VOICE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported voice format"
        )

    voice_dir = (
        USERS_DIR
        / f"user_{user_id}"
        / "voice"
    )

    voice_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    unique_name = (
        f"{uuid.uuid4()}{extension}"
    )

    file_path = (
        voice_dir /
        unique_name
    )

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(
            file.file,
            buffer
        )

    if file_path.stat().st_size > VOICE_SIZE_LIMIT:
        file_path.unlink()

        raise HTTPException(
            status_code=400,
            detail="Voice file too large"
        )

    return (
        str(file_path),
        file.filename
    )