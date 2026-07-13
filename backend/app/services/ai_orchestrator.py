from __future__ import annotations

import re
from collections import Counter

from sqlalchemy.orm import Session

from app.agents import get_agent_spec
from app.agents.base import build_agent_artifact_content
from app.models.ai_session import AiSession
from app.models.ai_session_artifact import AiSessionArtifact
from app.models.ai_session_message import AiSessionMessage
from app.services.ai_router_service import AUTO_MODE, RoutingDecision, route_prompt
from app.services.ai_payload import session_payload
from app.services.context_service import build_session_context
from app.core.logging_config import logger
from app.services.llm_service import generate_local_reply
from app.services.prompt_service import build_prompt_messages

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
    return [part.strip() for part in _SENTENCE_SPLIT_RE.split(cleaned) if part.strip()]


def _informative_sentence(sentence: str) -> bool:
    tokens = [token for token in _tokenize(sentence) if token not in _STOPWORDS]
    if len(tokens) < 5:
        return False
    if len(set(tokens)) < 4:
        return False

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

    lowered = sentence.lower()
    boilerplate_penalty = 0.0
    for pattern in _BOILERPLATE_PATTERNS:
        if pattern in lowered:
            boilerplate_penalty -= 15.0

    return (float(chunk_score) * 0.9) + (query_overlap * 2.2) + (theme_overlap * 0.9) + length_bonus + (density_bonus * 0.4) + boilerplate_penalty


def _select_supporting_sentences(chunks: list[dict], prompt: str, limit: int = 4) -> list[tuple[int, str]]:
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
            if lowered.startswith((
                "citation rules", "answer requirements", "selected documents", "recent messages", "user request",
                "the master agent", "the document generation", "the query agent", "the summary agent", "the diagram agent",
            )):
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
        for sentence in _split_sentences(text):
            lowered = sentence.lower()
            if any(pattern in lowered for pattern in _BOILERPLATE_PATTERNS):
                continue
            for token in _tokenize(sentence):
                if token in _STOPWORDS or token in _THEME_TERMS:
                    continue
                counter[token] += 1

    ordered = [token for token, _count in counter.most_common(12) if token not in prompt_terms]
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
            "what is this", "what is this document about", "what is this pdf about", "what is the pdf about",
            "what is this file about", "what does this document say", "what does the pdf say",
            "summarize", "summary", "elaborate", "recap",
        )
    )


def _synthesize_summary(chunks: list[dict], prompt: str) -> tuple[str, list[dict]]:
    selected = _select_supporting_sentences(chunks, prompt, limit=4)
    selected_indices = [index for index, _sentence in selected]
    selected_chunks = [chunks[index - 1] for index in selected_indices if 0 < index <= len(chunks)]

    if selected:
        sentences = [sentence for _index, sentence in selected]
        lead = " ".join(sentences[:3]).strip()
        if lead:
            return lead, selected_chunks or chunks[: min(3, len(chunks))]

    return "", chunks[: min(3, len(chunks))]


def _format_citations(chunks: list[dict]) -> str:
    if not chunks:
        return ""
    lines = ["", "Sources:"]
    for index, chunk in enumerate(chunks, start=1):
        lines.append(f"[{index}] {chunk['filename']}")
    return "\n".join(lines)


