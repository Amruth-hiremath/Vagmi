from __future__ import annotations

from textwrap import dedent

from app.agents import get_agent_spec
from app.agents.base import agent_instruction_block

MAX_SELECTED_DOCUMENT_LINES = 4
MAX_RECENT_MESSAGE_LINES = 6
MAX_GROUNDING_LINES = 4
MAX_SNIPPET_CHARS = 240


def _compact(text: str, limit: int = MAX_SNIPPET_CHARS) -> str:
    compact = " ".join((text or "").split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def _answer_rules(routed_agent: str) -> str:
    if routed_agent == "query":
        return (
            "- Query mode: answer the user directly and stay focused on the question.\n"
            "- Prefer 1-4 short paragraphs or bullets.\n"
            "- Do not wander into document drafting, diagrams, or meta commentary."
        )

    if routed_agent == "summary":
        return (
            "- Summary mode: condense the material into a clean overview.\n"
            "- Use a small structure such as key idea, important details, and takeaways.\n"
            "- Keep it complete, but avoid raw excerpt dumping."
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
            "- Make it look like a real document draft, not a chat reply.\n"
            "- Include clear structure and concise prose."
        )

    return (
        "- Master mode: ask one precise clarification question only.\n"
        "- Do not answer the underlying request until it is unambiguous."
    )


def build_prompt_bundle(context: dict, routed_agent: str, routing_reason: str) -> str:
    spec = get_agent_spec(routed_agent)

    doc_lines = []
    for doc in context.get("selected_documents", [])[:MAX_SELECTED_DOCUMENT_LINES]:
        doc_lines.append(f"- {doc['filename']} (id={doc['id']})")

    message_lines = []
    for item in context.get("recent_messages", [])[-MAX_RECENT_MESSAGE_LINES:]:
        role = item.get("role", "assistant")
        content = _compact(item.get("content") or "", 180)
        message_lines.append(f"{role}: {content}")

    grounding_lines = []
    for index, chunk in enumerate(context.get("grounding_chunks", [])[:MAX_GROUNDING_LINES], start=1):
        snippet = _compact(chunk.get("chunk_text") or "")
        grounding_lines.append(f"[{index}] {chunk['filename']}: {snippet}")

    prompt = context.get("prompt") or ""
    return dedent(
        f"""
        You are Vāgmi, an offline, user-isolated workplace AI.

        Session title: {context.get('title')}
        Routing mode: {context.get('routing_mode')}
        Routed specialist: {spec.label}
        Routing reason: {routing_reason}
        Specialist system prompt: {spec.system_prompt}
        Specialist contract: {agent_instruction_block(spec, routing_reason, context)}

        Selected documents:
        {chr(10).join(doc_lines) if doc_lines else "- None selected"}

        Retrieved passages:
        {chr(10).join(grounding_lines) if grounding_lines else "- No passages retrieved for this prompt"}

        Recent messages:
        {chr(10).join(message_lines) if message_lines else "- No prior context"}

        User request:
        {prompt}

        Answer rules:
        {_answer_rules(routed_agent)}

        Final response rules:
        - Use only the selected specialist for this turn.
        - Do not mention or impersonate other specialist modes unless the user explicitly asks.
        - Answer from the retrieved passages and recent session context only.
        - Do not echo passages verbatim or dump raw excerpts.
        - If the answer is not fully supported, say what is missing instead of inventing facts.
        - Use inline citations like [1] or [2] only for supported claims.
        - Keep the tone professional and production-ready.
        """
    ).strip()
