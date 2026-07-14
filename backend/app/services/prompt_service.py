from __future__ import annotations

from textwrap import dedent

from app.agents import get_agent_spec
from app.agents.base import agent_instruction_block

MAX_SELECTED_DOCUMENT_LINES = 8
MAX_RECENT_MESSAGE_LINES = 10
MAX_GROUNDING_LINES = 8
MAX_SNIPPET_CHARS = 600


def _compact(text: str, limit: int = MAX_SNIPPET_CHARS) -> str:
    compact = " ".join((text or "").split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def _answer_rules(routed_agent: str) -> str:
    if routed_agent == "query":
        return (
            "- Query mode: answer the user directly and stay focused on the question.\n"
            "- Prefer 1-4 short paragraphs or bullets, with line breaks between distinct points.\n"
            "- Do not wander into document drafting, diagrams, or meta commentary."
        )

    if routed_agent == "summary":
        return (
            "- Summary mode: condense the material into a clean overview.\n"
            "- Use markdown headings or bullets, with each section on its own line.\n"
            "- Separate sections with blank lines and avoid raw excerpt dumping."
        )

    if routed_agent == "diagram":
        return (
            "- Diagram mode: produce a Mermaid diagram first when structure helps.\n"
            "- Follow it with a short explanation only if needed.\n"
            "- Keep the diagram valid, compact, and readable."
        )

    if routed_agent == "document":
        return (
            "- Document mode: draft a polished markdown document with headings and sections.\n"
            "- Put each heading on its own line and leave a blank line between sections.\n"
            "- Use bullets where helpful and keep the structure professional."
        )

    return (
        "- Master mode: ask one precise clarification question only.\n"
        "- Do not answer the underlying request until it is unambiguous."
    )


def _selected_document_block(context: dict) -> str:
    lines = []
    for doc in context.get("selected_documents", [])[:MAX_SELECTED_DOCUMENT_LINES]:
        lines.append(f"- {doc['filename']} (id={doc['id']})")
    return "\n".join(lines) if lines else "- None selected"


def _retrieved_passage_block(context: dict) -> str:
    lines = []
    for index, chunk in enumerate(context.get("grounding_chunks", [])[:MAX_GROUNDING_LINES], start=1):
        snippet = _compact(chunk.get("chunk_text") or "")
        lines.append(f"[{index}] {chunk['filename']}: {snippet}")
    return "\n".join(lines) if lines else "- No passages retrieved for this prompt"


def _recent_message_block(context: dict) -> str:
    lines = []
    for item in context.get("recent_messages", [])[-MAX_RECENT_MESSAGE_LINES:]:
        role = item.get("role", "assistant")
        content = _compact(item.get("content") or "", 180)
        lines.append(f"{role}: {content}")
    return "\n".join(lines) if lines else "- No prior context"


def build_prompt_messages(context: dict, routed_agent: str, routing_reason: str) -> list[dict[str, str]]:
    spec = get_agent_spec(routed_agent)
    prompt = context.get("prompt") or ""

    system_prompt = dedent(
        f"""
        You are Vāgmi, an offline, user-isolated workplace AI.

        Session title: {context.get('title')}
        Routing mode: {context.get('routing_mode')}
        Routed specialist: {spec.label}
        Routing reason: {routing_reason}

        Specialist system prompt: {spec.system_prompt}
        Specialist contract: {agent_instruction_block(spec, routing_reason, context)}

        Selected documents:
        {_selected_document_block(context)}

        Retrieved passages:
        {_retrieved_passage_block(context)}

        Recent messages:
        {_recent_message_block(context)}

        Answer rules:
        {_answer_rules(routed_agent)}

        Final response rules:
        - Use only the selected specialist for this turn.
        - Do not mention or impersonate other specialist modes unless the user explicitly asks.
        - Answer from the retrieved passages and recent session context only.
        - Do not echo passages verbatim or dump raw excerpts.
        - If the answer is not fully supported, say what is missing instead of inventing facts.
        - Keep the tone professional and production-ready.
        """
    ).strip()

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]


def build_prompt_bundle(context: dict, routed_agent: str, routing_reason: str) -> str:
    messages = build_prompt_messages(context, routed_agent, routing_reason)
    return "\n\n".join(f"{message['role'].title()}: {message['content']}" for message in messages).strip()
