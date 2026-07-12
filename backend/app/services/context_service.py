from __future__ import annotations

from datetime import datetime
from sqlalchemy.orm import Session

from app.models.ai_session import AiSession
from app.models.ai_session_document import AiSessionDocument
from app.models.ai_session_message import AiSessionMessage
from app.models.document import Document

MAX_RETRIEVED_CHUNKS = 6
MAX_CHUNK_CHARS = 480


def _safe_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def session_selected_documents(db: Session, session_id: int, owner_id: int) -> list[dict]:
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
            "created_at": _safe_iso(doc.created_at),
            "selected": bool(link.selected),
        }
        for link, doc in rows
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


def _truncate(text: str, limit: int = MAX_CHUNK_CHARS) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def retrieve_grounding_chunks(
    db: Session,
    prompt: str | None,
    owner_id: int,
    selected_document_ids: set[int],
    top_k: int = MAX_RETRIEVED_CHUNKS,
) -> list[dict]:
    """
    Pull hybrid (BM25 + vector) chunks for the prompt, scoped to only the
    documents the user has selected for this session. Fully local/offline:
    reuses the same singleton services the /retrieval endpoint uses, so no
    extra model loads happen per-call. Any failure degrades to an empty
    grounding set rather than breaking the chat turn.
    """
    text = (prompt or "").strip()
    if not text or not selected_document_ids:
        return []

    try:
        from app.core.dependencies import hybrid_retriever
    except Exception:
        return []

    try:
        # Over-fetch since results are user-scoped, not session-scoped, and
        # we need to filter down to the documents selected for this session.
        raw_results = hybrid_retriever.search(query=text, user_id=owner_id, top_k=top_k * 4)
    except Exception:
        return []

    filtered: list[dict] = []
    for result in raw_results:
        doc_id = result.get("document_id")
        if doc_id not in selected_document_ids:
            continue
        filtered.append(result)
        if len(filtered) >= top_k:
            break

    filename_by_id: dict[int, str] = {}
    if filtered:
        try:
            rows = (
                db.query(Document.id, Document.filename)
                .filter(Document.id.in_({item["document_id"] for item in filtered}))
                .all()
            )
            filename_by_id = {row[0]: row[1] for row in rows}
        except Exception:
            filename_by_id = {}

    return [
        {
            "document_id": item["document_id"],
            "filename": filename_by_id.get(item["document_id"], f"document-{item['document_id']}"),
            "chunk_text": _truncate(item.get("chunk_text", "")),
            "score": round(float(item.get("score", 0.0)), 4),
        }
        for item in filtered
    ]


def build_session_context(db: Session, session: AiSession, owner_id: int, prompt: str | None = None) -> dict:
    documents = session_selected_documents(db, session.id, owner_id)
    selected_documents = [doc for doc in documents if doc["selected"]]
    messages = session_messages(db, session.id, limit=24)
    recent_messages = messages[-12:]

    grounding_chunks: list[dict] = []
    if prompt:
        selected_ids = {doc["id"] for doc in selected_documents}
        grounding_chunks = retrieve_grounding_chunks(db, prompt, owner_id, selected_ids)

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
        "grounding_chunks": grounding_chunks,
    }