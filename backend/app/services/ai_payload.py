from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.ai_session import AiSession
from app.models.ai_session_artifact import AiSessionArtifact
from app.models.ai_session_document import AiSessionDocument
from app.models.ai_session_message import AiSessionMessage
from app.models.document import Document


def _messages(session_id: int, db: Session):
    return (
        db.query(AiSessionMessage)
        .filter(AiSessionMessage.session_id == session_id)
        .order_by(
            AiSessionMessage.created_at.asc(),
            AiSessionMessage.id.asc(),
        )
        .all()
    )


def _artifacts(session_id: int, owner_id: int, db: Session):
    rows = (
        db.query(AiSessionArtifact)
        .filter(
            AiSessionArtifact.session_id == session_id,
            AiSessionArtifact.owner_id == owner_id,
        )
        .order_by(
            AiSessionArtifact.created_at.desc(),
            AiSessionArtifact.id.desc(),
        )
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


def _session_documents(session_id: int, owner_id: int, db: Session):
    rows = (
        db.query(AiSessionDocument, Document)
        .join(
            Document,
            Document.id == AiSessionDocument.document_id,
        )
        .filter(
            AiSessionDocument.session_id == session_id,
            Document.owner_id == owner_id,
        )
        .order_by(
            AiSessionDocument.created_at.desc(),
            AiSessionDocument.id.desc(),
        )
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


def session_payload(
    session: AiSession,
    owner_id: int,
    db: Session,
    include_messages: bool = True,
):
    selected_documents = _session_documents(
        session.id,
        owner_id,
        db,
    )

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

    artifacts = _artifacts(
        session.id,
        owner_id,
        db,
    )

    return {
        "id": session.id,
        "title": session.title,
        "routing_mode": session.routing_mode,
        "selected_agent": session.selected_agent,
        "status": session.status,
        "last_prompt": session.last_prompt,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "last_used_at": session.last_used_at,
        "selected_document_count": len(
            [
                doc
                for doc in selected_documents
                if doc.get("selected")
            ]
        ),
        "message_count": len(messages),
        "artifact_count": len(artifacts),
        "selected_documents": selected_documents,
        "messages": messages,
    }