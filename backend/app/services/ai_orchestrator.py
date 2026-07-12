from __future__ import annotations

from collections import Counter
from typing import Iterable
import re

from sqlalchemy.orm import Session

from app.models.ai_session import AiSession
from app.models.ai_session_artifact import AiSessionArtifact
from app.models.ai_session_message import AiSessionMessage
from app.services.ai_router_service import AUTO_MODE, MANUAL_MODE, RoutingDecision, route_prompt
from app.services.context_service import build_session_context
from app.services.llm_service import generate_local_reply
from app.services.prompt_service import build_prompt_bundle
from app.services.ai_payload import session_payload



def _format_citations(chunks: list[dict]) -> str:
    if not chunks:
        return ""
    lines = ["", "Sources:"]
    for index, chunk in enumerate(chunks, start=1):
        lines.append(f"[{index}] {chunk['filename']}")
    return "\n".join(lines)



_STOPWORDS = {
    "about", "above", "after", "again", "also", "and", "any", "around", "because", "been", "before", "between",
    "both", "can", "could", "document", "documents", "during", "each", "from", "have", "here", "into", "just",
    "like", "make", "many", "more", "most", "much", "need", "only", "other", "over", "please", "project",
    "retrieved", "retrieval", "section", "sections", "should", "show", "some", "such", "that", "their", "there",
    "these", "this", "those", "through", "turn", "user", "using", "what", "when", "where", "which", "with",
    "would", "your", "pdf", "file", "files", "text", "passage", "passages", "answer", "context", "query",
    "session", "selected", "local", "offline", "assistant", "prompt", "grounded", "grounding", "result",
    "results", "response", "snippet", "snippets", "about", "summary", "diagram", "document", "query",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
    "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "of", "in", "on", "at",
    "to", "for", "by", "with", "from", "as", "or", "but", "not", "no", "yes", "all", "any", "some", "such",
}

_THEME_TERMS = {
    "assistant", "agent", "workflow", "retrieval", "document", "summary", "diagram", "markdown", "docx", "pdf",
    "mermaid", "office", "workspace", "session", "context", "prompt", "export", "generation", "draft", "local",
    "offline", "secure", "query", "answer", "source", "sources", "library", "upload", "chat", "validation",
    "structure", "system", "analysis", "knowledge", "report", "notes", "snippet", "index", "hybrid",
    "engine", "module", "feature", "capability", "component", "interface", "platform", "architecture",
    "implementation", "deployment", "configuration", "integration", "management", "processing",
}

_BOILERPLATE_PATTERNS = {
    "the master agent", "the document generation agent", "the query agent", "the summary agent",
    "the diagram agent", "the following capabilities", "the minimum viable product",
    "the core value proposition", "the document-generation engine", "the highest-value office module",
    "distinguishes vāgmi from", "plain document chat tool", "polished office document",
    "inserts a mermaid diagram", "exports the result", "markdown, docx, and pdf",
    "in-scope features", "mvp", "system dependencies", "component notes", "ollama local inference",
    "cpu/gpu-capable", "local quantized models", "gguf format", "q4 or q5 quantization",
    "document ingestion", "upload, parse, chunk, embed, and index", "pyside6", "qt desktop shell",
    "tray/dock/always-on-top", "web interface", "fastapi-served", "jinja2 templates",
    "collaboration panel", "intra-chat", "group chat", "file attachment", "local session cache",
    "current account", "window preference", "last room/document", "air-gapped office",
    "structured artifact", "polished deliverables", "practical and measurable",
}

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9_-]{2,}")


def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in _WORD_RE.findall(text or "")]


def _clean_sentence(sentence: str) -> str:
    return re.sub(r"\s+", " ", (sentence or "").strip())


def _split_sentences(text: str) -> list[str]:
    cleaned = _clean_sentence(text)
    if not cleaned:
        return []
    parts = _SENTENCE_SPLIT_RE.split(cleaned)
    return [part.strip() for part in parts if part.strip()]


def _informative_sentence(sentence: str) -> bool:
    tokens = [token for token in _tokenize(sentence) if token not in _STOPWORDS]
    if len(tokens) < 5:
        return False
    if len(set(tokens)) < 4:
        return False

    # Filter out boilerplate/template content
    lowered = sentence.lower()
    for pattern in _BOILERPLATE_PATTERNS:
        if pattern in lowered:
            return False

    return True


