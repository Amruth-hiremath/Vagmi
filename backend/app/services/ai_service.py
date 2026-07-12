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
from app.services.ai_orchestrator import regenerate_last_turn, run_session_turn
from app.services.ai_payload import session_payload
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
    rows = (
        db.query(AiSessionDocument, Document)
        .join(Document, Document.id == AiSessionDocument.document_id)
        .filter(AiSessionDocument.session_id == session_id, Document.owner_id == owner_id)
        .order_by(AiSessionDocument.created_at.desc(), AiSessionDocument.id.desc())
        .all()
    )
    return [
        {
            "id": doc.id,
            "filename": doc.filename,
            "status": doc.status,
            "created_at": doc.created_at,
            "selected": bool(link.selected),
        }
        for link, doc in rows
    ]


def list_ai_documents(db: Session, owner_id: int) -> list[Document]:
    """All documents owned by the user, in the shape the Intelligence tab's
    sources sidebar expects. Kept separate from `_session_documents` (which
    also carries per-session `selected` flags) so `/ai/documents` can serve
    a plain library listing regardless of which session, if any, is open."""
    return (
        db.query(Document)
        .filter(Document.owner_id == owner_id)
        .order_by(Document.created_at.desc(), Document.id.desc())
        .all()
    )


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





def list_sessions(db: Session, owner_id: int) -> list[dict]:
    sessions = (
        db.query(AiSession)
        .filter(AiSession.owner_id == owner_id)
        .order_by(AiSession.updated_at.desc(), AiSession.created_at.desc())
        .all()
    )
    return [session_payload(session, owner_id, db, include_messages=False) for session in sessions]


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
    desired_ids = {int(doc_id) for doc_id in document_ids if str(doc_id).isdigit() or isinstance(doc_id, int)}

    existing_links = {
        row.document_id: row
        for row in db.query(AiSessionDocument)
        .join(Document, Document.id == AiSessionDocument.document_id)
        .filter(AiSessionDocument.session_id == session.id, Document.owner_id == owner_id)
        .all()
    }

    available_ids = {
        row[0]
        for row in db.query(Document.id)
        .filter(Document.owner_id == owner_id, Document.id.in_(sorted(desired_ids)))
        .all()
    }

    # Keep every previously attached document visible in the session.
    for document_id, link in existing_links.items():
        link.selected = document_id in available_ids

    # Attach any newly selected documents to this session.
    for document_id in sorted(available_ids):
        if document_id in existing_links:
            existing_links[document_id].selected = True
            continue
        db.add(AiSessionDocument(session_id=session.id, document_id=document_id, selected=True, created_at=_now()))

    session.updated_at = _now()
    db.commit()
    db.refresh(session)
    return session


def attach_document_to_session(db: Session, session: AiSession, document_id: int, owner_id: int, selected: bool = True) -> None:
    document = (
        db.query(Document)
        .filter(Document.id == int(document_id), Document.owner_id == owner_id)
        .first()
    )
    if not document:
        raise ValueError("Document not found")

    link = (
        db.query(AiSessionDocument)
        .filter(AiSessionDocument.session_id == session.id, AiSessionDocument.document_id == document.id)
        .first()
    )
    if link:
        link.selected = bool(selected)
        if not getattr(link, "created_at", None):
            link.created_at = _now()
    else:
        db.add(AiSessionDocument(session_id=session.id, document_id=document.id, selected=bool(selected), created_at=_now()))

    session.updated_at = _now()
    db.commit()
    db.refresh(session)


def delete_session(db: Session, session: AiSession) -> None:
    db.query(AiSessionDocument).filter(AiSessionDocument.session_id == session.id).delete(synchronize_session=False)
    db.query(AiSessionMessage).filter(AiSessionMessage.session_id == session.id).delete(synchronize_session=False)
    db.query(AiSessionArtifact).filter(AiSessionArtifact.session_id == session.id).delete(synchronize_session=False)
    db.delete(session)
    db.commit()


def delete_artifact(db: Session, owner_id: int, session_id: int, artifact_id: int) -> None:
    artifact = (
        db.query(AiSessionArtifact)
        .filter(
            AiSessionArtifact.id == artifact_id,
            AiSessionArtifact.session_id == session_id,
            AiSessionArtifact.owner_id == owner_id,
        )
        .first()
    )
    if not artifact:
        raise ValueError("Artifact not found")
    db.delete(artifact)
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
        "model_policy": "Offline scaffold; local GGUF model path only (llama.cpp), no downloads",
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


def regenerate_chat_turn(db: Session, owner_id: int, session_id: int) -> dict:
    session = get_session(db, owner_id, session_id)
    if not session:
        raise ValueError("AI session not found")
    return regenerate_last_turn(db, session, owner_id)