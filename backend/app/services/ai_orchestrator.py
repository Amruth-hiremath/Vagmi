from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session

from app.models.ai_session import AiSession
from app.models.ai_session_artifact import AiSessionArtifact
from app.models.ai_session_message import AiSessionMessage
from app.services.ai_router_service import AUTO_MODE, MANUAL_MODE, RoutingDecision, route_prompt
from app.services.context_service import build_session_context
from app.services.llm_service import generate_local_reply
from app.services.prompt_service import build_prompt_bundle


def _format_citations(chunks: list[dict]) -> str:
    if not chunks:
        return ""
    lines = ["", "Sources:"]
    for index, chunk in enumerate(chunks, start=1):
        lines.append(f"[{index}] {chunk['filename']}")
    return "\n".join(lines)


def build_grounded_reply(prompt: str, routed_agent: str, context: dict) -> tuple[str, str | None, str | None]:
    """
    Deterministic, fully-offline reply built directly from retrieved
    passages when available. This is the "next real step" beyond a static
    scaffold: it actually surfaces the selected documents' content instead
    of only naming them, and stays stable with zero passages.
    """
    selected_docs = context.get("selected_documents", [])
    chunks = context.get("grounding_chunks", [])
    doc_names = [doc["filename"] for doc in selected_docs[:4]]
    doc_summary = ", ".join(doc_names) if doc_names else "no documents selected yet"

    artifact_type = None
    artifact_title = None
    lowered = (prompt or "").lower()
    if routed_agent == "diagram" or "diagram" in lowered or "mermaid" in lowered:
        artifact_type = "mermaid"
        artifact_title = "Mermaid Draft"
    elif routed_agent == "document" or any(word in lowered for word in ["report", "draft", "document", "note", "proposal"]):
        artifact_type = "document"
        artifact_title = "Document Draft"
    elif routed_agent == "summary" or any(word in lowered for word in ["summary", "summarize", "summarise", "recap"]):
        artifact_type = "summary"
        artifact_title = "Summary Draft"

    if chunks:
        agent_lead = {
            "summary": "Here is a grounded summary based on the retrieved passages",
            "diagram": "Here is what the retrieved passages suggest for a diagram",
            "document": "Here is a draft grounded in the retrieved passages",
            "query": "Here is what the retrieved passages say",
        }.get(routed_agent, "Here is what the retrieved passages say")

        body_lines = [f"{agent_lead}:"]
        for index, chunk in enumerate(chunks, start=1):
            body_lines.append(f"[{index}] {chunk['chunk_text']}")
        body = "\n".join(body_lines)
        reply = f"{body}{_format_citations(chunks)}"
    else:
        reply = "\n".join([
            f"Routed to the {routed_agent} agent.",
            f"Context snapshot: {len(selected_docs)} selected document(s), {len(context.get('recent_messages', []))} recent message(s).",
            f"Selected docs: {doc_summary}.",
            "No passages matched this prompt in the selected documents yet."
            if selected_docs
            else "Select one or more documents in the sidebar to ground responses in their content.",
            "Local model hook is staged next; this deterministic scaffold keeps the offline flow stable.",
        ])

    return reply, artifact_type, artifact_title


def build_clarification_reply(prompt: str, route: RoutingDecision, context: dict) -> str:
    selected_docs = context.get("selected_documents", [])
    doc_summary = f"{len(selected_docs)} selected document(s)" if selected_docs else "no selected documents yet"
    if route.reason == "mixed_intent":
        lead = "This request looks mixed, so I need one clear target before I answer."
    elif route.reason == "empty_prompt":
        lead = "I need an actual request before I can route this."
    else:
        lead = "I could not confidently route this request, so I need a little more direction."

    options = route.suggestion_labels() or ["Query", "Summary", "Diagram", "Document"]
    return "\n".join([
        lead,
        f"Current context: {doc_summary}.",
        f"Pick one of these specialist modes: {', '.join(options)}.",
        "Or switch to Manual mode and choose the specialist yourself — the safest path when a request spans multiple tasks.",
    ])