def _sentence_score(sentence: str, chunk_score: float, prompt_terms: set[str]) -> float:
    tokens = [token for token in _tokenize(sentence) if token not in _STOPWORDS]
    if not tokens:
        return 0.0

    token_set = set(tokens)
    query_overlap = len(token_set & prompt_terms)
    theme_overlap = len(token_set & _THEME_TERMS)
    length_bonus = min(len(tokens), 40) / 40.0
    density_bonus = min(len(token_set), 18) / 18.0

    # Heavily penalize boilerplate/template content
    lowered = sentence.lower()
    boilerplate_penalty = 0
    for pattern in _BOILERPLATE_PATTERNS:
        if pattern in lowered:
            boilerplate_penalty -= 15.0

    return (float(chunk_score) * 0.9) + (query_overlap * 2.2) + (theme_overlap * 0.9) + length_bonus + (density_bonus * 0.4) + boilerplate_penalty


def _select_supporting_sentences(chunks: list[dict], prompt: str, limit: int = 3) -> list[tuple[int, str]]:
    prompt_terms = {
        token
        for token in _tokenize(prompt)
        if token not in _STOPWORDS and token not in _THEME_TERMS
    }

    candidates: list[tuple[float, int, str]] = []
    for chunk_index, chunk in enumerate(chunks, start=1):
        text = str(chunk.get("chunk_text") or "")
        chunk_score = float(chunk.get("score") or 0.0)
        for sentence in _split_sentences(text):
            cleaned = _clean_sentence(sentence)
            if len(cleaned) < 40:
                continue
            lowered = cleaned.lower()
            # Skip sentences that start with common boilerplate prefixes
            if lowered.startswith(("citation rules", "answer requirements", "selected documents", "recent messages", "user request", "the master agent", "the document generation", "the query agent", "the summary agent", "the diagram agent", "the following capabilities", "the minimum viable product", "the core value proposition", "the document-generation engine", "the highest-value office module")):
                continue
            if not _informative_sentence(cleaned):
                continue
            score = _sentence_score(cleaned, chunk_score, prompt_terms)
            if score <= 0:
                continue
            candidates.append((score, chunk_index, cleaned))

    candidates.sort(key=lambda item: (-item[0], item[1], len(item[2])))

    chosen: list[tuple[int, str]] = []
    seen: set[str] = set()
    for _score, chunk_index, sentence in candidates:
        key = sentence.lower()
        if key in seen:
            continue
        seen.add(key)
        chosen.append((chunk_index, sentence))
        if len(chosen) >= limit:
            break

    return chosen


def _topic_hint_from_chunks(chunks: list[dict], prompt: str, limit: int = 3) -> str:
    prompt_terms = {
        token
        for token in _tokenize(prompt)
        if token not in _STOPWORDS and token not in _THEME_TERMS
    }

    counter: Counter[str] = Counter()
    for chunk in chunks:
        text = str(chunk.get("chunk_text") or "")
        # Filter out boilerplate content before counting
        sentences = _split_sentences(text)
        for sentence in sentences:
            lowered = sentence.lower()
            # Skip sentences containing boilerplate
            if any(pattern in lowered for pattern in _BOILERPLATE_PATTERNS):
                continue
            for token in _tokenize(sentence):
                if token in _STOPWORDS:
                    continue
                if token in _THEME_TERMS:
                    continue
                counter[token] += 1

    ordered = [token for token, _count in counter.most_common(12) if token not in prompt_terms]
    if not ordered:
        ordered = [token for token in prompt_terms if token not in _THEME_TERMS]

    ordered = ordered[:limit]
    if not ordered:
        return "the selected documents"

    if len(ordered) == 1:
        return ordered[0]
    if len(ordered) == 2:
        return f"{ordered[0]} and {ordered[1]}"
    return ", ".join(ordered[:-1]) + f", and {ordered[-1]}"


