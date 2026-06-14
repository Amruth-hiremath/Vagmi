from sqlalchemy.orm import Session

from app.models.attachment import Attachment


def create_attachment(
    db: Session,
    message_id: int,
    owner_id: int,
    original_filename: str,
    file_path: str
):
    attachment = Attachment(
        message_id=message_id,
        owner_id=owner_id,
        original_filename=original_filename,
        file_path=file_path
    )

    db.add(attachment)

    db.commit()

    db.refresh(attachment)

    return attachment