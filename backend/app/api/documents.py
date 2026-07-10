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
from app.core.constants import ALLOWED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_SIZE
from app.core.logging_config import logger
from app.core.dependencies import get_rag_services

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
    extension = Path(file.filename).suffix.lower()

    if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    user_documents_dir = USERS_DIR / f"user_{current_user.id}" / "documents"
    user_documents_dir.mkdir(parents=True, exist_ok=True)

    # to ensure unique file names and avoid overwriting, generate a unique name using uuid4 and keep the original extension
    unique_name = f"{uuid.uuid4()}{extension}"
    file_path = user_documents_dir / unique_name

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if file_path.stat().st_size > MAX_DOCUMENT_SIZE:
        file_path.unlink() # Delete the file
        raise HTTPException(status_code=400, detail="File too large")

    # Save to database initially as "processing"
    document = Document(
        owner_id=current_user.id,
        filename=file.filename,
        file_path=str(file_path),
        status="processing"
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    logger.info(
        f"Document saved: {file.filename} by user {current_user.username}. Starting RAG indexing..."
    )

    # ---------------------------------------------------------
    # TRIGGER THE RAG PIPELINE
    # ---------------------------------------------------------
    try:
        # 1. Extract & Chunk
        raw_text = rag["processor"].extract_text(str(file_path))
        chunks = rag["chunker"].chunk_text(raw_text, chunk_size=500, overlap=100)
        
        if chunks:
            # 2. Embed
            embeddings = rag["embedder"].embed_chunks(chunks)
            
            # 3. Store in Vector DB (ChromaDB)
            rag["vector"].add_chunks(
                document_id=document.id, 
                owner_id=current_user.id, 
                chunks=chunks, 
                embeddings=embeddings
            )
            
            # 4. Store in Keyword DB (BM25)
            metadata = [{"document_id": document.id} for _ in chunks]
            rag["bm25"].add_chunks(
                user_id=current_user.id, 
                chunks=chunks, 
                chunk_metadata=metadata
            )

        # 5. Mark as successful
        document.status = "indexed"
        db.commit()
        db.refresh(document)
        logger.info(f"Successfully indexed document {document.id} into RAG pipeline.")

    except Exception as e:
        # If the AI pipeline fails, mark the document status as failed
        logger.error(f"Failed to index document {document.id}: {str(e)}")
        document.status = "failed_indexing"
        db.commit()
        db.refresh(document)
        raise HTTPException(status_code=500, detail=f"File saved, but indexing failed: {str(e)}")

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