def _is_about_query(prompt: str) -> bool:
    lowered = (prompt or "").lower()
    return any(
        phrase in lowered
        for phrase in (
            "what is this",
            "what is this document about",
            "what is this pdf about",
            "what is the pdf about",
            "what is this file about",
            "what does this document say",
            "what does the pdf say",
            "summarize",
            "summary",
            "elaborate",
            "recap",
        )
    )


def _synthesize_summary(chunks: list[dict], routed_agent: str, prompt: str) -> tuple[str, list[dict]]:
    selected = _select_supporting_sentences(chunks, prompt, limit=5)
    selected_indices = [index for index, _sentence in selected]
    selected_chunks = [chunks[index - 1] for index in selected_indices if 0 < index <= len(chunks)]

    if selected:
        # Combine selected sentences into a coherent response
        sentences = [sentence for _index, sentence in selected]
        # Remove any remaining boilerplate from the combined text
        cleaned_sentences = []
        for sentence in sentences:
            lowered = sentence.lower()
            is_boilerplate = any(pattern in lowered for pattern in _BOILERPLATE_PATTERNS)
            if not is_boilerplate:
                cleaned_sentences.append(sentence)

        if cleaned_sentences:
            lead = " ".join(cleaned_sentences[:3])
            return lead.strip(), selected_chunks or chunks[: min(3, len(chunks))]

    return "", chunks[: min(3, len(chunks))]


def build_grounded_reply(prompt: str, routed_agent: str, context: dict) -> tuple[str, str | None, str | None]:
    """
    Deterministic, fully-offline reply built from the retrieved passages when
    a local model is unavailable or rejects the turn. The goal is to synthesize
    the evidence into a short answer rather than dumping the passages back to
    the user verbatim.
    """
    selected_docs = context.get("selected_documents", [])
    chunks = context.get("grounding_chunks", [])
    doc_names = [doc["filename"] for doc in selected_docs[:4]]
    doc_summary = ", ".join(doc_names) if doc_names else "no documents selected yet"

    # Only generate artifacts for specific agent types, not based on keyword matching
    artifact_type = None
    artifact_title = None
    if routed_agent == "diagram":
        artifact_type = "mermaid"
        artifact_title = "Mermaid Diagram"
    elif routed_agent == "document":
        artifact_type = "document"
        artifact_title = "Document Draft"

    if chunks:
        reply, citation_chunks = _synthesize_summary(chunks, routed_agent, prompt)
        if not reply:
            topic = _topic_hint_from_chunks(chunks, prompt)
            if _is_about_query(prompt):
                reply = f"This document mainly discusses {topic}."
            elif routed_agent == "summary":
                reply = f"The selected documents mainly discuss {topic}."
            elif routed_agent == "diagram":
                reply = f"The selected passages can be turned into a diagram about {topic}."
            elif routed_agent == "document":
                reply = f"The selected passages can be drafted into a document about {topic}."
            else:
                reply = f"The selected passages mainly discuss {topic}."
        else:
            # Clean up any remaining boilerplate patterns from the reply
            for pattern in _BOILERPLATE_PATTERNS:
                reply = re.sub(re.escape(pattern), "", reply, flags=re.IGNORECASE)
            reply = re.sub(r"^(this response is grounded in\s+\d+\s+retrieved passage\(s\)\.\s*)", "", reply, flags=re.IGNORECASE).strip()
            # Clean up extra whitespace
            reply = re.sub(r"\s+", " ", reply).strip()

        reply = reply.strip()
        if not reply.endswith((".", "!", "?")):
            reply += "."
        reply += _format_citations(citation_chunks)
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
            {
                "index": index,
                "filename": chunk["filename"],
                "document_id": chunk["document_id"],
                "chunk_index": chunk.get("chunk_index"),
                "chunk_id": chunk.get("chunk_id"),
            }
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

    payload = session_payload(session, owner_id, db, include_messages=True)

    return {
        "session": payload,
        "routed_agent": route.routed_agent,
        "routing_mode": route.routing_mode,
        "confidence": route.confidence,
        "needs_clarification": route.needs_clarification,
        "clarification_options": route.suggestion_labels(),
        "reply": reply,
        "sources": [doc["filename"] for doc in payload.get("selected_documents", [])[:6]],
        "citations": citations,
        "artifact_type": artifact_type,
        "artifact_title": artifact_title,
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
