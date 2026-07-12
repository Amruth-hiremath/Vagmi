from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.document import DocumentResponse
from app.schemas.ai import (
    AiChatRequest,
    AiChatResponse,
    AiDocumentResponse,
    AiRegenerateRequest,
    AiSessionArtifactResponse,
    AiSessionContextResponse,
    AiSessionCreate,
    AiSessionDocumentsUpdate,
    AiSessionMessageResponse,
    AiSessionResponse,
    AiSessionUpdate,
    AiStatusResponse,
)
from app.core.dependencies import get_rag_services
from app.services.ai_service import (
    attach_document_to_session,
    create_session,
    delete_artifact,
    delete_session,
    get_ai_status,
    get_session,
    get_session_context,
    list_ai_documents,
    list_session_artifacts,
    list_sessions,
    regenerate_chat_turn,
    replace_session_documents,
    run_chat_turn,
    update_session,
)
from app.services.document_ingest_service import ingest_uploaded_document

router = APIRouter(prefix="/ai", tags=["AI"])


@router.get("/status", response_model=AiStatusResponse)
def ai_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_ai_status(db, current_user.id)


@router.get("/documents", response_model=list[AiDocumentResponse])
def get_ai_documents(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Full document library for the Intelligence tab's sources sidebar.
    This is intentionally independent of any single session — sessions
    each track their own selection subset via /ai/sessions/{id}/documents."""
    return list_ai_documents(db, current_user.id)



@router.post("/documents/upload", response_model=DocumentResponse)
def upload_ai_document(
    file: UploadFile = File(...),
    session_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    rag: dict = Depends(get_rag_services),
):
    document = ingest_uploaded_document(
        file=file,
        owner_id=current_user.id,
        db=db,
        rag=rag,
    )
    if session_id:
        session = get_session(db, current_user.id, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="AI session not found")
        attach_document_to_session(db, session, document.id, current_user.id, selected=True)
    return document


@router.get("/sessions", response_model=list[AiSessionResponse])
def get_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_sessions(db, current_user.id)


def _resolve_create_payload(payload: AiSessionCreate) -> dict:
    return {
        "title": payload.title or payload.name,
        "routing_mode": payload.routing_mode or payload.mode,
        "selected_agent": payload.selected_agent or payload.agent,
        "legacy_name": payload.name,
        "legacy_mode": payload.mode,
        "legacy_agent": payload.agent,
    }


def _resolve_update_payload(payload: AiSessionUpdate) -> dict:
    return {
        "title": payload.title or payload.name,
        "routing_mode": payload.routing_mode or payload.mode,
        "selected_agent": payload.selected_agent or payload.agent,
        "status": payload.status,
        "legacy_name": payload.name,
        "legacy_mode": payload.mode,
        "legacy_agent": payload.agent,
    }


@router.post("/sessions", response_model=AiSessionResponse)
def create_ai_session(payload: AiSessionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = create_session(db, current_user.id, **_resolve_create_payload(payload))
    from app.services.ai_service import _session_payload
    return _session_payload(session, current_user.id, db, include_messages=True)


@router.get("/sessions/{session_id}", response_model=AiSessionResponse)
def get_ai_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = get_session(db, current_user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="AI session not found")
    from app.services.ai_service import _session_payload
    return _session_payload(session, current_user.id, db, include_messages=True)


@router.patch("/sessions/{session_id}", response_model=AiSessionResponse)
def patch_ai_session(session_id: int, payload: AiSessionUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = get_session(db, current_user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="AI session not found")
    update_session(db, session, **_resolve_update_payload(payload))
    from app.services.ai_service import _session_payload
    return _session_payload(session, current_user.id, db, include_messages=True)


@router.delete("/sessions/{session_id}")
def remove_ai_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = get_session(db, current_user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="AI session not found")
    delete_session(db, session)
    return {"detail": "AI session deleted"}


@router.get("/sessions/{session_id}/documents")
def get_session_documents(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = get_session(db, current_user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="AI session not found")
    from app.services.ai_service import _session_documents
    return {"session_id": session_id, "documents": _session_documents(session_id, current_user.id, db)}


@router.put("/sessions/{session_id}/documents", response_model=AiSessionResponse)
def set_session_documents(session_id: int, payload: AiSessionDocumentsUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = get_session(db, current_user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="AI session not found")
    replace_session_documents(db, session, payload.document_ids, current_user.id)
    from app.services.ai_service import _session_payload
    return _session_payload(session, current_user.id, db, include_messages=True)


@router.get("/sessions/{session_id}/messages", response_model=list[AiSessionMessageResponse])
def get_ai_session_messages(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = get_session(db, current_user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="AI session not found")
    from app.services.ai_service import _messages
    return _messages(session_id, db)


@router.get("/sessions/{session_id}/context", response_model=AiSessionContextResponse)
def get_ai_session_context(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return get_session_context(db, current_user.id, session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/sessions/{session_id}/artifacts", response_model=list[AiSessionArtifactResponse])
def get_ai_session_artifacts(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return list_session_artifacts(db, current_user.id, session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/sessions/{session_id}/artifacts/{artifact_id}")
def remove_ai_session_artifact(session_id: int, artifact_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        delete_artifact(db, current_user.id, session_id, artifact_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"detail": "Artifact deleted"}


@router.post("/sessions/{session_id}/messages", response_model=AiChatResponse)
def post_ai_session_message(session_id: int, payload: AiChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return run_chat_turn(db, current_user.id, session_id, payload.prompt, payload.routing_mode, payload.selected_agent)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/regenerate", response_model=AiChatResponse)
def post_ai_session_regenerate(session_id: int, payload: AiRegenerateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = get_session(db, current_user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="AI session not found")
    if payload.routing_mode or payload.selected_agent:
        from app.services.ai_service import update_session as _update_session
        _update_session(db, session, routing_mode=payload.routing_mode, selected_agent=payload.selected_agent)
    try:
        return regenerate_chat_turn(db, current_user.id, session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/chat", response_model=AiChatResponse)
def ai_chat(payload: AiChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return run_chat_turn(db, current_user.id, payload.session_id, payload.prompt, payload.routing_mode, payload.selected_agent)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc