from pathlib import Path
import shutil
import uuid
from fastapi import APIRouter
from fastapi import Depends
from fastapi import UploadFile
from fastapi import File
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.document import Document
from app.schemas.document import DocumentResponse
from app.core.config import USERS_DIR

router = APIRouter(
    prefix="/documents",
    tags=["Documents"]
)

# allowed file extensions and maximum file size for document uploads
ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt"
}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB

# endpoint for uploading a document
@router.post("/upload", response_model=DocumentResponse)
def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    extension = Path(file.filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    user_documents_dir = USERS_DIR / f"user_{current_user.id}" / "documents"
    user_documents_dir.mkdir(parents=True, exist_ok=True)

    # to ensure unique file names and avoid overwriting, generate a unique name using uuid4 and keep the original extension
    unique_name = f"{uuid.uuid4()}{extension}"
    file_path = user_documents_dir / unique_name

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if file_path.stat().st_size > MAX_FILE_SIZE:
        file_path.unlink() # Delete the file
        raise HTTPException(status_code=400, detail="File too large")

    document = Document(
        owner_id=current_user.id,
        filename=file.filename,
        file_path=str(file_path),
        status="uploaded"
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    return document

# endpoint for listing all documents of the current logged in user
@router.get(
    "",
    response_model=list[DocumentResponse]
)
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    documents = (
        db.query(Document)
        .filter(
            Document.owner_id == current_user.id
        )
        .all()
    )

    return documents