def build_grounded_reply(prompt: str, routed_agent: str, context: dict) -> tuple[str, str | None, str | None]:
    spec = get_agent_spec(routed_agent)
    selected_docs = context.get("selected_documents", [])
    chunks = context.get("grounding_chunks", [])
    doc_names = [doc["filename"] for doc in selected_docs[:4]]
    doc_summary = ", ".join(doc_names) if doc_names else "no documents selected yet"

    artifact_type = spec.artifact_type
    artifact_title = spec.artifact_title

    if chunks:
        reply, citation_chunks = _synthesize_summary(chunks, prompt)
        if not reply:
            topic = _topic_hint_from_chunks(chunks, prompt)
            if routed_agent == "summary":
                reply = f"The selected documents are mainly about {topic}."
                if _is_about_query(prompt):
                    reply += f" In plain terms, the material focuses on {topic} and the related workflow around it."
            elif routed_agent == "diagram":
                reply = (
                    f"A useful diagram for these passages would center on {topic}. "
                    f"The flow is: request -> selected documents -> grounded output."
                )
            elif routed_agent == "document":
                reply = (
                    f"This can be drafted into a document about {topic}. "
                    f"A clean structure would be overview, details, and next steps."
                )
            else:
                reply = f"The selected passages mainly discuss {topic}."
        else:
            reply = re.sub(r"\s+", " ", reply).strip()

        if not reply.endswith((".", "!", "?")):
            reply += "."
        reply += _format_citations(citation_chunks)
    else:
        if routed_agent == "summary":
            reply = (
                f"The session is set up for a summary, but no passages were retrieved yet. "
                f"Selected docs: {doc_summary}."
            )
        elif routed_agent == "diagram":
            reply = (
                f"The session is set up for a diagram, but no passages were retrieved yet. "
                f"Selected docs: {doc_summary}."
            )
        elif routed_agent == "document":
            reply = (
                f"The session is set up for a document draft, but no passages were retrieved yet. "
                f"Selected docs: {doc_summary}."
            )
        else:
            if routed_agent == "query":
                reply = (
                    f"The available context is limited, but the request appears to be about the selected documents. "
                    f"Selected docs: {doc_summary}."
                )
            elif routed_agent == "summary":
                reply = (
                    f"The available context is limited, but the selected documents can still be summarized. "
                    f"Selected docs: {doc_summary}."
                )
            elif routed_agent == "diagram":
                reply = (
                    f"The available context is limited, but a diagram can still be drafted from the selected documents. "
                    f"Selected docs: {doc_summary}."
                )
            elif routed_agent == "document":
                reply = (
                    f"The available context is limited, but a document draft can still be started from the selected documents. "
                    f"Selected docs: {doc_summary}."
                )
            else:
                reply = (
                    f"Routed to the {routed_agent} agent. Context snapshot: {len(selected_docs)} selected document(s), "
                    f"{len(context.get('recent_messages', []))} recent message(s). Selected docs: {doc_summary}."
                )

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
    artifact_content: str | None = None,
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
            content=artifact_content or reply,
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
    logger.info(
        "AI turn received: session=%s mode=%s selected_agent=%s prompt_len=%s",
        session.id,
        routing_mode or session.routing_mode,
        selected_agent or session.selected_agent,
        len(prompt or ""),
    )
    route = route_prompt(prompt, routing_mode or session.routing_mode, selected_agent or session.selected_agent)
    context = build_session_context(db, session, owner_id, prompt=prompt)
    spec = get_agent_spec(route.routed_agent)

    logger.info(
        "AI context built: session=%s selected_docs=%s recent_messages=%s grounding_chunks=%s",
        session.id,
        len(context.get("selected_documents", [])),
        len(context.get("recent_messages", [])),
        len(context.get("grounding_chunks", [])),
    )

    prompt_messages = build_prompt_messages(context, route.routed_agent, route.reason)
    logger.info(
        "AI prompt built: session=%s agent=%s message_count=%s",
        session.id,
        route.routed_agent,
        len(prompt_messages),
    )
    artifact_type = spec.artifact_type
    artifact_title = spec.artifact_title
    artifact_content = None
    citations: list[dict] = []

    logger.info(
        "AI turn routed: session=%s mode=%s agent=%s reason=%s selected_docs=%s grounding_chunks=%s",
        session.id,
        route.routing_mode,
        route.routed_agent,
        route.reason,
        len(context.get("selected_documents", [])),
        len(context.get("grounding_chunks", [])),
    )

    if route.needs_clarification and route.routing_mode == AUTO_MODE:
        reply = build_clarification_reply(prompt, route, context)
        artifact_type = None
        artifact_title = None
    else:
        reply = generate_local_reply(
            prompt_messages=prompt_messages,
            routed_agent=route.routed_agent,
            context=context,
        )
        if reply is None:
            reply, fallback_artifact_type, fallback_artifact_title = build_grounded_reply(prompt, route.routed_agent, context)
            if fallback_artifact_type is not None:
                artifact_type = fallback_artifact_type
            if fallback_artifact_title is not None:
                artifact_title = fallback_artifact_title
        else:
            artifact_content = build_agent_artifact_content(spec, prompt, reply, context)

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

    if artifact_type and artifact_content is None and not (route.needs_clarification and route.routing_mode == AUTO_MODE):
        artifact_content = build_agent_artifact_content(spec, prompt, reply, context)

    logger.info(
        "AI turn completed: session=%s agent=%s clarification=%s artifact_type=%s",
        session.id,
        route.routed_agent,
        bool(route.needs_clarification and route.routing_mode == AUTO_MODE),
        artifact_type,
    )

    persist_turn(
        db=db,
        session=session,
        owner_id=owner_id,
        prompt=prompt,
        routed_agent=route.routed_agent,
        reply=reply,
        artifact_type=artifact_type,
        artifact_title=artifact_title,
        artifact_content=artifact_content,
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
    last_prompt = session.last_prompt
    if not last_prompt:
        raise ValueError("No prompt available to regenerate")
    return run_session_turn(db, session, owner_id, last_prompt, session.routing_mode, session.selected_agent)
