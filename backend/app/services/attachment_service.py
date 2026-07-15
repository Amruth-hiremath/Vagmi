from pathlib import Path
import shutil
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.models.attachment import Attachment


MAX_GENERIC_ATTACHMENT_SIZE = 2 *1024 * 1024 * 1024


def save_upload_file(
    file: UploadFile,
    destination_dir: Path,
    max_size: int = MAX_GENERIC_ATTACHMENT_SIZE,
):
    destination_dir.mkdir(parents=True, exist_ok=True)

    original_name = file.filename or "attachment"
    extension = Path(original_name).suffix.lower()
    unique_name = f"{uuid.uuid4()}{extension}"
    file_path = destination_dir / unique_name

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = file_path.stat().st_size

    if file_size > max_size:
        try:
            file_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="File too large")

    return str(file_path), original_name, file_size


def create_attachment(
    db: Session,
    message_id: int,
    owner_id: int,
    original_filename: str,
    file_path: str,
    file_size: int = None
):
    attachment = Attachment(
        message_id=message_id,
        owner_id=owner_id,
        original_filename=original_filename,
        file_path=file_path,
        file_size=file_size
    )

    db.add(attachment)

    db.commit()

    db.refresh(attachment)

    return attachment