def persist_turn(
    db: Session,
    session: AiSession,
    owner_id: int,
    prompt: str,
    routed_agent: str,
    reply: str,
    artifact_type: str | None = None,
    artifact_title: str | None = None,
) -> None:
    db.add(AiSessionMessage(
        session_id=session.id,
        role="user",
        content=prompt,
        agent_name="user",
    ))
    db.add(AiSessionMessage(
        session_id=session.id,
        role="assistant",
        content=reply,
        agent_name=routed_agent,
    ))

    if artifact_type:
        db.add(AiSessionArtifact(
            session_id=session.id,
            owner_id=owner_id,
            title=artifact_title or "AI Artifact",
            artifact_type=artifact_type,
            content=reply,
            file_path=None,
        ))

    session.last_prompt = prompt
    session.status = "active"
    db.commit()
    db.refresh(session)


def run_session_turn(
    db: Session,
    session: AiSession,
    owner_id: int,
    prompt: str,
    routing_mode: str | None = None,
    selected_agent: str | None = None,
) -> dict:
    route = route_prompt(prompt, routing_mode or session.routing_mode, selected_agent or session.selected_agent)
    context = build_session_context(db, session, owner_id, prompt=prompt)

    prompt_bundle = build_prompt_bundle(context, route.routed_agent, route.reason)
    artifact_type = None
    artifact_title = None
    citations: list[dict] = []

    if route.needs_clarification and route.routing_mode == AUTO_MODE:
        reply = build_clarification_reply(prompt, route, context)
    else:
        reply = generate_local_reply(
            prompt_bundle=prompt_bundle,
            routed_agent=route.routed_agent,
            context=context,
        )
        if reply is None:
            reply, artifact_type, artifact_title = build_grounded_reply(prompt, route.routed_agent, context)
        citations = [
            {"index": index, "filename": chunk["filename"], "document_id": chunk["document_id"]}
            for index, chunk in enumerate(context.get("grounding_chunks", []), start=1)
        ]

    persist_turn(
        db=db,
        session=session,
        owner_id=owner_id,
        prompt=prompt,
        routed_agent=route.routed_agent,
        reply=reply,
        artifact_type=artifact_type,
        artifact_title=artifact_title,
    )

    updated_context = build_session_context(db, session, owner_id)

    return {
        "session": updated_context,
        "routed_agent": route.routed_agent,
        "routing_mode": route.routing_mode,
        "confidence": route.confidence,
        "needs_clarification": route.needs_clarification,
        "clarification_options": route.suggestion_labels(),
        "reply": reply,
        "sources": [doc["filename"] for doc in updated_context.get("selected_documents", [])[:6]],
        "citations": citations,
        "artifact_type": artifact_type,
        "artifact_title": artifact_title,
        "route_reason": route.reason,
        "local_model_ready": False,
    }


def regenerate_last_turn(db: Session, session: AiSession, owner_id: int) -> dict:
    """
    Re-run the most recent user prompt in this session through the same
    routing/orchestration path, without requiring the caller to retype it.
    The previous assistant turn (and any artifact it produced) is left in
    place; a fresh assistant message is appended, matching how regenerate
    works in NotebookLM-style tools.
    """
    last_user_message = (
        db.query(AiSessionMessage)
        .filter(AiSessionMessage.session_id == session.id, AiSessionMessage.role == "user")
        .order_by(AiSessionMessage.created_at.desc(), AiSessionMessage.id.desc())
        .first()
    )
    if not last_user_message:
        raise ValueError("No previous prompt to regenerate")

    return run_session_turn(
        db=db,
        session=session,
        owner_id=owner_id,
        prompt=last_user_message.content,
        routing_mode=session.routing_mode,
        selected_agent=session.selected_agent,
    )