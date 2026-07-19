from fastapi import APIRouter
from fastapi import Depends
from fastapi import UploadFile
from fastapi import File
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.document import Document
from app.schemas.document import DocumentResponse
from app.core.dependencies import get_rag_services
from app.services.document_ingest_service import ingest_uploaded_document

router = APIRouter(
    prefix="/documents",
    tags=["Documents"]
)

# endpoint for uploading a document

@router.post("/upload", response_model=DocumentResponse)
def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    rag: dict = Depends(get_rag_services)
):
    return ingest_uploaded_document(
        file=file,
        owner_id=current_user.id,
        db=db,
        rag=rag,
    )

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