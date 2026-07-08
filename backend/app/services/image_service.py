import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException
from fastapi import UploadFile

from app.core.constants import (
    ALLOWED_IMAGE_EXTENSIONS,
    MAX_IMAGE_SIZE
)

from app.core.config import USERS_DIR


def save_image(
    file: UploadFile,
    user_id: int
):
    extension = (
        Path(file.filename)
        .suffix
        .lower()
    )

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image format"
        )

    image_dir = (
        USERS_DIR
        / f"user_{user_id}"
        / "attachments"
        / "images"
    )

    image_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    unique_name = (
        f"{uuid.uuid4()}{extension}"
    )

    image_path = (
        image_dir / unique_name
    )

    with open(
        image_path,
        "wb"
    ) as buffer:
        shutil.copyfileobj(
            file.file,
            buffer
        )

    if (
        image_path.stat().st_size
        > MAX_IMAGE_SIZE
    ):
        image_path.unlink()

        raise HTTPException(
            status_code=400,
            detail="Image too large"
        )

    return (
        str(image_path),
        file.filename
    )