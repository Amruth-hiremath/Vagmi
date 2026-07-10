from __future__ import annotations

from datetime import datetime
from sqlalchemy.orm import Session

from app.models.ai_session import AiSession
from app.models.ai_session_document import AiSessionDocument
from app.models.ai_session_message import AiSessionMessage
from app.models.document import Document


def _safe_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def session_selected_documents(db: Session, session_id: int, owner_id: int) -> list[dict]:
    selected_ids = {
        row[0]
        for row in db.query(AiSessionDocument.document_id)
        .join(Document, Document.id == AiSessionDocument.document_id)
        .filter(AiSessionDocument.session_id == session_id, Document.owner_id == owner_id)
        .all()
    }

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
            "created_at": _safe_iso(doc.created_at),
            "selected": doc.id in selected_ids,
        }
        for doc in docs
    ]


def session_messages(db: Session, session_id: int, limit: int | None = None) -> list[dict]:
    query = (
        db.query(AiSessionMessage)
        .filter(AiSessionMessage.session_id == session_id)
        .order_by(AiSessionMessage.created_at.asc(), AiSessionMessage.id.asc())
    )
    if limit is not None:
        query = query.limit(limit)

    return [
        {
            "id": item.id,
            "role": item.role,
            "content": item.content,
            "agent_name": item.agent_name,
            "created_at": _safe_iso(item.created_at),
        }
        for item in query.all()
    ]


def build_session_context(db: Session, session: AiSession, owner_id: int, prompt: str | None = None) -> dict:
    documents = session_selected_documents(db, session.id, owner_id)
    selected_documents = [doc for doc in documents if doc["selected"]]
    messages = session_messages(db, session.id, limit=24)
    recent_messages = messages[-12:]

    return {
        "session_id": session.id,
        "title": session.title,
        "routing_mode": session.routing_mode,
        "selected_agent": session.selected_agent,
        "status": session.status,
        "last_prompt": session.last_prompt,
        "prompt": prompt,
        "document_count": len(selected_documents),
        "message_count": len(messages),
        "documents": documents,
        "selected_documents": selected_documents,
        "recent_messages": recent_messages,
    }
