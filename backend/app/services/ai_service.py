
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from app.core.config import LOCAL_MODELS_DIR, OFFLINE_MODELS_DIR
from app.models.ai_session import AiSession
from app.models.ai_session_artifact import AiSessionArtifact
from app.models.ai_session_document import AiSessionDocument
from app.models.ai_session_message import AiSessionMessage
from app.models.document import Document
from app.services.ai_orchestrator import run_session_turn
from app.services.context_service import build_session_context, session_messages, session_selected_documents
from app.services.llm_service import resolve_local_model_path

MANUAL_MODE = "manual"
AUTO_MODE = "auto"
ALLOWED_AGENTS = {"master", "query", "summary", "diagram", "document"}
MANUAL_AGENTS = {"query", "summary", "diagram", "document"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _first_text(*values: object, default: str | None = None) -> str | None:
    for value in values:
        if isinstance(value, str):
            text = value.strip()
            if text:
                return text
    return default


def _normalise_mode(mode: str | None) -> str:
    value = (mode or MANUAL_MODE).strip().lower()
    return AUTO_MODE if value == AUTO_MODE else MANUAL_MODE


def _normalise_agent(agent: str | None) -> str:
    value = (agent or "query").strip().lower()
    return value if value in ALLOWED_AGENTS else "query"


def _normalise_manual_agent(agent: str | None) -> str:
    value = _normalise_agent(agent)
    return value if value in MANUAL_AGENTS else "query"


def _session_doc_ids(session_id: int, db: Session) -> set[int]:
    rows = db.query(AiSessionDocument.document_id).filter(AiSessionDocument.session_id == session_id).all()
    return {row[0] for row in rows}


def _session_documents(session_id: int, owner_id: int, db: Session) -> list[dict]:
    selected_ids = _session_doc_ids(session_id, db)
    docs = (
        db.query(Document)
        .filter(Document.owner_id == owner_id)
        .order_by(Document.created_at.desc(), Document.id.desc())
        .all()
    )
    return [
        {
            "id": doc.id,
            "filename": doc.filename,
            "status": doc.status,
            "created_at": doc.created_at,
            "selected": doc.id in selected_ids,
        }
        for doc in docs
    ]


def _messages(session_id: int, db: Session, limit: int | None = None) -> list[AiSessionMessage]:
    query = (
        db.query(AiSessionMessage)
        .filter(AiSessionMessage.session_id == session_id)
        .order_by(AiSessionMessage.created_at.asc(), AiSessionMessage.id.asc())
    )
    if limit is not None:
        query = query.limit(limit)
    return query.all()


def _artifacts(session_id: int, owner_id: int, db: Session) -> list[dict]:
    rows = (
        db.query(AiSessionArtifact)
        .filter(AiSessionArtifact.session_id == session_id, AiSessionArtifact.owner_id == owner_id)
        .order_by(AiSessionArtifact.created_at.desc(), AiSessionArtifact.id.desc())
        .all()
    )
    return [
        {
            "id": row.id,
            "title": row.title,
            "artifact_type": row.artifact_type,
            "content": row.content,
            "file_path": row.file_path,
            "created_at": row.created_at,
        }
        for row in rows
    ]


def _session_payload(session: AiSession, owner_id: int, db: Session, include_messages: bool = True) -> dict:
    selected_documents = _session_documents(session.id, owner_id, db)
    messages = [
        {
            "id": item.id,
            "role": item.role,
            "content": item.content,
            "agent_name": item.agent_name,
            "created_at": item.created_at,
        }
        for item in _messages(session.id, db)
    ] if include_messages else []

    data = {
        "id": session.id,
        "title": session.title,
        "routing_mode": session.routing_mode,
        "selected_agent": session.selected_agent,
        "status": session.status,
        "last_prompt": session.last_prompt,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "last_used_at": session.last_used_at,
        "selected_document_count": len([doc for doc in selected_documents if doc.get("selected")]),
        "message_count": len(_messages(session.id, db)),
        "artifact_count": len(_artifacts(session.id, owner_id, db)),
        "selected_documents": selected_documents,
        "messages": messages,
    }
    return data


def list_sessions(db: Session, owner_id: int) -> list[dict]:
    sessions = (
        db.query(AiSession)
        .filter(AiSession.owner_id == owner_id)
        .order_by(AiSession.updated_at.desc(), AiSession.created_at.desc())
        .all()
    )
    return [_session_payload(session, owner_id, db, include_messages=False) for session in sessions]


def get_session(db: Session, owner_id: int, session_id: int) -> AiSession | None:
    return (
        db.query(AiSession)
        .filter(AiSession.id == session_id, AiSession.owner_id == owner_id)
        .first()
    )


def create_session(
    db: Session,
    owner_id: int,
    title: str | None = None,
    routing_mode: str | None = None,
    selected_agent: str | None = None,
    legacy_name: str | None = None,
    legacy_mode: str | None = None,
    legacy_agent: str | None = None,
) -> AiSession:
    resolved_title = _first_text(title, legacy_name)
    if not resolved_title:
        existing_count = db.query(AiSession).filter(AiSession.owner_id == owner_id).count()
        resolved_title = f"Session {existing_count + 1}"

    resolved_mode = _normalise_mode(routing_mode or legacy_mode)
    resolved_agent = _normalise_agent(selected_agent or legacy_agent)
    if resolved_mode == MANUAL_MODE:
        resolved_agent = _normalise_manual_agent(resolved_agent)

    session = AiSession(
        owner_id=owner_id,
        title=resolved_title,
        routing_mode=resolved_mode,
        selected_agent=resolved_agent,
        status="idle",
        last_prompt=None,
        created_at=_now(),
        updated_at=_now(),
        last_used_at=None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def update_session(
    db: Session,
    session: AiSession,
    *,
    title: str | None = None,
    routing_mode: str | None = None,
    selected_agent: str | None = None,
    status: str | None = None,
    legacy_name: str | None = None,
    legacy_mode: str | None = None,
    legacy_agent: str | None = None,
) -> AiSession:
    resolved_title = _first_text(title, legacy_name)
    if resolved_title is not None:
        session.title = resolved_title
    if routing_mode is not None or legacy_mode is not None:
        session.routing_mode = _normalise_mode(routing_mode or legacy_mode)
        if session.routing_mode == MANUAL_MODE:
            session.selected_agent = _normalise_manual_agent(session.selected_agent)
    if selected_agent is not None or legacy_agent is not None:
        resolved_agent = _normalise_agent(selected_agent or legacy_agent)
        if session.routing_mode == MANUAL_MODE:
            resolved_agent = _normalise_manual_agent(resolved_agent)
        session.selected_agent = resolved_agent
    if status is not None:
        session.status = status.strip() or session.status
    session.updated_at = _now()
    db.commit()
    db.refresh(session)
    return session


def replace_session_documents(db: Session, session: AiSession, document_ids: Iterable[int], owner_id: int) -> AiSession:
    valid_ids = {int(doc_id) for doc_id in document_ids}

    db.query(AiSessionDocument).filter(AiSessionDocument.session_id == session.id).delete(synchronize_session=False)
    if valid_ids:
        available_ids = {
            row[0]
            for row in db.query(Document.id)
            .filter(Document.owner_id == owner_id, Document.id.in_(sorted(valid_ids)))
            .all()
        }
        for document_id in sorted(available_ids):
            db.add(AiSessionDocument(session_id=session.id, document_id=document_id, created_at=_now()))

    session.updated_at = _now()
    db.commit()
    db.refresh(session)
    return session


def delete_session(db: Session, session: AiSession) -> None:
    db.query(AiSessionDocument).filter(AiSessionDocument.session_id == session.id).delete(synchronize_session=False)
    db.query(AiSessionMessage).filter(AiSessionMessage.session_id == session.id).delete(synchronize_session=False)
    db.query(AiSessionArtifact).filter(AiSessionArtifact.session_id == session.id).delete(synchronize_session=False)
    db.delete(session)
    db.commit()


def get_session_context(db: Session, owner_id: int, session_id: int) -> dict:
    session = get_session(db, owner_id, session_id)
    if not session:
        raise ValueError("AI session not found")
    return build_session_context(db, session, owner_id)


def list_session_artifacts(db: Session, owner_id: int, session_id: int) -> list[dict]:
    session = get_session(db, owner_id, session_id)
    if not session:
        raise ValueError("AI session not found")
    return _artifacts(session.id, owner_id, db)


def get_ai_status(db: Session, owner_id: int) -> dict:
    model_path = resolve_local_model_path()
    return {
        "enabled": True,
        "offline_only": True,
        "model_policy": "Offline scaffold; local model path only, no HuggingFace downloads",
        "ready": True,
        "session_count": db.query(AiSession).filter(AiSession.owner_id == owner_id).count(),
        "local_model_available": bool(model_path),
        "model_path": model_path,
    }


def run_chat_turn(db: Session, owner_id: int, session_id: int, prompt: str, routing_mode: str | None = None, selected_agent: str | None = None) -> dict:
    session = get_session(db, owner_id, session_id)
    if not session:
        raise ValueError("AI session not found")
    return run_session_turn(
        db=db,
        session=session,
        owner_id=owner_id,
        prompt=prompt,
        routing_mode=routing_mode,
        selected_agent=selected_agent,
    )
