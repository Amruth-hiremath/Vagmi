from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import USERS_DIR
from app.core.constants import ALLOWED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_SIZE
from app.core.logging_config import logger
from app.models.document import Document


def ingest_uploaded_document(
    *,
    file: UploadFile,
    owner_id: int,
    db: Session,
    rag: dict,
) -> Document:
    """Persist and index an uploaded document for the current user.

    This is shared by the general document API and the Intelligence tab so
    both entry points stay behaviorally identical.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    user_documents_dir = USERS_DIR / f"user_{owner_id}" / "documents"
    user_documents_dir.mkdir(parents=True, exist_ok=True)

    unique_name = f"{uuid.uuid4()}{extension}"
    file_path = user_documents_dir / unique_name

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        if file_path.stat().st_size > MAX_DOCUMENT_SIZE:
            file_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="File too large")

        document = Document(
            owner_id=owner_id,
            filename=file.filename,
            file_path=str(file_path),
            status="processing",
        )
        db.add(document)
        db.commit()
        db.refresh(document)

        logger.info("Document saved for user %s: %s", owner_id, file.filename)

        raw_text = rag["processor"].extract_text(str(file_path))
        chunks = rag["chunker"].chunk_text(raw_text, chunk_size=500, overlap=100)

        if chunks:
            embeddings = rag["embedder"].embed_chunks(chunks)
            rag["vector"].add_chunks(
                document_id=document.id,
                owner_id=owner_id,
                chunks=chunks,
                embeddings=embeddings,
            )
            metadata = [{"document_id": document.id} for _ in chunks]
            rag["bm25"].add_chunks(
                user_id=owner_id,
                chunks=chunks,
                chunk_metadata=metadata,
            )

        document.status = "indexed"
        db.commit()
        db.refresh(document)
        logger.info("Successfully indexed document %s for user %s", document.id, owner_id)
        return document

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to index uploaded document for user %s", owner_id)
        document = db.query(Document).filter(Document.file_path == str(file_path)).first()
        if document:
            document.status = "failed_indexing"
            db.commit()
            db.refresh(document)
        raise HTTPException(status_code=500, detail=f"File saved, but indexing failed: {exc}") from exc
